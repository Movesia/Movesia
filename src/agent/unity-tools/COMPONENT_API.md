# Component API Reference

Unified `"component"` WebSocket endpoint for adding and modifying Unity components remotely via the AI agent.

---

## Message Format

Every message follows this envelope:

```json
{"type": "component", "id": "req-1", "body": {...params}}
```

All responses come back as `"component_result"` with `componentInstanceId` for stateless follow-up.

---

## Table of Contents

- [Action Inference](#action-inference)
- [Three-Phase Execution](#three-phase-execution)
- [Parameters](#parameters)
- [Adding Components](#adding-components)
  - [Basic Add](#basic-add)
  - [Idempotent Add](#idempotent-add)
  - [Force Duplicate](#force-duplicate)
- [Modifying Components](#modifying-components)
  - [By Path + Type](#by-path--type)
  - [By Component Instance ID](#by-component-instance-id)
  - [Multiple Components of Same Type](#multiple-components-of-same-type)
- [Add + Modify (Compound)](#add--modify-compound)
- [Removing Components](#removing-components)
- [Response Format](#response-format)
- [Property Paths](#property-paths)
  - [Common Property Paths](#common-property-paths)
  - [Supported Property Types](#supported-property-types)
- [Fuzzy Key Names](#fuzzy-key-names)
- [Error Handling](#error-handling)
- [Legacy Endpoints](#legacy-endpoints)
- [Typical Workflows](#typical-workflows)
- [Files](#files)

---

## Action Inference

The endpoint determines what to do based on which fields are provided:

| `componentType` | `properties` | `componentInstanceId` | Action |
|---|---|---|---|
| yes | no | no | **ADD** (idempotent) |
| yes | yes | no | **Find-or-add**, then **MODIFY** |
| no | yes | yes | **MODIFY** directly by component ID |
| yes | yes | yes | **MODIFY** by componentInstanceId (componentType ignored, warning logged) |

No `componentType` and no `componentInstanceId` = error.

---

## Three-Phase Execution

### Phase 1: Resolve target

- If `componentInstanceId` provided: resolve component directly. `componentType` is ignored (warning logged).
- Otherwise: resolve GameObject from `path` (preferred) or `instanceId` (fallback) via `GameObjectResolver`.

### Phase 2: Find-or-add

Only runs when `componentType` is provided and Phase 1 resolved a GameObject (not a direct component).

1. Search the GO for existing component(s) of the given type.
2. If multiple exist, use `componentIndex` to select the Nth one (0-indexed).
3. If `componentIndex >= count` of that type: **error** (never silently adds).
4. If none exist: add the component via `Undo.AddComponent` (undoable).
5. If `allowDuplicate=true`: skip the search, always add a new one.

### Phase 3: Modify

Only runs when `properties` is provided. Uses `SerializedObject`/`SerializedProperty` for type-safe property editing with Undo support. All properties are applied in a single batch (`ApplyModifiedProperties` once).

---

## Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `path` | string | - | GameObject path (preferred). E.g., `"/SampleScene/Player"` |
| `instanceId` | int | - | GameObject instanceId (fallback) |
| `componentInstanceId` | int | - | Direct component ID — skips Phase 2 entirely |
| `componentType` | string | - | Component type name. E.g., `"Rigidbody"`, `"BoxCollider"`, `"PlayerController"` |
| `componentIndex` | int | 0 | Which component when multiple of same type exist (0-indexed) |
| `allowDuplicate` | bool | false | When true, always adds new instead of reusing existing |
| `properties` | object | - | Map of `SerializedProperty` paths to values |

Either `componentType` or `componentInstanceId` is required. `path`/`instanceId` is required unless `componentInstanceId` is provided.

---

## Adding Components

### Basic Add

Add a component to a GameObject. If it already exists, returns the existing one (idempotent).

```json
{"type": "component", "id": "1", "body": {
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody"
}}
```

**Response:**

```json
{
  "success": true,
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "componentInstanceId": 54321,
  "added": true,
  "modified": false,
  "successCount": 0,
  "failCount": 0
}
```

### Idempotent Add

Sending the same add request again returns the existing component without adding a duplicate:

```json
{
  "success": true,
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "componentInstanceId": 54321,
  "added": false,
  "modified": false,
  "successCount": 0,
  "failCount": 0
}
```

Note `added: false` — the component already existed.

### Force Duplicate

To add a second component of the same type (e.g., multiple AudioSources), use `allowDuplicate`:

```json
{"type": "component", "id": "2", "body": {
  "path": "/SampleScene/Player",
  "componentType": "AudioSource",
  "allowDuplicate": true
}}
```

---

## Modifying Components

### By Path + Type

Modify a component by specifying the GameObject path and component type:

```json
{"type": "component", "id": "3", "body": {
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "properties": {
    "m_Mass": 5.0,
    "m_UseGravity": true,
    "m_IsKinematic": false
  }
}}
```

If the Rigidbody already exists, it modifies it. If not, it adds one first, then modifies.

### By Component Instance ID

When you have a component's `componentInstanceId` from a previous response:

```json
{"type": "component", "id": "4", "body": {
  "componentInstanceId": 54321,
  "properties": {
    "m_Mass": 10.0
  }
}}
```

This skips the GameObject resolution and find-or-add phases entirely.

### Multiple Components of Same Type

Use `componentIndex` to target the Nth component (0-indexed):

```json
{"type": "component", "id": "5", "body": {
  "path": "/SampleScene/Player",
  "componentType": "AudioSource",
  "componentIndex": 1,
  "properties": {
    "m_Volume": 0.5
  }
}}
```

If `componentIndex` exceeds the actual count, you get an error:

```json
{
  "success": false,
  "error": "componentIndex 3 out of range. GameObject has 2 AudioSource(s).",
  "path": "/SampleScene/Player",
  "componentType": "AudioSource"
}
```

---

## Add + Modify (Compound)

The main advantage of the unified endpoint — add a component and configure it in a single round-trip:

```json
{"type": "component", "id": "6", "body": {
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "properties": {
    "m_Mass": 5.0,
    "m_UseGravity": true,
    "m_IsKinematic": false,
    "m_Drag": 0.5,
    "m_AngularDrag": 0.1
  }
}}
```

**Response:**

```json
{
  "success": true,
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "componentInstanceId": 54321,
  "added": true,
  "modified": true,
  "successCount": 5,
  "failCount": 0,
  "propertyResults": [
    {"success": true, "propertyPath": "m_Mass", "propertyType": "Float", "previousValue": 1.0, "newValue": 5.0},
    {"success": true, "propertyPath": "m_UseGravity", "propertyType": "Boolean", "previousValue": true, "newValue": true},
    {"success": true, "propertyPath": "m_IsKinematic", "propertyType": "Boolean", "previousValue": false, "newValue": false},
    {"success": true, "propertyPath": "m_Drag", "propertyType": "Float", "previousValue": 0.0, "newValue": 0.5},
    {"success": true, "propertyPath": "m_AngularDrag", "propertyType": "Float", "previousValue": 0.05, "newValue": 0.1}
  ]
}
```

This replaces what previously required two messages (`add_component` + `modify_component`).

---

## Removing Components

`remove_component` is a **separate** message type (not part of the unified endpoint) because it is destructive:

```json
{"type": "remove_component", "id": "7", "body": {
  "componentInstanceId": 54321
}}
```

**Response type:** `component_removed`

```json
{
  "path": "/SampleScene/Player"
}
```

Cannot remove `Transform` components (Unity restriction).

---

## Response Format

All unified endpoint responses use type `"component_result"`:

```json
{
  "success": true,
  "error": null,
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "componentInstanceId": 54321,
  "added": true,
  "modified": true,
  "successCount": 3,
  "failCount": 0,
  "propertyResults": [...]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | bool | `true` when all operations succeeded (no property failures) |
| `error` | string? | Error message (omitted when null) |
| `path` | string | Canonical GameObject path |
| `componentType` | string | Resolved component type name |
| `componentInstanceId` | int | Instance ID for follow-up operations |
| `added` | bool | Whether a new component was added |
| `modified` | bool | Whether properties were set |
| `successCount` | int | Number of properties successfully set |
| `failCount` | int | Number of properties that failed |
| `propertyResults` | array? | Per-property detail (omitted when no properties were set) |

### Property Result Entry

| Field | Type | Description |
|-------|------|-------------|
| `success` | bool | Whether this property was set |
| `error` | string? | Error message if failed |
| `propertyPath` | string | The SerializedProperty path |
| `propertyType` | string | Unity property type (e.g., `"Float"`, `"Boolean"`, `"Color"`) |
| `previousValue` | any? | Value before modification |
| `newValue` | any? | Value after modification |

---

## Property Paths

Properties use Unity's `SerializedProperty` path format. These are the internal field names (usually prefixed with `m_`).

### Common Property Paths

**Rigidbody:**

| Path | Type | Description |
|------|------|-------------|
| `m_Mass` | float | Mass in kg |
| `m_Drag` | float | Linear drag |
| `m_AngularDrag` | float | Angular drag |
| `m_UseGravity` | bool | Gravity enabled |
| `m_IsKinematic` | bool | Kinematic mode |
| `m_Constraints` | enum | Freeze position/rotation (bitmask) |

**BoxCollider:**

| Path | Type | Description |
|------|------|-------------|
| `m_IsTrigger` | bool | Is trigger |
| `m_Center` | Vector3 | Center offset `[x, y, z]` |
| `m_Size` | Vector3 | Size `[x, y, z]` |

**SphereCollider:**

| Path | Type | Description |
|------|------|-------------|
| `m_IsTrigger` | bool | Is trigger |
| `m_Center` | Vector3 | Center offset `[x, y, z]` |
| `m_Radius` | float | Radius |

**AudioSource:**

| Path | Type | Description |
|------|------|-------------|
| `m_Volume` | float | Volume (0-1) |
| `m_Pitch` | float | Pitch |
| `m_Loop` | bool | Looping |
| `m_PlayOnAwake` | bool | Play on awake |
| `m_SpatialBlend` | float | 2D (0) to 3D (1) |

**Light:**

| Path | Type | Description |
|------|------|-------------|
| `m_Color` | Color | Light color `[r, g, b, a]` |
| `m_Intensity` | float | Intensity |
| `m_Range` | float | Range (point/spot) |
| `m_SpotAngle` | float | Spot angle |
| `m_Type` | enum | `0`=Spot, `1`=Directional, `2`=Point |

**Camera:**

| Path | Type | Description |
|------|------|-------------|
| `field of view` | float | FOV in degrees |
| `near clip plane` | float | Near clip |
| `far clip plane` | float | Far clip |
| `orthographic` | bool | Orthographic mode |
| `orthographic size` | float | Ortho size |
| `m_BackGroundColor` | Color | Background `[r, g, b, a]` |

**To discover property paths**, use `inspect_gameobject` with the component filtered — it returns all serialized field names and their values.

### Supported Property Types

| SerializedProperty Type | JSON Format | Example |
|---|---|---|
| Integer | int | `42` |
| Boolean | bool | `true` |
| Float | float | `3.14` |
| String | string | `"hello"` |
| Color | float[] | `[1.0, 0.0, 0.0, 1.0]` (RGBA) or `[1.0, 0.0, 0.0]` (RGB, alpha=1) |
| Vector2 | float[] | `[1.0, 2.0]` |
| Vector3 | float[] | `[1.0, 2.0, 3.0]` |
| Vector4 | float[] | `[1.0, 2.0, 3.0, 4.0]` |
| Quaternion | float[] | `[0, 45, 0]` (Euler) or `[x, y, z, w]` (Quaternion) |
| Rect | float[] | `[x, y, width, height]` |
| Bounds | float[] | `[centerX, centerY, centerZ, sizeX, sizeY, sizeZ]` |
| Enum | int or string | `2` (index) or `"Directional"` (name) |
| ObjectReference | int, string, or object | instanceId, assetPath, or `{"instanceId": 123}` |
| LayerMask | int | Layer mask value |
| Array/List | array | Recursive per-element |

**Not supported:** AnimationCurve, Gradient, ExposedReference, ManagedReference.

---

## Fuzzy Key Names

All field names are fuzzy-matched via `ComponentCanonicalMap`. The normalization strips underscores and lowercases before lookup. These all resolve to the same canonical name:

| Canonical | Also accepts |
|-----------|-------------|
| `path` | `game_object_path`, `goPath`, `objectPath`, `target_path` |
| `instanceId` | `instance_id`, `gameObjectInstanceId`, `goInstanceId`, `objectId`, `goId` |
| `componentType` | `component_type`, `component`, `compType`, `type`, `typeName`, `compName`, `componentName` |
| `componentInstanceId` | `component_instance_id`, `compInstanceId`, `componentId`, `compId` |
| `componentIndex` | `component_index`, `compIndex`, `index` |
| `properties` | `props`, `params`, `parameters`, `componentProperties` |
| `allowDuplicate` | `allow_duplicate`, `duplicate`, `allowDup`, `forceNew` |

Property keys inside `properties` are **not** normalized — they pass through as-is since they are `SerializedProperty` paths (e.g., `m_Mass`, `m_UseGravity`).

---

## Error Handling

### Total failure

When the operation cannot proceed at all (bad path, unknown type, etc.):

```json
{
  "success": false,
  "error": "Component type 'Rigidbodi' not found",
  "path": "/SampleScene/Player"
}
```

### Partial failure

When some properties succeed and others fail:

```json
{
  "success": false,
  "error": "2 properties failed to set",
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "componentInstanceId": 54321,
  "added": false,
  "modified": true,
  "successCount": 1,
  "failCount": 2,
  "propertyResults": [
    {"success": true, "propertyPath": "m_Mass", "propertyType": "Float", "previousValue": 1.0, "newValue": 5.0},
    {"success": false, "propertyPath": "m_FakeField", "error": "Property 'm_FakeField' not found"},
    {"success": false, "propertyPath": "m_BadValue", "error": "Type mismatch"}
  ]
}
```

Note: `added` and `modified` still reflect what happened. The component may have been added successfully even if all property modifications failed.

### Common errors

| Error | Cause |
|-------|-------|
| `"Either 'path' or 'instanceId' is required"` | No target specified |
| `"Either 'componentType' or 'componentInstanceId' is required"` | No component specified |
| `"Component type 'X' not found"` | Typo or type not loaded |
| `"componentIndex N out of range. GameObject has M X(s)."` | Index exceeds component count |
| `"Component with instanceId N not found"` | Stale componentInstanceId |
| `"Resolved to a scene-level path"` | Path points to a scene, not a GO |
| `"Property 'X' not found"` | Wrong SerializedProperty path |

---

## Legacy Endpoints

The three original endpoints still work for backward compatibility:

### `add_component`

```json
{"type": "add_component", "id": "1", "body": {
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody"
}}
```

Response type: `component_added`. Returns only `path`.

### `modify_component`

```json
{"type": "modify_component", "id": "2", "body": {
  "path": "/SampleScene/Player",
  "componentType": "Rigidbody",
  "properties": {"m_Mass": 5.0}
}}
```

Response type: `component_modified`. Returns `componentType`, `path`, `successCount`, `failCount`, `results[]`.

### `remove_component`

```json
{"type": "remove_component", "id": "3", "body": {
  "componentInstanceId": 54321
}}
```

Response type: `component_removed`. Returns `path`.

**Recommendation:** Use the unified `"component"` endpoint for add and modify operations. Use `"remove_component"` for removal (it is not part of the unified endpoint since it is destructive).

---

## Typical Workflows

### Set up a physics object

```
1. component → add Rigidbody + configure mass/drag in one call
2. component → add BoxCollider + configure size in one call
```

```json
{"type": "component", "id": "1", "body": {
  "path": "/SampleScene/Crate",
  "componentType": "Rigidbody",
  "properties": {"m_Mass": 10.0, "m_Drag": 0.5}
}}
```

```json
{"type": "component", "id": "2", "body": {
  "path": "/SampleScene/Crate",
  "componentType": "BoxCollider",
  "properties": {"m_Size": [2.0, 2.0, 2.0]}
}}
```

### Inspect then modify

```
1. inspect_gameobject → summary mode to see component types
2. inspect_gameobject → filter to specific component to see property paths
3. component → modify the properties you want to change
```

### Configure multiple AudioSources

```
1. component → add first AudioSource with allowDuplicate: false, configure it
2. component → add second AudioSource with allowDuplicate: true, configure it
3. component → modify first (componentIndex: 0), modify second (componentIndex: 1)
```

### Ensure component exists before modifying

The unified endpoint handles this naturally. Send `componentType` + `properties` — if the component exists, it's modified. If not, it's added first:

```json
{"type": "component", "id": "1", "body": {
  "path": "/SampleScene/Enemy",
  "componentType": "NavMeshAgent",
  "properties": {"m_Speed": 5.0, "m_StoppingDistance": 2.0}
}}
```

No need to check if NavMeshAgent exists first.

---

## Files

| File | Purpose |
|------|---------|
| `Editor/Components/ComponentManager.cs` | `ManageComponent()` — three-phase orchestration, `ComponentResult` data class |
| `Editor/Components/ComponentHandlers.cs` | `HandleComponent()` — unified handler with `ComponentCanonicalMap` fuzzy key normalization. Also legacy `HandleAddComponent`, `HandleRemoveComponent`, `HandleModifyComponent` |
| `Editor/Components/ComponentInspector.cs` | Read-only component dump via `EditorJsonUtility.ToJson()`. Used by `inspect_gameobject` |
| `Editor/Hierarchy/HierarchyManipulator.cs` | `AddComponent()`, `RemoveComponent()`, `ModifyComponent()`, `FindComponentType()` — the underlying primitives that `ComponentManager` delegates to |
| `Editor/Handlers/MessageRouter.cs` | Routes `"component"` to `ComponentHandlers.HandleComponent()` |
