#if UNITY_EDITOR
using UnityEngine;
using UnityEditor;

/// <summary>
/// Provides backward-compatible wrappers for Unity Editor API changes across versions.
///
/// Unity 6+ (UNITY_6000_0_OR_NEWER):
///   EditorUtility.InstanceIDToObject(int) is marked obsolete.
///   Replacement: EditorUtility.EntityIdToObject(int).
///
/// Unity 2021.3–2022.x:
///   Only EditorUtility.InstanceIDToObject(int) exists.
///   EditorUtility.EntityIdToObject(int) does not exist.
///
/// Usage: Replace all direct EditorUtility.InstanceIDToObject / EntityIdToObject
/// calls with EditorCompat.IdToObject to compile cleanly on all supported versions.
/// </summary>
public static class EditorCompat
{
    /// <summary>
    /// Resolve a Unity Object by its instance/entity ID.
    /// Uses EntityIdToObject on Unity 6+, InstanceIDToObject on older versions.
    /// </summary>
    public static Object IdToObject(int id)
    {
#if UNITY_6000_0_OR_NEWER
        return EditorUtility.EntityIdToObject(id);
#else
        return EditorUtility.InstanceIDToObject(id);
#endif
    }
}
#endif
