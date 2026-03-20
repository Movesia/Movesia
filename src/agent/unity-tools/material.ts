/**
 * THE ARTIST: unity_material
 * "I need to create materials from project textures, modify, or assign them."
 * Consumes: material (unified endpoint)
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { callUnityAsync } from './connection';

/**
 * Material properties schema — simplified to reduce token cost.
 * Validation (array length, shape) happens in the C# handler.
 */
const PropertiesSchema = z
  .record(
    z.string(),
    z.union([
      z.array(z.number()),              // colors [r,g,b,a], vectors [x,y,z,w]
      z.number(),                        // metallic, smoothness, renderQueue
      z.string(),                        // texture asset paths
      z.record(z.string(), z.unknown()), // { instanceId: 123 } or { assetPath: "..." }
    ])
  )
  .optional()
  .describe('Properties: textures as asset paths (mainTexture, normalMap, metallicMap, etc.), floats (metallic, smoothness), colors [r,g,b,a] — names auto-resolved.');

/**
 * Keywords schema - object form { keyword: bool } or array form [keywords to enable]
 */
const KeywordsSchema = z
  .union([z.record(z.string(), z.boolean()), z.array(z.string())])
  .optional()
  .describe('Shader keywords. Object: { "_EMISSION": true }, or array: ["_EMISSION"]');

/**
 * Assignment target schema
 */
const AssignToSchema = z
  .object({
    game_object_path: z.string().describe('Path to the target GameObject (e.g. "/SampleScene/Player"). Required.'),
    slot_index: z.number().int().default(0).describe('Material slot index (default: 0)'),
  })
  .optional()
  .describe('Assign material to a GameObject Renderer');

/**
 * Zod schema for unity_material tool input
 */
export const MaterialSchema = z.object({
  action: z.enum(['create', 'modify', 'assign', 'create_and_assign']).describe('The material operation.'),

  // Identify existing material (omit both for CREATE)
  instance_id: z.number().int().optional().describe('Instance ID of existing material to modify/assign.'),
  asset_path: z.string().optional().describe("Asset path of existing material (e.g., '/Materials/Foo.mat')."),

  // Create params (only used when creating new)
  shader_name: z
    .string()
    .optional()
    .describe("Full shader name (e.g., 'Universal Render Pipeline/Lit'). Auto-detects URP/Standard if omitted."),
  name: z.string().optional().describe("Material name (default: 'NewMaterial')."),
  save_path: z.string().optional().describe("Where to save new material (default: '/Materials/{name}.mat')."),

  // Modify params (applied whether creating or loading)
  properties: PropertiesSchema,
  keywords: KeywordsSchema,

  // Assign params
  assign_to: AssignToSchema,
});

/** Type inferred from the Zod schema */
export type MaterialInput = z.infer<typeof MaterialSchema>;

/**
 * Create materials from project textures/assets, modify, and assign them. This is the "Artist".
 */
async function unityMaterialImpl (input: MaterialInput, _config?: any): Promise<string> {
  const {
    action,
    instance_id: instanceId,
    asset_path: assetPath,
    shader_name: shaderName,
    name,
    save_path: savePath,
    properties,
    keywords,
    assign_to: assignTo,
  } = input;

  // Build the unified material message body
  const body: Record<string, unknown> = {};

  // Identification (for existing materials)
  if (instanceId !== undefined) {
    body.instanceId = instanceId;
  }
  if (assetPath !== undefined) {
    body.assetPath = assetPath;
  }

  // Creation params
  if (shaderName !== undefined) {
    body.shaderName = shaderName;
  }
  if (name !== undefined) {
    body.name = name;
  }
  if (savePath !== undefined) {
    body.savePath = savePath;
  }

  // Modification params
  if (properties !== undefined) {
    body.properties = properties;
  }
  if (keywords !== undefined) {
    body.keywords = keywords;
  }

  // Assignment params
  if (assignTo !== undefined) {
    body.assignTo = {
      path: assignTo.game_object_path,
      slotIndex: assignTo.slot_index ?? 0,
    };
  }

  // Validate based on action
  switch (action) {
    case 'create':
      // Creating requires no instanceId/assetPath (or they're ignored)
      // Name is recommended but optional
      if (!name && !savePath) {
        // Warn but don't fail - Unity will use defaults
      }
      break;

    case 'modify':
      // Modifying requires identifying the material
      if (instanceId === undefined && assetPath === undefined) {
        return JSON.stringify(
          {
            error: "For 'modify', provide instance_id OR asset_path to identify the material",
            hint: "Provide the material asset_path (e.g., '/Materials/Red.mat')",
            example:
              "unity_material({ action: 'modify', asset_path: '/Materials/BrickWall.mat', properties: { mainTexture: '/Textures/Brick_Albedo.png' } })",
          },
          null,
          2
        );
      }
      if (properties === undefined && keywords === undefined) {
        return JSON.stringify(
          {
            error: "For 'modify', provide properties or keywords to change",
            example:
              "unity_material({ action: 'modify', asset_path: '/Materials/BrickWall.mat', properties: { metallic: 0.9 } })",
          },
          null,
          2
        );
      }
      break;

    case 'assign':
      // Assigning requires identifying the material AND a target
      if (instanceId === undefined && assetPath === undefined) {
        return JSON.stringify(
          {
            error: "For 'assign', provide instance_id OR asset_path to identify the material",
            example:
              "unity_material({ action: 'assign', asset_path: '/Materials/BrickWall.mat', assign_to: { game_object_path: '/SampleScene/Wall' } })",
          },
          null,
          2
        );
      }
      if (assignTo === undefined) {
        return JSON.stringify(
          {
            error: "For 'assign', provide assign_to with the target GameObject",
            example:
              "unity_material({ action: 'assign', asset_path: '/Materials/BrickWall.mat', assign_to: { game_object_path: '/SampleScene/Wall', slot_index: 0 } })",
          },
          null,
          2
        );
      }
      break;

    case 'create_and_assign':
      // Create + assign in one shot
      if (assignTo === undefined) {
        return JSON.stringify(
          {
            error: "For 'create_and_assign', provide assign_to with the target GameObject",
            example:
              "unity_material({ action: 'create_and_assign', name: 'MetalFloor', properties: { mainTexture: '/Textures/Metal_Albedo.png' }, assign_to: { game_object_path: '/SampleScene/Floor' } })",
          },
          null,
          2
        );
      }
      break;

    default: {
      const _exhaustive: never = action;
      return JSON.stringify({ error: `Unknown action: ${_exhaustive}` }, null, 2);
    }
  }

  // Send to Unity via the unified 'material' endpoint
  const result = await callUnityAsync('material', body);

  return JSON.stringify(result, null, 2);
}

/**
 * The Artist - unity_material tool
 * Create, modify, and assign materials.
 */
export const unityMaterial = new DynamicStructuredTool({
  name: 'unity_material',
  description: `Create materials from project textures/assets, modify, and assign them.

Actions: 'create' | 'modify' | 'assign' | 'create_and_assign'
- create: Optional: shader_name, name, save_path, properties
- modify: Requires instance_id OR asset_path
- assign: Requires instance_id OR asset_path + assign_to
- create_and_assign: Create + assign in one call

IMPORTANT: Find textures FIRST with unity_query(action='search_assets', asset_type='texture', asset_name='...'), then pass the returned asset paths as properties.

PROPERTIES (friendly names auto-resolve):
mainTexture/baseMap: texture asset path | normalMap: texture asset path | metallicMap: texture asset path | emissionMap: texture asset path | occlusionMap: texture asset path | metallic/smoothness: 0-1 | color: [r,g,b,a] tint | renderQueue: int

KEYWORDS: { "_EMISSION": true } or ["_EMISSION"] (all enabled)

EXAMPLES:
unity_material({ action: 'create', name: 'BrickWall', properties: { mainTexture: '/Textures/Brick_Albedo.png', normalMap: '/Textures/Brick_Normal.png', metallic: 0.1, smoothness: 0.6 } })
unity_material({ action: 'assign', asset_path: '/Materials/BrickWall.mat', assign_to: { game_object_path: "/SampleScene/Wall" } })
unity_material({ action: 'create_and_assign', name: 'MetalFloor', properties: { mainTexture: '/Textures/Metal_Albedo.png', metallicMap: '/Textures/Metal_Metallic.png', normalMap: '/Textures/Metal_Normal.png', smoothness: 0.8 }, assign_to: { game_object_path: "/SampleScene/Floor", slot_index: 0 } })`,
  schema: MaterialSchema,
  func: unityMaterialImpl,
});
