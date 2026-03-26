/**
 * Knowledge Tools Package
 *
 * Contains tools for external knowledge retrieval:
 * - Web search (Tavily) — internet search for up-to-date information
 * - RAG search — vector search over Unity docs, workflows, and guides (via proxy)
 */

// Web search
export { createInternetSearch } from './web-search'

// RAG search (always enabled — embedding + search go through website proxy)
export { knowledgeSearch, KnowledgeSearchSchema, type KnowledgeSearchInput } from './rag-search'
export { setQdrantConfig, getQdrantConfig, embedQuery, searchViaProxy } from './rag-config'
export type { QdrantConfig, CollectionMeta, SearchResult, SearchToolResponse } from './types'
export { ragTools, type RagTool } from './rag-tools'
