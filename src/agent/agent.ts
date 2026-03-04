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
import { TavilySearch } from '@langchain/tavily';
import { MemorySaver } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { BaseStore } from '@langchain/langgraph-checkpoint';
import { unityTools, setUnityManager } from './unity-tools/index';
// RAG tools disabled — uncomment when ready to use
// import { ragTools, setQdrantConfig } from './rag-tools/index';
// import type { QdrantConfig } from './rag-tools/index';
import { UNITY_AGENT_PROMPT } from './prompts';
import type { UnityManager } from './UnityConnection/index';
import { createLogger } from './UnityConnection/config';

import { createAgent } from 'langchain';
import {
  createFilesystemMiddleware,
  CompositeBackend,
  StateBackend,
  StoreBackend,
  FilesystemBackend,
} from 'deepagents';
import { OptimizedTodoMiddleware } from './middlewares/index';

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
 * Create the ChatOpenAI model routed through the Movesia proxy.
 *
 * The proxy validates the OAuth access token, forwards to OpenRouter with
 * the server-side API key, and logs usage analytics.
 *
 * @param accessToken - Required OAuth access token (sent as Authorization: Bearer)
 * @param modelName - OpenRouter model identifier (default: anthropic/claude-haiku-4.5)
 */
export function createModel (accessToken: string, modelName?: string) {
  const proxyBaseUrl = process.env.MOVESIA_AUTH_URL || 'https://movesia.com';
  log.info(
    `Creating model via proxy: ${proxyBaseUrl}/api/v1 ` +
    `(token: ${accessToken.slice(0, 8)}...${accessToken.slice(-4)}, len=${accessToken.length})`
  );
  return new ChatOpenAI({
    modelName: modelName ?? 'anthropic/claude-haiku-4.5',
    streaming: true,
    configuration: {
      baseURL: `${proxyBaseUrl}/api/v1`,
    },
    apiKey: accessToken, // OAuth access token — validated server-side by the proxy
  });
}

// =============================================================================
// TOOLS
// =============================================================================

/**
 * Create internet search tool using Tavily.
 */
function createInternetSearch (apiKey?: string) {
  const key = apiKey ?? process.env.TAVILY_API_KEY;
  if (!key) {
    return null;
  }
  return new TavilySearch({
    tavilyApiKey: key,
    maxResults: 5,
  });
}

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

/**
 * Create the middleware stack for the agent.
 * Note: The todo middleware is no longer a LangGraph middleware —
 * its tool and system prompt are injected directly into the agent.
 * Only the filesystem middleware uses the middleware[] parameter.
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
          return new CompositeBackend(new FilesystemBackend({ rootDir: assetsPath, virtualMode: true }), {
            '/scratch/': new StateBackend(config),
            ...(config.store
              ? { '/memories/': new StoreBackend(config, { namespace: ['projects', projectNamespaceHash(projectPath), 'memories'] }) }
              : {}),
          });
        },
      })
    );
    names.push('filesystem');
  } else {
    log.warn('No projectPath — filesystem middleware skipped');
  }

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
  // qdrantConfig?: QdrantConfig;
}

/**
 * Create the Movesia agent with the given options.
 *
 * Uses langchain's `createAgent` which supports middleware as a first-class
 * parameter.
 */
export function createMovesiaAgent (options: CreateAgentOptions = {}) {
  const { checkpointer = new MemorySaver(), store, unityManager, openRouterApiKey, tavilyApiKey, projectPath } = options;

  // Set project path if provided
  if (projectPath) {
    setUnityProjectPath(projectPath);
  }

  // Register unity manager if provided
  if (unityManager) {
    setUnityManager(unityManager);
  }

  // Create model
  const llm = createModel(openRouterApiKey);
  const modelName = (llm as any).modelName ?? 'unknown';

  // Get tools + add todo middleware tool
  const tools = [...getAllTools(tavilyApiKey), todoMiddleware.tool];
  const toolNames = tools.map((t: any) => t.name).join(', ');

  // Build system prompt with todo instructions appended
  const systemPrompt = `${UNITY_AGENT_PROMPT}\n\n${todoMiddleware.systemPrompt}`;

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
