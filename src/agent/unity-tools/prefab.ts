/**
 * THE FACTORY: unity_prefab
 * "I need to use or create templates."
 * Consumes: prefab (unified phased endpoint)
 *
 * Supports compound operations in a single call:
 * - Phase 1: instantiate/create/apply (resolves prefab asset)
 * - Phase 2: modify (if component_type + properties provided)
 *
 * Response has boolean flags: instantiated, created, modified, applied
 * Multiple can be true (e.g., created + modified in one call)
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { callUnityAsync } from './connection';

/**
 * Zod schema for unity_prefab tool input (unified API)
 */
export const PrefabSchema = z.object({
    // --- INSTANTIATE BY NAME ---
    prefab_name: z.string().optional()
        .describe("Prefab name to search and spawn (e.g., 'Enemy'). Exact match preferred, then partial."),

    // --- INSTANTIATE BY PATH / MODIFY ASSET ---
    asset_path: z.string().optional()
        .describe("Path to .prefab or model file (.fbx, .obj, .gltf). Works with any importable asset."),

    // --- CREATE ASSET / APPLY OVERRIDES ---
    path: z.string().optional()
        .describe('Scene GameObject path (e.g. "/SampleScene/Player"). For create: the GO to save as prefab. For apply: the prefab instance.'),

    // --- CREATE ASSET ---
    save_path: z.string().optional()
        .describe("Where to save new prefab (e.g., '/Prefabs/NewPrefab.prefab'). Used with path."),

    // --- INSTANTIATE OPTIONS ---
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional()
        .describe('Spawn position {x, y, z}.'),
    rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional()
        .describe('Spawn rotation {x, y, z} in euler angles.'),
    scale: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional()
        .describe('Spawn scale {x, y, z}.'),
    parent_path: z.string().optional()
        .describe('Parent GameObject path to spawn under (e.g. "/SampleScene/Environment").'),

    // --- MODIFY ASSET ---
    component_type: z.string().optional()
        .describe("Component to edit on the prefab asset (e.g., 'Rigidbody', 'BoxCollider')."),
    target_path: z.string().optional()
        .describe("Path to nested child in prefab (e.g., 'Body/HitBox'). For modifying non-root components."),
    properties: z.record(z.string(), z.unknown()).optional()
        .describe("Properties to modify on the component. Use array format for vectors: { m_LocalScale: [2, 2, 2] }")
});

/** Type inferred from the Zod schema */
export type PrefabInput = z.infer<typeof PrefabSchema>;

/**
 * Manage Prefab Assets and Instances. This is the "Factory".
 * Uses unified API - C# side infers operation from provided fields.
 */
async function unityPrefabImpl(input: PrefabInput, _config?: any): Promise<string> {
    const {
        prefab_name: prefabName,
        asset_path: assetPath,
        path,
        save_path: savePath,
        position,
        rotation,
        scale,
        parent_path: parentPath,
        component_type: componentType,
        target_path: targetPath,
        properties
    } = input;

    // Convert {x,y,z} objects to [x,y,z] arrays for Unity's C# side (expects float[])
    const vec3ToArray = (v: { x?: number; y?: number; z?: number }) => [v.x ?? 0, v.y ?? 0, v.z ?? 0];

    // Build the unified prefab message body
    const body: Record<string, unknown> = {};

    // Instantiate by name
    if (prefabName !== undefined) {
        body.prefabName = prefabName;
    }

    // Asset path (for instantiate by path OR modify asset)
    if (assetPath !== undefined) {
        body.assetPath = assetPath;
    }

    // Scene GameObject path (for create asset OR apply overrides)
    if (path !== undefined) {
        body.path = path;
    }

    // Save path (for create asset)
    if (savePath !== undefined) {
        body.savePath = savePath;
    }

    // Instantiate options
    if (position !== undefined) {
        body.position = vec3ToArray(position);
    }
    if (rotation !== undefined) {
        body.rotation = vec3ToArray(rotation);
    }
    if (scale !== undefined) {
        body.scale = vec3ToArray(scale);
    }
    if (parentPath !== undefined) {
        body.parentPath = parentPath;
    }

    // Modify asset options
    if (componentType !== undefined) {
        body.componentType = componentType;
    }
    if (targetPath !== undefined) {
        body.targetPath = targetPath;
    }
    if (properties !== undefined) {
        body.properties = properties;
    }

    // Validate: at least one identifying field must be present
    if (prefabName === undefined && assetPath === undefined && path === undefined) {
        return JSON.stringify({
            error: "Provide at least one of: prefab_name, asset_path, or path",
            hint: "See examples below for each operation",
            examples: {
                instantiate: 'unity_prefab({ prefab_name: "Enemy", position: [0, 1, 0] })',
                modify: 'unity_prefab({ asset_path: "/Prefabs/Enemy.prefab", component_type: "Rigidbody", properties: { m_Mass: 5.0 } })',
                create_and_modify: 'unity_prefab({ path: "/SampleScene/Player", save_path: "/Prefabs/Player.prefab", component_type: "Rigidbody", properties: { m_Mass: 5.0 } })',
                apply: 'unity_prefab({ path: "/SampleScene/Player" })'
            }
        }, null, 2);
    }

    // Send to Unity via the unified 'prefab' endpoint
    const result = await callUnityAsync('prefab', body);

    return JSON.stringify(result, null, 2);
}

/**
 * The Factory - unity_prefab tool
 * Manage Prefab Assets and Instances with compound operations.
 */
export const unityPrefab = new DynamicStructuredTool({
    name: 'unity_prefab',
    description: `Manage Prefab Assets and Instances. This is the "Factory".

Supports COMPOUND operations — combine any Phase 1 + Phase 2 in one call:

PHASE 1 (pick one):
- prefab_name → instantiate by name
- asset_path (alone) → instantiate by path (prefabs, .fbx, .obj, .gltf — any model)
- asset_path + save_path → create prefab from model file (auto: instantiate → save prefab → cleanup → spawn prefab)
- path + save_path → create prefab from scene GameObject
- path (alone) → apply overrides

PHASE 2 (optional, chains after Phase 1):
- component_type + properties → modify the prefab asset

EXAMPLES:
Instantiate: unity_prefab({ prefab_name: 'Enemy', position: [0, 1, 0] })
Instantiate FBX: unity_prefab({ asset_path: '/Models/Door.fbx', position: [0, 0, 0] })
FBX → Prefab: unity_prefab({ asset_path: '/Models/Door.fbx', save_path: '/Prefabs/Door.prefab', position: [0, 0, 0] })
Modify only: unity_prefab({ asset_path: '/Prefabs/Enemy.prefab', component_type: 'Rigidbody', properties: { m_Mass: 5.0 } })
Create from scene: unity_prefab({ path: "/SampleScene/Player", save_path: '/Prefabs/Player.prefab' })

Response flags: instantiated, created, modified, applied (multiple can be true)
Optional spawn fields: position, rotation, scale, parent_path
Use target_path for nested children (e.g., 'Body/HitBox')`,
    schema: PrefabSchema,
    func: unityPrefabImpl
});
