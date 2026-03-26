/**
 * RAG configuration, query embedding, and proxy search.
 *
 * Both embedding and vector search go through the Movesia website proxy:
 *   embedQuery(text)         →  POST /api/v1/embeddings  →  OpenRouter
 *   searchViaProxy(...)      →  POST /api/v1/rag/search  →  Qdrant (localhost on server)
 *
 * The Electron app never connects to Qdrant directly.
 */

import type { QdrantConfig, CollectionMeta, SearchResult } from './types'

// Simple logger
const PREFIX = '[RAG]'
const log = {
  debug: (msg: string) => console.debug(`${PREFIX} ${msg}`),
  info: (msg: string) => console.log(`${PREFIX} ${msg}`),
  warn: (msg: string) => console.warn(`${PREFIX} ${msg}`),
  error: (msg: string) => console.error(`${PREFIX} ${msg}`),
}

// =============================================================================
// MODULE-LEVEL SINGLETON
// =============================================================================

/** Module-level RAG configuration */
let _config: QdrantConfig | null = null

/**
 * Set the RAG configuration. Called from agent.ts during agent creation.
 */
export function setQdrantConfig(config: QdrantConfig): void {
  _config = config
  log.info(`RAG configured (${config.collections.length} collections, proxy-only)`)
  for (const col of config.collections) {
    log.debug(`  Collection: ${col.name} — ${col.description} [field: ${col.contentField}, limit: ${col.defaultLimit}]`)
  }
}

/**
 * Get the current RAG configuration, or null if not set.
 */
export function getQdrantConfig(): QdrantConfig | null {
  return _config
}

/**
 * Get the list of available collection names.
 */
export function getCollectionNames(): string[] {
  return _config?.collections.map(c => c.name) ?? []
}

/**
 * Get metadata for a specific collection.
 */
export function getCollectionMeta(name: string): CollectionMeta | undefined {
  return _config?.collections.find(c => c.name === name)
}

// =============================================================================
// HELPER: get a fresh access token
// =============================================================================

async function getToken(): Promise<string> {
  if (!_config) throw new Error('RAG config not set')
  const token = _config.getAccessToken
    ? (await _config.getAccessToken() ?? _config.openRouterApiKey)
    : _config.openRouterApiKey
  if (!token) throw new Error('No access token available for RAG')
  return token
}

// =============================================================================
// QUERY EMBEDDING (via proxy)
// =============================================================================

/**
 * Embed a text query using the Movesia proxy's embeddings endpoint.
 *
 * Routes through the website backend which validates the OAuth token
 * and forwards to OpenRouter (always, regardless of chat provider).
 * Sends model="default" — the proxy resolves it to openai/text-embedding-3-small.
 */
export async function embedQuery(text: string): Promise<number[]> {
  if (!_config) {
    throw new Error('RAG config not set — cannot embed query')
  }

  const model = _config.embeddingModel ?? 'default'
  const proxyBaseUrl = process.env.MOVESIA_AUTH_URL || 'https://movesia.com'
  const token = await getToken()

  const response = await fetch(`${proxyBaseUrl}/api/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: text,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Embedding request failed (${response.status}): ${body}`)
  }

  const json = await response.json() as {
    data?: Array<{ embedding?: number[] }>
  }

  const embedding = json.data?.[0]?.embedding
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Unexpected embedding response format')
  }

  return embedding
}

// =============================================================================
// VECTOR SEARCH (via proxy)
// =============================================================================

/** Response shape from the /api/v1/rag/search proxy endpoint. */
interface ProxySearchResponse {
  success: boolean
  total_results: number
  results: SearchResult[]
  errors?: string[]
}

/**
 * Search Qdrant collections via the Movesia proxy.
 *
 * The proxy connects to Qdrant on localhost:6333 (same VPS), validates
 * the OAuth token, and returns results. The Electron app never talks
 * to Qdrant directly.
 */
export async function searchViaProxy(
  embedding: number[],
  collections: Array<{ name: string; limit?: number; score_threshold?: number }>,
): Promise<ProxySearchResponse> {
  const proxyBaseUrl = process.env.MOVESIA_AUTH_URL || 'https://movesia.com'
  const token = await getToken()

  const response = await fetch(`${proxyBaseUrl}/api/v1/rag/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embedding, collections }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`RAG search failed (${response.status}): ${body}`)
  }

  return response.json() as Promise<ProxySearchResponse>
}
