/**
 * IPC channel constants for subscription/quota management.
 *
 * Channels are split into:
 * - Send channels: renderer → main (used by invoke)
 * - Receive channels: main → renderer (used by webContents.send, listened via on)
 */
export const SubscriptionChannels = {
  // Renderer → Main (invoke)
  GET_QUOTA: 'subscription:get-quota',

  // Main → Renderer (push)
  QUOTA_CHANGED: 'subscription:quota-changed',
} as const
