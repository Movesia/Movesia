#if UNITY_EDITOR
using UnityEngine;
using UnityEditor;
using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

/// <summary>
/// Dumps raw component data using EditorJsonUtility.
/// Supports full dump, filtered dump (by component type), and summary mode (no properties).
/// Auto-excludes Transform (data is at top-level of inspect response) and strips internal Unity fields.
/// </summary>
public static class ComponentInspector
{
    [Serializable]
    public class RawComponentData
    {
        [JsonIgnore]
        public int instanceId;              // kept for internal use, never serialized

        public string type;

        public bool enabled;
        public bool ShouldSerializeenabled() => !enabled;  // omit when true (default)

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public object properties;           // null in summary mode → omitted
    }

    // Internal Unity serialization fields that bloat every component and carry no useful info for the agent
    private static readonly HashSet<string> InternalFields = new HashSet<string>
    {
        "m_ObjectHideFlags",
        "m_CorrespondingSourceObject",
        "m_PrefabInstance",
        "m_PrefabAsset",
        "m_GameObject",
        "m_EditorHideFlags",
        "m_EditorClassIdentifier"
    };

    /// <summary>
    /// Strip internal Unity metadata fields from a component's serialized properties.
    /// </summary>
    private static JObject StripInternalFields(JObject props)
    {
        if (props == null) return null;
        foreach (var field in InternalFields)
            props.Remove(field);
        EnrichObjectReferences(props);
        return props;
    }

    /// <summary>
    /// Recursively walks a JObject/JArray tree and enriches any Unity object references.
    /// Handles two formats produced by EditorJsonUtility.ToJson():
    ///   1. {fileID, guid, type} — asset references with GUID (from meta files)
    ///   2. {instanceID} — scene/runtime object references (resolved via EditorUtility)
    /// Replaces opaque IDs with agent-friendly info (asset paths, GO paths, names).
    /// </summary>
    private static void EnrichObjectReferences(JToken token)
    {
        if (token == null) return;

        if (token.Type == JTokenType.Object)
        {
            var obj = (JObject)token;

            // Format 1: Unity asset reference ({fileID, guid, type})
            if (obj.TryGetValue("guid", out var guidToken) && obj.ContainsKey("fileID"))
            {
                string guid = guidToken.ToString();
                if (!string.IsNullOrEmpty(guid) && guid != "00000000000000000000000000000000")
                {
                    string assetPath = AssetDatabase.GUIDToAssetPath(guid);
                    if (!string.IsNullOrEmpty(assetPath))
                        obj["assetPath"] = assetPath;
                }
            }
            // Format 2: EditorJsonUtility serialized reference ({instanceID: N})
            // This is the format produced for ObjectReference fields on components
            else if (obj.Count == 1 && obj.TryGetValue("instanceID", out var idToken))
            {
                int instanceId = idToken.Value<int>();
                if (instanceId == 0)
                {
                    // Null/unassigned reference — replace entire object with null
                    // so the agent sees "fieldName": null instead of "fieldName": {"instanceID": 0}
                    obj.Replace(JValue.CreateNull());
                    return; // replaced the node, nothing to recurse into
                }

                var resolved = EditorCompat.IdToObject(instanceId);
                if (resolved != null)
                {
                    // Remove the raw instanceID — agent shouldn't see it
                    obj.Remove("instanceID");
                    obj["name"] = resolved.name;

                    string assetPath = AssetDatabase.GetAssetPath(resolved);
                    if (!string.IsNullOrEmpty(assetPath))
                    {
                        // It's a project asset (InputActionAsset, Material, Texture, etc.)
                        obj["assetPath"] = assetPath;
                    }
                    else if (resolved is GameObject go)
                    {
                        // It's a scene GameObject — give the agent a path
                        obj["path"] = GameObjectResolver.BuildPath(go);
                    }
                    else if (resolved is Component comp)
                    {
                        // It's a component on a scene GO — give GO path + type
                        obj["path"] = GameObjectResolver.BuildPath(comp.gameObject);
                        obj["componentType"] = comp.GetType().Name;
                    }
                }
                else
                {
                    // ID is non-zero but can't be resolved (destroyed object, etc.)
                    obj.Replace(JValue.CreateNull());
                    return;
                }
            }

            // Recurse into child properties
            foreach (var property in obj.Properties())
                EnrichObjectReferences(property.Value);
        }
        else if (token.Type == JTokenType.Array)
        {
            foreach (var item in (JArray)token)
                EnrichObjectReferences(item);
        }
    }

    /// <summary>
    /// Dump all components for a GameObject as raw JSON strings.
    /// Excludes Transform (top-level inspect fields cover it) and strips internal Unity fields.
    /// </summary>
    public static RawComponentData[] DumpComponents(GameObject go)
    {
        var components = go.GetComponents<Component>();
        var results = new List<RawComponentData>();

        for (int i = 0; i < components.Length; i++)
        {
            var comp = components[i];
            if (comp == null)
            {
                results.Add(new RawComponentData
                {
                    instanceId = 0,
                    type = "Missing",
                    enabled = false,
                    properties = null
                });
                continue;
            }

            // Skip Transform — data is already at top-level (localPosition, localRotation, etc.)
            if (comp is Transform) continue;

            var jsonString = EditorJsonUtility.ToJson(comp, false);
            results.Add(new RawComponentData
            {
                instanceId = comp.GetInstanceID(),
                type = comp.GetType().Name,
                enabled = GetEnabled(comp),
                properties = StripInternalFields(JObject.Parse(jsonString))
            });
        }

        return results.ToArray();
    }

    /// <summary>
    /// Dump components filtered by type name. Returns only matching components with full properties.
    /// If filter is null/empty, returns all (same as DumpComponents).
    /// Only skips Transform when not explicitly requested in the filter.
    /// </summary>
    public static RawComponentData[] DumpComponentsFiltered(GameObject go, string[] typeFilter)
    {
        if (typeFilter == null || typeFilter.Length == 0)
            return DumpComponents(go);

        var filterSet = new HashSet<string>(typeFilter, StringComparer.OrdinalIgnoreCase);
        var components = go.GetComponents<Component>();
        var results = new List<RawComponentData>();

        foreach (var comp in components)
        {
            if (comp == null) continue;
            string typeName = comp.GetType().Name;
            if (!filterSet.Contains(typeName)) continue;

            var jsonString = EditorJsonUtility.ToJson(comp, false);
            results.Add(new RawComponentData
            {
                instanceId = comp.GetInstanceID(),
                type = typeName,
                enabled = GetEnabled(comp),
                properties = StripInternalFields(JObject.Parse(jsonString))
            });
        }

        return results.ToArray();
    }

    /// <summary>
    /// Summary-only dump: component type names and enabled status, no properties.
    /// Optionally filtered by type name. Lightweight for progressive disclosure.
    /// Excludes Transform (always present, data at top-level).
    /// </summary>
    public static RawComponentData[] DumpComponentsSummary(GameObject go, string[] typeFilter = null)
    {
        var components = go.GetComponents<Component>();
        var results = new List<RawComponentData>();

        HashSet<string> filterSet = null;
        if (typeFilter != null && typeFilter.Length > 0)
            filterSet = new HashSet<string>(typeFilter, StringComparer.OrdinalIgnoreCase);

        foreach (var comp in components)
        {
            if (comp == null) continue;

            // Skip Transform unless explicitly requested
            if (comp is Transform && (filterSet == null || !filterSet.Contains("Transform"))) continue;

            string typeName = comp.GetType().Name;
            if (filterSet != null && !filterSet.Contains(typeName)) continue;

            results.Add(new RawComponentData
            {
                instanceId = comp.GetInstanceID(),
                type = typeName,
                enabled = GetEnabled(comp),
                properties = null  // summary mode: no properties
            });
        }

        return results.ToArray();
    }

    /// <summary>
    /// Dump a single component by instance ID.
    /// </summary>
    public static RawComponentData DumpComponent(int instanceId)
    {
        var obj = EditorCompat.IdToObject(instanceId);
        if (obj is Component comp)
        {
            var jsonString = EditorJsonUtility.ToJson(comp, false);
            return new RawComponentData
            {
                instanceId = comp.GetInstanceID(),
                type = comp.GetType().Name,
                enabled = GetEnabled(comp),
                properties = StripInternalFields(JObject.Parse(jsonString))
            };
        }
        return null;
    }

    private static bool GetEnabled(Component c)
    {
        if (c == null) return false;
        if (c is Behaviour b) return b.enabled;
        if (c is Renderer r) return r.enabled;
        if (c is Collider col) return col.enabled;
        return true;
    }
}
#endif
