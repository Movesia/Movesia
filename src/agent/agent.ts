/**
 * Movesia Agent Factory
 *
 * Creates the LangGraph-based agent with Unity tools and middleware.
 * Uses langchain's createAgent (with middleware support) + deepagents
 * for filesystem access rooted at the Unity project path.
 *
 * Configuration is passed dynamically rather than read from environment variables.
 */

import { resolve } from 'path'
import { ChatOpenAI } from '@langchain/openai'
import { TavilySearch } from '@langchain/tavily'
import { MemorySaver } from '@langchain/langgraph'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import { unityTools, setUnityManager } from './unity-tools/index'
import { probuilderTools } from './subagent-tools/index'
import { UNITY_AGENT_PROMPT, PROBUILDER_AGENT_PROMPT } from './prompts'
import type { UnityManager } from './UnityConnection/index'
import { createLogger } from './UnityConnection/config'

import { createAgent, todoListMiddleware } from 'langchain'
import {
  createFilesystemMiddleware,
  createSubAgentMiddleware,
  CompositeBackend,
  StateBackend,
  StoreBackend,
  FilesystemBackend,
} from 'deepagents'
import type { SubAgent } from 'deepagents'

const log = createLogger('movesia.agent')

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Unity project path - set dynamically from extension.
 * Defaults to environment variable for backwards compatibility.
 */
let _unityProjectPath: string | null = process.env.UNITY_PROJECT_PATH ?? null

/**
 * Get the current Unity project path, or null if not set.
 */
export function getUnityProjectPath(): string | null {
  if (!_unityProjectPath) {
    return null
  }
  return resolve(_unityProjectPath)
}

/**
 * Check if a Unity project path has been configured.
 */
export function hasUnityProjectPath(): boolean {
  return _unityProjectPath !== null
}

/**
 * Set the Unity project path dynamically.
 * Call this from the extension when a project is selected.
 */
export function setUnityProjectPath(path: string): void {
  const previous = _unityProjectPath
  _unityProjectPath = path
  log.debug(`setUnityProjectPath: '${previous}' → '${path}'`)
}

/**
 * For backwards compatibility - resolves current path.
 * @deprecated Use getUnityProjectPath() instead
 */
export const UNITY_PROJECT_PATH_RESOLVED = _unityProjectPath
  ? resolve(_unityProjectPath)
  : ''

// =============================================================================
// LLM MODEL
// =============================================================================

/**
 * Create the ChatOpenAI model configured for OpenRouter.
 */
export function createModel(apiKey?: string, modelName?: string) {
  return new ChatOpenAI({
    modelName: modelName ?? 'minimax/minimax-m2.5:nitro',
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
    },
    apiKey: apiKey ?? process.env.OPENROUTER_API_KEY,
  })
}

/**
 * Create a model for subagents (uses a faster/cheaper model).
 */
export function createSubAgentModel(apiKey?: string) {
  return createModel(apiKey, 'minimax/minimax-m2.5:nitro')
}

// =============================================================================
// TOOLS
// =============================================================================

/**
 * Create internet search tool using Tavily.
 */
function createInternetSearch(apiKey?: string) {
  const key = apiKey ?? process.env.TAVILY_API_KEY
  if (!key) {
    return null
  }
  return new TavilySearch({
    tavilyApiKey: key,
    maxResults: 5,
  })
}

/**
 * Get all tools available to the agent.
 */
function getAllTools(tavilyApiKey?: string): any[] {
  const tools: any[] = [...unityTools]
  const internetSearch = createInternetSearch(tavilyApiKey)
  if (internetSearch) {
    tools.unshift(internetSearch)
  }
  return tools
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * ProBuilder subagent definition.
 */
const probuilderSubagent: SubAgent = {
  name: 'probuilder-expert',
  description:
    'Delegate to this agent for ANY 3D geometry or mesh work: creating shapes (cubes, walls, stairs, arches, cylinders, doors, pipes, tori), editing meshes (extrude, bevel, delete faces, merge), flipping normals to make rooms, assigning materials to specific faces, level prototyping, or any ProBuilder operation. Use when the user mentions: build, create shape, mesh, geometry, wall, room, floor, ceiling, stairs, extrude, bevel, level design, prototype, greybox, or whitebox.',
  systemPrompt: PROBUILDER_AGENT_PROMPT,
  tools: probuilderTools as any,
}

/**
 * Create the middleware stack for the agent.
 */
function createMiddlewareStack(projectPath?: string, subagentLlm?: any): any[] {
  const middleware: any[] = []
  const names: string[] = []

  // 1. Todo list middleware
  middleware.push(todoListMiddleware())
  names.push('todoList')

  // 2. Filesystem middleware - only if we have a project path
  if (projectPath) {
    const assetsPath = resolve(projectPath, 'Assets')
    log.debug(`Filesystem root: ${assetsPath}`)
    middleware.push(
      createFilesystemMiddleware({
        backend: (config: any) => {
          return new CompositeBackend(
            new FilesystemBackend({ rootDir: assetsPath, virtualMode: true }),
            {
              '/scratch/': new StateBackend(config),
              ...(config.store
                ? { '/memories/': new StoreBackend(config) }
                : {}),
            }
          )
        },
      })
    )
    names.push('filesystem')
  } else {
    log.warn('No projectPath — filesystem middleware skipped')
  }

  // 3. SubAgent middleware
  if (subagentLlm) {
    middleware.push(
      createSubAgentMiddleware({
        defaultModel: subagentLlm,
        defaultTools: [],
        subagents: [probuilderSubagent],
      })
    )
    names.push('subAgent(probuilder)')
  }

  log.debug(`Middleware: [${names.join(', ')}]`)
  return middleware
}

// =============================================================================
// AGENT FACTORY
// =============================================================================

/**
 * Options for creating the Movesia agent
 */
export interface CreateAgentOptions {
  checkpointer?: BaseCheckpointSaver
  unityManager?: UnityManager
  openRouterApiKey?: string
  tavilyApiKey?: string
  projectPath?: string
}

/**
 * Create the Movesia agent with the given options.
 *
 * Uses langchain's `createAgent` which supports middleware as a first-class
 * parameter.
 */
export function createMovesiaAgent(options: CreateAgentOptions = {}) {
  const {
    checkpointer = new MemorySaver(),
    unityManager,
    openRouterApiKey,
    tavilyApiKey,
    projectPath,
  } = options

  // Set project path if provided
  if (projectPath) {
    setUnityProjectPath(projectPath)
  }

  // Register unity manager if provided
  if (unityManager) {
    setUnityManager(unityManager)
  }

  // Create models
  const llm = createModel(openRouterApiKey)
  const modelName = (llm as any).modelName ?? 'unknown'
  const subagentLlm = createSubAgentModel(openRouterApiKey)

  // Get tools
  const tools = getAllTools(tavilyApiKey)
  const toolNames = tools.map((t: any) => t.name).join(', ')

  // Build middleware stack
  const middleware = createMiddlewareStack(projectPath, subagentLlm)
  const middlewareNames = middleware.map((m: any) => m.name || 'anonymous').join(', ')

  // Log summary (INFO) + details (DEBUG)
  log.info(`Creating agent (${tools.length} tools, ${middleware.length} middleware)`)
  log.debug(`Model: ${modelName}`)
  log.debug(`Tools: [${toolNames}]`)
  log.debug(`Middleware: [${middlewareNames}]`)
  log.debug(`Checkpointer: ${checkpointer?.constructor.name ?? 'MemorySaver'}`)
  log.debug(`Project: ${projectPath ?? 'none'}`)

  // Create the agent
  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt: UNITY_AGENT_PROMPT,
    middleware,
    checkpointer,
  })

  log.info('Agent created')

  return agent
}

/**
 * Agent type returned by createMovesiaAgent
 */
export type MovesiaAgent = ReturnType<typeof createMovesiaAgent>
