# Unity Hierarchy API — Agent Guide

This document describes how to navigate and manipulate the Unity scene hierarchy through the WebSocket API. It covers the path-based identification system, the lean response format, the three navigation tools, and how all manipulation/component APIs accept paths.

---

## Field Omission Rules

All responses follow a "only show non-obvious state" philosophy to minimize token count:

- **Errors** use `error_response` type — success responses never contain `success` or `error` fields
- **`activeSelf`** — omitted when `true` (the default). Only appears when `false`.
- **`activeInHierarchy`** — omitted when it equals `activeSelf`. Only appears when an object is active itself but disabled by a parent.
- **`tag`** — omitted when `"Untagged"` (the default)
- **`layer`** — omitted when `"Default"` (the default)
- **`childCount`** — omitted when `0` (leaf objects) in all responses (list_children, inspect, find)
- **`descendantCount`** — only in `list_children` responses (not in inspect); omitted when `0` (leaf objects)
- **`isPrefabInstance`** — omitted when `false`
- **`prefabAssetPath`** / **`hasPrefabOverrides`** — omitted when not a prefab instance
- **`localScale`** — omitted when `[1,1,1]` (identity scale)
- **`name`** — never included (derivable from last segment of `path`)
- **`instanceId`** — never included in responses (agent uses `path`)
- **`parentPath`** — never included in inspect (derivable from `path`)
- **Transform component** — auto-excluded from components array (data is at top-level: `localPosition`, `localRotation`, `localScale`, `worldPosition`)
- **Internal Unity fields** — stripped from component properties: `m_ObjectHideFlags`, `m_CorrespondingSourceObject`, `m_PrefabInstance`, `m_PrefabAsset`, `m_GameObject`, `m_EditorHideFlags`, `m_EditorClassIdentifier`
- **Component `enabled`** — omitted when `true` (the default)

---

## Path-Based Identification

Every GameObject in Unity is identified by a **filesystem-like path**.

### Path Format

```
/SceneName/RootObject/Child/GrandChild
```

- Leading `/` is optional but recommended for clarity
- **First segment is always the scene name** (e.g., `SampleScene`, `UIScene`)
- Remaining segments walk the Transform hierarchy
- Path `"/"` refers to the root — lists all loaded scenes
- All responses include a `path` field so the agent always has fresh references

### Duplicate Sibling Names

When multiple siblings share the same name, a 0-indexed `[index]` suffix disambiguates:

```
/SampleScene/Environment/Tree[0]   ← first Tree
/SampleScene/Environment/Tree[1]   ← second Tree
/SampleScene/Environment/Tree[2]   ← third Tree
```

The index only appears when siblings actually share names. If a name is unique among its siblings, no index is appended.

### Path vs instanceId

All APIs accept **both** `path` (preferred) and `instanceId` (fallback). If both are provided, `path` takes priority.

```json
{ "path": "/SampleScene/Player" }
{ "instanceId": 12340 }
{ "path": "/SampleScene/Player", "instanceId": 12340 }
```

**Always prefer `path`** — it is self-documenting, predictable from context, and survives across hierarchy snapshots. Use `instanceId` only when you already have one from a previous response and the path may have changed (e.g., after a rename or reparent — though those operations return the updated path anyway).

---

## Navigation Tools

Three message types for exploring the hierarchy progressively, without dumping the entire scene tree.

### `list_children` — Browse the hierarchy

The **`ls`** equivalent. Lists immediate children of a path with controlled depth recursion.

**When to use:** Starting exploration, seeing what's inside a container, understanding hierarchy structure.

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

| Parameter | Type   | Default  | Description |
|-----------|--------|----------|-------------|
| `path`    | string | required | Path to list. `"/"` for scenes, `"/SceneName"` for root objects, any deeper path for children. |
| `depth`   | int    | 1        | Recursion depth (clamped 1–3). `1` = direct children only. `2` = children + grandchildren. |

**Response:** `list_children_response`

```json
{
  "type": "list_children_response",
  "id": "ls-001",
  "body": {
    "parentPath": "/SampleScene/Environment",
    "count": 3,
    "children": [
      {
        "path": "/SampleScene/Environment/Ground"
      },
      {
        "path": "/SampleScene/Environment/Tree[0]",
        "childCount": 5,
        "descendantCount": 47,
        "isPrefabInstance": true
      },
      {
        "path": "/SampleScene/Environment/InactiveRock",
        "activeSelf": false,
        "tag": "Obstacle",
        "childCount": 2,
        "descendantCount": 3
      }
    ]
  }
}
```

Note: no `success`, no `name`, no `instanceId`, no `tag` when Untagged, no `activeSelf` when true, no `isPrefabInstance` when false. Leaf objects (like Ground) have only `path` — `childCount` and `descendantCount` are omitted when 0.

**Key fields:**
- `childCount` — direct children count. Omitted when 0 (leaf objects).
- `descendantCount` — total recursive descendants. Omitted when 0 (leaf objects). Use this to decide: small count → drill down with `list_children` at higher depth; large count → use `find_gameobjects` to search.
- `children` — null when `depth` is 1. Populated with nested `ChildEntry` arrays when `depth` > 1.
- **No `components[]` array** — kept lightweight. Use `inspect_gameobject` to see components.

**Special paths:**

| Path | Returns |
|------|---------|
| `"/"` | All loaded scenes (path, childCount = root object count, descendantCount = total GOs in scene) |
| `"/SceneName"` | Root GameObjects of that scene |
| `"/SceneName/SomeObject"` | Children of SomeObject |

---

### `inspect_gameobject` — Read one object in detail

The **`cat`** equivalent. Returns full details for one GameObject with optional component filtering.

**When to use:** Reading properties of a specific object, checking transforms, seeing component data.

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

| Parameter    | Type     | Default  | Description |
|--------------|----------|----------|-------------|
| `path`       | string   | —        | Path to the GameObject |
| `instanceId` | int      | —        | Alternative: instanceId |
| `components` | string[] | null     | Filter: only return these component types. Omit for all components. |
| `detail`     | string   | `"full"` | `"full"` = properties included. `"summary"` = type names + enabled status only (no property values). |

**Response:** `inspect_gameobject_response`

```json
{
  "type": "inspect_gameobject_response",
  "id": "cat-001",
  "body": {
    "path": "/SampleScene/Player",
    "tag": "Player",
    "childCount": 3,
    "localPosition": [0, 1, 0],
    "localRotation": [0, 0, 0],
    "worldPosition": [0, 1, 0],
    "components": [
      {
        "type": "Rigidbody",
        "properties": { "m_Mass": 1.0, "m_UseGravity": true, "m_Drag": 0, "..." : "..." }
      },
      {
        "type": "PlayerController",
        "properties": { "speed": 5.0, "jumpForce": 10.0 }
      }
    ]
  }
}
```

Note: no `success`, `name`, `instanceId`, `parentPath`, `descendantCount`, `activeInHierarchy` (same as activeSelf so both omitted), `activeSelf` (true=omitted), `layer` (Default=omitted), `isPrefabInstance` (false=omitted), `localScale` ([1,1,1]=omitted). No Transform in components. No `m_ObjectHideFlags` etc. in properties. Component `enabled` omitted when true.

**Usage patterns:**

1. **Quick scan** — See what components an object has without property bloat:
   ```json
   { "path": "/SampleScene/Player", "detail": "summary" }
   ```
   Returns component type names and enabled status (only when not true). `properties` will be `null`.

2. **Targeted read** — Read only specific component properties:
   ```json
   { "path": "/SampleScene/Player", "components": ["Rigidbody"] }
   ```
   Returns full property dump but only for Rigidbody.

3. **Full dump** — Everything (use sparingly, can be large):
   ```json
   { "path": "/SampleScene/Player" }
   ```

---

### `find_gameobjects` — Search the hierarchy

The **`find/grep`** equivalent. Searches by name, tag, layer, or component type with subtree scoping.

**When to use:** Finding objects when you don't know exactly where they are, locating all objects of a type, searching within a subtree.

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

| Parameter    | Type   | Default | Description |
|--------------|--------|---------|-------------|
| `name`       | string | —       | Substring match on GameObject name (case-insensitive) |
| `tag`        | string | —       | Exact tag match |
| `layer`      | string | —       | Layer name match |
| `component`  | string | —       | Has a component of this type |
| `root`       | string | —       | Scope search to this subtree path. Omit to search all loaded scenes. |
| `maxResults` | int    | 25      | Max results to return |

**At least one filter is required.** All provided filters are AND'd together.

**Response:** `find_gameobjects_response`

```json
{
  "type": "find_gameobjects_response",
  "id": "find-001",
  "body": {
    "totalCount": 347,
    "returned": 25,
    "truncated": true,
    "results": [
      {
        "path": "/SampleScene/Audio/BGMusic"
      },
      {
        "path": "/SampleScene/Environment/Lamp",
        "tag": "Interactable",
        "layer": "Interactive",
        "childCount": 2
      }
    ]
  }
}
```

Note: no `success`, `name`, `instanceId`. Tag/layer omitted when default. childCount omitted when 0.

**Key fields:**
- `totalCount` — total matches found in the entire search scope (even beyond maxResults)
- `returned` — how many results were actually returned
- `truncated` — `true` if there were more matches than `maxResults`. When truncated, narrow the search using the `root` parameter.
- **No `components[]` array** — kept lightweight. Use `inspect_gameobject` on individual results to see their components.

**Search examples:**

```json
// Find by name substring
{ "name": "Enemy" }

// Find by tag
{ "tag": "Player" }

// Find by component type
{ "component": "AudioSource" }

// Find by component within a subtree
{ "component": "MeshRenderer", "root": "/SampleScene/Environment/Buildings" }

// Combine filters (AND)
{ "name": "Door", "component": "Animator", "root": "/SampleScene/Interior" }
```

---

## Navigation Workflow

The recommended pattern for exploring an unknown scene:

```
1. list_children({ path: "/" })
   → sees 2 scenes: SampleScene, UIScene

2. list_children({ path: "/SampleScene" })
   → sees 8 root objects. Environment has descendantCount: 347, Player has descendantCount: 8

3. list_children({ path: "/SampleScene/Player", depth: 2 })
   → Player's full subtree (only 8 objects, safe to expand at depth 2)

4. inspect_gameobject({ path: "/SampleScene/Player/Weapons/Sword", detail: "summary" })
   → component types: MeshFilter, MeshRenderer, BoxCollider, SwordController
     (Transform auto-excluded from list)

5. inspect_gameobject({ path: "/SampleScene/Player/Weapons/Sword", components: ["SwordController"] })
   → reads only SwordController properties

6. find_gameobjects({ component: "AudioSource", root: "/SampleScene/Environment" })
   → finds all AudioSources in the Environment subtree without browsing 347 descendants
```

**Decision heuristic:**
- `descendantCount` < 20 → safe to use `list_children` with `depth: 2` or `depth: 3`
- `descendantCount` > 50 → use `find_gameobjects` with `root` scoping instead of drilling down manually

---

## GameObject Manipulation

All manipulation commands accept `path` (preferred) or `instanceId`. All success responses include the `path` of the affected GameObject. All failures use `error_response` type.

**Success response pattern:**
```json
{ "path": "/SampleScene/NewCube" }
```

**Failure response pattern** (type is `error_response`):
```json
{ "error": "GameObject not found" }
```

### `create_gameobject`

```json
{
  "type": "create_gameobject",
  "id": "create-001",
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

| Parameter          | Type     | Description |
|--------------------|----------|-------------|
| `name`             | string   | Name for the new GameObject |
| `primitive`        | string   | Optional: `Cube`, `Sphere`, `Capsule`, `Cylinder`, `Plane`, `Quad` |
| `parentPath`       | string   | Parent by path (preferred) |
| `parentInstanceId` | int      | Parent by instanceId (fallback) |
| `position`         | float[3] | Local position |
| `rotation`         | float[3] | Euler rotation |
| `scale`            | float[3] | Local scale |
| `components`       | string[] | Component types to add |

**Response:** `gameobject_created`

```json
{
  "type": "gameobject_created",
  "id": "create-001",
  "body": {
    "path": "/SampleScene/Environment/NewCube"
  }
}
```

### `duplicate_gameobject`

```json
{
  "type": "duplicate_gameobject",
  "id": "dup-001",
  "body": {
    "path": "/SampleScene/Player"
  }
}
```

**Response:** `gameobject_duplicated` — includes `path` of the new duplicate.

### `destroy_gameobject`

```json
{
  "type": "destroy_gameobject",
  "id": "del-001",
  "body": {
    "path": "/SampleScene/Environment/OldTree"
  }
}
```

**Response:** `gameobject_destroyed` — includes the `path` the object had before destruction.

### `rename_gameobject`

```json
{
  "type": "rename_gameobject",
  "id": "ren-001",
  "body": {
    "path": "/SampleScene/Player",
    "name": "Hero"
  }
}
```

**Response:** `gameobject_renamed` — includes the **new** `path` (reflects the name change).

### `set_parent`

```json
{
  "type": "set_parent",
  "id": "parent-001",
  "body": {
    "path": "/SampleScene/Sword",
    "parentPath": "/SampleScene/Player/Weapons",
    "worldPositionStays": true
  }
}
```

| Parameter            | Type   | Default | Description |
|----------------------|--------|---------|-------------|
| `path`               | string | —       | Child to reparent (by path) |
| `instanceId`         | int    | —       | Child to reparent (by instanceId) |
| `parentPath`         | string | —       | New parent (by path, preferred) |
| `parentInstanceId`   | int    | —       | New parent (by instanceId, fallback) |
| `worldPositionStays` | bool   | true    | Keep world position? |

**Response:** `parent_set` — includes the **new** `path` (reflects the new parent).

### `set_sibling_index`

```json
{
  "type": "set_sibling_index",
  "id": "sib-001",
  "body": {
    "path": "/SampleScene/Environment/Tree[2]",
    "siblingIndex": 0
  }
}
```

**Response:** `sibling_index_set` — includes `path`.

### `move_to_scene`

```json
{
  "type": "move_to_scene",
  "id": "mv-001",
  "body": {
    "path": "/SampleScene/SharedUI",
    "sceneName": "UIScene"
  }
}
```

The object must be a root-level object (no parent). **Response:** `moved_to_scene` — includes the **new** `path` (reflects the new scene).

### `set_active`

```json
{
  "type": "set_active",
  "id": "act-001",
  "body": {
    "path": "/SampleScene/Player",
    "active": false
  }
}
```

**Response:** `active_set` — includes `path`.

### `set_transform`

```json
{
  "type": "set_transform",
  "id": "tf-001",
  "body": {
    "path": "/SampleScene/Player",
    "position": [10, 0, 5],
    "rotation": [0, 90, 0],
    "scale": [1, 1, 1],
    "local": true
  }
}
```

All three (position, rotation, scale) are optional — only provided values are changed. `local: true` (default) uses local space; `local: false` uses world space.

**Response:** `transform_set` — includes `path`.

---

## Component Operations

All component operations accept `path` to identify the target GameObject. All success responses include the `path` of the parent GameObject. Failures use `error_response` type.

### `add_component`

```json
{
  "type": "add_component",
  "id": "comp-001",
  "body": {
    "path": "/SampleScene/Player",
    "componentType": "Rigidbody"
  }
}
```

**Response:** `component_added`

```json
{
  "type": "component_added",
  "id": "comp-001",
  "body": {
    "path": "/SampleScene/Player"
  }
}
```

### `remove_component`

```json
{
  "type": "remove_component",
  "id": "comp-002",
  "body": {
    "path": "/SampleScene/Player",
    "componentType": "Rigidbody"
  }
}
```

**Response:** `component_removed` — includes `path` of the parent GameObject.

### `modify_component`

Modify properties on a component. Two ways to target the component:

**Option A — By GameObject path + component type (preferred):**

```json
{
  "type": "modify_component",
  "id": "comp-003",
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

**Option B — By componentInstanceId directly:**

```json
{
  "type": "modify_component",
  "id": "comp-004",
  "body": {
    "componentInstanceId": 12347,
    "properties": {
      "m_Mass": 2.5
    }
  }
}
```

If a GameObject has multiple components of the same type, use `componentIndex` (0-indexed) to pick which one.

**Response:** `component_modified` — includes `path` and per-property success/failure details:

```json
{
  "type": "component_modified",
  "id": "comp-003",
  "body": {
    "componentType": "Rigidbody",
    "path": "/SampleScene/Player",
    "successCount": 2,
    "failCount": 1,
    "results": [
      { "success": true, "propertyPath": "m_Mass", "propertyType": "float" },
      { "success": true, "propertyPath": "m_UseGravity", "propertyType": "bool" },
      { "success": false, "error": "Property not found", "propertyPath": "m_FakeField", "propertyType": "" }
    ]
  }
}
```

---

## Legacy Hierarchy Reads

These older APIs still work. Prefer the navigation tools above for progressive exploration.

### `get_hierarchy`

Returns the full scene hierarchy (expensive for large scenes). Default `maxDepth` is 3.

```json
{ "type": "get_hierarchy", "id": "h-001", "body": { "maxDepth": 3 } }
```

Every GameObject in the response includes `path` and `descendantCount`.

### `get_scenes`

Scene metadata only (no GameObjects).

```json
{ "type": "get_scenes", "id": "s-001", "body": {} }
```

### `get_components`

Full component dump for a single object. Accepts `path` or `instanceId`.

```json
{ "type": "get_components", "id": "gc-001", "body": { "path": "/SampleScene/Player" } }
```

Response includes `path` alongside the component data. Transform is auto-excluded; internal Unity fields are stripped.

### `get_project_settings`

Project configuration. Optional `category` filter.

```json
{ "type": "get_project_settings", "id": "ps-001", "body": { "category": "build" } }
```

Categories: `environment`, `player`, `build`, `quality`, `physics`, `time`, `audio`, `rendering`, `packages`.

---

## Prefab Operations

### Unified `prefab` endpoint

Supports actions: `list`, `instantiate`, `create`, `createVariant`, `apply`, `revert`, `unpack`, `open`, `addComponent`, `modify`.

```json
{
  "type": "prefab",
  "id": "pf-001",
  "body": {
    "action": "instantiate",
    "prefabName": "Enemy",
    "position": [5, 0, 3]
  }
}
```

### Legacy prefab message types

| Type | Description |
|------|-------------|
| `list_prefabs` | List prefab assets |
| `instantiate_prefab` | Instantiate by asset path |
| `instantiate_prefab_by_name` | Instantiate by name search |
| `create_prefab` | Create prefab from scene GO |
| `create_prefab_variant` | Create variant of existing prefab |
| `apply_prefab` | Apply instance overrides to asset |
| `revert_prefab` | Revert instance to asset values |
| `unpack_prefab` | Break prefab link |
| `open_prefab` | Open in prefab editing mode |
| `add_component_to_prefab` | Add component to prefab asset |
| `modify_prefab` | Modify prefab asset properties |

---

## Scene Operations

| Type               | Description |
|--------------------|-------------|
| `create_scene`     | Create new scene (empty/default) |
| `open_scene`       | Open scene (single/additive) |
| `save_scene`       | Save current scene |
| `set_active_scene` | Set the active scene |

---

## Material Operations

### Unified `material` endpoint

Creates, modifies, and/or assigns materials in a single call. Auto-detects URP/built-in shaders.

```json
{
  "type": "material",
  "id": "mat-001",
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

Property aliases: `color`/`baseColor`/`albedo`, `metallic`, `smoothness`/`glossiness`, `normalMap`, `emissionColor`, `mainTexture`/`baseMap`.

### `list_shaders`

```json
{ "type": "list_shaders", "id": "sh-001", "body": {} }
```

---

## Asset Operations

| Type               | Description |
|--------------------|-------------|
| `search_assets`    | Search by type, name, label, folder |
| `get_asset_labels` | Get all asset labels |
| `get_type_aliases` | Get type alias map (e.g., "script" = "MonoScript") |
| `delete_assets`    | Delete assets (moves to OS trash) |

---

## Spatial Context

```json
{
  "type": "get_spatial_context",
  "id": "sp-001",
  "body": {
    "names": ["Wall", "Floor"],
    "maxDistance": 0.5
  }
}
```

Returns spatial data with bounds, positions, and automatic alignment checks.

---

## Other Operations

| Type                     | Description |
|--------------------------|-------------|
| `ping`                   | Health check |
| `get_logs`               | Get buffered Unity console logs (max 100) |
| `get_errors`             | Get only errors and exceptions |
| `clear_logs`             | Clear the log buffer |
| `refresh_assets`         | Trigger AssetDatabase.Refresh() |
| `get_compilation_status` | Check compilation state |
| `get_available_types`    | List available component types |
| `capture_screenshot`     | Capture editor screenshot |

---

## Response Envelope

Every response follows this envelope:

```json
{
  "type": "<response_type>",
  "id": "<original_request_id>",
  "ts": 1704067200,
  "body": { ... }
}
```

The `id` echoes the request ID for correlation. The `body` contains the type-specific payload. Fields in `body` follow the omission rules above — default/obvious values are not included.

---

## Error Handling

All errors use `error_response` as the type (not the original response type). Success responses never contain `success` or `error` fields.

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

Scene resolution errors include available scenes:

```json
{
  "error": "Scene 'MyScene' not found. Available scenes: [SampleScene, UIScene (unloaded)]"
}
```

---

## Fuzzy Key Normalization

The API protects against LLM field-name hallucinations. All of these resolve correctly:

| You Send | Resolves To |
|----------|-------------|
| `instanceId`, `gameObjectInstanceId`, `goInstanceId`, `objectId`, `id` | `instanceId` |
| `path`, `gameObjectPath`, `goPath`, `objectPath` | `path` |
| `depth`, `maxDepth`, `recursionDepth`, `levels` | `depth` |
| `component`, `componentType`, `hasComponent`, `withComponent` | `component` |
| `root`, `rootPath`, `searchRoot`, `scope` | `root` |
| `maxResults`, `limit`, `maxCount`, `resultLimit` | `maxResults` |
| `components`, `componentFilter`, `filterComponents`, `componentTypes` | `components` |
| `detail`, `detailLevel`, `mode`, `verbosity` | `detail` |
| `name`, `namePattern`, `search`, `filter` | `name` |
| `parentPath` | `parentPath` |
| `parentInstanceId`, `parentId` | `parentInstanceId` |

---

## What Changed from the Previous API

### Lean response format
All responses now omit default/obvious values to minimize token count. See the **Field Omission Rules** section at the top for the full list. Key removals:
- `success` and `error` fields removed from success responses (errors use `error_response` type)
- `name` removed (derivable from `path`)
- `instanceId` removed from all responses (agent uses `path`)
- `parentPath` removed from inspect (derivable from `path`)
- `descendantCount` removed from inspect responses (only in `list_children`)
- Transform component auto-excluded from components array
- Internal Unity fields stripped from component properties
- Default values omitted: `activeSelf: true`, `tag: "Untagged"`, `layer: "Default"`, `isPrefabInstance: false`, `localScale: [1,1,1]`, `enabled: true`

### New message types added
- `list_children` — progressive hierarchy browsing
- `inspect_gameobject` — detailed single-object inspection with filtering
- `find_gameobjects` — search with subtree scoping

### All existing APIs now accept `path`
Previously, every command required an `instanceId` integer. Now all manipulation and component commands accept `path` as the preferred identification method:
- `create_gameobject` — accepts `parentPath` alongside `parentInstanceId`
- `duplicate_gameobject` — accepts `path`
- `destroy_gameobject` — accepts `path`
- `rename_gameobject` — accepts `path`
- `set_parent` — accepts `path` for child and `parentPath` for parent
- `set_sibling_index` — accepts `path`
- `move_to_scene` — accepts `path`
- `set_active` — accepts `path`
- `set_transform` — accepts `path`
- `add_component` — accepts `path`
- `modify_component` — accepts `path`
- `get_components` — accepts `path`

### All responses now include `path`
Every response that references a GameObject includes its current `path`. This means:
- After `create_gameobject` → response has `path` of the new object
- After `rename_gameobject` → response has the **updated** `path` reflecting the new name
- After `set_parent` → response has the **updated** `path` reflecting the new parent
- After `move_to_scene` → response has the **updated** `path` reflecting the new scene
- After `duplicate_gameobject` → response has `path` of the new duplicate
- After `destroy_gameobject` → response has the `path` the object had before destruction
- All component operation responses include the `path` of the parent GameObject

### `get_hierarchy` default depth reduced
Default `maxDepth` changed from 10 to 3 to avoid dumping excessively deep trees. The hierarchy response includes `path` and `descendantCount` on every GameObject.

### `get_components` accepts paths
Previously required `instanceId`. Now accepts `path` and returns `path` in the response.

---

## Connection Details

| Property          | Value |
|-------------------|-------|
| **URL**           | `ws://127.0.0.1:8765/ws/unity` |
| **Protocol**      | WebSocket (RFC 6455) |
| **Serialization** | JSON (Newtonsoft.Json) |
| **Heartbeat**     | Every 25–35 seconds |
| **Auto-reconnect**| Yes, with exponential backoff |

### Request Envelope

```json
{
  "type": "<message_type>",
  "id": "<unique_request_id>",
  "body": { ... }
}
```

The `id` field is a unique string you choose per request. The response will echo it back for correlation.
