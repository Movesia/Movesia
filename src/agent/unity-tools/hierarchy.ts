/**
 * THE ARCHITECT: unity_hierarchy
 * "I need to organize the Scene Graph."
 * Consumes: create_gameobject, duplicate_gameobject, destroy_gameobject,
 *           rename_gameobject, set_parent, move_to_scene
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { callUnityAsync } from './connection';

/**
 * Zod schema for unity_hierarchy tool input
 */
export const HierarchySchema = z.object({
    action: z.enum(['create', 'duplicate', 'destroy', 'rename', 'reparent', 'move_scene'])
        .describe('The hierarchy manipulation action.'),

    // Target
    path: z.string().optional()
        .describe('Path to the target GameObject (e.g. "/SampleScene/Player"). Required for duplicate/destroy/rename/reparent/move_scene.'),

    // Create params
    name: z.string().optional()
        .describe('New name (for create/rename).'),
    primitive_type: z.string().optional()
        .describe("Optional primitive (Cube, Sphere, Capsule, Cylinder, Plane, Quad) for 'create'."),

    // Positioning
    parent_path: z.string().optional()
        .describe('Parent GameObject path for create/reparent (e.g. "/SampleScene/Environment").'),
    position: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional()
        .describe('Position {x, y, z} for creation.'),
    rotation: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional()
        .describe('Euler angles {x, y, z} for creation.'),
    scale: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional()
        .describe('Scale {x, y, z} for creation.'),
    target_scene: z.string().optional()
        .describe("Scene name for 'move_scene'.")
});

/** Type inferred from the Zod schema */
export type HierarchyInput = z.infer<typeof HierarchySchema>;

/** Map tool actions to Unity WebSocket action names */
const API_MAP = {
    create: 'create_gameobject',
    duplicate: 'duplicate_gameobject',
    destroy: 'destroy_gameobject',
    rename: 'rename_gameobject',
    reparent: 'set_parent',
    move_scene: 'move_to_scene'
} as const;

/**
 * Manage GameObject structure in the scene hierarchy. This is the "Architect".
 */
async function unityHierarchyImpl(input: HierarchyInput, _config?: any): Promise<string> {
    const {
        action,
        path,
        name,
        primitive_type,
        parent_path,
        position,
        rotation,
        scale,
        target_scene
    } = input;

    // Convert {x,y,z} objects to [x,y,z] arrays for Unity's C# side (expects float[])
    const vec3ToArray = (v: { x?: number; y?: number; z?: number }) => [v.x ?? 0, v.y ?? 0, v.z ?? 0];

    const params: Record<string, unknown> = {};

    switch (action) {
        case 'create':
            if (name) params.name = name;
            if (primitive_type) params.primitive = primitive_type;
            if (parent_path) params.parentPath = parent_path;
            if (position) params.position = vec3ToArray(position);
            if (rotation) params.rotation = vec3ToArray(rotation);
            if (scale) params.scale = vec3ToArray(scale);
            break;

        case 'duplicate':
            if (!path) {
                return JSON.stringify({
                    error: "path is required for 'duplicate'",
                    hint: "Use unity_query(action='list_children') to browse the hierarchy and find paths",
                    example: 'unity_hierarchy({ action: "duplicate", path: "/SampleScene/Player" })'
                }, null, 2);
            }
            params.path = path;
            break;

        case 'destroy':
            if (!path) {
                return JSON.stringify({
                    error: "path is required for 'destroy'",
                    hint: "Use unity_query(action='list_children') to browse the hierarchy and find paths",
                    example: 'unity_hierarchy({ action: "destroy", path: "/SampleScene/OldObject" })'
                }, null, 2);
            }
            params.path = path;
            break;

        case 'rename':
            if (!path) {
                return JSON.stringify({
                    error: "path is required for 'rename'",
                    hint: "Use unity_query(action='list_children') to browse the hierarchy and find paths",
                    example: 'unity_hierarchy({ action: "rename", path: "/SampleScene/Player", name: "Hero" })'
                }, null, 2);
            }
            if (name === undefined) {
                return JSON.stringify({
                    error: "name is required for 'rename'",
                    hint: "Provide the new name for the GameObject",
                    example: 'unity_hierarchy({ action: "rename", path: "/SampleScene/Player", name: "Hero" })'
                }, null, 2);
            }
            params.path = path;
            params.name = name;
            break;

        case 'reparent':
            if (!path) {
                return JSON.stringify({
                    error: "path is required for 'reparent'",
                    hint: "Use unity_query(action='list_children') to find both object paths",
                    example: 'unity_hierarchy({ action: "reparent", path: "/SampleScene/Sword", parent_path: "/SampleScene/Player/Weapons" })'
                }, null, 2);
            }
            params.path = path;
            if (parent_path) params.parentPath = parent_path; // undefined means move to root
            break;

        case 'move_scene':
            if (!path) {
                return JSON.stringify({
                    error: "path is required for 'move_scene'",
                    hint: "Use unity_query(action='list_children') to browse the hierarchy and find paths",
                    example: 'unity_hierarchy({ action: "move_scene", path: "/SampleScene/SharedUI", target_scene: "UIScene" })'
                }, null, 2);
            }
            if (target_scene === undefined) {
                return JSON.stringify({
                    error: "target_scene is required for 'move_scene'",
                    hint: "Provide the name of the destination scene",
                    example: 'unity_hierarchy({ action: "move_scene", path: "/SampleScene/SharedUI", target_scene: "UIScene" })'
                }, null, 2);
            }
            params.path = path;
            params.sceneName = target_scene;
            break;

        default: {
            const _exhaustive: never = action;
            return JSON.stringify({ error: `Unknown action: ${_exhaustive}` }, null, 2);
        }
    }

    const result = await callUnityAsync(API_MAP[action], params);
    return JSON.stringify(result, null, 2);
}

/**
 * The Architect - unity_hierarchy tool
 * Manage GameObject structure in the scene hierarchy.
 */
export const unityHierarchy = new DynamicStructuredTool({
    name: 'unity_hierarchy',
    description: `Manage GameObject structure in the scene hierarchy. This is the "Architect".

Actions:
- 'create': Make new empty objects or primitives (Cube, Sphere, etc.). Use parent_path to nest under a parent.
- 'duplicate': Clone an existing GameObject. Requires path.
- 'destroy': Remove objects (Undo supported). Requires path.
- 'rename': Change a GameObject's name. Requires path + name. Response includes updated path.
- 'reparent': Move objects in the hierarchy tree. Requires path. parent_path = new parent (omit to move to root). Response includes updated path.
- 'move_scene': Move root objects between loaded scenes. Requires path + target_scene.

All objects are identified by path (e.g. "/SampleScene/Player"). Use unity_query(action='list_children') to browse paths.`,
    schema: HierarchySchema,
    func: unityHierarchyImpl
});
