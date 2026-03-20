/**
 * IPC channel constants for agent communication.
 *
 * Channels are split into:
 * - Send channels: renderer → main (used by invoke/send)
 * - Receive channels: main → renderer (used by webContents.send, listened via on)
 */
export const AgentChannels = {
  // Chat
  CHAT_SEND: 'chat:send',
  CHAT_ABORT: 'chat:abort',
  CHAT_STREAM_EVENT: 'chat:stream-event',
  CHAT_STREAM_ERROR: 'chat:stream-error',
  CHAT_TOOL_APPROVAL_RESPONSE: 'chat:tool-approval-response',

  // Threads
  THREADS_LIST: 'threads:list',
  THREADS_DELETE: 'threads:delete',
  THREAD_MESSAGES: 'threads:messages',

  // Unity
  UNITY_STATUS: 'unity:status',
  UNITY_SET_PROJECT: 'unity:set-project',

  // Settings
  SETTINGS_GET_LAST_PROJECT: 'settings:get-last-project',
} as const;

/** Channels the renderer can invoke/send to the main process */
export const AGENT_SEND_CHANNELS = [
  AgentChannels.CHAT_SEND,
  AgentChannels.CHAT_ABORT,
  AgentChannels.CHAT_TOOL_APPROVAL_RESPONSE,
  AgentChannels.THREADS_LIST,
  AgentChannels.THREADS_DELETE,
  AgentChannels.THREAD_MESSAGES,
  AgentChannels.UNITY_STATUS,
  AgentChannels.UNITY_SET_PROJECT,
  AgentChannels.SETTINGS_GET_LAST_PROJECT,
] as const;

/** Channels the main process sends to the renderer (renderer listens on) */
export const AGENT_RECEIVE_CHANNELS = [
  AgentChannels.CHAT_STREAM_EVENT,
  AgentChannels.CHAT_STREAM_ERROR,
] as const;
