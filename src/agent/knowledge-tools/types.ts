/**
 * Shared types for RAG/Knowledge tools.
 */

/**
 * Metadata about a Qdrant collection — used to teach the agent
 * which collection to query and how to extract content from results.
 */
export interface CollectionMeta {
  /** Qdrant collection name (case-sensitive) */
  name: string
  /** Human-readable description for logging */
  description: string
  /** Payload field that holds the main text content */
  contentField: string
  /** Default result limit for this collection */
  defaultLimit: number
}

/**
 * Configuration for RAG knowledge search.
 *
 * The Electron app never connects to Qdrant directly — both embedding
 * and vector search go through the website proxy on movesia.com.
 */
export interface QdrantConfig {
  /** Available collections with metadata */
  collections: CollectionMeta[]
  /** OAuth access token for API calls (used as fallback if getAccessToken is not set) */
  openRouterApiKey: string
  /** Async getter for a fresh access token — called per-request so expired tokens trigger on-demand refresh */
  getAccessToken?: () => Promise<string | null>
  /** Embedding model identifier (default: "default" — resolved server-side) */
  embeddingModel?: string
  /** Minimum similarity score (default: 0.35) */
  scoreThreshold?: number
  /** Request timeout in ms (default: 10000) */
  timeout?: number
}

/**
 * A single search result from Qdrant.
 */
export interface SearchResult {
  id: string | number
  score: number
  /** The main text content extracted from the payload */
  content: string
  /** Remaining payload fields as metadata */
  metadata: Record<string, unknown>
  /** Which collection this came from */
  collection: string
}

/**
 * Structured tool response.
 */
export interface SearchToolResponse {
  success: boolean
  query: string
  collections_searched: string[]
  total_results: number
  results: SearchResult[]
  hint?: string
}
