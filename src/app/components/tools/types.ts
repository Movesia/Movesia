import type { ComponentType } from 'react'

// =============================================================================
// CORE TYPES
// =============================================================================

/** Tool execution states — matches the streaming lifecycle */
export type ToolCallState = 'streaming' | 'executing' | 'completed' | 'error'

/** Core tool call data passed to all tool UI components */
export interface ToolCallData {
  id: string
  name: string
  state: ToolCallState
  input?: unknown
  output?: unknown
  error?: string
  textOffsetStart?: number
  textOffsetEnd?: number
}

// =============================================================================
// TOOL UI COMPONENT PROPS
// =============================================================================

/** Standard props passed to all tool UI components */
export interface ToolUIProps<TInput = unknown, TOutput = unknown> {
  tool: ToolCallData
  input: TInput | undefined
  output: TOutput | undefined
  isExpanded: boolean
  onToggleExpand: () => void
  isActive: boolean
}

/** Type for a tool UI component */
export type ToolUIComponent<TInput = unknown, TOutput = unknown> = ComponentType<
  ToolUIProps<TInput, TOutput>
>

// =============================================================================
// TOOL CONFIGURATION
// =============================================================================

/** Visual configuration for a tool */
export interface ToolConfig {
  displayName: string
  color: string
  icon?: ComponentType<{ className?: string }>
  defaultExpanded?: boolean
  category?: 'query' | 'mutation' | 'system'
  description?: string
}

/** Full tool registration including UI component */
export interface ToolRegistration<TInput = unknown, TOutput = unknown> {
  config: ToolConfig
  component?: ToolUIComponent<TInput, TOutput>
  fullCustom?: boolean
}

// =============================================================================
// TOOL-SPECIFIC INPUT/OUTPUT TYPES
// =============================================================================

export namespace UnityQuery {
  export type Action = 'hierarchy' | 'inspect_object' | 'search_assets' | 'get_logs' | 'get_settings'

  export interface Input {
    action: Action
    max_depth?: number
    instance_id?: number
    search_query?: string
    asset_type?: string
    log_filter?: string
    settings_category?: string
  }

  export interface HierarchyNode {
    name: string
    instanceId: number
    activeSelf: boolean
    children?: HierarchyNode[]
    components?: string[]
  }

  export interface HierarchyOutput {
    success: boolean
    scenes?: Array<{
      name: string
      path: string
      isActive: boolean
      rootObjects: HierarchyNode[]
    }>
    error?: string
  }

  export interface ComponentData {
    type: string
    properties: Record<string, unknown>
  }

  export interface InspectOutput {
    success: boolean
    name?: string
    instanceId?: number
    tag?: string
    layer?: string
    isActive?: boolean
    components?: ComponentData[]
    error?: string
  }

  export interface AssetResult {
    name: string
    path: string
    type: string
    guid?: string
  }

  export interface SearchOutput {
    success: boolean
    assets?: AssetResult[]
    count?: number
    error?: string
  }

  export interface LogEntry {
    message: string
    type: 'Log' | 'Warning' | 'Error' | 'Exception'
    stackTrace?: string
    timestamp?: string
  }

  export interface LogsOutput {
    success: boolean
    logs?: LogEntry[]
    count?: number
    error?: string
  }

  export type Output = HierarchyOutput | InspectOutput | SearchOutput | LogsOutput | { error: string }
}

export namespace UnityHierarchy {
  export type Action = 'create' | 'duplicate' | 'destroy' | 'rename' | 'reparent' | 'move_scene'

  export interface Input {
    action: Action
    instance_id?: number
    name?: string
    primitive_type?: string
    parent_id?: number
    position?: [number, number, number]
    target_scene?: string
  }

  export interface Output {
    success: boolean
    instanceId?: number
    name?: string
    message?: string
    error?: string
  }
}

export namespace UnityComponent {
  export type Action = 'add' | 'modify' | 'remove'

  export interface Input {
    action: Action
    game_object_id: number
    component_type: string
    properties?: Record<string, unknown>
  }

  export interface Output {
    success: boolean
    message?: string
    error?: string
  }
}

export namespace UnityPrefab {
  export type Action = 'instantiate' | 'instantiate_by_name' | 'create_asset' | 'modify_asset' | 'apply' | 'revert'

  export interface Input {
    action: Action
    asset_path?: string
    prefab_name?: string
    instance_id?: number
    position?: [number, number, number]
    rotation?: [number, number, number]
    component_type?: string
    properties?: Record<string, unknown>
  }

  export interface Output {
    success: boolean
    instanceId?: number
    assetPath?: string
    message?: string
    error?: string
  }
}

export namespace UnityScene {
  export type Action = 'open' | 'save' | 'create' | 'set_active'

  export interface Input {
    action: Action
    path?: string
    additive?: boolean
  }

  export interface Output {
    success: boolean
    scenePath?: string
    message?: string
    error?: string
  }
}

export namespace UnityRefresh {
  export interface Input {
    watched_scripts?: string[]
  }

  export interface VerificationResult {
    [scriptName: string]: boolean
  }

  export interface Output {
    status: 'SUCCESS' | 'FAILED' | 'TIMEOUT'
    verification?: VerificationResult
    errors?: string[]
    message?: string
  }
}

export interface ToolTypeMap {
  unity_query: { input: UnityQuery.Input; output: UnityQuery.Output }
  unity_hierarchy: { input: UnityHierarchy.Input; output: UnityHierarchy.Output }
  unity_component: { input: UnityComponent.Input; output: UnityComponent.Output }
  unity_prefab: { input: UnityPrefab.Input; output: UnityPrefab.Output }
  unity_scene: { input: UnityScene.Input; output: UnityScene.Output }
  unity_refresh: { input: UnityRefresh.Input; output: UnityRefresh.Output }
}

export type ToolInput<T extends keyof ToolTypeMap> = ToolTypeMap[T]['input']
export type ToolOutput<T extends keyof ToolTypeMap> = ToolTypeMap[T]['output']
