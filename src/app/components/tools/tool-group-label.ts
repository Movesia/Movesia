import type { ToolPart } from '@/app/components/prompt-kit/tool'

// =============================================================================
// Helpers — extract names from paths
// =============================================================================

/** "Assets/Scripts/PlayerController.cs" → "PlayerController.cs" */
function getFilename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
}

/** "/SampleScene/Environment/Floor" → "Floor" */
function getObjectName(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
}

/** "/Scenes/MainMenu.unity" → "MainMenu" */
function getSceneName(path: string): string {
  const filename = getFilename(path)
  return filename.replace(/\.unity$/, '')
}

/** Truncate string to max length with ellipsis */
function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}

/** Get extension from file path */
function getExt(filePath: string): string {
  const parts = filePath.split('.')
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
}

// =============================================================================
// Single-tool label — one ToolPart → human-friendly description
// =============================================================================

type AnyInput = Record<string, unknown>

function str(val: unknown): string | undefined {
  return typeof val === 'string' && val.length > 0 ? val : undefined
}

function arr(val: unknown): string[] | undefined {
  return Array.isArray(val) && val.length > 0 ? val.map(String) : undefined
}

/** Returns a contextual label for a single tool call. */
export function getSingleToolLabel(toolPart: ToolPart): string {
  const input = (toolPart.input ?? {}) as AnyInput

  switch (toolPart.type) {
    case 'write_file':
      return labelWriteFile(input)
    case 'edit_file':
      return labelEditFile(input)
    case 'read_file':
      return labelReadFile(input)
    case 'ls':
      return labelLs(input)
    case 'unity_query':
      return labelUnityQuery(input)
    case 'unity_hierarchy':
      return labelUnityHierarchy(input)
    case 'unity_component':
      return labelUnityComponent(input)
    case 'unity_prefab':
      return labelUnityPrefab(input)
    case 'unity_scene':
      return labelUnityScene(input)
    case 'unity_refresh':
      return labelUnityRefresh(input)
    case 'unity_deletion':
      return labelUnityDeletion(input)
    case 'unity_material':
      return labelUnityMaterial(input)
    case 'knowledge_search':
      return labelKnowledgeSearch(input)
    case 'tavily_search':
      return labelTavilySearch(input)
    case 'write_todos':
      return 'Updating task list'
    default:
      return `Running ${toolPart.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`
  }
}

// ─── write_file ──────────────────────────────────────────────────────────────

function labelWriteFile(input: AnyInput): string {
  const filePath = str(input.file_path) ?? str(input.path)
  if (!filePath) return 'Creating file'
  const filename = getFilename(filePath)
  const ext = getExt(filePath)

  if (ext === 'shader' || ext === 'hlsl' || ext === 'cginc') return `Creating shader ${filename}`
  if (ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'xml' || ext === 'toml') return `Creating config ${filename}`
  if (ext === 'mat') return `Creating material ${filename}`
  if (ext === 'unity') return `Creating scene ${filename}`
  if (ext === 'anim' || ext === 'controller' || ext === 'overrideController') return `Creating animation ${filename}`
  if (ext === 'prefab') return `Creating prefab ${filename}`
  if (ext === 'asset') return `Creating asset ${filename}`
  if (ext === 'renderTexture' || ext === 'png' || ext === 'jpg' || ext === 'tga' || ext === 'exr') return `Creating texture ${filename}`
  return `Creating ${filename}`
}

// ─── edit_file ───────────────────────────────────────────────────────────────

function labelEditFile(input: AnyInput): string {
  const filePath = str(input.file_path) ?? str(input.path)
  if (!filePath) return 'Editing file'
  const filename = getFilename(filePath)
  const ext = getExt(filePath)

  if (ext === 'shader' || ext === 'hlsl' || ext === 'cginc') return `Editing shader ${filename}`
  return `Editing ${filename}`
}

// ─── read_file ───────────────────────────────────────────────────────────────

function labelReadFile(input: AnyInput): string {
  const path = str(input.path) ?? str(input.file_path)
  if (!path) return 'Reading file'
  return `Reading ${getFilename(path)}`
}

// ─── ls ──────────────────────────────────────────────────────────────────────

function labelLs(input: AnyInput): string {
  const path = str(input.path)
  if (!path || path === '/') return 'Listing project files'
  const dirName = path.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? path
  return `Listing ${dirName}/`
}

// ─── unity_query ─────────────────────────────────────────────────────────────

function labelUnityQuery(input: AnyInput): string {
  const action = str(input.action)

  switch (action) {
    case 'list_children': {
      const path = str(input.path)
      if (!path || path === '/') return 'Inspecting scene hierarchy'
      return `Inspecting ${getObjectName(path)} children`
    }
    case 'inspect_gameobject': {
      const path = str(input.path)
      const components = arr(input.components)
      if (path && components) return `Inspecting ${getObjectName(path)} components`
      if (path) return `Inspecting ${getObjectName(path)}`
      return 'Inspecting GameObject'
    }
    case 'find_gameobjects': {
      const name = str(input.name)
      const tag = str(input.tag)
      const component = str(input.component)
      const layer = str(input.layer)
      if (name) return `Finding GameObjects matching '${truncate(name, 20)}'`
      if (tag) return `Finding GameObjects tagged '${tag}'`
      if (component) return `Finding GameObjects with ${component}`
      if (layer) return `Finding GameObjects on layer ${layer}`
      return 'Finding GameObjects'
    }
    case 'search_assets': {
      const assetType = str(input.asset_type)
      const assetName = str(input.asset_name)
      const folder = str(input.folder)
      if (assetType && assetType !== 'all') {
        const typeLabels: Record<string, string> = {
          material: 'material',
          texture: 'texture',
          prefab: 'prefab',
          script: 'script',
          audio: 'audio',
          scene: 'scene',
          model: 'model',
          mesh: 'model',
          shader: 'shader',
          animation: 'animation',
        }
        return `Searching ${typeLabels[assetType] ?? assetType} assets`
      }
      if (assetName) return `Searching assets matching '${truncate(assetName, 20)}'`
      if (folder) {
        const folderName = folder.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? folder
        return `Searching assets in ${folderName}/`
      }
      return 'Searching project assets'
    }
    case 'get_logs': {
      const filter = str(input.log_filter)
      if (filter === 'Error') return 'Checking error logs'
      if (filter === 'Warning') return 'Checking warning logs'
      if (filter === 'Exception') return 'Checking exception logs'
      return 'Checking console logs'
    }
    case 'get_settings': {
      const category = str(input.settings_category)
      if (category) return `Reading ${category} settings`
      return 'Reading project settings'
    }
    default:
      return 'Querying Unity'
  }
}

// ─── unity_hierarchy ─────────────────────────────────────────────────────────

function labelUnityHierarchy(input: AnyInput): string {
  const action = str(input.action)

  switch (action) {
    case 'create': {
      const name = str(input.name)
      const primitive = str(input.primitive_type)
      if (primitive && primitive.toLowerCase() === 'empty' && name) return `Creating empty ${name}`
      if (primitive && name) return `Creating ${primitive} '${name}'`
      if (primitive) return `Creating ${primitive}`
      if (name) return `Creating empty ${name}`
      return 'Creating GameObject'
    }
    case 'duplicate': {
      const path = str(input.path)
      if (path) return `Duplicating ${getObjectName(path)}`
      return 'Duplicating GameObject'
    }
    case 'destroy': {
      const path = str(input.path)
      if (path) return `Destroying ${getObjectName(path)}`
      return 'Destroying GameObject'
    }
    case 'rename': {
      const path = str(input.path)
      const name = str(input.name)
      if (path && name) return `Renaming ${getObjectName(path)} → ${name}`
      if (name) return `Renaming to ${name}`
      return 'Renaming GameObject'
    }
    case 'reparent': {
      const path = str(input.path)
      const parentPath = str(input.parent_path)
      if (path && parentPath) return `Reparenting ${getObjectName(path)} under ${getObjectName(parentPath)}`
      if (path) return `Moving ${getObjectName(path)} to root`
      return 'Reparenting GameObject'
    }
    case 'move_scene': {
      const path = str(input.path)
      const scene = str(input.target_scene)
      if (path && scene) return `Moving ${getObjectName(path)} to ${scene}`
      return 'Moving GameObject to scene'
    }
    default:
      return 'Modifying hierarchy'
  }
}

// ─── unity_component ─────────────────────────────────────────────────────────

function labelUnityComponent(input: AnyInput): string {
  const action = str(input.action)
  const componentType = str(input.component_type)
  const path = str(input.path)
  const objectName = path ? getObjectName(path) : undefined

  switch (action) {
    case 'configure': {
      if (componentType && objectName) return `Configuring ${componentType} on ${objectName}`
      if (componentType && input.properties) return `Configuring ${componentType} properties`
      if (componentType) return `Configuring ${componentType}`
      return 'Configuring component'
    }
    case 'remove': {
      if (componentType && objectName) return `Removing ${componentType} from ${objectName}`
      if (componentType) return `Removing ${componentType}`
      return 'Removing component'
    }
    default:
      return 'Modifying components'
  }
}

// ─── unity_prefab ────────────────────────────────────────────────────────────

function labelUnityPrefab(input: AnyInput): string {
  const prefabName = str(input.prefab_name)
  const assetPath = str(input.asset_path)
  const path = str(input.path)
  const savePath = str(input.save_path)
  const componentType = str(input.component_type)

  // Instantiate by name
  if (prefabName && !savePath && !componentType) {
    return `Spawning ${prefabName} prefab`
  }

  // Instantiate by asset path (no save_path, no component edits)
  if (assetPath && !savePath && !componentType && !path) {
    return `Spawning ${getFilename(assetPath)}`
  }

  // Create prefab from model file
  if (assetPath && savePath && !path) {
    return `Creating prefab from ${getFilename(assetPath)}`
  }

  // Create prefab from scene object
  if (path && savePath) {
    return `Creating prefab from ${getObjectName(path)}`
  }

  // Apply overrides
  if (path && !savePath && !componentType) {
    return `Applying prefab overrides to ${getObjectName(path)}`
  }

  // Modify prefab asset
  if (assetPath && componentType) {
    const prefab = getFilename(assetPath).replace(/\.prefab$/, '')
    return `Modifying ${componentType} on ${prefab}`
  }

  // Modify prefab (no component specified)
  if (assetPath) {
    return `Modifying ${getFilename(assetPath).replace(/\.prefab$/, '')}`
  }

  return 'Working with prefabs'
}

// ─── unity_scene ─────────────────────────────────────────────────────────────

function labelUnityScene(input: AnyInput): string {
  const action = str(input.action)
  const path = str(input.path)
  const additive = input.additive === true
  const sceneName = path ? getSceneName(path) : undefined

  switch (action) {
    case 'open': {
      if (sceneName && additive) return `Loading ${sceneName} additively`
      if (sceneName) return `Opening ${sceneName}`
      return 'Opening scene'
    }
    case 'save': {
      if (sceneName) return `Saving ${sceneName}`
      return 'Saving current scene'
    }
    case 'create': {
      if (sceneName && additive) return `Creating ${sceneName} scene (additive)`
      if (sceneName) return `Creating ${sceneName} scene`
      return 'Creating new scene'
    }
    case 'set_active': {
      if (sceneName) return `Setting ${sceneName} as active scene`
      return 'Setting active scene'
    }
    default:
      return 'Managing scenes'
  }
}

// ─── unity_refresh ───────────────────────────────────────────────────────────

function labelUnityRefresh(input: AnyInput): string {
  const scripts = arr(input.watched_scripts)
  if (!scripts) return 'Refreshing & compiling assets'
  if (scripts.length === 1) return `Compiling ${scripts[0]}`
  if (scripts.length === 2) return `Compiling ${scripts[0]}, ${scripts[1]}`
  return `Compiling ${scripts.length} scripts`
}

// ─── unity_deletion ──────────────────────────────────────────────────────────

function labelUnityDeletion(input: AnyInput): string {
  const paths = arr(input.paths)
  if (!paths) return 'Deleting assets'
  if (paths.length === 1) return `Deleting ${getFilename(paths[0])}`
  if (paths.length === 2) return `Deleting ${getFilename(paths[0])}, ${getFilename(paths[1])}`
  return `Deleting ${paths.length} assets`
}

// ─── unity_material ──────────────────────────────────────────────────────────

function labelUnityMaterial(input: AnyInput): string {
  const action = str(input.action)
  const name = str(input.name)
  const assetPath = str(input.asset_path)
  const shaderName = str(input.shader_name)
  const assignTo = input.assign_to as AnyInput | undefined
  const gameObjectPath = assignTo ? str(assignTo.game_object_path) : undefined
  const objectName = gameObjectPath ? getObjectName(gameObjectPath) : undefined

  switch (action) {
    case 'create': {
      if (name) return `Creating material ${name}`
      if (shaderName) {
        // "Universal Render Pipeline/Lit" → "URP Lit"
        const shortShader = shaderName.replace('Universal Render Pipeline/', 'URP ')
        return `Creating ${shortShader} material`
      }
      return 'Creating new material'
    }
    case 'modify': {
      if (assetPath) {
        const matName = getFilename(assetPath).replace(/\.mat$/, '')
        return `Modifying ${matName} material`
      }
      if (name) return `Modifying ${name} material`
      return 'Modifying material'
    }
    case 'assign': {
      const matName = assetPath ? getFilename(assetPath).replace(/\.mat$/, '') : undefined
      if (matName && objectName) return `Assigning ${matName} material to ${objectName}`
      if (objectName) return `Assigning material to ${objectName}`
      return 'Assigning material'
    }
    case 'create_and_assign': {
      if (name && objectName) return `Creating & assigning ${name} to ${objectName}`
      if (name) return `Creating & assigning ${name}`
      return 'Creating & assigning material'
    }
    default:
      return 'Working with materials'
  }
}

// ─── knowledge_search ────────────────────────────────────────────────────────

function labelKnowledgeSearch(input: AnyInput): string {
  const query = str(input.query)
  const collections = arr(input.collections)

  if (!query) return 'Searching knowledge base'

  if (collections && collections.length === 1) {
    const collectionLabels: Record<string, string> = {
      'unity-docs': 'docs',
      'unity-workflows': 'workflows',
      'unity-guides': 'guides',
    }
    const label = collectionLabels[collections[0]] ?? 'knowledge'
    return `Searching ${label}: ${truncate(query, 30)}`
  }

  return `Searching knowledge: ${truncate(query, 30)}`
}

// ─── tavily_search ───────────────────────────────────────────────────────────

function labelTavilySearch(input: AnyInput): string {
  const query = str(input.query)
  if (!query) return 'Searching the web'
  return `Searching: ${truncate(query, 40)}`
}

// =============================================================================
// Group label — multiple ToolParts → single contextual label
// =============================================================================

/**
 * Generate a human-friendly label for a group of consecutive tool calls.
 */
export function getToolGroupLabel(toolParts: ToolPart[]): string {
  if (toolParts.length === 0) return 'No operations'
  if (toolParts.length === 1) return getSingleToolLabel(toolParts[0])

  const types = new Set(toolParts.map(t => t.type))
  const count = toolParts.length

  // ── All same type ──────────────────────────────────────────────────

  if (types.size === 1) {
    const type = toolParts[0].type
    return getSameTypeGroupLabel(type, toolParts)
  }

  // ── All file operations (write + edit + read + ls) ─────────────────

  const fileOps = new Set(['write_file', 'edit_file', 'read_file', 'ls'])
  if ([...types].every(t => fileOps.has(t))) {
    return getMixedFileOpsLabel(toolParts)
  }

  // ── Try smart theme detection ──────────────────────────────────────

  const theme = detectGroupTheme(toolParts)
  if (theme) return theme

  // ── Mixed types fallback: join first two labels ────────────────────

  if (count === 2) {
    const l1 = getSingleToolLabel(toolParts[0])
    const l2 = getSingleToolLabel(toolParts[1])
    return `${l1} and ${l2}`
  }

  // 3+ mixed: first label + remaining count
  const firstLabel = getSingleToolLabel(toolParts[0])
  return `${firstLabel} + ${count - 1} more operations`
}

// ─── Same-type group labels ──────────────────────────────────────────────────

function getSameTypeGroupLabel(type: string, toolParts: ToolPart[]): string {
  const count = toolParts.length

  switch (type) {
    case 'write_file': {
      const filenames = toolParts
        .map(t => str((t.input as AnyInput)?.file_path) ?? str((t.input as AnyInput)?.path))
        .filter(Boolean)
        .map(f => getFilename(f!))
      if (count === 2 && filenames.length === 2) return `Creating ${filenames[0]}, ${filenames[1]}`
      return `Creating ${count} files`
    }
    case 'edit_file': {
      const filenames = toolParts
        .map(t => str((t.input as AnyInput)?.file_path) ?? str((t.input as AnyInput)?.path))
        .filter(Boolean)
        .map(f => getFilename(f!))
      if (count === 2 && filenames.length === 2) return `Editing ${filenames[0]}, ${filenames[1]}`
      return `Editing ${count} files`
    }
    case 'read_file': {
      return count === 2
        ? `Reading ${getReadFilenames(toolParts)}`
        : `Reading ${count} files`
    }
    case 'unity_query':
      return count === 2
        ? joinTwoLabels(toolParts)
        : `Running ${count} queries`
    case 'unity_hierarchy': {
      // Check if all same action
      const actions = new Set(toolParts.map(t => str((t.input as AnyInput)?.action)).filter(Boolean))
      if (actions.size === 1) {
        const action = [...actions][0]!
        if (action === 'create') return `Creating ${count} GameObjects`
        if (action === 'destroy') return `Destroying ${count} GameObjects`
        if (action === 'duplicate') return `Duplicating ${count} GameObjects`
        if (action === 'rename') return `Renaming ${count} GameObjects`
      }
      return `Modifying ${count} GameObjects`
    }
    case 'unity_component':
      return count === 2
        ? joinTwoLabels(toolParts)
        : `Configuring ${count} components`
    case 'unity_material':
      return count === 2
        ? joinTwoLabels(toolParts)
        : `Setting up ${count} materials`
    case 'unity_prefab':
      return count === 2
        ? joinTwoLabels(toolParts)
        : `Working with ${count} prefabs`
    case 'unity_scene':
      return count === 2
        ? joinTwoLabels(toolParts)
        : `Managing ${count} scenes`
    case 'unity_deletion':
      return `Deleting ${count} batches of assets`
    case 'unity_refresh':
      return `Compiling ${count} times`
    case 'knowledge_search':
      return `Running ${count} knowledge searches`
    case 'tavily_search':
      return `Running ${count} web searches`
    case 'write_todos':
      return 'Updating task list'
    default:
      return `Running ${count} ${type.replace(/_/g, ' ')} operations`
  }
}

// ─── Mixed file ops label ────────────────────────────────────────────────────

function getMixedFileOpsLabel(toolParts: ToolPart[]): string {
  const count = toolParts.length

  if (count === 2) {
    const l1 = getSingleToolLabel(toolParts[0])
    const l2 = getSingleToolLabel(toolParts[1])
    return `${l1}, ${l2}`
  }

  return `Updating ${count} files`
}

// ─── Smart theme detection for mixed groups ──────────────────────────────────

function detectGroupTheme(toolParts: ToolPart[]): string | null {
  const types = new Set(toolParts.map(t => t.type))

  // Script creation workflow: write files + refresh
  if (types.has('write_file') && types.has('unity_refresh')) {
    return 'Creating & compiling scripts'
  }

  // Scene setup: hierarchy + components
  if (types.has('unity_hierarchy') && types.has('unity_component')) {
    return 'Setting up GameObjects'
  }

  // Full object setup: hierarchy + component + material
  if (types.has('unity_hierarchy') && types.has('unity_material')) {
    return 'Building scene objects'
  }

  // Prefab workflow: prefab + component modifications
  if (types.has('unity_prefab') && types.has('unity_component')) {
    return 'Configuring prefabs'
  }

  // Cleanup workflow: deletion + refresh
  if (types.has('unity_deletion') && types.has('unity_refresh')) {
    return 'Cleaning up & refreshing'
  }

  // Research workflow: query + knowledge search
  if (types.has('unity_query') && types.has('knowledge_search')) {
    return 'Researching project state'
  }

  // Investigation: query + web search
  if (types.has('unity_query') && types.has('tavily_search')) {
    return 'Investigating & searching'
  }

  // Scene management: scene + hierarchy
  if (types.has('unity_scene') && types.has('unity_hierarchy')) {
    return 'Setting up scene'
  }

  // File editing + component config
  if ((types.has('write_file') || types.has('edit_file')) && types.has('unity_component')) {
    return 'Updating scripts & components'
  }

  // File ops + hierarchy
  if ((types.has('write_file') || types.has('edit_file')) && types.has('unity_hierarchy')) {
    return 'Creating scripts & GameObjects'
  }

  // Material + scene setup
  if (types.has('unity_material') && types.has('unity_scene')) {
    return 'Setting up scene & materials'
  }

  // Prefab + hierarchy
  if (types.has('unity_prefab') && types.has('unity_hierarchy')) {
    return 'Building scene with prefabs'
  }

  // All Unity mutations
  if ([...types].every(t => t.startsWith('unity_'))) {
    return 'Modifying Unity project'
  }

  // All file operations (should be caught earlier, but just in case)
  if ([...types].every(t => t === 'write_file' || t === 'edit_file' || t === 'read_file' || t === 'ls')) {
    return null
  }

  return null
}

// ─── Utility: join two labels ────────────────────────────────────────────────

function joinTwoLabels(toolParts: ToolPart[]): string {
  const l1 = getSingleToolLabel(toolParts[0])
  const l2 = getSingleToolLabel(toolParts[1])
  return `${l1}, ${l2}`
}

function getReadFilenames(toolParts: ToolPart[]): string {
  const filenames = toolParts
    .map(t => str((t.input as AnyInput)?.path) ?? str((t.input as AnyInput)?.file_path))
    .filter(Boolean)
    .map(f => getFilename(f!))
  return filenames.join(', ') || '2 files'
}

// =============================================================================
// Group state — aggregate state from multiple tools
// =============================================================================

/** Returns the "worst" state from a group: error > pending > running > complete */
export function getGroupState(toolParts: ToolPart[]): string {
  const states = new Set(toolParts.map(t => t.state))
  if (states.has('error')) return 'error'
  if (states.has('pending_approval')) return 'pending_approval'
  if (states.has('running')) return 'running'
  return 'complete'
}
