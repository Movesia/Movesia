#if UNITY_EDITOR
using UnityEngine;
using UnityEditor;
using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

/// <summary>
/// Unified component operations for the AI agent.
/// Single smart endpoint: provide what you have, get what you need.
///   - componentType only? Adds the component (idempotent).
///   - componentType + properties? Adds if absent, then modifies.
///   - componentInstanceId + properties? Modifies directly.
/// Delegates to HierarchyManipulator for the actual add/modify operations.
/// </summary>
public static class ComponentManager
{
    // =========================================================================
    // DATA STRUCTURES
    // =========================================================================

    [Serializable]
    public class ComponentResult
    {
        public bool success;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public string error;

        // GameObject info
        public string path;

        // Component info
        public string componentType;
        public int componentInstanceId;

        // What operations were performed
        public bool added;
        public bool modified;

        // Modification details (only populated when modified == true)
        public int successCount;
        public int failCount;

        [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
        public HierarchyManipulator.PropertyResult[] propertyResults;
    }

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /// <summary>
    /// Smart unified component operation. Determines what to do based on what's provided:
    ///
    /// Phase 1: Resolve target
    ///   - componentInstanceId provided → resolve component directly (componentType ignored with warning)
    ///   - Else → resolve GO from path/instanceId via GameObjectResolver
    ///
    /// Phase 2: Find-or-add component on the resolved GO
    ///   - componentIndex selects the Nth existing component of that type
    ///   - If componentIndex >= count of that type → error (no silent add)
    ///   - If none exist → add the component
    ///   - If allowDuplicate → skip search, always add new
    ///
    /// Phase 3: Modify properties (if provided)
    ///   - Delegates to HierarchyManipulator.ModifyComponent() with resolved component ID
    /// </summary>
    public static ComponentResult ManageComponent(
        // --- Identify the target ---
        string path = null,
        int instanceId = 0,
        int componentInstanceId = 0,
        // --- Component identification ---
        string componentType = null,
        int componentIndex = 0,
        bool allowDuplicate = false,
        // --- Modification params ---
        Dictionary<string, JToken> properties = null)
    {
        try
        {
            GameObject go = null;
            Component component = null;
            string goPath = null;
            bool didAdd = false;
            bool didModify = false;

            // =================================================================
            // PHASE 1: Resolve the target
            // =================================================================

            if (componentInstanceId != 0)
            {
                // Direct component reference — componentType is ignored for resolution
                if (!string.IsNullOrEmpty(componentType))
                {
                    Debug.Log($"⚙️ componentInstanceId provided, using direct resolution (componentType '{componentType}' ignored)");
                }

                component = EditorCompat.IdToObject(componentInstanceId) as Component;
                if (component == null)
                {
                    return new ComponentResult
                    {
                        success = false,
                        error = $"Component with instanceId {componentInstanceId} not found"
                    };
                }
                go = component.gameObject;
                goPath = GameObjectResolver.BuildPath(go);
            }
            else
            {
                // Resolve GameObject from path or instanceId
                var resolved = GameObjectResolver.Resolve(path, instanceId);
                if (!resolved.success)
                {
                    return new ComponentResult
                    {
                        success = false,
                        error = resolved.error
                    };
                }

                if (resolved.isSceneLevel || resolved.gameObject == null)
                {
                    return new ComponentResult
                    {
                        success = false,
                        error = "Resolved to a scene-level path; a specific GameObject is required",
                        path = resolved.resolvedPath
                    };
                }

                go = resolved.gameObject;
                goPath = resolved.resolvedPath;
            }

            // =================================================================
            // PHASE 2: Find-or-add component
            // =================================================================

            if (component == null && !string.IsNullOrEmpty(componentType))
            {
                // Resolve the Type
                var type = HierarchyManipulator.FindComponentType(componentType);
                if (type == null)
                {
                    return new ComponentResult
                    {
                        success = false,
                        error = $"Component type '{componentType}' not found",
                        path = goPath
                    };
                }

                if (!allowDuplicate)
                {
                    // Search for existing component of this type
                    var existing = go.GetComponents(type);

                    if (existing.Length > 0)
                    {
                        // Existing components found — use componentIndex to select
                        if (componentIndex >= existing.Length)
                        {
                            return new ComponentResult
                            {
                                success = false,
                                error = $"componentIndex {componentIndex} out of range. " +
                                        $"GameObject has {existing.Length} {type.Name}(s).",
                                path = goPath,
                                componentType = type.Name
                            };
                        }
                        component = existing[componentIndex];
                        // Not added — already existed
                    }
                }

                // Add if not found (or allowDuplicate)
                if (component == null)
                {
                    var addResult = HierarchyManipulator.AddComponent(go.GetInstanceID(), componentType);
                    if (!addResult.success)
                    {
                        return new ComponentResult
                        {
                            success = false,
                            error = addResult.error,
                            path = goPath
                        };
                    }

                    // Retrieve the newly added component
                    component = EditorCompat.IdToObject(addResult.instanceId) as Component;
                    if (component == null)
                    {
                        return new ComponentResult
                        {
                            success = false,
                            error = "Component was added but could not be retrieved by instanceId",
                            path = goPath
                        };
                    }
                    didAdd = true;
                }
            }
            else if (component == null)
            {
                // No componentType and no componentInstanceId — nothing to do
                return new ComponentResult
                {
                    success = false,
                    error = "Either 'componentType' or 'componentInstanceId' is required",
                    path = goPath
                };
            }

            // At this point, component is resolved
            string resolvedType = component.GetType().Name;
            int resolvedCompId = component.GetInstanceID();

            // =================================================================
            // PHASE 3: Modify properties (if provided)
            // =================================================================

            int successCount = 0;
            int failCount = 0;
            HierarchyManipulator.PropertyResult[] propertyResults = null;

            if (properties != null && properties.Count > 0)
            {
                var modResult = HierarchyManipulator.ModifyComponent(
                    componentInstanceId: resolvedCompId,
                    properties: properties
                );

                successCount = modResult.successCount;
                failCount = modResult.failCount;
                propertyResults = modResult.results;
                didModify = true;

                if (!modResult.success && successCount == 0)
                {
                    // Total failure in modify phase
                    return new ComponentResult
                    {
                        success = false,
                        error = modResult.error,
                        path = goPath,
                        componentType = resolvedType,
                        componentInstanceId = resolvedCompId,
                        added = didAdd,
                        modified = false,
                        successCount = 0,
                        failCount = failCount,
                        propertyResults = propertyResults
                    };
                }
            }

            // =================================================================
            // BUILD RESPONSE
            // =================================================================

            return new ComponentResult
            {
                success = failCount == 0,
                error = failCount > 0 ? $"{failCount} properties failed to set" : null,
                path = goPath,
                componentType = resolvedType,
                componentInstanceId = resolvedCompId,
                added = didAdd,
                modified = didModify,
                successCount = successCount,
                failCount = failCount,
                propertyResults = propertyResults
            };
        }
        catch (Exception ex)
        {
            return new ComponentResult { success = false, error = ex.Message };
        }
    }
}
#endif
