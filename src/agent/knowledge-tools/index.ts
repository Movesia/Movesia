/**
 * Knowledge Tools Package
 *
 * Contains tools for external knowledge retrieval:
 * - Web search (Tavily) — internet search for up-to-date information
 * - RAG search (Qdrant) — vector search over Unity docs, workflows, and guides (disabled)
 */

// Web search
export { createInternetSearch } from './web-search'

// RAG search (currently disabled — not attached to agent)
export { knowledgeSearch, KnowledgeSearchSchema, type KnowledgeSearchInput } from './rag-search'
export { setQdrantConfig, getQdrantConfig, getQdrantClient, embedQuery } from './rag-config'
export type { QdrantConfig, CollectionMeta, SearchResult, SearchToolResponse } from './types'
export { ragTools, type RagTool } from './rag-tools'
