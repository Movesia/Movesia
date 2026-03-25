import { useState, useEffect, useCallback } from 'react'

// ═══════════════════════════════════════════════════════════════════════════════
// Types (mirrored from website's /api/v1/subscription response)
// ═══════════════════════════════════════════════════════════════════════════════

export interface SubscriptionPlan {
  slug: string
  name: string
  creditsPerMonth: number // -1 = unlimited
  rateLimitChat: number
  rateLimitEmbeddings: number
}

export interface SubscriptionInfo {
  status: string
  creditsUsed: number
  creditsRemaining: number // -1 = unlimited
  currentPeriodEnd: string // ISO timestamp
  billingCycle: string
}

export interface SubscriptionData {
  plan: SubscriptionPlan
  subscription: SubscriptionInfo
}

export interface UseSubscriptionReturn {
  data: SubscriptionData | null
  isLoading: boolean
  refresh: () => Promise<void>
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared singleton store — all useSubscription() instances share the same data
// ═══════════════════════════════════════════════════════════════════════════════

let sharedData: SubscriptionData | null = null
let sharedLoading = true
let fetchInFlight = false
const listeners = new Set<() => void>()

function notifyListeners() {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function getSnapshot(): { data: SubscriptionData | null; isLoading: boolean } {
  return { data: sharedData, isLoading: sharedLoading }
}

async function fetchQuota(): Promise<void> {
  if (fetchInFlight) return
  fetchInFlight = true
  try {
    const result = await electron.ipcRenderer.invoke('subscription:get-quota')
    if (result) {
      sharedData = result as SubscriptionData
    }
  } catch (err) {
    console.error('[useSubscription] Failed to fetch quota:', err)
  } finally {
    sharedLoading = false
    fetchInFlight = false
    notifyListeners()
  }
}

// Initial fetch when module loads (first import)
fetchQuota()

// Listen for push updates from main process (once, globally)
electron.ipcRenderer.on('subscription:quota-changed', (_event: unknown, quotaData: SubscriptionData) => {
  sharedData = quotaData
  sharedLoading = false
  notifyListeners()
})

// ═══════════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * React hook that provides the user's subscription plan and quota.
 *
 * Uses a shared singleton store so ALL components see the same data instantly.
 * - Fetches once on first import
 * - Listens for quota-changed pushes from main process
 * - Exposes refresh() to re-fetch (all instances update simultaneously)
 */
export function useSubscription(): UseSubscriptionReturn {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return subscribe(() => forceUpdate((n) => n + 1))
  }, [])

  const snapshot = getSnapshot()

  const refresh = useCallback(async () => {
    await fetchQuota()
  }, [])

  return { data: snapshot.data, isLoading: snapshot.isLoading, refresh }
}
