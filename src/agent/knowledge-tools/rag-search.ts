/**
 * THE LIBRARIAN: knowledge_search
 * "I need to look up documentation, workflows, or in-depth guides."
 * Consumes: Movesia proxy for embeddings + Qdrant vector search.
 */

import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { getQdrantConfig, getCollectionNames, getCollectionMeta, embedQuery, searchViaProxy } from './rag-config'
import type { SearchToolResponse } from './types'

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
      hint: 'RAG configuration was not initialized during agent creation.',
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

  // ── EMBED THE QUERY (via proxy → OpenRouter) ──
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

  // ── RESOLVE PER-COLLECTION PARAMS ──
  const effectiveThreshold = scoreThreshold ?? qdrantConfig.scoreThreshold ?? 0.35

  const collectionsPayload = collections.map(name => {
    const meta = getCollectionMeta(name)
    return {
      name,
      limit: explicitLimit ?? meta?.defaultLimit,
      score_threshold: effectiveThreshold,
    }
  })

  // ── SEARCH VIA PROXY (proxy → Qdrant on server) ──
  try {
    const proxyResult = await searchViaProxy(embedding, collectionsPayload)

    log.info(`knowledge_search: "${query.slice(0, 60)}" → ${proxyResult.total_results} results from [${collections.join(', ')}]`)

    // Build the SearchToolResponse
    const response: SearchToolResponse = {
      success: proxyResult.success,
      query,
      collections_searched: collections,
      total_results: proxyResult.total_results,
      results: proxyResult.results,
    }

    if (proxyResult.errors && proxyResult.errors.length > 0 && proxyResult.total_results > 0) {
      response.hint = `Partial results. Errors: ${proxyResult.errors.join('; ')}`
    } else if (proxyResult.errors && proxyResult.errors.length > 0 && proxyResult.total_results === 0) {
      response.hint = `No results. Errors: ${proxyResult.errors.join('; ')}`
    } else if (proxyResult.total_results === 0) {
      response.hint = 'No relevant results found. Try broadening your query, using different keywords, or lowering the score_threshold.'
    }

    return JSON.stringify(response, null, 2)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.error(`Search failed: ${msg}`)
    return JSON.stringify({
      error: `Failed to search knowledge base: ${msg}`,
      hint: 'The knowledge base may be temporarily unavailable. Try again in a moment.',
      example: 'knowledge_search({ query: "rigidbody physics", collections: ["unity-docs"] })',
    }, null, 2)
  }
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
