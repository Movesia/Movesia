/**
 * IPC channels for custom protocol handling (movesia://)
 */
export const ProtocolChannels = {
  /** Emitted when the app receives a movesia:// URL */
  PROTOCOL_URL_RECEIVED: 'protocol:url-received',
} as const;

/**
 * The custom protocol scheme (without ://)
 */
export const PROTOCOL_SCHEME = 'movesia';
