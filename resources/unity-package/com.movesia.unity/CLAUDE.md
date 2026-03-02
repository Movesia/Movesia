# CLAUDE.md — com.movesia.unity

## What This Package Is

A **Unity Editor-only package** that acts as a WebSocket bridge, allowing an external AI agent (running on a local server) to remotely inspect and manipulate a Unity project in real time. The agent sends JSON commands over WebSocket; this package receives them, executes the corresponding Unity Editor API calls, and sends JSON responses back.

**This is NOT a runtime package.** All code is editor-only (`#if UNITY_EDITOR`, asmdef `includePlatforms: ["Editor"]`).

## Architecture Overview

```
External Agent (Python/Node server at ws://127.0.0.1:8765/ws/unity)
    ↕ WebSocket (JSON envelopes)
WebSocketClient.cs  ← auto-connects on editor load via [InitializeOnLoad]
    ↓ incoming messages queued to ConcurrentQueue
    ↓ dispatched on main thread via EditorApplication.update
Editor/Handlers/MessageRouter.cs ← routes by "type" field to handler files
    ↓
┌──────────────────────────────────────────────────────────────┐
│ Handler Files (parse body + dispatch):                       │
│  • LogHandlers          (ping, get_logs, get_errors)         │
│  • HierarchyHandlers    (navigation + hierarchy CRUD)        │
│  • ComponentHandlers    (unified + legacy component ops)      │
│  • PrefabHandlers       (unified + legacy prefab ops)        │
│  • SceneHandlers        (scene CRUD)                         │
│  • AssetHandlers        (search + deletion)                  │
│  • MaterialHandlers     (material + list_shaders)            │
│  • CompilationHandlers  (refresh + status + types)           │
└──────────────────────────────────────────────────────────────┘
    ↓ delegates to
┌─────────────────────────────────────────────────────┐
│ Manager / Utility Classes (all static, editor-only):│
│  • GameObjectResolver    (path ↔ GameObject)        │
│  • HierarchyTracker      (read scene tree)          │
│  • HierarchyManipulator  (CRUD GameObjects)         │
│  • ComponentInspector     (dump component JSON)      │
│  • ComponentManager       (unified component ops)    │
│  • PrefabManager          (prefab operations)        │
│  • SceneManagement        (scene CRUD)               │
│  • AssetSearch            (find assets)              │
│  • DeletionManager        (delete assets safely)     │
│  • MaterialManager        (create/modify materials)  │
│  • CompilationManager     (refresh + recompile)      │
│  • ProjectSettingsTracker (read project config)      │
│  • ConsoleLogBuffer       (capture Unity logs)       │
└─────────────────────────────────────────────────────┘
```

## Message Protocol

Every message (both directions) is a JSON envelope:

```json
{
  "source": "unity",
  "type": "<message_type>",
  "ts": 1700000000000,
  "id": "<requestId or null>",
  "body": { ... }
}
```

- `type` determines the handler (e.g., `"list_children"`, `"create_gameobject"`)
- `id` is the request correlation ID — responses echo it back so the agent can match request/response
- `body` contains type-specific payload

## Hierarchy Navigation — Filesystem-Like API

The hierarchy navigation system lets the agent explore the Unity scene tree like a filesystem. Instead of dumping the entire hierarchy, the agent navigates progressively using paths.

### Path Format

All GameObjects are identified by **paths** (preferred) or `instanceId` (fallback):

```
/SceneName/RootObject/Child/GrandChild
```

- Leading `/` is optional
- First segment is always the **scene name**
- Duplicate sibling names use `[index]` syntax (0-indexed): `/Environment/Tree[2]`
- Path `"/"` refers to the root (lists all loaded scenes)

### `list_children` — the `ls` equivalent

Lists immediate children of a path. Supports controlled depth recursion.

```json
// List loaded scenes
{ "type": "list_children", "body": { "path": "/" } }

// List root GameObjects of a scene
{ "type": "list_children", "body": { "path": "/SampleScene" } }

// List children of a specific object
{ "type": "list_children", "body": { "path": "/SampleScene/Environment", "depth": 2 } }
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | required | Path to list children of. Use `"/"` for scenes. |
| `depth` | int | 1 | Recursion depth (clamped 1-3) |

**Response:** `list_children_response`
```json
{
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
```

**Key fields:** `childCount` = direct children, `descendantCount` = total recursive descendants. Use `descendantCount` to decide whether to drill down or search instead.

**No `components[]` array** — kept lightweight. Use `inspect_gameobject` for component details.

### `inspect_gameobject` — the `cat` equivalent

Returns full details for one GameObject, with optional component filtering.

```json
// Full inspection
{ "type": "inspect_gameobject", "body": { "path": "/SampleScene/Player" } }

// Summary mode — component types only, no properties
{ "type": "inspect_gameobject", "body": { "path": "/SampleScene/Player", "detail": "summary" } }

// Filtered — only specific components with full properties
{ "type": "inspect_gameobject", "body": {
  "path": "/SampleScene/Player",
  "components": ["Rigidbody", "PlayerController"]
}}
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | - | Path to the GameObject |
| `instanceId` | int | - | Alternative: instanceId |
| `components` | string[] | null | Filter: only return these component types |
| `detail` | string | "full" | `"full"` = properties included, `"summary"` = types only |

**Response:** `inspect_gameobject_response` — includes name, path, instanceId, activeSelf, activeInHierarchy, tag, layer, childCount, descendantCount, parentPath, prefab info, localPosition/localRotation/localScale/worldPosition, and filtered components array.

### `find_gameobjects` — the `find/grep` equivalent

Searches by name, tag, layer, or component type. Supports subtree scoping.

```json
// Find by name (case-insensitive substring)
{ "type": "find_gameobjects", "body": { "name": "Enemy" } }

// Find by component, scoped to a subtree
{ "type": "find_gameobjects", "body": {
  "component": "AudioSource",
  "root": "/SampleScene/Environment"
}}

// Multiple filters (AND'd)
{ "type": "find_gameobjects", "body": { "tag": "Enemy", "layer": "Characters" } }
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | - | Substring match (case-insensitive) |
| `tag` | string | - | Exact tag match |
| `layer` | string | - | Layer name match |
| `component` | string | - | Has component of this type |
| `root` | string | - | Scope search to this subtree path |
| `maxResults` | int | 25 | Max results to return |

At least one filter is required. All filters are AND'd.

**Response:** `find_gameobjects_response`
```json
{
  "success": true,
  "totalCount": 347,
  "returned": 25,
  "truncated": true,
  "results": [
    { "name": "BGMusic", "path": "/SampleScene/Audio/BGMusic", "instanceId": 501, "tag": "Untagged", "layer": "Default", "childCount": 0 }
  ]
}
```

When `truncated: true`, the agent should use `root` to narrow the search scope.

### Navigation Workflow Example

```
1. list_children({ path: "/" })
   → sees 2 scenes: SampleScene, UI Scene

2. list_children({ path: "/SampleScene" })
   → sees 8 root objects. Environment has descendantCount: 347, Player has descendantCount: 8

3. list_children({ path: "/SampleScene/Player", depth: 2 })
   → sees Player's full subtree (only 8 objects, safe to expand)

4. inspect_gameobject({ path: "/SampleScene/Player/Weapons/Sword", detail: "summary" })
   → sees component types: Transform, MeshFilter, MeshRenderer, BoxCollider, SwordController

5. inspect_gameobject({ path: "/SampleScene/Player/Weapons/Sword", components: ["SwordController"] })
   → reads only the SwordController properties

6. find_gameobjects({ component: "AudioSource", root: "/SampleScene/Environment" })
   → finds all AudioSources in the Environment subtree
```

### Path-Based Identification for All Operations

All manipulation and component operations now accept `path` alongside `instanceId`:

```json
// Using path (preferred)
{ "type": "destroy_gameobject", "body": { "path": "/SampleScene/Environment/OldTree" } }

// Using instanceId (still works)
{ "type": "destroy_gameobject", "body": { "instanceId": 12345 } }

// Parent by path
{ "type": "create_gameobject", "body": {
  "name": "NewChild",
  "parentPath": "/SampleScene/Player/Weapons"
}}

// Component operations by path
{ "type": "add_component", "body": {
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody"
}}
```

All responses include the `path` field, so the agent always has updated path references after operations that change the hierarchy (rename, reparent, move-to-scene, etc.).

## Unified Component Endpoint — `"component"`

Smart single-message endpoint for adding and/or modifying components. Modeled after the `"material"` and `"prefab"` unified endpoints. Uses fuzzy key normalization to protect against LLM field-name hallucinations.

### Action Inference

The endpoint determines what to do based on which fields are provided:

| `componentType` | `properties` | `componentInstanceId` | Action |
|---|---|---|---|
| yes | no | no | ADD only (idempotent — returns existing if present) |
| yes | yes | no | Find-or-add, then MODIFY |
| no | yes | yes | MODIFY directly by component ID |
| yes | yes | yes | MODIFY by componentInstanceId (componentType ignored) |

### Three-Phase Execution

1. **Resolve target**: If `componentInstanceId` → resolve component directly. Else resolve GO from `path`/`instanceId`
2. **Find-or-add**: Search GO for existing component of `componentType` (using `componentIndex` for Nth match). If none exist → add. If `allowDuplicate=true` → always add new
3. **Modify**: If `properties` provided → set them via `SerializedObject`/`SerializedProperty`

### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | - | GameObject path (preferred) |
| `instanceId` | int | - | GameObject instanceId (fallback) |
| `componentInstanceId` | int | - | Direct component ID (skips find-or-add) |
| `componentType` | string | - | Component type name (e.g., `"Rigidbody"`, `"BoxCollider"`) |
| `componentIndex` | int | 0 | Which component if multiple of same type exist |
| `allowDuplicate` | bool | false | When true, always adds new instead of reusing existing |
| `properties` | object | - | `SerializedProperty` paths → values to set |

### Examples

```json
// Add a Rigidbody (idempotent)
{ "type": "component", "body": {
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody"
}}

// Add + configure in one call
{ "type": "component", "body": {
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "properties": { "m_Mass": 5.0, "m_UseGravity": true }
}}

// Modify existing by direct component ID
{ "type": "component", "body": {
  "componentInstanceId": 12345,
  "properties": { "m_Mass": 10.0 }
}}

// Modify the 2nd AudioSource on a GO
{ "type": "component", "body": {
  "path": "/SampleScene/Player",
  "componentType": "AudioSource",
  "componentIndex": 1,
  "properties": { "m_Volume": 0.5 }
}}
```

### Response: `component_result`

```json
{
  "success": true,
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "componentInstanceId": 54321,
  "added": true,
  "modified": true,
  "successCount": 2,
  "failCount": 0,
  "propertyResults": [
    { "success": true, "propertyPath": "m_Mass", "propertyType": "Float", "previousValue": 1.0, "newValue": 5.0 },
    { "success": true, "propertyPath": "m_UseGravity", "propertyType": "Boolean", "previousValue": true, "newValue": true }
  ]
}
```

### Remove Component (separate endpoint)

`remove_component` remains a separate message type since it's destructive:

```json
{ "type": "remove_component", "body": { "componentInstanceId": 12345 } }
```

## Key Files

| File | Purpose |
|------|---------|
| `package.json` | UPM manifest. Depends on `com.unity.nuget.newtonsoft-json`. Min Unity 2021.3 |
| `Editor/WebSocketClient.cs` | `[InitializeOnLoad]` static class. Manages WS connection lifecycle: auto-connect, heartbeat (25s + jitter), exponential backoff reconnection, session persistence via `EditorPrefs`. Connects to `ws://127.0.0.1:8765/ws/unity` |
| `Editor/Handlers/MessageRouter.cs` | Central message router. `switch(type)` dispatching ~40 message types to handler classes. Also contains `NormalizeKeys` fuzzy key utility and `SendResponse` helper |
| `Editor/Hierarchy/GameObjectResolver.cs` | **Path resolution utility.** Resolves paths (`"/SceneName/Root/Child"`) to GameObjects, builds canonical paths from GameObjects, counts descendants. Used by all handlers for path-based identification |
| `Editor/Hierarchy/HierarchyHandlers.cs` | Handles hierarchy navigation (list_children, inspect_gameobject, find_gameobjects), legacy reads (get_hierarchy, get_scenes, get_components, get_project_settings), and all GameObject manipulation (create, duplicate, destroy, rename, set_parent, etc.) |
| `Editor/Hierarchy/HierarchyTracker.cs` | Read-only scene hierarchy capture. Returns `HierarchySnapshot` with scenes, GameObjects (recursive with depth limit), components, prefab info, paths, descendantCounts |
| `Editor/Hierarchy/HierarchyManipulator.cs` | Full GameObject CRUD with Undo support. Create (empty/primitive), duplicate, destroy, rename, reparent, reorder, move-to-scene, set-active, set-transform. Also handles `ModifyComponent` using `SerializedObject`/`SerializedProperty` for type-safe property editing |
| `Editor/Components/ComponentInspector.cs` | Dumps component data as raw JSON via `EditorJsonUtility.ToJson()`. Supports full dump, filtered dump (by type), and summary mode (no properties) |
| `Editor/Components/ComponentManager.cs` | Unified smart component endpoint (`"component"`) — single message adds (idempotent) and/or modifies components. Supports add-if-absent + modify in one call. Delegates to `HierarchyManipulator` for actual operations |
| `Editor/Components/ComponentHandlers.cs` | Handles unified "component" endpoint and legacy add_component, remove_component, modify_component. Contains `ComponentCanonicalMap` for fuzzy key normalization |
| `Editor/Logs/LogHandlers.cs` | Handles ping, get_logs, get_errors, clear_logs |
| `Editor/Prefabs/PrefabHandlers.cs` | Handles unified "prefab" endpoint and all legacy prefab operations. Contains `PrefabCanonicalMap` for fuzzy key normalization |
| `Editor/Scenes/SceneHandlers.cs` | Handles create_scene, open_scene, save_scene, set_active_scene |
| `Editor/Assets/AssetHandlers.cs` | Handles search_assets, get_asset_labels, get_type_aliases, delete_assets |
| `Editor/Materials/MaterialHandlers.cs` | Handles unified "material" endpoint and list_shaders. Contains `MaterialCanonicalMap` and `ListShadersCanonicalMap` for fuzzy key normalization |
| `Editor/Compilation/CompilationHandlers.cs` | Handles refresh_assets, get_compilation_status, get_available_types |
| `Editor/Prefabs/PrefabManager.cs` | Prefab operations: list, instantiate (by path or name search), create from GO, create variant, apply/revert/unpack instances, open in prefab mode, edit prefab assets directly, modify prefab properties via `SerializedObject` |
| `Editor/Scenes/SceneManager.cs` | Scene operations: create (empty/default), open (single/additive), save, set active. Class named `SceneManagement` to avoid conflict with `UnityEngine.SceneManagement` |
| `Editor/Assets/AssetSearch.cs` | Asset search with type aliases (e.g., "script" → "MonoScript", "audio" → "AudioClip"), name/label/folder/extension filtering |
| `Editor/Assets/DeletionManager.cs` | Safe asset deletion using `MoveAssetsToTrash` (OS recycle bin). Persists pending requests across domain reloads when deleting scripts |
| `Editor/Materials/MaterialManager.cs` | Unified smart material endpoint (`"material"`) — single message creates, modifies, and/or assigns materials. Auto-detects URP/built-in shaders, resolves friendly property names via alias dictionary (e.g., `"color"` → `_BaseColor`/`_Color`). Separate `"list_shaders"` query for shader discovery |
| `Editor/Compilation/CompilationManager.cs` | Triggers `AssetDatabase.Refresh()`, tracks compilation via `CompilationPipeline` events, persists pending requests across domain reloads, sends deferred responses after recompilation completes |
| `Editor/Logs/ConsoleLogBuffer.cs` | Circular buffer (100 entries) capturing Unity console logs. Backfills existing console entries on init via reflection into `UnityEditor.LogEntries` |
| `Editor/Settings/ProjectSettingsTracker.cs` | Reads Unity project settings: environment, player, build, quality, physics, time, audio, rendering, packages |
| `Editor/WebSocket/WebSocket.cs` | NativeWebSocket library (vendored). Provides `ClientWebSocket` wrapper for editor, JSLIB bridge for WebGL. Namespace: `NativeWebSocket` |

## Assembly Structure

- **`Movesia.Connection.Editor`** (`Editor/Movesia.Connection.Editor.asmdef`)
  - Root namespace: `Movesia.Connection`
  - Editor-only platform
  - References: `Movesia.WebSocket`, `Newtonsoft.Json.dll`
  - Contains all handler classes and `WebSocketClient`

- **`Movesia.WebSocket`** (`Editor/WebSocket/Movesia.WebSocket.asmdef`)
  - The vendored NativeWebSocket library
  - No platform restrictions in asmdef (but code uses `#if UNITY_WEBGL` conditionals)

## Critical Patterns

### GameObjectResolver — Path Resolution

`GameObjectResolver` is the central utility for converting between paths and GameObjects:

- **`Resolve(string path, int instanceId)`** — resolves from path (preferred) or instanceId (fallback)
- **`ResolveFromBody(JToken body)`** — extracts path/instanceId from a message body and resolves. Used by all handlers as a one-liner.
- **`BuildPath(GameObject go)`** — builds canonical path string from a GameObject. Appends `[index]` only when siblings share names.
- **`CountDescendants(Transform t)`** — recursive descendant count, O(n), sub-millisecond for typical scenes
- **`ResolveScene(string sceneName)`** — finds scene by name (case-sensitive, then case-insensitive fallback)

Path resolution algorithm:
1. Split path by `/`, first segment = scene name
2. Find scene by name, validate it's loaded
3. Walk Transform children matching each segment by name + optional `[index]`
4. On failure, return error with available children for diagnostics

### Domain Reload Survival
When scripts are created/deleted/modified, Unity triggers a domain reload that destroys all static state. Two managers handle this:
- **CompilationManager**: Saves pending request to `Temp/movesia_pending_compilation.json` before `AssetDatabase.Refresh()`. After reload, `[InitializeOnLoad]` static constructor checks for pending file, waits for WebSocket reconnection, then sends deferred response.
- **DeletionManager**: Same pattern for script file deletions → `Temp/movesia_pending_deletion.json`.

### Main Thread Dispatch
WebSocket messages arrive on background threads. `WebSocketClient` enqueues them into a `ConcurrentQueue<string>`. `EditorApplication.update` callback dequeues and processes on the main thread (required for all Unity API calls).

### Undo Support
All `HierarchyManipulator` operations use Unity's `Undo` system (`Undo.RegisterCreatedObjectUndo`, `Undo.DestroyObjectImmediate`, `Undo.RecordObject`, etc.), making all agent actions undoable by the user.

### SerializedProperty Type Mapping
`HierarchyManipulator.SetPropertyValue()` maps JSON values to Unity `SerializedProperty` types. Supports: int, bool, float/double, string, Color, Vector2/3/4, Quaternion (accepts euler[3] or xyzw[4]), Rect, Bounds, enums (by index or name), ObjectReference (by instanceId), arrays/lists (Generic), LayerMask. NOT supported: AnimationCurve, Gradient, ExposedReference, ManagedReference.

### Material Property Aliases
`MaterialManager` uses a property alias dictionary so the agent can use friendly names instead of shader-specific property names. Resolution uses `material.HasProperty()` to pick the first matching candidate:
- `color`/`baseColor`/`albedo` → `_BaseColor` (URP) or `_Color` (built-in)
- `mainTexture`/`baseMap` → `_BaseMap` (URP) or `_MainTex` (built-in)
- `metallic` → `_Metallic`
- `smoothness`/`glossiness` → `_Smoothness` (URP) or `_Glossiness` (built-in)
- `normalMap` → `_BumpMap`
- `emissionColor` → `_EmissionColor`
- When no shader is specified, auto-detects URP Lit first (`Universal Render Pipeline/Lit`), then falls back to `Standard`

### Custom WebSocket Close Codes
The server uses custom close codes (4000-4999 range):
- `4001` Superseded — another connection replaced this one, don't reconnect
- `4002` DuplicateSession
- `4003` AuthenticationFailed
- `4004` SessionExpired
- `4005` CompilationReset
- `4006` ProjectMismatch — server is connected to a different Unity project, don't reconnect

### Session Management
`WebSocketClient.SessionId` is persisted in `EditorPrefs` under key `"Movesia_SessionId"`. Created once as a GUID and reused across domain reloads. Passed as query parameter on WebSocket URL along with connection sequence number and project path.

### Fuzzy Key Normalization
`MessageRouter.NormalizeKeys()` protects against LLM field-name hallucinations. Algorithm: strip underscores + lowercase → match against a canonical map. Each handler domain has its own canonical map (e.g., `NavigationCanonicalMap` in HierarchyHandlers, `PrefabCanonicalMap` in PrefabHandlers, `ComponentCanonicalMap` in ComponentHandlers).

## Conventions

- **All classes are static** — no MonoBehaviour/ScriptableObject instances
- **All code is wrapped in `#if UNITY_EDITOR`** preprocessor guards
- **Result objects** follow a consistent pattern: `{ success: bool, error: string?, path: string?, ...data }`
- **Paths** are the preferred way to reference GameObjects (e.g., `"/SceneName/Player/Weapons"`)
- **Instance IDs** are still supported as fallback and included in all responses
- **Asset paths** are normalized to start with `"Assets/"` and include proper extensions
- **Error handling**: try/catch in every handler, errors returned as result objects (never thrown to caller)
- **Logging** uses emoji prefixes for quick visual scanning in Unity console
- **Response size**: navigation tools use guardrails (maxResults, depth clamping, truncation flags) to avoid context window bloat

## Common Tasks

### Adding a new message type
1. Add a `case "your_type":` in `MessageRouter.HandleMessage()` switch (in `Editor/Handlers/MessageRouter.cs`)
2. Add a `HandleYourType(string requestId, JToken body)` method in the appropriate `*Handlers.cs` file (or create a new one)
3. Use `GameObjectResolver.ResolveFromBody(body)` to resolve path/instanceId
4. Call the appropriate manager class method
5. Include `path` in the response via `GameObjectResolver.BuildPath(go)`
6. Send response via `await MessageRouter.SendResponse(requestId, "your_response_type", result)`

### Adding a new handler class
1. Create `Editor/YourManager.cs`
2. Wrap in `#if UNITY_EDITOR`
3. Make it `public static class`
4. Define `[Serializable]` result data classes (include `path` field)
5. Use `Undo.*` methods for any scene modifications
6. Return result objects with `success`/`error`/`path` fields

### Testing without the external server
- Use `Tools > WebSocket > Send Test Message` menu item
- Use `Tools > Movesia > Compilation > Check Status` to inspect compilation state
- WebSocket will continuously retry connection with exponential backoff (100ms → 500ms → up to 5s)

## Dependencies

- **Newtonsoft.Json** (`com.unity.nuget.newtonsoft-json` 3.2.1) — JSON serialization for message protocol
- **NativeWebSocket** (vendored in `Editor/WebSocket/`) — WebSocket client implementation

## Known Limitations

- No Runtime assembly — this is purely an editor tool
- No tests directory exists yet
- No custom Editor UI/window — operates entirely headlessly via WebSocket
- `FindComponentType` is duplicated in `HierarchyManipulator` and `PrefabManager` (slightly different implementations)
- `ConsoleLogBuffer` backfill uses reflection into Unity internals (`UnityEditor.LogEntries`) which may break across Unity versions
- AnimationCurve, Gradient, and ManagedReference property types cannot be modified via the agent
- GameObjects with `/` in their name cause ambiguous path resolution (matches Unity's own `Transform.Find()` limitation)
