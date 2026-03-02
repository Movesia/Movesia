# Unity Editor WebSocket API

A WebSocket-based API for remotely inspecting and manipulating a Unity project in real time, designed for AI agent integration.

## Overview

This plugin establishes a persistent WebSocket connection between the Unity Editor and external services (e.g., AI agents, automation tools). It provides:

- **Hierarchy Navigation** - Filesystem-like browsing of the scene tree (`list_children`, `inspect_gameobject`, `find_gameobjects`)
- **GameObject Manipulation** - Create, duplicate, destroy, rename, reparent, transform GameObjects
- **Component Operations** - Add, remove, and modify component properties
- **Prefab Operations** - Instantiate, create, apply, revert, unpack prefabs
- **Scene Management** - Create, open, save, switch scenes
- **Material System** - Create and modify materials with shader property aliases
- **Asset Search** - Find assets by type, name, label, folder
- **Spatial Context** - Spatial queries with alignment analysis
- **Project Settings** - Read build, quality, physics, rendering config
- **Console Logs** - Buffered editor logs with filtering

## Connection Details

| Property           | Value                                  |
| ------------------ | -------------------------------------- |
| **URL**            | `ws://127.0.0.1:8765/ws/unity`        |
| **Protocol**       | WebSocket (RFC 6455)                   |
| **Serialization**  | JSON (Newtonsoft.Json)                 |
| **Heartbeat**      | Every 25-35 seconds                    |
| **Auto-reconnect** | Yes, with exponential backoff          |

## Message Protocol

### Request Envelope

```json
{
  "type": "<message_type>",
  "id": "<unique_request_id>",
  "body": { ... }
}
```

### Response Envelope

```json
{
  "type": "<response_type>",
  "id": "<original_request_id>",
  "ts": 1704067200,
  "body": { ... }
}
```

---

## Path-Based Identification

All GameObjects are identified by **filesystem-like paths** (preferred) or `instanceId` (fallback):

```
/SceneName/RootObject/Child/GrandChild
```

- Leading `/` is optional
- First segment is always the **scene name**
- Duplicate sibling names use `[index]` syntax (0-indexed): `/Environment/Tree[2]`
- Path `"/"` refers to the root (lists all loaded scenes)
- All responses include `path` so the agent always has fresh references

---

## API Endpoints

### Hierarchy Navigation

#### `list_children` - Browse the hierarchy

The `ls` equivalent. Lists immediate children of a path with controlled depth recursion.

**Request:**

```json
{
  "type": "list_children",
  "id": "ls-001",
  "body": {
    "path": "/SampleScene/Environment",
    "depth": 1
  }
}
```

| Parameter | Type   | Default  | Description                                              |
| --------- | ------ | -------- | -------------------------------------------------------- |
| `path`    | string | required | Path to list. `"/"` for scenes, `"/Scene"` for roots.   |
| `depth`   | int    | 1        | Recursion depth (clamped 1-3)                            |

**Response:**

```json
{
  "type": "list_children_response",
  "id": "ls-001",
  "body": {
    "success": true,
    "parentPath": "/SampleScene/Environment",
    "count": 3,
    "children": [
      {
        "name": "Ground",
        "path": "/SampleScene/Environment/Ground",
        "instanceId": 12340,
        "activeSelf": true,
        "tag": "Untagged",
        "childCount": 0,
        "descendantCount": 0,
        "isPrefabInstance": false
      },
      {
        "name": "Tree",
        "path": "/SampleScene/Environment/Tree[0]",
        "instanceId": 12341,
        "activeSelf": true,
        "tag": "Untagged",
        "childCount": 5,
        "descendantCount": 47,
        "isPrefabInstance": true
      }
    ]
  }
}
```

**Key fields:** `childCount` = direct children, `descendantCount` = total recursive descendants. Use `descendantCount` to decide whether to drill down (small) or search (large).

---

#### `inspect_gameobject` - Read one object in detail

The `cat` equivalent. Returns full details for one GameObject with optional component filtering.

**Request:**

```json
{
  "type": "inspect_gameobject",
  "id": "cat-001",
  "body": {
    "path": "/SampleScene/Player",
    "components": ["Rigidbody", "PlayerController"],
    "detail": "full"
  }
}
```

| Parameter    | Type     | Default | Description                                        |
| ------------ | -------- | ------- | -------------------------------------------------- |
| `path`       | string   | -       | Path to the GameObject                              |
| `instanceId` | int      | -       | Alternative: instanceId                             |
| `components` | string[] | null    | Filter: only return these component types           |
| `detail`     | string   | "full"  | `"full"` = properties included, `"summary"` = types only |

**Response:** `inspect_gameobject_response` with name, path, instanceId, activeSelf, activeInHierarchy, tag, layer, childCount, descendantCount, parentPath, prefab info, localPosition/localRotation/localScale/worldPosition, and component data.

---

#### `find_gameobjects` - Search the hierarchy

The `find/grep` equivalent. Searches by name, tag, layer, or component type with subtree scoping.

**Request:**

```json
{
  "type": "find_gameobjects",
  "id": "find-001",
  "body": {
    "component": "AudioSource",
    "root": "/SampleScene/Environment",
    "maxResults": 25
  }
}
```

| Parameter    | Type   | Default | Description                            |
| ------------ | ------ | ------- | -------------------------------------- |
| `name`       | string | -       | Substring match (case-insensitive)     |
| `tag`        | string | -       | Exact tag match                        |
| `layer`      | string | -       | Layer name match                       |
| `component`  | string | -       | Has component of this type             |
| `root`       | string | -       | Scope search to this subtree path      |
| `maxResults` | int    | 25      | Max results to return                  |

At least one filter is required. All filters are AND'd.

**Response:**

```json
{
  "type": "find_gameobjects_response",
  "id": "find-001",
  "body": {
    "success": true,
    "totalCount": 347,
    "returned": 25,
    "truncated": true,
    "results": [
      {
        "name": "BGMusic",
        "path": "/SampleScene/Audio/BGMusic",
        "instanceId": 501,
        "tag": "Untagged",
        "layer": "Default",
        "childCount": 0
      }
    ]
  }
}
```

When `truncated: true`, use the `root` parameter to narrow the search scope.

---

#### Navigation Workflow Example

```
1. list_children({ path: "/" })
   -> sees 2 scenes: SampleScene, UI Scene

2. list_children({ path: "/SampleScene" })
   -> sees 8 roots. Environment: descendantCount 347, Player: descendantCount 8

3. list_children({ path: "/SampleScene/Player", depth: 2 })
   -> Player's full subtree (only 8 objects, safe to expand)

4. inspect_gameobject({ path: "/SampleScene/Player/Weapons/Sword", detail: "summary" })
   -> component types: Transform, MeshFilter, MeshRenderer, BoxCollider, SwordController

5. inspect_gameobject({ path: "/SampleScene/Player/Weapons/Sword", components: ["SwordController"] })
   -> reads only SwordController properties

6. find_gameobjects({ component: "AudioSource", root: "/SampleScene/Environment" })
   -> finds all AudioSources in the Environment subtree
```

---

### Legacy Hierarchy Reads

#### `get_hierarchy`

Retrieves the full scene hierarchy (expensive). Prefer `list_children` for progressive exploration.

```json
{ "type": "get_hierarchy", "body": { "maxDepth": 3 } }
```

| Parameter  | Type | Default | Description                        |
| ---------- | ---- | ------- | ---------------------------------- |
| `maxDepth` | int  | 3       | Maximum depth to traverse children |

Response includes `path` and `descendantCount` on every GameObject.

#### `get_scenes`

Scene metadata only (no GameObjects).

```json
{ "type": "get_scenes", "body": {} }
```

#### `get_components`

Detailed component data for a specific GameObject. Accepts `path` or `instanceId`.

```json
{ "type": "get_components", "body": { "path": "/SampleScene/Player" } }
```

#### `get_project_settings`

Project configuration. Optional `category` filter: `environment`, `player`, `build`, `quality`, `physics`, `time`, `audio`, `rendering`, `packages`.

```json
{ "type": "get_project_settings", "body": { "category": "build" } }
```

---

### GameObject Manipulation

All operations accept `path` (preferred) or `instanceId`. All responses include the updated `path`.

#### `create_gameobject`

```json
{
  "type": "create_gameobject",
  "body": {
    "name": "NewCube",
    "primitive": "Cube",
    "parentPath": "/SampleScene/Environment",
    "position": [0, 1, 0],
    "rotation": [0, 45, 0],
    "scale": [1, 1, 1],
    "components": ["Rigidbody"]
  }
}
```

| Parameter         | Type     | Description                                                |
| ----------------- | -------- | ---------------------------------------------------------- |
| `name`            | string   | Name for the new GameObject                                |
| `primitive`       | string   | Optional: Cube, Sphere, Capsule, Cylinder, Plane, Quad    |
| `parentPath`      | string   | Parent path (alternative to `parentInstanceId`)            |
| `parentInstanceId`| int      | Parent instanceId (fallback)                               |
| `position`        | float[3] | Local position                                             |
| `rotation`        | float[3] | Euler rotation                                             |
| `scale`           | float[3] | Local scale                                                |
| `components`      | string[] | Component types to add                                     |

#### `duplicate_gameobject`

```json
{ "type": "duplicate_gameobject", "body": { "path": "/SampleScene/Player" } }
```

#### `destroy_gameobject`

```json
{ "type": "destroy_gameobject", "body": { "path": "/SampleScene/Environment/OldTree" } }
```

#### `rename_gameobject`

```json
{ "type": "rename_gameobject", "body": { "path": "/SampleScene/Player", "name": "Hero" } }
```

#### `set_parent`

```json
{
  "type": "set_parent",
  "body": {
    "path": "/SampleScene/Sword",
    "parentPath": "/SampleScene/Player/Weapons",
    "worldPositionStays": true
  }
}
```

#### `set_sibling_index`

```json
{ "type": "set_sibling_index", "body": { "path": "/SampleScene/Player", "siblingIndex": 0 } }
```

#### `move_to_scene`

```json
{ "type": "move_to_scene", "body": { "path": "/SampleScene/SharedUI", "sceneName": "UIScene" } }
```

#### `set_active`

```json
{ "type": "set_active", "body": { "path": "/SampleScene/Player", "active": false } }
```

#### `set_transform`

```json
{
  "type": "set_transform",
  "body": {
    "path": "/SampleScene/Player",
    "position": [10, 0, 5],
    "rotation": [0, 90, 0],
    "scale": [1, 1, 1],
    "local": true
  }
}
```

---

### Component Operations

All operations accept `path` (preferred) or `instanceId`.

#### `add_component`

```json
{
  "type": "add_component",
  "body": {
    "path": "/SampleScene/Player",
    "componentType": "Rigidbody"
  }
}
```

#### `remove_component`

```json
{ "type": "remove_component", "body": { "componentInstanceId": 12347 } }
```

#### `modify_component`

```json
{
  "type": "modify_component",
  "body": {
    "path": "/SampleScene/Player",
    "componentType": "Rigidbody",
    "properties": {
      "m_Mass": 2.5,
      "m_UseGravity": true,
      "m_IsKinematic": false
    }
  }
}
```

Alternatively, use `componentInstanceId` for direct component targeting.

---

### Prefab Operations

#### Unified `prefab` endpoint

Supports actions: `list`, `instantiate`, `create`, `createVariant`, `apply`, `revert`, `unpack`, `open`, `addComponent`, `modify`.

```json
{
  "type": "prefab",
  "body": {
    "action": "instantiate",
    "prefabName": "Enemy",
    "position": [5, 0, 3]
  }
}
```

---

### Scene Operations

| Type              | Description                      |
| ----------------- | -------------------------------- |
| `create_scene`    | Create new scene (empty/default) |
| `open_scene`      | Open scene (single/additive)     |
| `save_scene`      | Save current scene               |
| `set_active_scene` | Set the active scene            |

---

### Material Operations

#### Unified `material` endpoint

Creates, modifies, and/or assigns materials in a single call. Auto-detects URP/built-in shaders.

```json
{
  "type": "material",
  "body": {
    "action": "create",
    "name": "RedMetal",
    "color": [1, 0, 0, 1],
    "metallic": 0.8,
    "smoothness": 0.6,
    "assignTo": { "path": "/SampleScene/Player" }
  }
}
```

#### `list_shaders`

Query available shaders.

```json
{ "type": "list_shaders", "body": {} }
```

---

### Asset Operations

| Type               | Description                          |
| ------------------ | ------------------------------------ |
| `search_assets`    | Search by type, name, label, folder  |
| `get_asset_labels` | Get all asset labels                 |
| `get_type_aliases` | Get type alias map                   |
| `delete_assets`    | Delete assets (moves to OS trash)    |

---

### Spatial Context

```json
{
  "type": "get_spatial_context",
  "body": {
    "names": ["Wall", "Floor"],
    "maxDistance": 0.5
  }
}
```

Returns spatial data with bounds, positions, and automatic alignment checks.

---

### Compilation / Refresh

| Type                     | Description                     |
| ------------------------ | ------------------------------- |
| `refresh_assets`         | Trigger AssetDatabase.Refresh() |
| `get_compilation_status` | Check compilation state         |
| `get_available_types`    | List available component types  |

---

### Log Operations

| Type         | Description                    |
| ------------ | ------------------------------ |
| `ping`       | Health check                   |
| `get_logs`   | Get buffered logs (max 100)    |
| `get_errors` | Get only errors and exceptions |
| `clear_logs` | Clear the log buffer           |

---

## Fuzzy Key Normalization

The API protects against LLM field-name hallucinations. For example, all of these resolve to `instanceId`:

- `instanceId`, `gameObjectInstanceId`, `goInstanceId`, `objectId`, `id`

This applies to all parameters across all endpoints.

---

## Error Handling

All errors return:

```json
{
  "type": "error_response",
  "id": "<request_id>",
  "body": {
    "error": "descriptive error message"
  }
}
```

Path resolution errors include available children for diagnostics:

```json
{
  "error": "Child 'Sword' not found under '/SampleScene/Player'. Available children: [Weapons, Shield, Armor]"
}
```

---

## Architecture

```
AI Agent / Client
    |
    | WebSocket (ws://127.0.0.1:8765/ws/unity)
    v
WebSocketClient (auto-connect, heartbeat, reconnect)
    |
    v
MessageRouter (routes ~40 message types)
    |
    +-- GameObjectResolver (path <-> GameObject resolution)
    |
    +-- HierarchyHandlers (navigation + GO manipulation)
    |       +-- HierarchyTracker (read scene tree)
    |       +-- HierarchyManipulator (CRUD with Undo)
    |       +-- ComponentInspector (dump/filter components)
    |
    +-- ComponentHandlers (add/remove/modify components)
    +-- PrefabHandlers -> PrefabManager
    +-- SceneHandlers -> SceneManagement
    +-- AssetHandlers -> AssetSearch, DeletionManager
    +-- MaterialHandlers -> MaterialManager
    +-- SpatialHandlers -> SpatialContextManager
    +-- CompilationHandlers -> CompilationManager
    +-- LogHandlers -> ConsoleLogBuffer
```

---

## Session Management

Persistent session ID stored in `EditorPrefs`:

- **Key:** `Movesia_SessionId`
- **Format:** GUID
- **Lifecycle:** Created on first load, persists across domain reloads

---

## Requirements

- **Unity:** 2021.3+
- **Dependencies:**
  - Newtonsoft.Json (`com.unity.nuget.newtonsoft-json`)
  - NativeWebSocket (vendored)
- **Platform:** Editor only (`#if UNITY_EDITOR`)
