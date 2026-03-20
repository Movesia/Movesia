/**
 * THE OBSERVER: unity_query
 * "I need to see what exists."
 * Consumes: list_children, inspect_gameobject, find_gameobjects, search_assets, get_project_settings, get_logs
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { callUnityAsync } from './connection';

/**
 * Zod schema for unity_query tool input
 */
export const QuerySchema = z.object({
    action: z.enum(['list_children', 'inspect_gameobject', 'find_gameobjects', 'search_assets', 'get_logs', 'get_settings'])
        .describe('The query type.'),

    // --- list_children & inspect_gameobject params ---
    path: z.string().optional()
        .describe('Hierarchy path (e.g. "/SampleScene/Player"). Required for list_children and inspect_gameobject. Use "/" to list all scenes.'),
    depth: z.number().int().min(1).max(3).optional()
        .describe("Recursion depth for 'list_children' (1-3, default 1). 1 = direct children only."),

    // --- inspect_gameobject params ---
    components: z.array(z.string()).optional()
        .describe("Filter: only return these component types for 'inspect_gameobject'. Omit for all."),
    detail: z.enum(['full', 'summary']).optional()
        .describe("'full' (default) = properties included. 'summary' = type names + enabled only. For 'inspect_gameobject'."),

    // --- find_gameobjects params ---
    name: z.string().optional()
        .describe("Substring match on GameObject name (case-insensitive). For 'find_gameobjects'."),
    tag: z.string().optional()
        .describe("Exact tag match. For 'find_gameobjects'."),
    layer: z.string().optional()
        .describe("Layer name match. For 'find_gameobjects'."),
    component: z.string().optional()
        .describe("Has a component of this type. For 'find_gameobjects'."),
    root: z.string().optional()
        .describe("Scope search to this subtree path. For 'find_gameobjects'."),
    max_results: z.number().int().optional()
        .describe("Max results for 'find_gameobjects' (default 25)."),

    // --- search_assets params ---
    asset_type: z.enum(['material', 'texture', 'prefab', 'script', 'audio', 'scene', 'model', 'mesh', 'shader', 'animation', 'all']).optional()
        .describe("Asset type to search for. For 'search_assets'."),
    asset_name: z.string().optional()
        .describe("Partial name match (case-insensitive). For 'search_assets'."),
    label: z.string().optional()
        .describe("Unity asset label filter. For 'search_assets'."),
    folder: z.string().optional()
        .describe("Scope to folder (e.g. '/Textures'). For 'search_assets'."),
    extension: z.string().optional()
        .describe("File extension filter (e.g. '.png'). For 'search_assets'."),
    limit: z.number().int().optional()
        .describe("Max results (default 100). For 'search_assets'."),

    // --- get_logs params ---
    log_filter: z.string().optional()
        .describe("'Error', 'Warning', or 'Exception'."),
    log_count: z.number().int().optional()
        .describe("Max number of recent logs to return. Defaults to 100."),

    // --- get_settings params ---
    settings_category: z.string().optional()
        .describe("Settings category (e.g., 'physics', 'player', 'quality').")
});

/** Type inferred from the Zod schema */
export type QueryInput = z.infer<typeof QuerySchema>;

/**
 * Read the current state of the Unity Editor. This is the agent's "eyes".
 */
async function unityQueryImpl(input: QueryInput, _config?: any): Promise<string> {
    const {
        action,
        path,
        depth,
        components: componentFilter,
        detail,
        name: nameFilter,
        tag: tagFilter,
        layer: layerFilter,
        component: componentTypeFilter,
        root,
        max_results: maxResults,
        asset_type: assetType,
        asset_name: assetName,
        label: assetLabel,
        folder: assetFolder,
        extension: assetExtension,
        limit: assetLimit,
        log_filter: logFilter,
        log_count: logCount,
        settings_category: settingsCategory
    } = input;

    let result;

    switch (action) {
        case 'list_children': {
            if (!path) {
                return JSON.stringify({
                    error: "path is required for 'list_children'",
                    hint: 'Use "/" to list all scenes, "/SceneName" for root objects',
                    example: 'unity_query({ action: "list_children", path: "/" })'
                }, null, 2);
            }
            const params: Record<string, unknown> = { path };
            if (depth !== undefined) params.depth = depth;
            result = await callUnityAsync('list_children', params);
            break;
        }

        case 'inspect_gameobject': {
            if (!path) {
                return JSON.stringify({
                    error: "path is required for 'inspect_gameobject'",
                    hint: 'First use list_children to browse the hierarchy and find paths',
                    example: 'unity_query({ action: "inspect_gameobject", path: "/SampleScene/Player" })'
                }, null, 2);
            }
            const params: Record<string, unknown> = { path };
            if (componentFilter) params.components = componentFilter;
            if (detail) params.detail = detail;
            result = await callUnityAsync('inspect_gameobject', params);
            break;
        }

        case 'find_gameobjects': {
            if (!nameFilter && !tagFilter && !layerFilter && !componentTypeFilter) {
                return JSON.stringify({
                    error: "At least one filter is required for 'find_gameobjects'",
                    hint: 'Provide name, tag, layer, or component to search by. All filters are AND-ed.',
                    example: 'unity_query({ action: "find_gameobjects", name: "Enemy" })'
                }, null, 2);
            }
            const params: Record<string, unknown> = {};
            if (nameFilter) params.name = nameFilter;
            if (tagFilter) params.tag = tagFilter;
            if (layerFilter) params.layer = layerFilter;
            if (componentTypeFilter) params.component = componentTypeFilter;
            if (root) params.root = root;
            if (maxResults !== undefined) params.maxResults = maxResults;
            result = await callUnityAsync('find_gameobjects', params);
            break;
        }

        case 'search_assets': {
            const params: Record<string, unknown> = {};
            if (assetType) params.type = assetType;
            if (assetName) params.name = assetName;
            if (assetLabel) params.label = assetLabel;
            if (assetFolder) params.folder = assetFolder;
            if (assetExtension) params.extension = assetExtension;
            if (assetLimit !== undefined) params.limit = assetLimit;
            result = await callUnityAsync('search_assets', params);
            break;
        }

        case 'get_logs':
            result = await callUnityAsync('get_logs', { filter: logFilter, limit: logCount });
            break;

        case 'get_settings':
            result = await callUnityAsync('get_project_settings', { category: settingsCategory });
            break;

        default: {
            const _exhaustive: never = action;
            result = { error: `Unknown action: ${_exhaustive}` };
        }
    }

    return JSON.stringify(result, null, 2);
}

/**
 * The Observer - unity_query tool
 * Read the current state of the Unity Editor.
 */
export const unityQuery = new DynamicStructuredTool({
    name: 'unity_query',
    description: `Read the current state of the Unity Editor. This is the agent's "eyes".

Actions:
- 'list_children': Browse the hierarchy incrementally (like "ls"). Use path="/" to list scenes, "/SceneName" for root objects. depth 1-3 controls recursion.
- 'inspect_gameobject': Full detail on one object (like "cat"). Requires path. Use components=["Rigidbody"] to filter. detail="summary" for type names only.
- 'find_gameobjects': Search by name/tag/layer/component (like "find/grep"). At least one filter required. Use root to scope to a subtree.
- 'search_assets': Search project asset files by type/name/folder (case-insensitive). Use to find textures, materials, prefabs, scripts, etc. Returns asset paths.
- 'get_logs': Check console for errors, warnings, or logs.
- 'get_settings': Retrieve specific project settings.

NAVIGATION WORKFLOW:
1. list_children({ path: "/" }) → see loaded scenes
2. list_children({ path: "/SampleScene" }) → see root objects with descendantCount
3. descendantCount < 20 → safe to drill with list_children at depth 2-3
4. descendantCount > 50 → use find_gameobjects with root scoping instead
5. inspect_gameobject to read component properties on a specific object

ASSET SEARCH: search_assets({ asset_type: 'texture', asset_name: 'brick' }) → all textures matching "brick"`,
    schema: QuerySchema,
    func: unityQueryImpl
});
