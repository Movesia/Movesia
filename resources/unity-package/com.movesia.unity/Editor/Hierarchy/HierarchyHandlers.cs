#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using UnityEditor;
using UnityEngine.SceneManagement;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

/// <summary>
/// Handles hierarchy read/write messages:
///
/// Navigation (filesystem-like):
///   list_children, inspect_gameobject, find_gameobjects
///
/// Legacy reads:
///   get_hierarchy, get_scenes, get_project_settings, get_components
///
/// GameObject manipulation:
///   create_gameobject, duplicate, destroy, rename, set_parent,
///   set_sibling_index, move_to_scene, set_active, set_transform
///
/// All operations accept "path" (preferred) or "instanceId" for identifying GameObjects.
/// Responses are lean: redundant/default-value fields are omitted to reduce token count.
/// </summary>
internal static class HierarchyHandlers
{
    // =========================================================================
    // FUZZY KEY NORMALIZATION — canonical map for navigation parameters
    // =========================================================================

    private static readonly Dictionary<string, string> NavigationCanonicalMap =
        new Dictionary<string, string>
    {
        // path
        { "path",                 "path" },
        { "gameobjectpath",      "path" },
        { "gopath",              "path" },
        { "objectpath",          "path" },
        { "hierarchypath",       "path" },

        // instanceId
        { "instanceid",          "instanceId" },
        { "gameobjectinstanceid","instanceId" },
        { "goinstanceid",        "instanceId" },
        { "objectid",            "instanceId" },
        { "id",                  "instanceId" },

        // depth (for list_children)
        { "depth",               "depth" },
        { "maxdepth",            "depth" },
        { "recursiondepth",      "depth" },
        { "levels",              "depth" },

        // components filter (for inspect_gameobject)
        { "components",          "components" },
        { "componentfilter",     "components" },
        { "filtercomponents",    "components" },
        { "componenttypes",      "components" },

        // detail level (for inspect_gameobject)
        { "detail",              "detail" },
        { "detaillevel",         "detail" },
        { "mode",                "detail" },
        { "verbosity",           "detail" },

        // name (for find_gameobjects)
        { "name",                "name" },
        { "namepattern",         "name" },
        { "search",              "name" },
        { "filter",              "name" },
        { "namefilter",          "name" },

        // tag (for find_gameobjects)
        { "tag",                 "tag" },
        { "tagfilter",           "tag" },

        // layer (for find_gameobjects)
        { "layer",               "layer" },
        { "layerfilter",         "layer" },
        { "layername",           "layer" },

        // component (for find_gameobjects — single type to search for)
        { "component",           "component" },
        { "componenttype",       "component" },
        { "hascomponent",        "component" },
        { "withcomponent",       "component" },

        // root (for find_gameobjects — subtree scope)
        { "root",                "root" },
        { "rootpath",            "root" },
        { "searchroot",          "root" },
        { "scope",               "root" },

        // maxResults (for find_gameobjects)
        { "maxresults",          "maxResults" },
        { "limit",               "maxResults" },
        { "maxcount",            "maxResults" },
        { "resultlimit",        "maxResults" },

        // parentPath (for create_gameobject, set_parent)
        { "parentpath",          "parentPath" },
        { "parentinstanceid",    "parentInstanceId" },

        // existing manipulation params
        { "primitive",           "primitive" },
        { "position",            "position" },
        { "rotation",            "rotation" },
        { "scale",               "scale" },
        { "local",               "local" },
        { "active",              "active" },
        { "siblingindex",        "siblingIndex" },
        { "scenename",           "sceneName" },
        { "worldpositionstays",  "worldPositionStays" },
    };

    // =========================================================================
    // DATA STRUCTURES — Lean navigation responses
    // =========================================================================

    /// <summary>
    /// Entry for list_children response. Lightweight — no components, no name (derivable from path).
    /// Fields at default values are omitted: activeSelf (when true), tag (when "Untagged"), isPrefabInstance (when false).
    /// </summary>
    [Serializable]
    public class ChildEntry
    {
        public string path;

        public bool activeSelf;
        public bool ShouldSerializeactiveSelf() => !activeSelf;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string tag;              // null when "Untagged" → omitted

        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public int childCount;             // omitted when 0 (leaf)

        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public int descendantCount;        // omitted when 0 (leaf)

        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public bool isPrefabInstance;    // omitted when false

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public ChildEntry[] children;   // null when depth=1 → omitted
    }

    [Serializable]
    public class ListChildrenResult
    {
        public string parentPath;
        public int count;
        public ChildEntry[] children;
    }

    /// <summary>
    /// Full inspection result for a single GameObject.
    /// Omits: name (in path), instanceId (agent uses path), parentPath (derivable), descendantCount.
    /// Conditional: activeSelf (when false), activeInHierarchy (when differs from activeSelf),
    ///   tag (non-Untagged), layer (non-Default), childCount (non-zero), prefab fields (when prefab),
    ///   localScale (non-identity).
    /// </summary>
    [Serializable]
    public class InspectResult
    {
        public string path;

        public bool activeSelf;
        public bool ShouldSerializeactiveSelf() => !activeSelf;

        public bool activeInHierarchy;
        public bool ShouldSerializeactiveInHierarchy() => activeInHierarchy != activeSelf;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string tag;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string layer;

        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public int childCount;

        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public bool isPrefabInstance;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string prefabAssetPath;

        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public bool hasPrefabOverrides;

        public float[] localPosition;
        public float[] localRotation;      // euler angles

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public float[] localScale;         // null when [1,1,1] → omitted

        public float[] worldPosition;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public ComponentInspector.RawComponentData[] components;
    }

    /// <summary>
    /// Entry for find_gameobjects results. Lightweight — no name, no instanceId.
    /// </summary>
    [Serializable]
    public class FindEntry
    {
        public string path;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string tag;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string layer;

        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public int childCount;          // omitted when 0 (leaf node)
    }

    [Serializable]
    public class FindResult
    {
        public int totalCount;      // total matches found
        public int returned;        // count actually returned

        [JsonProperty(DefaultValueHandling = DefaultValueHandling.Ignore)]
        public bool truncated;      // omitted when false

        public FindEntry[] results;
    }

    // =========================================================================
    // NAVIGATION HANDLERS — filesystem-like hierarchy exploration
    // =========================================================================

    /// <summary>
    /// list_children — the "ls" equivalent.
    /// Lists immediate children of a path. Supports depth for controlled recursion.
    /// Path "/" lists loaded scenes. Path "/SceneName" lists root GameObjects.
    /// </summary>
    internal static async Task HandleListChildren(string requestId, JToken body)
    {
        try
        {
            var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
            string path = b?["path"]?.ToString();
            int depth = b?["depth"]?.ToObject<int>() ?? 1;

            // Clamp depth to 1-3
            depth = Math.Max(1, Math.Min(3, depth));

            if (string.IsNullOrEmpty(path))
            {
                await MessageRouter.SendResponse(requestId, "error_response", new
                {
                    error = "Parameter 'path' is required. Use '/' to list scenes, '/SceneName' to list root objects."
                });
                return;
            }

            string trimmed = path.Trim().TrimStart('/');

            // Case 1: Root "/" — list loaded scenes
            if (string.IsNullOrEmpty(trimmed))
            {
                var sceneEntries = new List<ChildEntry>();
                int sceneCount = SceneManager.sceneCount;
                for (int i = 0; i < sceneCount; i++)
                {
                    var scene = SceneManager.GetSceneAt(i);
                    if (!scene.isLoaded) continue;

                    int descCount = 0;
                    var roots = new List<GameObject>();
                    scene.GetRootGameObjects(roots);
                    foreach (var root in roots)
                        descCount += 1 + GameObjectResolver.CountDescendants(root.transform);

                    sceneEntries.Add(new ChildEntry
                    {
                        path = $"/{scene.name}",
                        activeSelf = true,
                        tag = null,         // scenes have no tag
                        childCount = scene.rootCount,
                        descendantCount = descCount,
                        isPrefabInstance = false
                    });
                }

                await MessageRouter.SendResponse(requestId, "list_children_response", new ListChildrenResult
                {
                    parentPath = "/",
                    count = sceneEntries.Count,
                    children = sceneEntries.ToArray()
                });
                return;
            }

            // Parse path segments
            string[] segments = trimmed.Split('/');
            string sceneName = segments[0];
            var (scene2, sceneError) = GameObjectResolver.ResolveScene(sceneName);
            if (!string.IsNullOrEmpty(sceneError))
            {
                await MessageRouter.SendResponse(requestId, "error_response", new { error = sceneError });
                return;
            }

            // Case 2: Scene-only path "/SceneName" — list root GameObjects
            if (segments.Length == 1)
            {
                var roots = new List<GameObject>();
                scene2.GetRootGameObjects(roots);

                var children = new ChildEntry[roots.Count];
                for (int i = 0; i < roots.Count; i++)
                {
                    children[i] = BuildChildEntry(roots[i], depth, 1);
                }

                await MessageRouter.SendResponse(requestId, "list_children_response", new ListChildrenResult
                {
                    parentPath = $"/{scene2.name}",
                    count = children.Length,
                    children = children
                });
                return;
            }

            // Case 3: Full path — resolve to GameObject, list its children
            var resolved = GameObjectResolver.ResolveByPath(path);
            if (!resolved.success)
            {
                await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
                return;
            }

            var go = resolved.gameObject;
            var childEntries = new ChildEntry[go.transform.childCount];
            for (int i = 0; i < go.transform.childCount; i++)
            {
                childEntries[i] = BuildChildEntry(go.transform.GetChild(i).gameObject, depth, 1);
            }

            await MessageRouter.SendResponse(requestId, "list_children_response", new ListChildrenResult
            {
                parentPath = resolved.resolvedPath,
                count = childEntries.Length,
                children = childEntries
            });
        }
        catch (Exception ex)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = ex.Message });
        }
    }

    /// <summary>
    /// inspect_gameobject — the "cat" equivalent.
    /// Returns full details for one GameObject, with optional component filtering.
    /// </summary>
    internal static async Task HandleInspectGameObject(string requestId, JToken body)
    {
        try
        {
            var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
            var resolved = GameObjectResolver.ResolveFromBody(b);
            if (!resolved.success)
            {
                await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
                return;
            }

            var go = resolved.gameObject;
            string[] componentFilter = b?["components"]?.ToObject<string[]>();
            string detail = b?["detail"]?.ToString() ?? "full";

            // Get components based on detail level and filter
            ComponentInspector.RawComponentData[] componentData;
            if (string.Equals(detail, "summary", StringComparison.OrdinalIgnoreCase))
            {
                componentData = ComponentInspector.DumpComponentsSummary(go, componentFilter);
            }
            else if (componentFilter != null && componentFilter.Length > 0)
            {
                componentData = ComponentInspector.DumpComponentsFiltered(go, componentFilter);
            }
            else
            {
                componentData = ComponentInspector.DumpComponents(go);
            }

            // Build transform data
            var t = go.transform;
            var localPos = t.localPosition;
            var localRot = t.localEulerAngles;
            var localScl = t.localScale;
            var worldPos = t.position;

            // Prefab info
            bool isPrefab = PrefabUtility.IsPartOfPrefabInstance(go);
            string prefabPath = null;
            bool hasOverrides = false;
            if (isPrefab)
            {
                var source = PrefabUtility.GetCorrespondingObjectFromSource(go);
                if (source != null)
                    prefabPath = AssetDatabase.GetAssetPath(source);
                hasOverrides = PrefabUtility.HasPrefabInstanceAnyOverrides(go, false);
            }

            var result = new InspectResult
            {
                path = resolved.resolvedPath,
                activeSelf = go.activeSelf,
                activeInHierarchy = go.activeInHierarchy,
                tag = go.CompareTag("Untagged") ? null : go.tag,
                layer = go.layer == 0 ? null : LayerMask.LayerToName(go.layer),
                childCount = t.childCount,
                isPrefabInstance = isPrefab,
                prefabAssetPath = prefabPath,
                hasPrefabOverrides = hasOverrides,
                localPosition = new[] { (float)System.Math.Round(localPos.x, 2), (float)System.Math.Round(localPos.y, 2), (float)System.Math.Round(localPos.z, 2) },
                localRotation = new[] { (float)System.Math.Round(localRot.x, 2), (float)System.Math.Round(localRot.y, 2), (float)System.Math.Round(localRot.z, 2) },
                localScale = (localScl == Vector3.one) ? null : new[] { (float)System.Math.Round(localScl.x, 2), (float)System.Math.Round(localScl.y, 2), (float)System.Math.Round(localScl.z, 2) },
                worldPosition = new[] { (float)System.Math.Round(worldPos.x, 2), (float)System.Math.Round(worldPos.y, 2), (float)System.Math.Round(worldPos.z, 2) },
                components = componentData
            };

            await MessageRouter.SendResponse(requestId, "inspect_gameobject_response", result);
        }
        catch (Exception ex)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = ex.Message });
        }
    }

    /// <summary>
    /// find_gameobjects — the "find/grep" equivalent.
    /// Searches by name, tag, layer, or component type. Supports subtree scoping.
    /// </summary>
    internal static async Task HandleFindGameObjects(string requestId, JToken body)
    {
        try
        {
            var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
            string namePattern = b?["name"]?.ToString();
            string tag = b?["tag"]?.ToString();
            string layer = b?["layer"]?.ToString();
            string componentType = b?["component"]?.ToString();
            string root = b?["root"]?.ToString();
            int maxResults = b?["maxResults"]?.ToObject<int>() ?? 25;

            // Validate at least one filter is provided
            if (string.IsNullOrEmpty(namePattern) && string.IsNullOrEmpty(tag) &&
                string.IsNullOrEmpty(layer) && string.IsNullOrEmpty(componentType))
            {
                await MessageRouter.SendResponse(requestId, "error_response", new
                {
                    error = "At least one filter is required: name, tag, layer, or component"
                });
                return;
            }

            // Resolve component type if specified
            Type resolvedComponentType = null;
            if (!string.IsNullOrEmpty(componentType))
            {
                resolvedComponentType = HierarchyManipulator.FindComponentType(componentType);
                if (resolvedComponentType == null)
                {
                    await MessageRouter.SendResponse(requestId, "error_response", new
                    {
                        error = $"Component type '{componentType}' not found"
                    });
                    return;
                }
            }

            // Determine search scope
            var searchRoots = new List<GameObject>();
            string scopeDescription = "all loaded scenes";

            if (!string.IsNullOrEmpty(root))
            {
                var resolved = GameObjectResolver.ResolveByPath(root);
                if (!resolved.success)
                {
                    await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
                    return;
                }
                // Add all children of the root as search scope
                var rootGo = resolved.gameObject;
                for (int i = 0; i < rootGo.transform.childCount; i++)
                    searchRoots.Add(rootGo.transform.GetChild(i).gameObject);
                // Also check the root itself
                searchRoots.Insert(0, rootGo);
                scopeDescription = resolved.resolvedPath;
            }
            else
            {
                // Search all loaded scenes
                int sceneCount = SceneManager.sceneCount;
                for (int i = 0; i < sceneCount; i++)
                {
                    var scene = SceneManager.GetSceneAt(i);
                    if (!scene.isLoaded) continue;
                    var roots = new List<GameObject>();
                    scene.GetRootGameObjects(roots);
                    searchRoots.AddRange(roots);
                }
            }

            // Walk tree and collect matches
            var allMatches = new List<FindEntry>();
            int totalCount = 0;

            foreach (var searchRoot in searchRoots)
            {
                FindRecursive(searchRoot, namePattern, tag, layer, resolvedComponentType,
                    allMatches, ref totalCount, maxResults);
            }

            bool truncated = totalCount > allMatches.Count;

            await MessageRouter.SendResponse(requestId, "find_gameobjects_response", new FindResult
            {
                totalCount = totalCount,
                returned = allMatches.Count,
                truncated = truncated,
                results = allMatches.ToArray()
            });
        }
        catch (Exception ex)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = ex.Message });
        }
    }

    // =========================================================================
    // LEGACY READ OPERATIONS — kept for backward compatibility
    // =========================================================================

    internal static async Task HandleGetHierarchy(string requestId, JToken body)
    {
        int maxDepth = body?["maxDepth"]?.ToObject<int>() ?? 3;

        var snapshot = HierarchyTracker.CaptureSnapshot(maxDepth);

        await MessageRouter.SendResponse(requestId, "hierarchy_response", snapshot);
    }

    internal static async Task HandleGetScenes(string requestId, JToken body)
    {
        var scenes = HierarchyTracker.CaptureSceneList();

        await MessageRouter.SendResponse(requestId, "scenes_response", new
        {
            count = scenes.Length,
            scenes
        });
    }

    internal static async Task HandleGetProjectSettings(string requestId, JToken body)
    {
        string category = body?["category"]?.ToString();

        object result;

        if (!string.IsNullOrEmpty(category))
        {
            result = ProjectSettingsTracker.CaptureCategory(category);
            if (result == null)
            {
                await MessageRouter.SendResponse(requestId, "error_response", new
                {
                    error = $"Unknown category: {category}",
                    validCategories = new[] { "environment", "player", "build", "quality", "physics", "time", "audio", "rendering", "packages" }
                });
                return;
            }
        }
        else
        {
            result = ProjectSettingsTracker.CaptureSnapshot();
        }

        await MessageRouter.SendResponse(requestId, "project_settings_response", result);
    }

    internal static async Task HandleGetComponents(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        var go = resolved.gameObject;
        var components = ComponentInspector.DumpComponents(go);

        await MessageRouter.SendResponse(requestId, "components_response", new
        {
            gameObjectName = go.name,
            path = resolved.resolvedPath,
            count = components.Length,
            components
        });
    }

    // =========================================================================
    // GAMEOBJECT MANIPULATION — path support + error routing
    // =========================================================================

    internal static async Task HandleCreateGameObject(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        string name = b?["name"]?.ToString();
        string primitive = b?["primitive"]?.ToString();
        float[] position = b?["position"]?.ToObject<float[]>();
        float[] rotation = b?["rotation"]?.ToObject<float[]>();
        float[] scale = b?["scale"]?.ToObject<float[]>();
        string[] components = b?["components"]?.ToObject<string[]>();

        // Resolve parent from path or instanceId
        int? parentId = null;
        string parentPath = b?["parentPath"]?.ToString();
        if (!string.IsNullOrEmpty(parentPath))
        {
            var parentResolved = GameObjectResolver.ResolveByPath(parentPath);
            if (!parentResolved.success)
            {
                await MessageRouter.SendResponse(requestId, "error_response", new { error = parentResolved.error });
                return;
            }
            parentId = parentResolved.instanceId;
        }
        else
        {
            parentId = b?["parentInstanceId"]?.ToObject<int?>();
        }

        var result = HierarchyManipulator.Create(name, primitive, parentId, position, rotation, scale, components);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        // Enrich result with path
        if (result.instanceId != 0)
        {
            var createdGo = EditorCompat.IdToObject(result.instanceId) as GameObject;
            if (createdGo != null)
                result.path = GameObjectResolver.BuildPath(createdGo);
        }

        await MessageRouter.SendResponse(requestId, "gameobject_created", result);
    }

    internal static async Task HandleDuplicateGameObject(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        var result = HierarchyManipulator.Duplicate(resolved.instanceId);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        // Enrich with path
        if (result.instanceId != 0)
        {
            var dupGo = EditorCompat.IdToObject(result.instanceId) as GameObject;
            if (dupGo != null)
                result.path = GameObjectResolver.BuildPath(dupGo);
        }

        await MessageRouter.SendResponse(requestId, "gameobject_duplicated", result);
    }

    internal static async Task HandleDestroyGameObject(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        // Capture path before destruction
        string pathBeforeDestroy = resolved.resolvedPath;

        var result = HierarchyManipulator.Destroy(resolved.instanceId);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        result.path = pathBeforeDestroy;

        await MessageRouter.SendResponse(requestId, "gameobject_destroyed", result);
    }

    internal static async Task HandleRenameGameObject(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        string newName = b?["name"]?.ToString() ?? "Unnamed";
        var result = HierarchyManipulator.Rename(resolved.instanceId, newName);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        // Path changes after rename
        if (result.instanceId != 0)
        {
            var go = EditorCompat.IdToObject(result.instanceId) as GameObject;
            if (go != null)
                result.path = GameObjectResolver.BuildPath(go);
        }

        await MessageRouter.SendResponse(requestId, "gameobject_renamed", result);
    }

    internal static async Task HandleSetParent(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);

        // Resolve the child
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        // Resolve the parent (from parentPath or parentInstanceId)
        int? parentId = null;
        string parentPath = b?["parentPath"]?.ToString();
        if (!string.IsNullOrEmpty(parentPath))
        {
            var parentResolved = GameObjectResolver.ResolveByPath(parentPath);
            if (!parentResolved.success)
            {
                await MessageRouter.SendResponse(requestId, "error_response", new { error = parentResolved.error });
                return;
            }
            parentId = parentResolved.instanceId;
        }
        else
        {
            parentId = b?["parentInstanceId"]?.ToObject<int?>();
        }

        bool worldPositionStays = b?["worldPositionStays"]?.ToObject<bool>() ?? true;

        var result = HierarchyManipulator.SetParent(resolved.instanceId, parentId, worldPositionStays);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        // Path changes after reparent
        if (result.instanceId != 0)
        {
            var go = EditorCompat.IdToObject(result.instanceId) as GameObject;
            if (go != null)
                result.path = GameObjectResolver.BuildPath(go);
        }

        await MessageRouter.SendResponse(requestId, "parent_set", result);
    }

    internal static async Task HandleSetSiblingIndex(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        int siblingIndex = b?["siblingIndex"]?.ToObject<int>() ?? 0;
        var result = HierarchyManipulator.SetSiblingIndex(resolved.instanceId, siblingIndex);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        result.path = resolved.resolvedPath;

        await MessageRouter.SendResponse(requestId, "sibling_index_set", result);
    }

    internal static async Task HandleMoveToScene(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        string sceneName = b?["sceneName"]?.ToString();
        if (string.IsNullOrEmpty(sceneName))
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = "sceneName is required" });
            return;
        }

        var result = HierarchyManipulator.MoveToScene(resolved.instanceId, sceneName);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        // Path changes after scene move
        if (result.instanceId != 0)
        {
            var go = EditorCompat.IdToObject(result.instanceId) as GameObject;
            if (go != null)
                result.path = GameObjectResolver.BuildPath(go);
        }

        await MessageRouter.SendResponse(requestId, "moved_to_scene", result);
    }

    internal static async Task HandleSetActive(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        bool active = b?["active"]?.ToObject<bool>() ?? true;
        var result = HierarchyManipulator.SetActive(resolved.instanceId, active);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        result.path = resolved.resolvedPath;

        await MessageRouter.SendResponse(requestId, "active_set", result);
    }

    internal static async Task HandleSetTransform(string requestId, JToken body)
    {
        var b = MessageRouter.NormalizeKeys(body, NavigationCanonicalMap);
        var resolved = GameObjectResolver.ResolveFromBody(b);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        float[] position = b?["position"]?.ToObject<float[]>();
        float[] rotation = b?["rotation"]?.ToObject<float[]>();
        float[] scale = b?["scale"]?.ToObject<float[]>();
        bool local = b?["local"]?.ToObject<bool>() ?? true;

        var result = HierarchyManipulator.SetTransform(resolved.instanceId, position, rotation, scale, local);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        result.path = resolved.resolvedPath;

        await MessageRouter.SendResponse(requestId, "transform_set", result);
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    /// <summary>
    /// Build a ChildEntry for a GameObject, optionally recursing if depth > 1.
    /// </summary>
    private static ChildEntry BuildChildEntry(GameObject go, int maxDepth, int currentDepth)
    {
        var entry = new ChildEntry
        {
            path = GameObjectResolver.BuildPath(go),
            activeSelf = go.activeSelf,
            tag = go.CompareTag("Untagged") ? null : go.tag,
            childCount = go.transform.childCount,
            descendantCount = GameObjectResolver.CountDescendants(go.transform),
            isPrefabInstance = PrefabUtility.IsPartOfPrefabInstance(go)
        };

        // Recurse if within depth limit
        if (currentDepth < maxDepth && go.transform.childCount > 0)
        {
            entry.children = new ChildEntry[go.transform.childCount];
            for (int i = 0; i < go.transform.childCount; i++)
            {
                entry.children[i] = BuildChildEntry(
                    go.transform.GetChild(i).gameObject,
                    maxDepth,
                    currentDepth + 1
                );
            }
        }

        return entry;
    }

    /// <summary>
    /// Recursive search for find_gameobjects. Applies all filters (AND'd).
    /// Stops adding to results after maxResults but keeps counting totalCount.
    /// </summary>
    private static void FindRecursive(
        GameObject go, string namePattern, string tag, string layer,
        Type componentType, List<FindEntry> results, ref int totalCount, int maxResults)
    {
        bool matches = true;

        // Apply filters (all AND'd)
        if (matches && !string.IsNullOrEmpty(namePattern))
        {
            matches = go.name.IndexOf(namePattern, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        if (matches && !string.IsNullOrEmpty(tag))
        {
            matches = go.CompareTag(tag);
        }

        if (matches && !string.IsNullOrEmpty(layer))
        {
            matches = string.Equals(LayerMask.LayerToName(go.layer), layer, StringComparison.OrdinalIgnoreCase);
        }

        if (matches && componentType != null)
        {
            matches = go.GetComponent(componentType) != null;
        }

        if (matches)
        {
            totalCount++;
            if (results.Count < maxResults)
            {
                results.Add(new FindEntry
                {
                    path = GameObjectResolver.BuildPath(go),
                    tag = go.CompareTag("Untagged") ? null : go.tag,
                    layer = go.layer == 0 ? null : LayerMask.LayerToName(go.layer),
                    childCount = go.transform.childCount
                });
            }
        }

        // Recurse into children
        for (int i = 0; i < go.transform.childCount; i++)
        {
            FindRecursive(go.transform.GetChild(i).gameObject, namePattern, tag, layer,
                componentType, results, ref totalCount, maxResults);
        }
    }
}
#endif
