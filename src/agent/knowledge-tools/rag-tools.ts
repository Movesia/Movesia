/**
 * RAG tools array for easy registration with LangGraph.
 * Currently disabled — not attached to the agent.
 */

import { knowledgeSearch } from './rag-search'

/**
 * All RAG tools as an array for easy registration with LangGraph.
 *
 * Usage (when enabled):
 *     import { ragTools } from './knowledge-tools';
 *     const tools = [...unityTools, ...ragTools];
 */
export const ragTools = [
  knowledgeSearch,  // The Librarian - knowledge base search
] as const

/** Type for any RAG tool */
export type RagTool = typeof ragTools[number]
