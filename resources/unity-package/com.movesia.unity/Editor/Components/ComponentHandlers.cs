#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;
using UnityEditor;
using Newtonsoft.Json.Linq;

/// <summary>
/// Handles component operations: unified "component" endpoint, plus legacy
/// add_component, remove_component, modify_component.
/// All operations accept "path" (preferred) or "instanceId" for identifying GameObjects.
/// </summary>
internal static class ComponentHandlers
{
    // --- Unified component endpoint: canonical field names ---
    private static readonly Dictionary<string, string> ComponentCanonicalMap =
        new Dictionary<string, string>
    {
        // path (GameObject path — preferred identification)
        { "path",                   "path" },
        { "gameobjectpath",         "path" },
        { "gopath",                 "path" },
        { "objectpath",             "path" },
        { "targetpath",             "path" },

        // instanceId (GameObject instanceId — fallback identification)
        { "instanceid",             "instanceId" },
        { "gameobjectinstanceid",   "instanceId" },
        { "goinstanceid",           "instanceId" },
        { "objectid",               "instanceId" },
        { "goid",                   "instanceId" },

        // componentType
        { "componenttype",          "componentType" },
        { "component",              "componentType" },
        { "comptype",               "componentType" },
        { "type",                   "componentType" },
        { "typename",               "componentType" },
        { "compname",               "componentType" },
        { "componentname",          "componentType" },

        // componentInstanceId (direct component reference for modify-only)
        { "componentinstanceid",    "componentInstanceId" },
        { "compinstanceid",         "componentInstanceId" },
        { "componentid",            "componentInstanceId" },
        { "compid",                 "componentInstanceId" },

        // componentIndex (when multiple components of same type)
        { "componentindex",         "componentIndex" },
        { "compindex",              "componentIndex" },
        { "index",                  "componentIndex" },

        // properties
        { "properties",             "properties" },
        { "props",                  "properties" },
        { "params",                 "properties" },
        { "parameters",             "properties" },
        { "componentproperties",    "properties" },

        // allowDuplicate
        { "allowduplicate",         "allowDuplicate" },
        { "duplicate",              "allowDuplicate" },
        { "allowdup",               "allowDuplicate" },
        { "forcenew",               "allowDuplicate" },
    };

    /// <summary>
    /// Unified smart component endpoint. Determines action from what's provided:
    ///   - componentType only → ADD (idempotent)
    ///   - componentType + properties → ADD-IF-ABSENT, then MODIFY
    ///   - componentInstanceId + properties → MODIFY directly
    /// </summary>
    internal static async Task HandleComponent(string requestId, JToken body)
    {
        // Normalize all field names to protect against LLM hallucination
        var b = MessageRouter.NormalizeKeys(body, ComponentCanonicalMap);

        string path = b?["path"]?.ToString();
        int instanceId = b?["instanceId"]?.ToObject<int>() ?? 0;
        int componentInstanceId = b?["componentInstanceId"]?.ToObject<int>() ?? 0;
        string componentType = b?["componentType"]?.ToString();
        int componentIndex = b?["componentIndex"]?.ToObject<int>() ?? 0;
        bool allowDuplicate = b?["allowDuplicate"]?.ToObject<bool>() ?? false;

        // Parse properties (keys pass through as-is — they are SerializedProperty paths)
        Dictionary<string, JToken> properties = null;
        JObject propsObj = b?["properties"] as JObject;
        if (propsObj != null && propsObj.Count > 0)
        {
            properties = new Dictionary<string, JToken>();
            foreach (var prop in propsObj)
            {
                properties[prop.Key] = prop.Value;
            }
        }

        var result = ComponentManager.ManageComponent(
            path: path,
            instanceId: instanceId,
            componentInstanceId: componentInstanceId,
            componentType: componentType,
            componentIndex: componentIndex,
            allowDuplicate: allowDuplicate,
            properties: properties
        );

        await MessageRouter.SendResponse(requestId, "component_result", result);
    }

    // --- Legacy Handlers (backward compatibility) ---

    internal static async Task HandleAddComponent(string requestId, JToken body)
    {
        // Resolve the target GameObject from path or instanceId
        var resolved = GameObjectResolver.ResolveFromBody(body);
        if (!resolved.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
            return;
        }

        string componentType = body?["componentType"]?.ToString();

        if (string.IsNullOrEmpty(componentType))
        {
            Debug.LogWarning($"[HandleAddComponent] componentType is null or empty! Body keys: {string.Join(", ", (body as JObject)?.Properties().Select(p => p.Name) ?? Array.Empty<string>())}");
            await MessageRouter.SendResponse(requestId, "error_response", new { error = "componentType is required" });
            return;
        }

        var result = HierarchyManipulator.AddComponent(resolved.instanceId, componentType);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        // Enrich with path
        result.path = resolved.resolvedPath;

        await MessageRouter.SendResponse(requestId, "component_added", result);
    }

    internal static async Task HandleRemoveComponent(string requestId, JToken body)
    {
        int componentInstanceId = body?["componentInstanceId"]?.ToObject<int>() ?? 0;

        // Try to get the parent GO path before removal
        string goPath = null;
        var compObj = EditorCompat.IdToObject(componentInstanceId) as Component;
        if (compObj != null)
            goPath = GameObjectResolver.BuildPath(compObj.gameObject);

        var result = HierarchyManipulator.RemoveComponent(componentInstanceId);

        if (!result.success)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        result.path = goPath;

        await MessageRouter.SendResponse(requestId, "component_removed", result);
    }

    /// <summary>
    /// Handle modifying component properties in a batch.
    /// Supports both direct component ID and resolve from GameObject (path or instanceId) + type.
    /// </summary>
    internal static async Task HandleModifyComponent(string requestId, JToken body)
    {
        int componentInstanceId = body?["componentInstanceId"]?.ToObject<int>() ?? 0;
        string componentType = body?["componentType"]?.ToString();
        int componentIndex = body?["componentIndex"]?.ToObject<int>() ?? 0;
        JObject propertiesObj = body?["properties"] as JObject;

        if (propertiesObj == null || propertiesObj.Count == 0)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = "properties object is required" });
            return;
        }

        // Resolve the GameObject from path or instanceId (for GO-based component resolution)
        int gameObjectInstanceId = 0;
        string goPath = null;

        // If componentInstanceId is not provided, resolve GO from path/instanceId
        if (componentInstanceId == 0)
        {
            string path = body?["path"]?.ToString();
            int goId = body?["gameObjectInstanceId"]?.ToObject<int>() ?? 0;

            if (!string.IsNullOrEmpty(path))
            {
                var resolved = GameObjectResolver.ResolveByPath(path);
                if (!resolved.success)
                {
                    await MessageRouter.SendResponse(requestId, "error_response", new { error = resolved.error });
                    return;
                }
                gameObjectInstanceId = resolved.instanceId;
                goPath = resolved.resolvedPath;
            }
            else
            {
                gameObjectInstanceId = goId;
                if (goId != 0)
                {
                    var go = EditorCompat.IdToObject(goId) as GameObject;
                    if (go != null)
                        goPath = GameObjectResolver.BuildPath(go);
                }
            }
        }
        else
        {
            // Get path from the component's GO
            var comp = EditorCompat.IdToObject(componentInstanceId) as Component;
            if (comp != null)
                goPath = GameObjectResolver.BuildPath(comp.gameObject);
        }

        // Convert JObject to Dictionary
        var properties = new Dictionary<string, JToken>();
        foreach (var prop in propertiesObj)
        {
            properties[prop.Key] = prop.Value;
        }

        var result = HierarchyManipulator.ModifyComponent(
            componentInstanceId,
            properties,
            gameObjectInstanceId,
            componentType,
            componentIndex
        );

        // Total failure → error_response
        if (!result.success && result.successCount == 0)
        {
            await MessageRouter.SendResponse(requestId, "error_response", new { error = result.error });
            return;
        }

        // Enrich with path
        result.path = goPath;

        await MessageRouter.SendResponse(requestId, "component_modified", result);
    }
}
#endif
