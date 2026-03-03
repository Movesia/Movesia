# Movesia Agent — Tools & Capabilities

## What the Agent Is

A conversational AI companion for Unity game development. The user chats naturally and the agent reads, edits, configures, and manages their Unity project in real time through 8 specialized tools.

**Model:** Claude Haiku 4.5 (via OpenRouter)

---

## Tools

### 1. `unity_query` — Read & Inspect

The agent's eyes into the project. Read-only — never changes anything.

| Action | What it does |
|--------|-------------|
| `list_children` | Browse the scene hierarchy tree (path `"/"` = all scenes, depth 1–3) |
| `inspect_gameobject` | See everything about a single object — its components, properties, transform |
| `find_gameobjects` | Search by name, tag, layer, or attached component type |
| `get_logs` | Pull console errors, warnings, and exceptions |
| `get_settings` | Read project settings (physics, quality, input, etc.) |

---

### 2. `unity_hierarchy` — Organize the Scene Graph

Structural changes to GameObjects in the scene.

| Action | What it does |
|--------|-------------|
| `create` | New empty or primitive GameObject (Cube, Sphere, Capsule, Cylinder, Plane, Quad) |
| `duplicate` | Clone an existing GameObject |
| `destroy` | Delete a GameObject (undo-supported) |
| `rename` | Change a GameObject's name |
| `reparent` | Move a GameObject under a different parent (or to root) |
| `move_scene` | Move a GameObject to a different loaded scene |

---

### 3. `unity_component` — Configure Behaviors & Data

Add, tweak, or remove components on any GameObject. This is the primary editing tool.

| Action | What it does |
|--------|-------------|
| `configure` | Smart add-or-modify — if the component exists it edits it, if it doesn't it adds it. One call does both. |
| `remove` | Destroy a component from a GameObject |

**Property examples:**
- Vectors: `{ m_LocalPosition: [0, 5, 0] }`
- Colors: `{ m_Color: [1.0, 0.0, 0.0, 1.0] }` (RGBA 0–1)
- Enums: `{ m_Type: "Directional" }` or `{ m_Type: 1 }`
- Booleans: `{ m_Enabled: true }`

---

### 4. `unity_prefab` — Prefab Operations

Work with prefab templates and instances. Supports compound operations (multiple steps in one call).

| Operation | How |
|-----------|-----|
| Instantiate by name | `prefab_name: "Enemy"` + optional position/rotation/scale/parent |
| Instantiate by path | `asset_path: "Assets/Prefabs/Enemy.prefab"` |
| Create prefab from scene object | `path` (scene GO) + `save_path` (where to save .prefab) |
| Apply overrides | `path` alone — pushes scene changes back to the prefab asset |
| Modify prefab asset | Any of the above + `component_type` + `properties` |

---

### 5. `unity_scene` — Scene Management

| Action | What it does |
|--------|-------------|
| `open` | Load a scene (replace current or additive) |
| `save` | Save the current scene (or save-as to a new path) |
| `create` | New empty scene |
| `set_active` | Set which loaded scene is the active one |

---

### 6. `unity_refresh` — Script Compilation

Triggers C# recompilation and verifies scripts are available. **Mandatory** after creating or editing any `.cs` file.

- Takes `watched_scripts` — a list of class names to verify (e.g., `["PlayerController"]`)
- Returns `SUCCESS`, `COMPILATION_FAILED` (with errors), or `TIMEOUT`

---

### 7. `unity_deletion` — Asset Deletion

Deletes asset files (scripts, materials, prefabs, textures, etc.).

- Takes an array of asset paths
- Moves to OS trash (recoverable)

---

### 8. `unity_material` — Material Management

Create, edit, and assign materials with friendly property names.

| Action | What it does |
|--------|-------------|
| `create` | New material (auto-detects URP or Standard shader) |
| `modify` | Edit an existing material's properties |
| `assign` | Assign a material to a GameObject's renderer |
| `create_and_assign` | Create + assign in one call |

**Friendly properties:** `color`, `metallic`, `smoothness`, `mainTexture`, `normalMap`, `emissionColor`, `renderQueue`

---

## Script Workflow

When the agent writes C# scripts, it follows this sequence:

```
1. Write the .cs file to disk
2. Compile → unity_refresh({ watched_scripts: ["MyScript"] })
3. Verify compilation passed
4. Attach → unity_component({ action: "configure", path: "...", component_type: "MyScript" })
```

This is the agent's main creative power — it can design game mechanics by writing scripts, compiling them, and wiring them onto GameObjects with configured properties.

---

## Current Agent Behavior (How It Routes Requests)

The system prompt tells the agent how to map user requests to tools:

| User says | Agent does |
|-----------|-----------|
| "Show me what's in the scene" | `unity_query` → list_children |
| "Add a cube" | `unity_hierarchy` → create |
| "Make it red" | `unity_material` → create_and_assign |
| "Add a Rigidbody to the player" | `unity_component` → configure |
| "Spawn the enemy prefab" | `unity_prefab` → instantiate |
| "Save the scene" | `unity_scene` → save |
| "Write me a player controller" | filesystem write → `unity_refresh` → `unity_component` |
| "Delete the old scripts" | `unity_deletion` |
| "Why is my object falling through the floor?" | `unity_query` → inspect + get_logs |

---

## Capability Summary

| Category | What the agent can do |
|----------|----------------------|
| **Inspect** | Browse hierarchy, inspect any GameObject/component, search by name/tag/layer/component, read logs, read project settings |
| **Edit GameObjects** | Rename, reparent, move between scenes, duplicate, destroy |
| **Configure Components** | Add/modify/remove any component, set any serialized property (transforms, physics, colliders, lights, custom scripts, etc.) |
| **Materials** | Create materials, edit shader properties, assign to renderers |
| **Prefabs** | Instantiate, create from scene objects, apply overrides, modify prefab assets |
| **Scenes** | Open, save, create, set active |
| **Scripts** | Write C# scripts, compile, verify, attach to GameObjects with configured properties |
| **Assets** | Delete any asset file (trash, recoverable) |
| **Memory** | Remember project-specific context across conversations |
