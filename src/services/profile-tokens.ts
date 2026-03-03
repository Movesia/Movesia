#!/usr/bin/env tsx
/**
 * Token Profiling Script — One-Time Calibration
 *
 * Measures exact per-component token costs via differential API calls
 * to OpenRouter. Reads tools, system prompt, and middleware from the
 * actual agent configuration — not hardcoded.
 *
 * Phase 1: Raw model calls — per-tool and per-prompt-section costs
 * Phase 2: Agent invocations — filesystem middleware cost
 *
 * Usage:
 *   npx tsx src/services/profile-tokens.ts
 *
 * Requires: OPENROUTER_API_KEY in .env or environment
 *
 * Output: token-logs/tool-calibration.json (in current working directory)
 */

import { config } from 'dotenv'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { MemorySaver } from '@langchain/langgraph'
import { createAgent } from 'langchain'
import { createFilesystemMiddleware, StateBackend } from 'deepagents'
import { unityTools } from '../agent/unity-tools/index'
// RAG tools disabled — uncomment when ready to use
// import { ragTools } from '../agent/rag-tools/index'
import { UNITY_AGENT_PROMPT } from '../agent/prompts'
import { OptimizedTodoMiddleware } from '../agent/middlewares/index'

config({ path: join(process.cwd(), '.env') })

const API_KEY = process.env.OPENROUTER_API_KEY
if (!API_KEY) {
  console.error('ERROR: OPENROUTER_API_KEY not set. Add it to .env or environment.')
  process.exit(1)
}

const MODEL = 'anthropic/claude-haiku-4.5'
const OUTPUT_DIR = join(process.cwd(), 'token-logs')
const OUTPUT_FILE = join(OUTPUT_DIR, 'tool-calibration.json')

const PROBE_MESSAGE = 'Hi'

// =============================================================================
// Read actual agent configuration
// =============================================================================

const todoMiddleware = new OptimizedTodoMiddleware({ mode: 'balanced' })
const FULL_SYSTEM_PROMPT = `${UNITY_AGENT_PROMPT}\n\n${todoMiddleware.systemPrompt}`
const ALL_TOOLS = [...unityTools, todoMiddleware.tool]

// =============================================================================
// Helpers
// =============================================================================

function createModel(): ChatOpenAI {
  return new ChatOpenAI({
    modelName: MODEL,
    streaming: false,
    maxTokens: 1,
    configuration: { baseURL: 'https://openrouter.ai/api/v1' },
    apiKey: API_KEY,
  })
}

/**
 * Raw model call — measures input tokens for a given system prompt + tools.
 */
async function measureRaw(
  model: ChatOpenAI,
  systemPrompt: string,
  tools: unknown[],
  label: string,
): Promise<number> {
  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(PROBE_MESSAGE),
  ]

  const bound = tools.length > 0 ? model.bindTools(tools as any) : model
  const result = await bound.invoke(messages)

  const usage =
    (result as any).usage_metadata ??
    (result as any).response_metadata?.usage ??
    {}

  const inputTokens = (usage.input_tokens ?? usage.prompt_tokens ?? 0) as number
  console.log(`  ${label}: ${inputTokens.toLocaleString()} input tokens`)
  return inputTokens
}

let agentCounter = 0

/**
 * Agent invocation — measures input tokens from the first LLM call.
 * maxTokens: 1 ensures exactly one LLM call (can't produce tool calls).
 */
async function measureAgent(
  systemPrompt: string,
  tools: any[],
  middleware: any[],
  label: string,
): Promise<number> {
  const model = createModel()
  const agent = createAgent({
    model,
    tools,
    systemPrompt,
    middleware,
    checkpointer: new MemorySaver(),
  })

  const threadId = `profiler-${++agentCounter}-${Date.now()}`
  const stream = await (agent as any).streamEvents(
    { messages: [new HumanMessage(PROBE_MESSAGE)] },
    { configurable: { thread_id: threadId }, version: 'v2' },
  )

  for await (const event of stream) {
    if (event.event === 'on_chat_model_end') {
      const output = event.data?.output
      const usage =
        output?.usage_metadata ??
        output?.response_metadata?.usage ??
        {}
      const inputTokens = (usage.input_tokens ?? usage.prompt_tokens ?? 0) as number
      console.log(`  ${label}: ${inputTokens.toLocaleString()} input tokens`)
      return inputTokens
    }
  }

  console.log(`  ${label}: (no usage data captured)`)
  return 0
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║         Token Profiling Script                  ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log(`  Model:            ${MODEL}`)
  console.log(`  Base prompt:      ${UNITY_AGENT_PROMPT.length} chars`)
  console.log(`  Todo prompt:      ${todoMiddleware.systemPrompt.length} chars (balanced)`)
  console.log(`  Full prompt:      ${FULL_SYSTEM_PROMPT.length} chars`)
  console.log(`  Unity tools:      ${unityTools.length}`)
  console.log(`  Todo tool:        write_todos (from OptimizedTodoMiddleware)`)
  console.log(`  Total tools:      ${ALL_TOOLS.length}`)
  console.log('')

  const model = createModel()

  // =========================================================================
  // PHASE 1: Raw model calls — per-component measurement
  // =========================================================================

  console.log('━━━ PHASE 1: Component Measurement (raw model calls) ━━━')
  console.log('')

  // Step 1: Bare baseline — just the Unity system prompt, no tools
  console.log('Step 1: Bare baseline (Unity prompt only, no tools)...')
  const bareBaseline = await measureRaw(model, UNITY_AGENT_PROMPT, [], 'Bare baseline')
  console.log('')

  // Step 2: Full baseline — Unity prompt + todo system prompt, no tools
  console.log('Step 2: Full baseline (Unity + todo prompt, no tools)...')
  const fullBaseline = await measureRaw(model, FULL_SYSTEM_PROMPT, [], 'Full baseline')
  const todoPromptCost = fullBaseline - bareBaseline
  console.log(`  → Todo system prompt: ${todoPromptCost.toLocaleString()} tokens`)
  console.log('')

  // Step 3: All tools together (unity + write_todos), full prompt
  console.log(`Step 3: All ${ALL_TOOLS.length} tools together (full prompt)...`)
  const allToolsRaw = await measureRaw(model, FULL_SYSTEM_PROMPT, ALL_TOOLS, 'All tools')
  const allToolsCost = allToolsRaw - fullBaseline
  console.log(`  → All tool schemas: ${allToolsCost.toLocaleString()} tokens`)
  console.log('')

  // Step 4: Each tool individually (full prompt)
  console.log('Step 4: Each tool individually...')
  const toolCosts: Record<string, number> = {}
  let individualSum = 0

  for (const tool of ALL_TOOLS) {
    const withTool = await measureRaw(model, FULL_SYSTEM_PROMPT, [tool], (tool as any).name)
    const cost = withTool - fullBaseline
    toolCosts[(tool as any).name] = cost
    individualSum += cost
  }
  console.log('')

  // Phase 1 results
  const perToolOverhead = allToolsCost - individualSum
  console.log('Phase 1 Results:')
  console.log(`  Bare baseline (Unity prompt):   ${bareBaseline.toLocaleString()}`)
  console.log(`  Todo system prompt addition:    ${todoPromptCost.toLocaleString()}`)
  console.log(`  Full baseline (combined prompt): ${fullBaseline.toLocaleString()}`)
  console.log(`  All tool schemas combined:      ${allToolsCost.toLocaleString()}`)
  console.log(`  Sum of individual tools:        ${individualSum.toLocaleString()}`)
  console.log(`  Per-tool framework overhead:    ${perToolOverhead.toLocaleString()}`)
  console.log('')

  console.log('  Per-tool costs:')
  const sorted = Object.entries(toolCosts).sort((a, b) => b[1] - a[1])
  for (const [name, cost] of sorted) {
    const bar = '█'.repeat(Math.ceil(cost / 50))
    console.log(`    ${name.padEnd(22)} ${String(cost).padStart(6)}  ${bar}`)
  }
  console.log('')

  // =========================================================================
  // PHASE 2: Filesystem middleware (agent invocations)
  // =========================================================================

  console.log('━━━ PHASE 2: Filesystem Middleware (agent invocations) ━━━')
  console.log('')

  // Step 5: Agent baseline — full prompt, all tools, NO middleware
  console.log('Step 5: Agent baseline (no middleware)...')
  const agentNoMw = await measureAgent(FULL_SYSTEM_PROMPT, [...ALL_TOOLS] as any, [], 'No middleware')
  console.log('')

  // Step 6: Agent + filesystem middleware
  console.log('Step 6: Agent + filesystemMiddleware...')
  const agentFs = await measureAgent(
    FULL_SYSTEM_PROMPT,
    [...ALL_TOOLS] as any,
    [createFilesystemMiddleware({
      backend: (_config: any) => new StateBackend(_config),
    })],
    'With filesystem',
  )
  const fsCost = agentFs - agentNoMw
  console.log(`  → Filesystem middleware: ${fsCost.toLocaleString()} tokens`)
  console.log('')

  // Agent framework overhead (agent vs raw model, same prompt + tools)
  const agentFrameworkOverhead = agentNoMw - allToolsRaw
  console.log('Phase 2 Results:')
  console.log(`  Agent baseline (no middleware): ${agentNoMw.toLocaleString()}`)
  console.log(`  Filesystem middleware:          ${fsCost.toLocaleString()} tokens`)
  console.log(`  Agent framework overhead:       ${agentFrameworkOverhead.toLocaleString()} tokens`)
  console.log(`    (agent no-mw minus raw model with same prompt + tools)`)
  console.log('')

  // =========================================================================
  // FULL BUDGET
  // =========================================================================

  const totalKnown = bareBaseline + todoPromptCost + allToolsCost + fsCost + agentFrameworkOverhead
  console.log('━━━ FULL TOKEN BUDGET (first LLM call with project connected) ━━━')
  console.log('')
  console.log(`  Unity system prompt:      ${bareBaseline.toLocaleString().padStart(8)}`)
  console.log(`  Todo system prompt:       ${todoPromptCost.toLocaleString().padStart(8)}  (balanced OptimizedTodoMiddleware)`)
  console.log(`  Tool schemas (${ALL_TOOLS.length}):        ${allToolsCost.toLocaleString().padStart(8)}  (${unityTools.length} unity + write_todos)`)
  console.log(`  Filesystem middleware:     ${fsCost.toLocaleString().padStart(8)}`)
  console.log(`  Agent framework:          ${agentFrameworkOverhead.toLocaleString().padStart(8)}`)
  console.log(`  ─────────────────────────────────────`)
  console.log(`  Total (computed):         ${totalKnown.toLocaleString().padStart(8)}`)
  console.log(`  Actual measured:          ${agentFs.toLocaleString().padStart(8)}`)
  const budgetDelta = agentFs - totalKnown
  console.log(`  Delta:                    ${(budgetDelta >= 0 ? '+' : '') + budgetDelta.toLocaleString().padStart(7)}  (should be ~0)`)
  console.log('')

  // =========================================================================
  // SAVE CALIBRATION
  // =========================================================================

  const calibration = {
    calibratedAt: new Date().toISOString(),
    model: MODEL,
    bareBaseline,
    todoPromptCost,
    fullBaseline,
    tools: toolCosts,
    allToolsTotal: allToolsCost,
    individualSum,
    perToolFrameworkOverhead: perToolOverhead,
    filesystemMiddleware: fsCost,
    agentFrameworkOverhead,
    fullBudgetFirstCall: totalKnown,
    actualMeasured: agentFs,
    budgetDelta,
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(OUTPUT_FILE, JSON.stringify(calibration, null, 2), 'utf-8')
  console.log(`Saved to: ${OUTPUT_FILE}`)
}

main().catch(err => {
  console.error('Profiling failed:', err.message)
  process.exit(1)
})
