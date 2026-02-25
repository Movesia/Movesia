// Core types
export type {
  ToolCallState,
  ToolCallData,
  ToolUIProps,
  ToolUIComponent,
  ToolConfig,
  ToolRegistration,
  ToolTypeMap,
  ToolInput,
  ToolOutput,
} from './types'

// Tool-specific types (namespaced)
export type {
  UnityQuery,
  UnityHierarchy,
  UnityComponent,
  UnityPrefab,
  UnityScene,
  UnityRefresh,
} from './types'

// Registry API
export {
  registerToolUI,
  unregisterToolUI,
  getToolUIComponent,
  getToolConfig,
  getToolRegistration,
  hasCustomUI,
  getRegisteredTools,
  clearRegistry,
  getToolDisplayName,
  getToolColor,
  getToolCategory,
  registerTools,
  initializeDefaultConfigs,
} from './registry'

// Components
export { DefaultToolUI } from './DefaultToolUI'
export { ToolUIWrapper, ToolUIList } from './ToolUIWrapper'

// Re-export wrapper as the main component names for backwards compatibility
export { ToolUIWrapper as ToolCall } from './ToolUIWrapper'
export { ToolUIList as ToolCallList } from './ToolUIWrapper'
