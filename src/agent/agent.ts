/**
 * Movesia Agent Factory
 *
 * Creates the LangGraph-based agent with Unity tools and middleware.
 * Uses langchain's createAgent (with middleware support) + deepagents
 * for filesystem access rooted at the Unity project path.
 *
 * Configuration is passed dynamically rather than read from environment variables.
 */

import { createHash } from 'crypto';
import { resolve } from 'path';
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver, interrupt } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseStore } from '@langchain/langgraph-checkpoint';
import { SystemMessage, ToolMessage } from '@langchain/core/messages';
import { unityTools, setUnityManager } from './unity-tools/index';
import { createInternetSearch, knowledgeSearch, setQdrantConfig } from './knowledge-tools/index';
import type { QdrantConfig } from './knowledge-tools/index';
import { UNITY_AGENT_PROMPT } from './prompts';
import type { UnityManager } from './UnityConnection/index';
import { createLogger } from './UnityConnection/config';

import { createAgent, createMiddleware } from 'langchain';
import {
  createFilesystemMiddleware,
  CompositeBackend,
  StateBackend,
  StoreBackend,
  FilesystemBackend,
} from 'deepagents';
import { OptimizedTodoMiddleware } from './middlewares/index';
import { NormalizedBackend } from './normalized-backend';

export { createFilesystemMiddleware, StateBackend };

const log = createLogger('movesia.agent');

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Unity project path - set dynamically from extension.
 * Defaults to environment variable for backwards compatibility.
 */
let _unityProjectPath: string | null = process.env.UNITY_PROJECT_PATH ?? null;

/**
 * Get the current Unity project path, or null if not set.
 */
export function getUnityProjectPath (): string | null {
  if (!_unityProjectPath) {
    return null;
  }
  return resolve(_unityProjectPath);
}

/**
 * Check if a Unity project path has been configured.
 */
export function hasUnityProjectPath (): boolean {
  return _unityProjectPath !== null;
}

/**
 * Set the Unity project path dynamically.
 * Call this from the extension when a project is selected.
 */
export function setUnityProjectPath (path: string): void {
  const previous = _unityProjectPath;
  _unityProjectPath = path;
  log.debug(`setUnityProjectPath: '${previous}' → '${path}'`);
}

/**
 * For backwards compatibility - resolves current path.
 * @deprecated Use getUnityProjectPath() instead
 */
export const UNITY_PROJECT_PATH_RESOLVED = _unityProjectPath ? resolve(_unityProjectPath) : '';

// =============================================================================
// LLM MODEL
// =============================================================================

/**
 * Create the ChatOpenAI model.
 *
 * Currently configured to hit Fireworks AI directly for testing.
 * To revert to the Movesia proxy, restore the proxy baseURL and use
 * the OAuth access token as apiKey.
 *
 * @param accessToken - OAuth access token (unused when hitting Fireworks directly)
 * @param modelName - Model identifier (default: accounts/fireworks/models/deepseek-v3)
 */
export function createModel (accessToken: string, modelName?: string) {
  const fireworksApiKey = process.env.FIREWORKS_API_KEY || '';
  const defaultModel = process.env.MOVESIA_MODEL || 'accounts/fireworks/models/minimax-m2p5';
  const resolvedModel = modelName ?? defaultModel;

  log.info(`Creating model via Fireworks AI: ${resolvedModel} ` + `(key: ${fireworksApiKey.slice(0, 8)}...)`);

  return new ChatOpenAI({
    modelName: resolvedModel,
    streaming: true,
    configuration: {
      baseURL: 'https://api.fireworks.ai/inference/v1',
    },
    apiKey: fireworksApiKey,
  });
}

// =============================================================================
// TOOLS
// =============================================================================

/**
 * Get all tools available to the agent.
 */
export function getAllTools (tavilyApiKey?: string): any[] {
  const tools: any[] = [...unityTools];
  const internetSearch = createInternetSearch(tavilyApiKey);
  if (internetSearch) {
    tools.unshift(internetSearch);
  }
  return tools;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Generate a stable hash from a project path for namespace scoping.
 * Normalizes the path (lowercase, forward slashes) so the same project
 * always maps to the same namespace regardless of OS path format.
 */
function projectNamespaceHash (projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/**
 * Optimized todo middleware (balanced mode) — replaces langchain's
 * todoListMiddleware. Provides a write_todos tool + system prompt
 * at ~630 tokens vs ~3,189 tokens for the original.
 */
const todoMiddleware = new OptimizedTodoMiddleware({ mode: 'balanced' });

// =============================================================================
// HUMAN-IN-THE-LOOP CONFIGURATION
// =============================================================================

/**
 * Tools that require user approval before execution.
 * Uses a Set for O(1) lookup in the wrapToolCall hook.
 */
const APPROVAL_REQUIRED_TOOLS = new Set([
  'write_file',
  'edit_file',
  'unity_deletion',
]);

/**
 * Custom HITL middleware using wrapToolCall.
 *
 * Why not humanInTheLoopMiddleware?
 * The built-in afterModel-based middleware mutates AIMessage.tool_calls in-place
 * before the graph's routing decision, breaking model → tools routing entirely.
 * Additionally, write_file/edit_file are injected by createFilesystemMiddleware
 * (not in the direct tools array), so the afterModel approach can't find them.
 *
 * wrapToolCall runs INSIDE the ToolNode (after routing), so it:
 * - Cannot break model → tools routing
 * - Works with middleware-injected tools (filesystem tools)
 * - Intercepts each tool call individually
 */
const hitlMiddleware = createMiddleware({
  name: 'MovesiaHITL',
  wrapToolCall: async (request: any, handler: any) => {
    const toolName: string = request.toolCall.name;

    if (!APPROVAL_REQUIRED_TOOLS.has(toolName)) {
      // Auto-execute: read-only and Unity scene tools
      return handler(request);
    }

    // Mutating tool — interrupt for user approval
    log.info(`[HITL] Interrupting for approval: ${toolName} (id=${request.toolCall.id})`);

    const decision = interrupt({
      type: 'tool-approval',
      toolName,
      toolCallId: request.toolCall.id,
      args: request.toolCall.args,
    });

    // interrupt() returns the resume value after user responds
    if (decision && (decision as any).type === 'reject') {
      const reason = (decision as any).reason || 'Rejected by user';
      log.info(`[HITL] Rejected: ${toolName} — ${reason}`);
      return new ToolMessage({
        content: `Tool "${toolName}" was rejected: ${reason}`,
        tool_call_id: request.toolCall.id,
      });
    }

    // Approved — execute the tool
    log.info(`[HITL] Approved: ${toolName}`);
    return handler(request);
  },
});

/**
 * Create the middleware stack for the agent.
 * Note: The todo middleware is no longer a LangGraph middleware —
 * its tool and system prompt are injected directly into the agent.
 * Includes filesystem middleware and HITL middleware.
 */
function createMiddlewareStack (projectPath?: string): any[] {
  const middleware: any[] = [];
  const names: string[] = [];

  // Filesystem middleware - only if we have a project path
  if (projectPath) {
    const assetsPath = resolve(projectPath, 'Assets');
    log.debug(`Filesystem root: ${assetsPath}`);
    middleware.push(
      createFilesystemMiddleware({
        backend: (config: any) => {
          return new CompositeBackend(
            new NormalizedBackend(new FilesystemBackend({ rootDir: assetsPath, virtualMode: true })),
            {
              '/scratch/': new StateBackend(config),
              ...(config.store
                ? {
                    '/memories/': new StoreBackend(config, {
                      namespace: ['projects', projectNamespaceHash(projectPath), 'memories'],
                    }),
                  }
                : {}),
            }
          );
        },
      })
    );
    names.push('filesystem');
  } else {
    log.warn('No projectPath — filesystem middleware skipped');
  }

  // HITL middleware — uses wrapToolCall to intercept mutating tools
  middleware.push(hitlMiddleware);
  names.push('hitl');

  log.debug(`Middleware: [${names.join(', ')}]`);
  return middleware;
}

// =============================================================================
// AGENT FACTORY
// =============================================================================

/**
 * Options for creating the Movesia agent
 */
export interface CreateAgentOptions {
  checkpointer?: BaseCheckpointSaver;
  store?: BaseStore;
  unityManager?: UnityManager;
  openRouterApiKey?: string;
  tavilyApiKey?: string;
  projectPath?: string;
  qdrantConfig?: QdrantConfig;
}

/**
 * Create the Movesia agent with the given options.
 *
 * Uses langchain's `createAgent` which supports middleware as a first-class
 * parameter.
 */
export function createMovesiaAgent (options: CreateAgentOptions = {}) {
  const {
    checkpointer = new MemorySaver(),
    store,
    unityManager,
    openRouterApiKey,
    tavilyApiKey,
    projectPath,
    qdrantConfig,
  } = options;

  // Set project path if provided
  if (projectPath) {
    setUnityProjectPath(projectPath);
  }

  // Register unity manager if provided
  if (unityManager) {
    setUnityManager(unityManager);
  }

  // Configure Qdrant for knowledge search if provided
  if (qdrantConfig) {
    setQdrantConfig(qdrantConfig);
  }

  // Create model
  const llm = createModel(openRouterApiKey);
  const modelName = (llm as any).modelName ?? 'unknown';

  // Get tools + add todo middleware tool + knowledge search (if configured)
  const tools = [...getAllTools(tavilyApiKey), todoMiddleware.tool];
  if (qdrantConfig) {
    tools.push(knowledgeSearch);
  }
  const toolNames = tools.map((t: any) => t.name).join(', ');

  // Build system prompt.
  // For non-Anthropic providers (Fireworks, etc.), use a plain string.
  const systemPrompt = new SystemMessage({
    content: `${UNITY_AGENT_PROMPT}\n\n${todoMiddleware.systemPrompt}`,
  });

  // --- ANTHROPIC PROMPT CACHING (restore when switching back to OpenRouter/Anthropic) ---
  // const systemPrompt = new SystemMessage({
  //   content: [
  //     {
  //       type: 'text' as const,
  //       text: UNITY_AGENT_PROMPT,
  //       cache_control: { type: 'ephemeral' as const },
  //     },
  //     {
  //       type: 'text' as const,
  //       text: todoMiddleware.systemPrompt,
  //       cache_control: { type: 'ephemeral' as const },
  //     },
  //   ],
  // });

  // Build middleware stack (filesystem only — todo is injected directly)
  const middleware = createMiddlewareStack(projectPath);
  const middlewareNames = middleware.map((m: any) => m.name || 'anonymous').join(', ');

  // Log summary (INFO) + details (DEBUG)
  log.info(`Creating agent (${tools.length} tools, ${middleware.length} middleware)`);
  log.debug(`Model: ${modelName}`);
  log.debug(`Tools: [${toolNames}]`);
  log.debug(`Middleware: [${middlewareNames}]`);
  log.debug(`Todo middleware: balanced (custom OptimizedTodoMiddleware)`);
  log.debug(`Checkpointer: ${checkpointer?.constructor.name ?? 'MemorySaver'}`);
  log.debug(`Store: ${store?.constructor.name ?? 'none'}`);
  log.debug(`Project: ${projectPath ?? 'none'}`);

  // Create the agent
  const agent = createAgent({
    model: llm,
    tools,
    systemPrompt,
    middleware,
    checkpointer,
    store,
  });
  log.info('Agent created');

  return agent;
}

/**
 * Agent type returned by createMovesiaAgent
 */
export type MovesiaAgent = ReturnType<typeof createMovesiaAgent>;
