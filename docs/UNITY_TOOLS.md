# Movesia Unity Tools Reference

This document provides a comprehensive reference for all 8 Unity tools available in the Movesia LangGraph agent. These tools enable the AI agent to interact with the Unity Editor in real-time over WebSocket.

---

## Overview

| Tool Name | Nickname | Purpose |
|-----------|----------|---------|
| `unity_query` | The Observer | Read scene state (hierarchy, components, assets, logs) |
| `unity_hierarchy` | The Architect | Manage scene graph (create/rename/parent/move GameObjects) |
| `unity_component` | The Engineer | Manage components (add/remove/modify behaviors) |
| `unity_prefab` | The Factory | Prefab management (instantiate/create/modify prefabs) |
| `unity_scene` | The Director | Scene management (load/save/create scenes) |
| `unity_refresh` | The Compiler | Script compilation (compile C# scripts after editing) |
| `unity_deletion` | The Janitor | Asset deletion (remove files, recoverable via trash) |
| `unity_material` | The Artist | Material creation (create/modify/assign materials) |

---

## Tool 1: `unity_query` — "The Observer"

**File:** `src/agent/unity-tools/query.ts`

**Purpose:** Read-only inspection of the Unity Editor's current state. This is the agent's primary mechanism for "seeing" the project.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum | ✅ | One of: `'hierarchy'`, `'inspect_object'`, `'search_assets'`, `'get_logs'`, `'get_settings'` |
| `max_depth` | int | ❌ | How deep to traverse the scene hierarchy (default: 5) |
| `instance_id` | int | ❌ | Required for `'inspect_object'` — the GameObject's instance ID |
| `search_query` | string | ❌ | Name/label filter for asset searches |
| `asset_type` | string | ❌ | Type filter: `'prefab'`, `'script'`, `'material'`, etc. |
| `log_filter` | string | ❌ | Filter logs by `'Error'`, `'Warning'`, or `'Exception'` |
| `log_count` | int | ❌ | Max number of recent logs to return (default: 100) |
| `settings_category` | string | ❌ | Settings category: `'physics'`, `'player'`, `'quality'` |

### Actions

1. **`'hierarchy'`** — Returns the scene tree structure up to `max_depth`
2. **`'inspect_object'`** — Gets components and properties of a specific GameObject (requires `instance_id`)
3. **`'search_assets'`** — Finds prefabs, scripts, or other assets in project folders
4. **`'get_logs'`** — Checks console for errors, warnings, or general logs
5. **`'get_settings'`** — Retrieves specific project settings

### Typical Workflow

```typescript
// 1. See the scene structure
unity_query({ action: 'hierarchy' })

// 2. Identify an object's instance_id from the response
// 3. Inspect that specific object
unity_query({ action: 'inspect_object', instance_id: -74268 })

// 4. Search for assets
unity_query({ action: 'search_assets', search_query: 'Player', asset_type: 'prefab' })

// 5. Check for errors
unity_query({ action: 'get_logs', log_filter: 'Error' })
```

---

## Tool 2: `unity_hierarchy` — "The Architect"

**File:** `src/agent/unity-tools/hierarchy.ts`

**Purpose:** Manipulate the scene graph structure—create, duplicate, delete, rename, and reorganize GameObjects.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum | ✅ | One of: `'create'`, `'duplicate'`, `'destroy'`, `'rename'`, `'reparent'`, `'move_scene'` |
| `instance_id` | int | ❌ | The GameObject to manipulate |
| `name` | string | ❌ | New name (used with `'create'` or `'rename'`) |
| `primitive_type` | string | ❌ | `'Cube'`, `'Sphere'`, `'Capsule'`, `'Cylinder'`, `'Plane'`, `'Quad'` |
| `parent_id` | int | ❌ | Parent GameObject instance ID |
| `position` | [x, y, z] | ❌ | Spawn position for creation |
| `target_scene` | string | ❌ | Destination scene name for `'move_scene'` |

### Actions

| Action | Required Params | Optional Params |
|--------|-----------------|-----------------|
| `'create'` | — | `name`, `primitive_type`, `parent_id`, `position` |
| `'duplicate'` | `instance_id` | — |
| `'destroy'` | `instance_id` | — |
| `'rename'` | `instance_id`, `name` | — |
| `'reparent'` | `instance_id` | `parent_id` (null = move to root) |
| `'move_scene'` | `instance_id`, `target_scene` | — |

### Examples

```typescript
// Create a cube at position (0, 5, 0)
unity_hierarchy({ action: 'create', name: 'MyCube', primitive_type: 'Cube', position: [0, 5, 0] })

// Duplicate an existing GameObject
unity_hierarchy({ action: 'duplicate', instance_id: -74268 })

// Rename a GameObject
unity_hierarchy({ action: 'rename', instance_id: -74268, name: 'Player' })

// Reparent under another GameObject
unity_hierarchy({ action: 'reparent', instance_id: -74268, parent_id: -12345 })

// Move to root (no parent)
unity_hierarchy({ action: 'reparent', instance_id: -74268 })

// Delete (supports undo)
unity_hierarchy({ action: 'destroy', instance_id: -74268 })
```

---

## Tool 3: `unity_component` — "The Engineer"

**File:** `src/agent/unity-tools/component.ts`

**Purpose:** Add, remove, and modify components on GameObjects to control behavior and data.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum | ✅ | One of: `'add'`, `'remove'`, `'modify'` |
| `game_object_id` | int | ❌ | GameObject instance ID |
| `component_type` | string | ❌ | Component class name: `'Transform'`, `'Rigidbody'`, `'BoxCollider'`, etc. |
| `component_id` | int | ❌ | Direct component instance ID (alternative targeting) |
| `component_index` | int | ❌ | Index when multiple components of same type exist (default: 0) |
| `properties` | record | ❌ | Properties to modify (**use arrays for vectors!**) |

### Targeting Components

You can target a component in two ways:
1. **By component ID:** `component_id: 12345`
2. **By GameObject + type:** `game_object_id: -74268, component_type: 'Transform'`

### ⚠️ Critical: Vector Property Format

**Always use arrays for vector properties, NOT objects:**

```typescript
// ✅ Correct
{ m_LocalPosition: [0, 5, 0] }
{ m_LocalScale: [2, 2, 2] }

// ❌ Wrong — will fail!
{ m_LocalPosition: { x: 0, y: 5, z: 0 } }
```

### Examples

```typescript
// Add a Rigidbody component
unity_component({ action: 'add', game_object_id: -74268, component_type: 'Rigidbody' })

// Modify Transform position
unity_component({
  action: 'modify',
  game_object_id: -74268,
  component_type: 'Transform',
  properties: { m_LocalPosition: [0, 5, 0] }
})

// Modify Rigidbody mass
unity_component({
  action: 'modify',
  game_object_id: -74268,
  component_type: 'Rigidbody',
  properties: { m_Mass: 5.0 }
})

// Remove a component
unity_component({ action: 'remove', game_object_id: -74268, component_type: 'BoxCollider' })
```

---

## Tool 4: `unity_prefab` — "The Factory"

**File:** `src/agent/unity-tools/prefab.ts`

**Purpose:** Manage prefab assets and instances. Supports compound operations (create+modify, instantiate+modify in one call).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prefab_name` | string | ❌ | Prefab name to search and spawn |
| `asset_path` | string | ❌ | Path to `.prefab` file (e.g., `'Assets/Prefabs/Player.prefab'`) |
| `instance_id` | int | ❌ | Scene GameObject instance ID |
| `save_path` | string | ❌ | Where to save new prefab |
| `position` | [x, y, z] | ❌ | Spawn position |
| `rotation` | [x, y, z] | ❌ | Spawn rotation in euler angles |
| `scale` | [x, y, z] | ❌ | Spawn scale |
| `parent_instance_id` | int | ❌ | Parent GameObject instance ID |
| `component_type` | string | ❌ | Component to edit on the prefab asset |
| `target_path` | string | ❌ | Path to nested child (e.g., `'Body/HitBox'`) |
| `properties` | record | ❌ | Properties to modify on the component |

### Operations

**Phase 1 (pick one):**
| Input | Operation |
|-------|-----------|
| `prefab_name` | Instantiate by name |
| `asset_path` (alone) | Instantiate by path |
| `instance_id` + `save_path` | Create prefab from scene GameObject |
| `instance_id` (alone) | Apply overrides to prefab instance |

**Phase 2 (optional, chains after Phase 1):**
- `component_type` + `properties` → Modify the prefab asset

### Examples

```typescript
// Instantiate prefab by name
unity_prefab({ prefab_name: 'Enemy', position: [0, 1, 0] })

// Instantiate with full path
unity_prefab({ asset_path: 'Assets/Prefabs/Enemy.prefab', position: [10, 0, 0] })

// Create prefab from scene GameObject
unity_prefab({ instance_id: 123, save_path: 'Assets/Prefabs/NewPrefab.prefab' })

// Modify existing prefab asset
unity_prefab({
  asset_path: 'Assets/Prefabs/Enemy.prefab',
  component_type: 'Rigidbody',
  properties: { m_Mass: 5.0 }
})

// Compound: Create AND modify in one call
unity_prefab({
  instance_id: 123,
  save_path: 'Assets/Prefabs/Player.prefab',
  component_type: 'Rigidbody',
  properties: { m_Mass: 5.0 }
})

// Compound: Instantiate AND modify
unity_prefab({
  prefab_name: 'Enemy',
  position: [0, 1, 0],
  component_type: 'BoxCollider',
  properties: { m_Size: [2, 3, 1] }
})
```

---

## Tool 5: `unity_scene` — "The Director"

**File:** `src/agent/unity-tools/scene.ts`

**Purpose:** Manage scene files—open, save, create, and set the active scene.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum | ✅ | One of: `'open'`, `'save'`, `'create'`, `'set_active'` |
| `path` | string | ❌ | File path like `'Assets/Scenes/Level2.unity'` |
| `additive` | boolean | ❌ | Keep current scene loaded (default: false) |

### Actions

| Action | Required Params | Notes |
|--------|-----------------|-------|
| `'open'` | `path` | `additive: true` to keep current scene |
| `'save'` | — | `path` optional (saves to new path if provided) |
| `'create'` | `path` | Must end with `.unity` |
| `'set_active'` | `path` | Scene must already be loaded |

### Examples

```typescript
// Save current scene
unity_scene({ action: 'save' })

// Save to new path
unity_scene({ action: 'save', path: 'Assets/Scenes/Level1_Backup.unity' })

// Create a new scene
unity_scene({ action: 'create', path: 'Assets/Scenes/NewLevel.unity' })

// Open another scene (replacing current)
unity_scene({ action: 'open', path: 'Assets/Scenes/Level2.unity' })

// Open another scene additively
unity_scene({ action: 'open', path: 'Assets/Scenes/Level2.unity', additive: true })

// Set which loaded scene is active
unity_scene({ action: 'set_active', path: 'Assets/Scenes/Level2.unity' })
```

> ⚠️ **Important:** Always save before opening a new scene to avoid losing changes.

---

## Tool 6: `unity_refresh` — "The Compiler"

**File:** `src/agent/unity-tools/refresh.ts`

**Purpose:** Trigger Asset Database refresh and C# script compilation. **CRITICAL** after creating or editing `.cs` files.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `watched_scripts` | string[] | ❌ | Script class names to verify after compilation |
| `type_limit` | int | ❌ | Limit returned available types (default: 20) |

### Behavior

1. Sends `refresh_assets` command to Unity
2. Waits for `compilation_complete` response
3. Uses **"compilation-safe" wait mechanism** that survives domain reloads
4. Has **120 second timeout** (longer than normal tools)
5. Returns verification status for watched scripts

### Response Status Values

| Status | Meaning |
|--------|---------|
| `'SUCCESS'` | Assets refreshed and scripts compiled successfully |
| `'COMPILATION_FAILED'` | Unity failed to compile — errors included in response |
| `'TIMEOUT'` | Compilation took too long (domain reload issues) |
| `'NOT_CONNECTED'` | Unity manager not initialized or disconnected |

### Examples

```typescript
// Basic refresh
unity_refresh()

// Refresh and verify specific scripts
unity_refresh({ watched_scripts: ['PlayerController', 'EnemyAI'] })

// Response example (success):
{
  "status": "SUCCESS",
  "message": "Assets refreshed and scripts compiled successfully.",
  "verification": { "PlayerController": true, "EnemyAI": true },
  "warning": null,
  "next_step": "You can now use unity_component({ action: 'add' }) with these scripts."
}

// Response example (compilation failed):
{
  "status": "COMPILATION_FAILED",
  "message": "Unity failed to compile the scripts. You must fix these errors:",
  "errors": ["Assets/Scripts/PlayerController.cs(15,10): error CS1002: ; expected"]
}
```

> ⚠️ **Critical:** You MUST call `unity_refresh` after creating or editing C# scripts. Unity cannot add a component until scripts are compiled.

---

## Tool 7: `unity_deletion` — "The Janitor"

**File:** `src/agent/unity-tools/deletion.ts`

**Purpose:** Delete assets from the project by moving them to the OS trash (recoverable deletion).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `paths` | string[] | ✅ | Asset paths to delete (e.g., `['Assets/Scripts/Old.cs']`) |

### Behavior

1. Moves assets to OS trash (recycle bin) — **deletion is recoverable**
2. When deleting `.cs` or `.asmdef` files, Unity triggers a domain reload
3. Uses the **"compilation-safe" wait mechanism** (survives disconnect)
4. Returns detailed success/failure breakdown

### Response Structure

```typescript
{
  "status": "SUCCESS",        // or "FAILED", "TIMEOUT", "NOT_CONNECTED"
  "message": "Deleted 5 assets successfully.",
  "deletedCount": 5,
  "failedCount": 0,
  "deletedPaths": ["Assets/Scripts/Old.cs", ...],
  "failedPaths": [],
  "triggeredRecompile": true  // true if .cs files were deleted
}
```

### Examples

```typescript
// Delete a single asset
unity_deletion({ paths: ['Assets/Scripts/OldController.cs'] })

// Delete multiple assets
unity_deletion({
  paths: [
    'Assets/Scripts/OldController.cs',
    'Assets/Materials/UnusedMat.mat',
    'Assets/Prefabs/DummyEnemy.prefab'
  ]
})

// Workflow: Find assets first, then delete
// 1. Search for assets
unity_query({ action: 'search_assets', search_query: 'Old' })
// 2. Delete from results
unity_deletion({ paths: ['Assets/Scripts/OldPlayer.cs'] })
```

---

## Tool 8: `unity_material` — "The Artist"

**File:** `src/agent/unity-tools/material.ts`

**Purpose:** Create, modify, and assign materials to GameObjects. Supports friendly property names that auto-resolve.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum | ✅ | One of: `'create'`, `'modify'`, `'assign'`, `'create_and_assign'` |
| `instance_id` | int | ❌ | Instance ID of existing material |
| `asset_path` | string | ❌ | Asset path like `'Assets/Materials/Foo.mat'` |
| `shader_name` | string | ❌ | Full shader name (auto-detects URP/Standard if omitted) |
| `name` | string | ❌ | Material name (default: `'NewMaterial'`) |
| `save_path` | string | ❌ | Where to save new material |
| `properties` | record | ❌ | Material properties (friendly names supported) |
| `keywords` | object/array | ❌ | Shader keywords to enable/disable |
| `assign_to` | object | ❌ | Target GameObject for assignment |

### Friendly Property Names (Auto-Resolved)

| Friendly Name | Maps To | Type |
|---------------|---------|------|
| `color`, `baseColor`, `albedo` | `_BaseColor` | `[r, g, b, a]` (0-1 floats) |
| `metallic` | `_Metallic` | float (0-1) |
| `smoothness`, `glossiness` | `_Smoothness` | float (0-1) |
| `mainTexture`, `baseMap`, `mainTex` | `_BaseMap` | asset path or instance ID |
| `normalMap`, `bumpMap` | `_BumpMap` | asset path or instance ID |
| `emissionColor` | `_EmissionColor` | `[r, g, b, a]` |
| `renderQueue` | — | int (sets directly) |

### Keyword Format

```typescript
// Object form (explicit enable/disable)
keywords: { "_EMISSION": true, "_NORMALMAP": false }

// Array form (all enabled)
keywords: ["_EMISSION", "_NORMALMAP"]
```

### Assign To Structure

```typescript
assign_to: {
  game_object_instance_id: 12345,  // required
  slot_index: 0                     // optional, default 0
}
```

### Examples

```typescript
// Create a red metallic material
unity_material({
  action: 'create',
  name: 'RedMetal',
  properties: {
    color: [1, 0, 0, 1],
    metallic: 0.9,
    smoothness: 0.7
  }
})

// Modify existing material
unity_material({
  action: 'modify',
  asset_path: 'Assets/Materials/RedMetal.mat',
  properties: { color: [0, 0, 1, 1] }
})

// Assign material to GameObject
unity_material({
  action: 'assign',
  asset_path: 'Assets/Materials/RedMetal.mat',
  assign_to: { game_object_instance_id: 12345 }
})

// Create + configure + assign (compound operation)
unity_material({
  action: 'create_and_assign',
  name: 'BluePlastic',
  shader_name: 'Universal Render Pipeline/Lit',
  properties: {
    color: [0, 0, 1, 1],
    metallic: 0.1,
    smoothness: 0.8
  },
  keywords: { "_EMISSION": true },
  assign_to: { game_object_instance_id: 12345, slot_index: 0 }
})
```

---

## Connection Infrastructure

**File:** `src/agent/unity-tools/connection.ts`

All tools communicate through a centralized connection layer.

### Key Functions

| Function | Purpose |
|----------|---------|
| `setUnityManager(manager)` | Register the global UnityManager (called at startup) |
| `getUnityManager()` | Get the current UnityManager instance |
| `callUnityAsync(action, params)` | Core async bridge—sends WebSocket command and waits for response |

### Special Handling

- **Regular commands:** Use `sendAndWait()` with standard timeout
- **Compilation/deletion commands:** Use `sendRefreshAndWait()` with 120s timeout (survives domain reloads)
- **All responses:** Cast to `UnityResponse` type

### UnityResponse Type

```typescript
interface UnityResponse {
  success: boolean
  body?: { ... }
  error?: string
  hint?: string
}
```

---

## Tool Export

All 8 tools are exported as an array from `src/agent/unity-tools/index.ts`:

```typescript
import { unityTools } from './agent/unity-tools'

// Register with LangGraph
const agent = createAgent({
  tools: [...unityTools, ...otherTools]
})
```

---

## Common Workflows

### 1. Inspect and Modify a GameObject

```typescript
// 1. Get the scene hierarchy
unity_query({ action: 'hierarchy' })

// 2. Find the instance_id you want and inspect it
unity_query({ action: 'inspect_object', instance_id: -74268 })

// 3. Modify a component
unity_component({
  action: 'modify',
  game_object_id: -74268,
  component_type: 'Transform',
  properties: { m_LocalPosition: [0, 5, 0] }
})
```

### 2. Create a New Script and Add It

```typescript
// 1. Create the C# script file (using file system tool)
// ... write PlayerController.cs ...

// 2. Refresh Unity to compile
unity_refresh({ watched_scripts: ['PlayerController'] })

// 3. Add the component
unity_component({
  action: 'add',
  game_object_id: -74268,
  component_type: 'PlayerController'
})
```

### 3. Create and Apply a Material

```typescript
// 1. Create a new GameObject
unity_hierarchy({ action: 'create', name: 'Cube', primitive_type: 'Cube' })

// 2. Get its instance_id from the response
// 3. Create and assign material in one call
unity_material({
  action: 'create_and_assign',
  name: 'GoldMaterial',
  properties: {
    color: [1, 0.84, 0, 1],
    metallic: 1.0,
    smoothness: 0.9
  },
  assign_to: { game_object_instance_id: -74268 }
})
```

### 4. Prefab Workflow

```typescript
// 1. Create a GameObject and configure it
unity_hierarchy({ action: 'create', name: 'Enemy', primitive_type: 'Capsule' })
unity_component({ action: 'add', game_object_id: -74268, component_type: 'Rigidbody' })

// 2. Save as prefab
unity_prefab({ instance_id: -74268, save_path: 'Assets/Prefabs/Enemy.prefab' })

// 3. Later, instantiate copies
unity_prefab({ prefab_name: 'Enemy', position: [10, 0, 0] })
unity_prefab({ prefab_name: 'Enemy', position: [20, 0, 0] })
```
