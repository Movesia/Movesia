/**
 * IPC channel constants for authentication.
 *
 * Channels are split into:
 * - Send channels: renderer → main (used by invoke)
 * - Receive channels: main → renderer (used by webContents.send, listened via on)
 */
export const AuthChannels = {
  // Renderer → Main (invoke)
  SIGN_IN: 'auth:sign-in',
  SIGN_OUT: 'auth:sign-out',
  GET_STATE: 'auth:get-state',
  GET_TOKEN: 'auth:get-token',

  // Main → Renderer (push)
  STATE_CHANGED: 'auth:state-changed',
} as const
