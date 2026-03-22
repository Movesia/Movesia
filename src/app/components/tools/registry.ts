import { Globe, Trash2, Palette, ListTodo, File, FilePen } from 'lucide-react'
import type { ToolConfig, ToolRegistration, ToolUIComponent } from './types'

// =============================================================================
// REGISTRY STATE
// =============================================================================

const toolRegistry = new Map<string, ToolRegistration>()

const defaultConfigs: Record<string, ToolConfig> = {
  unity_query: {
    displayName: 'Query Unity',
    color: 'text-blue-400',
    category: 'query',
    description: 'Read the current state of the Unity Editor',
  },
  unity_hierarchy: {
    displayName: 'Modify Hierarchy',
    color: 'text-green-400',
    category: 'mutation',
    description: 'Manage GameObject structure in the scene',
  },
  unity_component: {
    displayName: 'Modify Component',
    color: 'text-purple-400',
    category: 'mutation',
    description: 'Add, modify, or remove components',
  },
  unity_prefab: {
    displayName: 'Prefab Operation',
    color: 'text-orange-400',
    category: 'mutation',
    description: 'Work with prefab assets and instances',
  },
  unity_scene: {
    displayName: 'Scene Operation',
    color: 'text-cyan-400',
    category: 'mutation',
    description: 'Manage scenes in the project',
  },
  unity_refresh: {
    displayName: 'Refresh Assets',
    color: 'text-yellow-400',
    category: 'system',
    description: 'Trigger Unity asset database refresh',
  },
  unity_deletion: {
    displayName: 'Delete Assets',
    icon: Trash2,
    color: 'text-red-400',
    category: 'mutation',
    description: 'Delete project assets (recoverable via OS trash)',
  },
  unity_material: {
    displayName: 'Material Operation',
    icon: Palette,
    color: 'text-pink-400',
    category: 'mutation',
    description: 'Create, modify, or assign materials',
  },
  tavily_search: {
    displayName: 'Web Search',
    icon: Globe,
    color: 'text-emerald-400',
    category: 'query',
    description: 'Search the internet for information',
  },
  write_todos: {
    displayName: 'Update Todos',
    icon: ListTodo,
    color: 'text-amber-400',
    category: 'system',
    description: 'Manage task list',
  },
  write_file: {
    displayName: 'Write File',
    icon: File,
    color: 'text-emerald-400',
    category: 'mutation',
    description: 'Create or overwrite a file',
  },
  edit_file: {
    displayName: 'Edit File',
    icon: FilePen,
    color: 'text-blue-400',
    category: 'mutation',
    description: 'Edit an existing file',
  },
}

// =============================================================================
// REGISTRY API
// =============================================================================

export function registerToolUI<TInput = unknown, TOutput = unknown>(
  toolName: string,
  registration: ToolRegistration<TInput, TOutput>
): void {
  toolRegistry.set(toolName, registration as ToolRegistration)
}

export function unregisterToolUI(toolName: string): boolean {
  return toolRegistry.delete(toolName)
}

export function getToolUIComponent(toolName: string): ToolUIComponent | undefined {
  return toolRegistry.get(toolName)?.component
}

export function getToolConfig(toolName: string): ToolConfig {
  const registration = toolRegistry.get(toolName)
  if (registration?.config) {
    return registration.config
  }

  if (defaultConfigs[toolName]) {
    return defaultConfigs[toolName]
  }

  return {
    displayName: toolName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'text-gray-400',
    category: 'query',
    description: `Execute ${toolName}`,
  }
}

export function getToolRegistration(toolName: string): ToolRegistration | undefined {
  return toolRegistry.get(toolName)
}

export function hasCustomUI(toolName: string): boolean {
  return toolRegistry.get(toolName)?.component !== undefined
}

export function getRegisteredTools(): string[] {
  return Array.from(toolRegistry.keys())
}

export function clearRegistry(): void {
  toolRegistry.clear()
}

export function getToolDisplayName(toolName: string): string {
  return getToolConfig(toolName).displayName
}

export function getToolColor(toolName: string): string {
  return getToolConfig(toolName).color
}

export function getToolCategory(toolName: string): ToolConfig['category'] {
  return getToolConfig(toolName).category
}

export function registerTools(tools: Record<string, ToolRegistration>): void {
  for (const [name, registration] of Object.entries(tools)) {
    registerToolUI(name, registration)
  }
}

export function initializeDefaultConfigs(): void {
  for (const [name, config] of Object.entries(defaultConfigs)) {
    if (!toolRegistry.has(name)) {
      toolRegistry.set(name, { config })
    }
  }
}

// Auto-initialize on module load
initializeDefaultConfigs()
