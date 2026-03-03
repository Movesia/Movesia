/**
 * RAG Tools Package - Knowledge retrieval tools for the Movesia agent.
 *
 * Provides tools for searching external knowledge bases (Qdrant vector store)
 * to augment the agent's context with documentation, workflows, and in-depth guides.
 *
 * Tools:
 * - knowledge_search: The Librarian — search documentation and knowledge bases
 *
 * Setup:
 *     Before using tools, configure the Qdrant connection:
 *
 *         import { setQdrantConfig } from './rag-tools';
 *         setQdrantConfig({ url: '...', apiKey: '...', ... });
 */

import { knowledgeSearch } from './search'

// Configuration
export { setQdrantConfig, getQdrantConfig, getQdrantClient, embedQuery } from './config'

// Types
export type { QdrantConfig, CollectionMeta, SearchResult, SearchToolResponse } from './types'

// Tool with schema and type
export { knowledgeSearch, KnowledgeSearchSchema, type KnowledgeSearchInput } from './search'

/**
 * All RAG tools as an array for easy registration with LangGraph.
 *
 * Usage:
 *     import { ragTools } from './rag-tools';
 *     const tools = [...unityTools, ...ragTools];
 */
export const ragTools = [
  knowledgeSearch,  // The Librarian - knowledge base search
] as const

/** Type for any RAG tool */
export type RagTool = typeof ragTools[number]
