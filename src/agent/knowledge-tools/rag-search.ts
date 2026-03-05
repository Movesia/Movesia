/**
 * THE LIBRARIAN: knowledge_search
 * "I need to look up documentation, workflows, or in-depth guides."
 * Consumes: Qdrant vector store collections via embeddings + search
 */

import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { getQdrantClient, getQdrantConfig, getCollectionNames, getCollectionMeta, embedQuery } from './rag-config'
import type { SearchResult, SearchToolResponse } from './types'

const PREFIX = '[RAG]'
const log = {
  debug: (msg: string) => console.debug(`${PREFIX} ${msg}`),
  info: (msg: string) => console.log(`${PREFIX} ${msg}`),
  error: (msg: string) => console.error(`${PREFIX} ${msg}`),
}

// ─────────────────────────────────────────────────────────────
// ZOD SCHEMA
// ─────────────────────────────────────────────────────────────

export const KnowledgeSearchSchema = z.object({
  query: z.string()
    .describe('Natural language search query. Be specific for better results. E.g., "How to set up a character controller with Rigidbody physics in Unity 6" rather than "character controller".'),

  collections: z.array(
    z.enum(['unity-docs', 'unity-workflows', 'unity-guides'])
      .describe(`Which knowledge collection to search:
- 'unity-workflows': Step-by-step task recipes with exact tool call sequences (how to BUILD things)
- 'unity-docs': Unity API reference and engine documentation (how things WORK)
- 'unity-guides': In-depth Unity ebooks covering architecture, patterns, performance, shaders, networking, DOTS, and code style (how to THINK about things and deep technical knowledge)`)
  )
    .min(1)
    .max(3)
    .describe('One or more collections to search. Use multiple when the question spans topics.'),

  limit: z.number().int().min(1).max(20).optional()
    .describe('Override results per collection. If omitted, uses smart defaults: unity-workflows=1 (large recipes), unity-docs=3, unity-guides=2. Set explicitly when you need more or fewer.'),

  score_threshold: z.number().min(0).max(1).optional()
    .describe('Minimum similarity score (0-1). Default 0.35 (permissive). Raise to 0.5-0.7 for stricter precision.'),
})

// ─────────────────────────────────────────────────────────────
// TYPE
// ─────────────────────────────────────────────────────────────

export type KnowledgeSearchInput = z.infer<typeof KnowledgeSearchSchema>

// ─────────────────────────────────────────────────────────────
// IMPLEMENTATION
// ─────────────────────────────────────────────────────────────

async function knowledgeSearchImpl(input: KnowledgeSearchInput, _config?: any): Promise<string> {
  const {
    query,
    collections,
    limit: explicitLimit,
    score_threshold: scoreThreshold,
  } = input

  // ── CHECK CONFIGURATION ──
  const qdrantConfig = getQdrantConfig()
  if (!qdrantConfig) {
    return JSON.stringify({
      error: 'Knowledge base not configured.',
      hint: 'Set QDRANT_URL and QDRANT_API_KEY environment variables.',
      example: 'knowledge_search({ query: "rigidbody physics", collections: ["unity-docs"] })',
    }, null, 2)
  }

  const client = getQdrantClient()
  if (!client) {
    return JSON.stringify({
      error: 'Failed to initialize Qdrant client.',
      hint: 'Check QDRANT_URL and QDRANT_API_KEY environment variables.',
      example: 'knowledge_search({ query: "rigidbody physics", collections: ["unity-docs"] })',
    }, null, 2)
  }

  // ── VALIDATE COLLECTIONS ──
  const availableCollections = getCollectionNames()
  const invalidCollections = collections.filter(c => !availableCollections.includes(c))
  if (invalidCollections.length > 0) {
    return JSON.stringify({
      error: `Unknown collection(s): ${invalidCollections.join(', ')}`,
      hint: `Available collections: ${availableCollections.join(', ')}`,
      example: `knowledge_search({ query: "${query}", collections: ["${availableCollections[0]}"] })`,
    }, null, 2)
  }

  // ── EMBED THE QUERY ──
  let embedding: number[]
  try {
    embedding = await embedQuery(query)
    log.debug(`Embedded query (${embedding.length} dims): "${query.slice(0, 80)}"`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`Embedding failed: ${msg}`)
    return JSON.stringify({
      error: `Failed to embed query: ${msg}`,
      hint: 'Check that the user is authenticated and the embedding model is available.',
      example: 'knowledge_search({ query: "rigidbody physics", collections: ["unity-docs"] })',
    }, null, 2)
  }

  // ── RESOLVE DEFAULTS ──
  // Low default threshold (0.35) — let the limit control result count, not the score cutoff
  const effectiveThreshold = scoreThreshold ?? qdrantConfig.scoreThreshold ?? 0.35

  // ── SEARCH EACH COLLECTION IN PARALLEL ──
  const allResults: SearchResult[] = []
  const errors: string[] = []

  const searchPromises = collections.map(async (collectionName) => {
    const meta = getCollectionMeta(collectionName)
    if (!meta) {
      return { collectionName, results: [] as SearchResult[], error: `No metadata for '${collectionName}'` }
    }

    // Per-collection smart limit: agent override > collection default
    const effectiveLimit = explicitLimit ?? meta.defaultLimit

    try {
      const response = await client.search(collectionName, {
        vector: embedding,
        limit: effectiveLimit,
        score_threshold: effectiveThreshold,
        with_payload: true,
      })

      const results: SearchResult[] = response.map((point) => {
        const payload = (point.payload ?? {}) as Record<string, unknown>

        // Extract content from the configured field for this collection
        const content = String(payload[meta.contentField] ?? '')

        // Build metadata from remaining payload fields
        const metadata = { ...payload }
        delete metadata[meta.contentField]

        // Convert BigInt IDs to string (Qdrant returns BigInt for large integer IDs)
        const id = typeof point.id === 'bigint' ? String(point.id) : point.id

        return {
          id,
          score: point.score ?? 0,
          content,
          metadata,
          collection: collectionName,
        }
      })

      log.debug(`[${collectionName}] ${results.length} results (limit=${effectiveLimit}, threshold=${effectiveThreshold})`)
      return { collectionName, results, error: null }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)

      if (errorMsg.includes('Not found') || errorMsg.includes("doesn't exist")) {
        return { collectionName, results: [] as SearchResult[], error: `Collection '${collectionName}' does not exist in Qdrant.` }
      }
      if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
        return { collectionName, results: [] as SearchResult[], error: `Qdrant timed out searching '${collectionName}'.` }
      }
      if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('Unauthorized')) {
        return { collectionName, results: [] as SearchResult[], error: 'Authentication failed for Qdrant. Check the API key.' }
      }

      return { collectionName, results: [] as SearchResult[], error: `Failed to search '${collectionName}': ${errorMsg}` }
    }
  })

  const searchResults = await Promise.all(searchPromises)

  for (const { results, error } of searchResults) {
    allResults.push(...results)
    if (error) errors.push(error)
  }

  // ── SORT BY SCORE (descending) ──
  allResults.sort((a, b) => b.score - a.score)

  // ── BUILD RESPONSE ──
  const response: SearchToolResponse = {
    success: errors.length === 0,
    query,
    collections_searched: collections,
    total_results: allResults.length,
    results: allResults,
  }

  if (errors.length > 0 && allResults.length > 0) {
    response.hint = `Partial results. Errors: ${errors.join('; ')}`
  } else if (errors.length > 0 && allResults.length === 0) {
    response.hint = `No results. Errors: ${errors.join('; ')}`
  } else if (allResults.length === 0) {
    response.hint = 'No relevant results found. Try broadening your query, using different keywords, or lowering the score_threshold.'
  }

  log.info(`knowledge_search: "${query.slice(0, 60)}" → ${allResults.length} results from [${collections.join(', ')}]`)

  return JSON.stringify(response, null, 2)
}

// ─────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────

export const knowledgeSearch = new DynamicStructuredTool({
  name: 'knowledge_search',
  description: `Search the knowledge base for Unity documentation, workflows, and guides. This is "The Librarian".

Use this tool when you need to look up:
- Step-by-step task recipes with exact tool sequences → collection: 'unity-workflows' (how to BUILD things)
- Unity API details, component docs, or engine behavior → collection: 'unity-docs' (how things WORK)
- Architecture, patterns, performance, shaders, networking, DOTS → collection: 'unity-guides' (how to THINK about things)

WHEN TO USE:
- User asks "how do I build X?" → search unity-workflows
- User asks "how does X work?" or "what parameters does Y take?" → search unity-docs
- User asks "how should I architect X?" or "what's the best approach?" → search unity-guides
- Complex task you haven't done before → search unity-workflows + unity-guides first

TIPS FOR GOOD QUERIES:
- Be specific: "Unity 6 Rigidbody linearVelocity migration from velocity" > "rigidbody"
- Include context: "NavMesh agent pathfinding on dynamic obstacles" > "pathfinding"
- Use technical terms: "URP ShaderGraph custom lit shader" > "custom shader"

Results are ranked by similarity score (0-1). Higher = more relevant.`,
  schema: KnowledgeSearchSchema,
  func: knowledgeSearchImpl,
})
