/**
 * THE ENGINEER: unity_component
 * "I need to change behavior and data."
 * Consumes: unified "component" endpoint + "remove_component"
 *
 * The unified endpoint infers the action from which fields are provided:
 *   componentType only          → ADD (idempotent)
 *   componentType + properties  → find-or-add, then MODIFY (compound)
 *   componentInstanceId + props → direct MODIFY (skips GO resolution)
 *
 * Remove is a separate endpoint because it's destructive.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { callUnityAsync } from './connection';

/**
 * Zod schema for unity_component tool input
 */
export const ComponentSchema = z.object({
  action: z
    .enum(['configure', 'remove'])
    .describe(
      "'configure': Add a component, modify its properties, or both in one call (action is inferred from fields). " +
        "'remove': Destroy a component (separate destructive endpoint)."
    ),

  // Target identifiers (GameObject)
  path: z
    .string()
    .optional()
    .describe('Path to the target GameObject (e.g. "/SampleScene/Player"). Preferred over instance_id.'),

  instance_id: z.number().int().optional().describe('GameObject instance ID. Fallback when path is not known.'),

  // Component identifiers
  component_type: z
    .string()
    .optional()
    .describe(
      "Component type name (e.g., 'Rigidbody', 'BoxCollider', 'AudioSource'). " +
        "For 'configure': provide this to add/find a component. " +
        "For 'remove': provide with path to remove by type."
    ),

  component_instance_id: z
    .number()
    .int()
    .optional()
    .describe(
      'Direct component instance ID (from a previous response). ' +
        "Skips GameObject resolution entirely. For 'configure': targets this exact component for modification. " +
        "For 'remove': removes this exact component."
    ),

  component_index: z
    .number()
    .int()
    .default(0)
    .describe('Which component when multiple of the same type exist (0-indexed, default: 0).'),

  allow_duplicate: z
    .boolean()
    .default(false)
    .describe(
      'When true, always adds a new component instead of reusing an existing one. Useful for multiple AudioSources, Colliders, etc.'
    ),

  // Properties for modification
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Property name → value map. Vectors: [0,5,0]. Colors: [1,0,0,1]. ' +
        'Object references: { assetPath: "/Scene/Path" } or { assetPath: "/Prefabs/..." }.'
    ),
});

/** Type inferred from the Zod schema */
export type ComponentInput = z.infer<typeof ComponentSchema>;

/**
 * Edit components on GameObjects. This is the "Engineer".
 *
 * Uses the unified "component" endpoint for add/modify operations.
 * The endpoint infers the action from which fields are provided.
 * Remove uses a separate "remove_component" endpoint.
 */
async function unityComponentImpl (input: ComponentInput, _config?: any): Promise<string> {
  const {
    action,
    path,
    instance_id,
    component_type,
    component_instance_id,
    component_index = 0,
    allow_duplicate = false,
    properties,
  } = input;

  let result;

  switch (action) {
    case 'configure': {
      // Validate: need either component_type or component_instance_id
      if (component_type === undefined && component_instance_id === undefined) {
        return JSON.stringify(
          {
            error: "Either 'component_type' or 'component_instance_id' is required for 'configure'",
            hint: 'Provide component_type to add/find a component, or component_instance_id to target one directly',
            example:
              'unity_component({ action: "configure", path: "/SampleScene/Player", component_type: "Rigidbody", properties: { m_Mass: 5.0 } })',
          },
          null,
          2
        );
      }

      // Validate: need a target (unless using component_instance_id)
      if (component_instance_id === undefined && !path && instance_id === undefined) {
        return JSON.stringify(
          {
            error: "Either 'path', 'instance_id', or 'component_instance_id' is required",
            hint: 'Use path (preferred) to identify the GameObject, or component_instance_id for direct access',
            example:
              'unity_component({ action: "configure", path: "/SampleScene/Player", component_type: "Rigidbody" })',
          },
          null,
          2
        );
      }

      // Build params for the unified "component" endpoint
      const params: Record<string, unknown> = {};

      if (component_instance_id !== undefined) {
        // Direct component targeting — skips GO resolution & find-or-add
        params.componentInstanceId = component_instance_id;
      } else {
        // GO-based targeting
        if (path) params.path = path;
        if (instance_id !== undefined) params.instanceId = instance_id;
      }

      if (component_type !== undefined) params.componentType = component_type;
      if (component_index !== 0) params.componentIndex = component_index;
      if (allow_duplicate) params.allowDuplicate = true;
      if (properties !== undefined) params.properties = properties;

      result = await callUnityAsync('component', params);
      break;
    }

    case 'remove': {
      if (component_instance_id !== undefined) {
        result = await callUnityAsync('remove_component', {
          componentInstanceId: component_instance_id,
        });
      } else if (path && component_type !== undefined) {
        result = await callUnityAsync('remove_component', {
          path,
          componentType: component_type,
          componentIndex: component_index,
        });
      } else {
        return JSON.stringify(
          {
            error: "For 'remove', provide EITHER component_instance_id OR (path + component_type)",
            hint: 'Easiest: use path + component_type from the hierarchy',
            example: 'unity_component({ action: "remove", path: "/SampleScene/Player", component_type: "Rigidbody" })',
          },
          null,
          2
        );
      }
      break;
    }

    default: {
      const _exhaustive: never = action;
      result = { error: `Unknown action: ${_exhaustive}` };
    }
  }

  return JSON.stringify(result, null, 2);
}

/**
 * The Engineer - unity_component tool
 * Add, modify, and remove components on GameObjects.
 */
export const unityComponent = new DynamicStructuredTool({
  name: 'unity_component',
  description: `Add, modify, and remove components on GameObjects.

Actions:
- 'configure': Smart add/modify (inferred from fields):
  - path + component_type → ADD (idempotent, returns existing if present)
  - path + component_type + properties → find-or-add, then MODIFY in one call
  - component_instance_id + properties → direct MODIFY (skips GO resolution)
  - allow_duplicate: true → force new component instead of reusing existing
- 'remove': Destroy component by component_instance_id or path + component_type.

WORKFLOW: Just provide path + component_type + properties. Adds the component if missing, then sets all properties in one round-trip:
  unity_component({ action: 'configure', path: "/SampleScene/Player", component_type: 'Rigidbody',
                    properties: { m_Mass: 5.0, m_UseGravity: true } })

Use component_instance_id from previous responses for follow-up modifications without re-resolving.

PROPERTY FORMAT:
- Vectors: [0, 5, 0], Colors: [1, 0, 0, 1], Enums: int or string
- Object references: { assetPath: "/Scene/Object" } or { assetPath: "/Prefabs/Prefab.prefab" }
  Use this to assign references instead of Find() in scripts.`,
  schema: ComponentSchema,
  func: unityComponentImpl,
});
