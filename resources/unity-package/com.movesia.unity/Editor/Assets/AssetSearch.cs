#if UNITY_EDITOR
using UnityEditor;
using System;
using System.Collections.Generic;
using System.Linq;

/// <summary>
/// Unified asset search API using AssetDatabase.FindAssets.
/// Supports searching by type, name, label, and folder.
/// </summary>
public static class AssetSearch
{
    // --- Data Structures ---

    [Serializable]
    public class AssetSearchResult
    {
        public string error;          // Only set on failure
        public int totalFound;        // Total matches before limit (useful when truncated)
        public string[] paths;        // Asset paths — the only thing the agent needs
    }

    // --- Common Type Aliases ---
    // Maps friendly names to Unity type names
    private static readonly Dictionary<string, string> TypeAliases = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        // Scenes & Prefabs
        { "scene", "Scene" },
        { "prefab", "Prefab" },
        
        // Scripts
        { "script", "MonoScript" },
        { "cs", "MonoScript" },
        
        // Textures & Sprites
        { "texture", "Texture2D" },
        { "sprite", "Sprite" },
        { "image", "Texture2D" },
        { "png", "Texture2D" },
        { "jpg", "Texture2D" },
        
        // Materials & Shaders
        { "material", "Material" },
        { "mat", "Material" },
        { "shader", "Shader" },
        
        // Audio
        { "audio", "AudioClip" },
        { "sound", "AudioClip" },
        { "music", "AudioClip" },
        { "wav", "AudioClip" },
        { "mp3", "AudioClip" },
        
        // Animation
        { "animation", "AnimationClip" },
        { "anim", "AnimationClip" },
        { "animator", "AnimatorController" },
        { "controller", "AnimatorController" },
        
        // 3D
        { "model", "Model" },
        { "mesh", "Mesh" },
        { "fbx", "Model" },
        
        // UI
        { "font", "Font" },
        { "ttf", "Font" },
        
        // Data
        { "scriptableobject", "ScriptableObject" },
        { "so", "ScriptableObject" },
        { "asset", "ScriptableObject" },
        
        // Video
        { "video", "VideoClip" },
        
        // Physics
        { "physicmaterial", "PhysicMaterial" },
        { "physicsmaterial", "PhysicMaterial" },
        
        // All
        { "all", "Object" },
        { "any", "Object" },
        { "*", "Object" }
    };

    // --- Public API ---

    /// <summary>
    /// Search for assets in the project.
    /// </summary>
    /// <param name="type">Asset type (e.g., "Prefab", "Material", "Texture2D", or aliases like "script", "audio")</param>
    /// <param name="nameFilter">Optional name filter (partial match)</param>
    /// <param name="label">Optional Unity asset label filter</param>
    /// <param name="folder">Optional folder to search in (e.g., "Assets/Prefabs")</param>
    /// <param name="limit">Maximum results to return (default 100)</param>
    /// <param name="extension">Optional file extension filter (e.g., ".png", ".cs")</param>
    public static AssetSearchResult Search(
        string type = null,
        string nameFilter = null,
        string label = null,
        string folder = null,
        int limit = 100,
        string extension = null)
    {
        try
        {
            // Build the search query
            var queryParts = new List<string>();

            // Type filter
            if (!string.IsNullOrEmpty(type))
            {
                string resolvedType = ResolveTypeAlias(type);
                queryParts.Add($"t:{resolvedType}");
            }

            // Name filter (use quotes if contains spaces)
            if (!string.IsNullOrEmpty(nameFilter))
            {
                if (nameFilter.Contains(" "))
                    queryParts.Add($"\"{nameFilter}\"");
                else
                    queryParts.Add(nameFilter);
            }

            // Label filter
            if (!string.IsNullOrEmpty(label))
            {
                queryParts.Add($"l:{label}");
            }

            string query = string.Join(" ", queryParts);
            
            // If no query parts, search for everything
            if (string.IsNullOrEmpty(query))
            {
                query = "t:Object";
            }

            // Folder filter
            string[] searchFolders = null;
            if (!string.IsNullOrEmpty(folder))
            {
                // Normalize folder path
                if (!folder.StartsWith("Assets"))
                {
                    folder = "Assets/" + folder.TrimStart('/');
                }
                
                if (!AssetDatabase.IsValidFolder(folder))
                {
                    return new AssetSearchResult { error = $"Folder not found: {folder}" };
                }
                
                searchFolders = new[] { folder };
            }

            // Execute search
            string[] guids = searchFolders != null
                ? AssetDatabase.FindAssets(query, searchFolders)
                : AssetDatabase.FindAssets(query);

            // Process results — collect only asset paths (lean response)
            var paths = new List<string>();
            int totalFound = 0;

            foreach (var guid in guids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);

                // Extension filter (post-processing since FindAssets doesn't support it)
                if (!string.IsNullOrEmpty(extension))
                {
                    string ext = extension.StartsWith(".") ? extension : "." + extension;
                    if (!path.EndsWith(ext, StringComparison.OrdinalIgnoreCase))
                        continue;
                }

                totalFound++;

                if (paths.Count < limit)
                    paths.Add(path.StartsWith("Assets/") ? path.Substring(7) : path);
            }

            return new AssetSearchResult
            {
                totalFound = totalFound,
                paths = paths.ToArray()
            };
        }
        catch (Exception ex)
        {
            return new AssetSearchResult { error = ex.Message };
        }
    }

    /// <summary>
    /// Get a list of all available type aliases.
    /// </summary>
    public static Dictionary<string, string> GetTypeAliases()
    {
        return new Dictionary<string, string>(TypeAliases);
    }

    /// <summary>
    /// List all unique labels used in the project.
    /// </summary>
    public static string[] GetAllLabels()
    {
        var labels = new HashSet<string>();
        
        string[] allGuids = AssetDatabase.FindAssets("t:Object");
        
        // Sample a subset to avoid performance issues
        int sampleSize = Math.Min(allGuids.Length, 1000);
        for (int i = 0; i < sampleSize; i++)
        {
            string path = AssetDatabase.GUIDToAssetPath(allGuids[i]);
            var asset = AssetDatabase.LoadMainAssetAtPath(path);
            if (asset != null)
            {
                foreach (var label in AssetDatabase.GetLabels(asset))
                {
                    labels.Add(label);
                }
            }
        }
        
        return labels.OrderBy(l => l).ToArray();
    }

    // --- Helpers ---

    private static string ResolveTypeAlias(string type)
    {
        if (TypeAliases.TryGetValue(type, out string resolved))
        {
            return resolved;
        }
        
        // Return as-is (might be a valid Unity type name)
        return type;
    }
}
#endif