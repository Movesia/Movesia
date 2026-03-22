# Movesia Agent Tools

## Unity Tools

All Unity tools communicate via WebSocket to the Unity Editor.

### unity_query — The Observer

Reads the current state of the Unity Editor.

| Action | What it does |
|--------|-------------|
| `list_children` | Browse hierarchy incrementally (path + depth 1-3) |
| `inspect_gameobject` | Full component/property detail on one object |
| `find_gameobjects` | Search by name, tag, layer, or component type |
| `search_assets` | Find project assets by type/name/folder/extension |
| `get_logs` | Read Unity console (filter by Error/Warning/Exception) |
| `get_settings` | Retrieve project settings by category |

### unity_hierarchy — The Architect

Manages the scene graph structure.

| Action | What it does |
|--------|-------------|
| `create` | New empty GameObject or primitive (Cube, Sphere, etc.) with optional parent/position/rotation/scale |
| `duplicate` | Clone an existing GameObject |
| `destroy` | Remove a GameObject (undo supported) |
| `rename` | Change a GameObject's name |
| `reparent` | Move a GameObject under a different parent |
| `move_scene` | Move root objects between loaded scenes |

### unity_component — The Engineer

Adds, modifies, and removes components on GameObjects.

| Action | What it does |
|--------|-------------|
| `configure` | Smart add/modify — adds component if missing, sets properties, all in one call. Supports `allow_duplicate` for multiple colliders/audio sources |
| `remove` | Destroy a component by type or instance ID |

Properties support vectors `[x,y,z]`, colors `[r,g,b,a]`, enums, and object references via `{ assetPath: "..." }`.

### unity_prefab — The Factory

Manages prefab assets and instances. Supports compound operations (Phase 1 + Phase 2 in one call).

| Operation | How |
|-----------|-----|
| Instantiate by name | `prefab_name` |
| Instantiate by path | `asset_path` (works with .prefab, .fbx, .obj, .gltf) |
| Model → Prefab | `asset_path` + `save_path` (auto: instantiate model → save as prefab → cleanup → spawn prefab) |
| Create from scene GO | `path` + `save_path` |
| Apply overrides | `path` alone |
| Modify prefab asset | Chain `component_type` + `properties` after any Phase 1 |

### unity_material — The Artist

Creates, modifies, and assigns materials.

| Action | What it does |
|--------|-------------|
| `create` | New material with optional shader, properties, textures |
| `modify` | Change properties/keywords on existing material |
| `assign` | Assign material to a GameObject renderer slot |
| `create_and_assign` | Create + assign in one call |

Properties: `mainTexture`, `normalMap`, `metallicMap`, `emissionMap`, `occlusionMap` (as asset paths), `metallic`, `smoothness` (0-1), `color` [r,g,b,a]. Shader keywords via object or array.

### unity_scene — The Director

Manages scene files.

| Action | What it does |
|--------|-------------|
| `open` | Load a scene (additive supported) |
| `save` | Save current scene (optionally to new path) |
| `create` | Create a new .unity scene file |
| `set_active` | Set which loaded scene is active |

### unity_refresh — The Compiler

Triggers Asset Database refresh + script compilation. **Must** be called after creating/editing .cs files. Waits for compilation to finish (up to 120s, survives domain reloads). Can verify specific script types exist via `watched_scripts`.

### unity_deletion — The Janitor

Batch-deletes assets by moving them to OS trash (recoverable). Handles domain reloads when deleting scripts. Returns per-path success/failure.

---

## Non-Unity Tools

| Tool | What it does |
|------|-------------|
| `TavilySearch` | Internet search (requires `TAVILY_API_KEY`) |
| `knowledge_search` | RAG search over Unity docs, workflows, and guides via Qdrant |
| `write_todos` | Task tracking for multi-step operations |
| Filesystem tools | Read/write/list files in Unity `Assets/` directory (via deepagents middleware) |
