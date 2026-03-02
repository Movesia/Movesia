#if UNITY_EDITOR
using UnityEngine;
using UnityEditor;
using UnityEngine.SceneManagement;
using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

/// <summary>
/// Central path-resolution utility for the hierarchy navigation system.
/// Resolves filesystem-like paths ("/SceneName/Root/Child") to Unity GameObjects,
/// and builds canonical paths from GameObjects.
///
/// Path format:
///   "/SceneName/RootObject/Child/GrandChild"
///   Leading "/" is optional.
///   First segment is always the scene name.
///   Duplicate sibling names use [index] syntax: "/Environment/Tree[2]" (0-indexed).
///
/// Used by all handler classes (hierarchy, component, manipulation) for path-first
/// identification of GameObjects, with instanceId as fallback.
/// </summary>
public static class GameObjectResolver
{
    // =========================================================================
    // DATA STRUCTURES
    // =========================================================================

    [Serializable]
    public class ResolveResult
    {
        public bool success;
        public string error;
        public GameObject gameObject;   // null in serialized responses, or for scene-level
        public int instanceId;
        public string resolvedPath;     // canonical path that was resolved
        public bool isSceneLevel;       // true if path resolved to a scene (no GO)
        public Scene scene;             // the resolved scene (always set on success)
    }

    // Regex to parse segment with optional index: "Name[2]" -> name="Name", index=2
    private static readonly Regex IndexedSegmentPattern =
        new Regex(@"^(.+)\[(\d+)\]$", RegexOptions.Compiled);

    // Reusable buffer to avoid GC allocation when getting root objects
    private static readonly List<GameObject> rootObjectsBuffer = new List<GameObject>(64);

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    /// <summary>
    /// Resolve a GameObject from EITHER path or instanceId.
    /// Path takes priority if both are provided.
    /// </summary>
    public static ResolveResult Resolve(string path, int instanceId = 0)
    {
        if (!string.IsNullOrEmpty(path))
            return ResolveByPath(path);

        if (instanceId != 0)
            return ResolveByInstanceId(instanceId);

        return new ResolveResult
        {
            success = false,
            error = "Either 'path' or 'instanceId' is required"
        };
    }

    /// <summary>
    /// Convenience helper that extracts path and instanceId from a JToken body
    /// and resolves the target GameObject. Used by all handlers as a one-liner.
    /// </summary>
    public static ResolveResult ResolveFromBody(JToken body)
    {
        string path = body?["path"]?.ToString();
        int instanceId = body?["instanceId"]?.ToObject<int>() ?? 0;
        return Resolve(path, instanceId);
    }

    /// <summary>
    /// Resolve by instanceId (existing pattern).
    /// </summary>
    public static ResolveResult ResolveByInstanceId(int instanceId)
    {
        var obj = EditorCompat.IdToObject(instanceId);
        if (obj == null)
        {
            return new ResolveResult
            {
                success = false,
                error = $"No object found with instanceId {instanceId}"
            };
        }

        GameObject go = obj as GameObject;
        if (go == null)
        {
            // Might be a component — try to get its gameObject
            var comp = obj as Component;
            if (comp != null)
                go = comp.gameObject;
        }

        if (go == null)
        {
            return new ResolveResult
            {
                success = false,
                error = $"Object with instanceId {instanceId} is not a GameObject or Component (type: {obj.GetType().Name})"
            };
        }

        return new ResolveResult
        {
            success = true,
            gameObject = go,
            instanceId = go.GetInstanceID(),
            resolvedPath = BuildPath(go),
            scene = go.scene
        };
    }

    /// <summary>
    /// Resolve by path string: "/SceneName/Root/Child[2]/GrandChild"
    /// </summary>
    public static ResolveResult ResolveByPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return new ResolveResult
            {
                success = false,
                error = "Path is empty"
            };
        }

        // Strip leading/trailing whitespace and leading "/"
        string trimmed = path.Trim().TrimStart('/');

        if (string.IsNullOrEmpty(trimmed))
        {
            // Path was just "/" — root level
            return new ResolveResult
            {
                success = true,
                isSceneLevel = true,
                resolvedPath = "/"
            };
        }

        // Split by "/"
        string[] segments = trimmed.Split('/');

        // First segment is the scene name
        string sceneName = segments[0];
        var (scene, sceneError) = ResolveScene(sceneName);
        if (!string.IsNullOrEmpty(sceneError))
        {
            return new ResolveResult
            {
                success = false,
                error = sceneError
            };
        }

        // If only scene segment, return scene-level result
        if (segments.Length == 1)
        {
            return new ResolveResult
            {
                success = true,
                isSceneLevel = true,
                resolvedPath = $"/{scene.name}",
                scene = scene
            };
        }

        // Get root objects of the scene
        rootObjectsBuffer.Clear();
        scene.GetRootGameObjects(rootObjectsBuffer);

        // Resolve second segment among root objects
        var (rootName, rootIndex) = ParseSegment(segments[1]);
        Transform current = FindChildByNameAndIndex(rootObjectsBuffer, rootName, rootIndex);

        if (current == null)
        {
            var availableRoots = new List<string>();
            foreach (var root in rootObjectsBuffer)
                availableRoots.Add(root.name);

            return new ResolveResult
            {
                success = false,
                error = $"Root GameObject '{segments[1]}' not found in scene '{scene.name}'. " +
                        $"Available roots: [{string.Join(", ", availableRoots)}]"
            };
        }

        // Walk remaining segments
        for (int i = 2; i < segments.Length; i++)
        {
            var (segName, segIndex) = ParseSegment(segments[i]);
            Transform child = FindChildByNameAndIndex(current, segName, segIndex);

            if (child == null)
            {
                var availableChildren = new List<string>();
                for (int c = 0; c < current.childCount; c++)
                    availableChildren.Add(current.GetChild(c).name);

                string partialPath = "/" + string.Join("/", segments, 0, i);
                return new ResolveResult
                {
                    success = false,
                    error = $"Child '{segments[i]}' not found under '{partialPath}'. " +
                            $"Available children: [{string.Join(", ", availableChildren)}]"
                };
            }

            current = child;
        }

        var go = current.gameObject;
        return new ResolveResult
        {
            success = true,
            gameObject = go,
            instanceId = go.GetInstanceID(),
            resolvedPath = BuildPath(go),
            scene = go.scene
        };
    }

    /// <summary>
    /// Build the canonical path for a GameObject (inverse of resolution).
    /// Format: "/SceneName/Root/Child/GrandChild"
    /// Appends [index] only when siblings share the same name.
    /// </summary>
    public static string BuildPath(GameObject go)
    {
        if (go == null) return null;

        var segments = new List<string>();
        Transform current = go.transform;

        while (current != null)
        {
            string segment = current.name;

            // Check for duplicate names among siblings
            Transform parent = current.parent;
            if (parent != null)
            {
                int sameNameCount = 0;
                int myIndex = 0;
                for (int i = 0; i < parent.childCount; i++)
                {
                    Transform sibling = parent.GetChild(i);
                    if (sibling.name == current.name)
                    {
                        if (sibling == current)
                            myIndex = sameNameCount;
                        sameNameCount++;
                    }
                }

                if (sameNameCount > 1)
                    segment = $"{current.name}[{myIndex}]";
            }
            else
            {
                // Root object — check among scene roots
                var scene = current.gameObject.scene;
                if (scene.IsValid() && scene.isLoaded)
                {
                    rootObjectsBuffer.Clear();
                    scene.GetRootGameObjects(rootObjectsBuffer);

                    int sameNameCount = 0;
                    int myIndex = 0;
                    foreach (var root in rootObjectsBuffer)
                    {
                        if (root.name == current.name)
                        {
                            if (root.transform == current)
                                myIndex = sameNameCount;
                            sameNameCount++;
                        }
                    }

                    if (sameNameCount > 1)
                        segment = $"{current.name}[{myIndex}]";
                }
            }

            segments.Add(segment);
            current = current.parent;
        }

        // Reverse to get root-first order
        segments.Reverse();

        // Prepend scene name
        string sceneName = go.scene.IsValid() ? go.scene.name : "Unknown";

        return $"/{sceneName}/{string.Join("/", segments)}";
    }

    /// <summary>
    /// Resolve a scene by name.
    /// Tries case-sensitive match first, then case-insensitive fallback.
    /// </summary>
    public static (Scene scene, string error) ResolveScene(string sceneName)
    {
        if (string.IsNullOrEmpty(sceneName))
            return (default, "Scene name is empty");

        int sceneCount = SceneManager.sceneCount;

        // Case-sensitive match first
        for (int i = 0; i < sceneCount; i++)
        {
            var scene = SceneManager.GetSceneAt(i);
            if (scene.name == sceneName)
            {
                if (!scene.isLoaded)
                    return (default, $"Scene '{sceneName}' exists but is not loaded");
                return (scene, null);
            }
        }

        // Case-insensitive fallback
        for (int i = 0; i < sceneCount; i++)
        {
            var scene = SceneManager.GetSceneAt(i);
            if (string.Equals(scene.name, sceneName, StringComparison.OrdinalIgnoreCase))
            {
                if (!scene.isLoaded)
                    return (default, $"Scene '{sceneName}' exists but is not loaded");
                return (scene, null);
            }
        }

        // Build list of available scenes for diagnostics
        var available = new List<string>();
        for (int i = 0; i < sceneCount; i++)
        {
            var scene = SceneManager.GetSceneAt(i);
            available.Add($"{scene.name}{(scene.isLoaded ? "" : " (unloaded)")}");
        }

        return (default, $"Scene '{sceneName}' not found. Available scenes: [{string.Join(", ", available)}]");
    }

    /// <summary>
    /// Count all descendants recursively (for descendantCount).
    /// O(n) in subtree size, sub-millisecond for typical scenes.
    /// </summary>
    public static int CountDescendants(Transform t)
    {
        int count = t.childCount;
        for (int i = 0; i < t.childCount; i++)
            count += CountDescendants(t.GetChild(i));
        return count;
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    /// <summary>
    /// Parse a segment like "Tree[2]" into (name="Tree", index=2).
    /// If no index suffix, returns (segment, 0).
    /// </summary>
    private static (string name, int index) ParseSegment(string segment)
    {
        var match = IndexedSegmentPattern.Match(segment);
        if (match.Success)
        {
            string name = match.Groups[1].Value;
            int index = int.Parse(match.Groups[2].Value);
            return (name, index);
        }
        return (segment, 0);
    }

    /// <summary>
    /// Find a child Transform by name and index among children of a parent Transform.
    /// Index is 0-based among same-named siblings.
    /// </summary>
    private static Transform FindChildByNameAndIndex(Transform parent, string name, int index)
    {
        int matchCount = 0;
        for (int i = 0; i < parent.childCount; i++)
        {
            Transform child = parent.GetChild(i);
            if (child.name == name)
            {
                if (matchCount == index)
                    return child;
                matchCount++;
            }
        }

        // Case-insensitive fallback if exact match failed
        if (matchCount == 0)
        {
            matchCount = 0;
            for (int i = 0; i < parent.childCount; i++)
            {
                Transform child = parent.GetChild(i);
                if (string.Equals(child.name, name, StringComparison.OrdinalIgnoreCase))
                {
                    if (matchCount == index)
                        return child;
                    matchCount++;
                }
            }
        }

        return null;
    }

    /// <summary>
    /// Find a root GameObject by name and index among a list of root objects.
    /// Index is 0-based among same-named roots.
    /// </summary>
    private static Transform FindChildByNameAndIndex(List<GameObject> roots, string name, int index)
    {
        int matchCount = 0;
        foreach (var root in roots)
        {
            if (root.name == name)
            {
                if (matchCount == index)
                    return root.transform;
                matchCount++;
            }
        }

        // Case-insensitive fallback
        if (matchCount == 0)
        {
            matchCount = 0;
            foreach (var root in roots)
            {
                if (string.Equals(root.name, name, StringComparison.OrdinalIgnoreCase))
                {
                    if (matchCount == index)
                        return root.transform;
                    matchCount++;
                }
            }
        }

        return null;
    }
}
#endif
