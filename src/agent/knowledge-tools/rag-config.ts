/**
 * Qdrant client configuration, connection management, and query embedding.
 *
 * Pattern mirrors unity-tools/connection.ts:
 *   setQdrantConfig(config)  →  module-level singleton
 *   getQdrantClient()        →  lazy-initialized QdrantClient
 *   embedQuery(text)         →  calls OpenRouter embeddings API → float[]
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import type { QdrantConfig, CollectionMeta } from './types'

// Simple logger — avoids importing UnityConnection/config which has
// ESM re-export issues when run outside Vite (e.g., tsx profiler script).
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

/** Module-level Qdrant configuration */
let _config: QdrantConfig | null = null

/** Lazy-initialized Qdrant client */
let _client: QdrantClient | null = null

/**
 * Set the Qdrant configuration. Called from agent.ts during agent creation.
 */
export function setQdrantConfig(config: QdrantConfig): void {
  _config = config
  _client = null // Reset client so it reinitializes on next use
  log.info(`Qdrant configured: ${config.url} (${config.collections.length} collections)`)
  for (const col of config.collections) {
    log.debug(`  Collection: ${col.name} — ${col.description} [field: ${col.contentField}, limit: ${col.defaultLimit}]`)
  }
}

/**
 * Get the current Qdrant configuration, or null if not set.
 */
export function getQdrantConfig(): QdrantConfig | null {
  return _config
}

/**
 * Get or create the Qdrant client instance (lazy initialization).
 * Returns null if config is not set.
 */
export function getQdrantClient(): QdrantClient | null {
  if (!_config) return null
  if (!_client) {
    _client = new QdrantClient({
      url: _config.url,
      apiKey: _config.apiKey,
      timeout: _config.timeout ?? 10_000,
    })
    log.debug('Qdrant client initialized')
  }
  return _client
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
// QUERY EMBEDDING
// =============================================================================

/**
 * Embed a text query using the Movesia proxy's embeddings endpoint.
 *
 * Routes through the website backend which validates the OAuth token
 * and forwards to OpenRouter with the server-side API key.
 * Default model: openai/text-embedding-3-small (1536 dimensions).
 */
export async function embedQuery(text: string): Promise<number[]> {
  if (!_config) {
    throw new Error('Qdrant config not set — cannot embed query')
  }

  const model = _config.embeddingModel ?? 'openai/text-embedding-3-small'
  const proxyBaseUrl = process.env.MOVESIA_AUTH_URL || 'https://movesia.com'

  // Get a fresh token per-request so expired tokens trigger on-demand refresh
  const token = _config.getAccessToken
    ? (await _config.getAccessToken() ?? _config.openRouterApiKey)
    : _config.openRouterApiKey

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
