#if UNITY_EDITOR && UNITY_6000_3_OR_NEWER
using UnityEditor;
using UnityEditor.Toolbars;
using UnityEngine;

/// <summary>
/// Adds a Movesia dropdown to the Unity main toolbar (Unity 6.3+ API).
/// Shows the Movesia logo with a colored dot overlay in the bottom-right corner
/// (green = connected, red = disconnected). Dropdown menu provides connect/disconnect actions.
/// </summary>
[InitializeOnLoad]
public static class MovesiaToolbar
{
    private const string kPath = "Movesia/Connection";

    private static MainToolbarDropdown s_dropdown;
    private static Texture2D s_iconConnected;
    private static Texture2D s_iconDisconnected;
    private static bool s_iconsBuilt;

    static MovesiaToolbar()
    {
        WebSocketClient.OnConnected += OnConnectionChanged;
        WebSocketClient.OnDisconnected += OnConnectionChanged;
    }

    [MainToolbarElement(kPath, defaultDockPosition = MainToolbarDockPosition.Left, defaultDockIndex = 0)]
    public static MainToolbarElement CreateButton()
    {
        EnsureIcons();
        var connected = WebSocketClient.IsConnected;
        var content = MakeContent(connected);
        s_dropdown = new MainToolbarDropdown(content, ShowDropdownMenu);
        return s_dropdown;
    }

    private static void ShowDropdownMenu(Rect dropDownRect)
    {
        var menu = new GenericMenu();

        // 1. Status (grayed out, not clickable)
        var statusLabel = WebSocketClient.IsConnected ? "Status: Connected" : "Status: Disconnected";
        menu.AddDisabledItem(new GUIContent(statusLabel));

        menu.AddSeparator("");

        // 2. Open Movesia
        menu.AddItem(new GUIContent("Open Movesia"), false, OnOpenMovesia);

        // 3. Pause / Resume
        if (WebSocketClient.IsConnected)
            menu.AddItem(new GUIContent("Pause"), false, () => WebSocketClient.MenuDisconnect());
        else
            menu.AddItem(new GUIContent("Reconnect"), false, () => WebSocketClient.MenuReconnect());

        // 4. Docs
        menu.AddItem(new GUIContent("Docs"), false, OnOpenDocs);

        menu.DropDown(dropDownRect);
    }

    private static void OnOpenMovesia()
    {
        Application.OpenURL("movesia://open");
    }

    private static void OnOpenDocs()
    {
        Application.OpenURL("https://movesia.com/docs");
    }

    private static void OnConnectionChanged()
    {
        if (s_dropdown == null) return;
        EnsureIcons();
        s_dropdown.content = MakeContent(WebSocketClient.IsConnected);
        MainToolbar.Refresh(kPath);
    }

    private static MainToolbarContent MakeContent(bool connected)
    {
        var icon = connected ? s_iconConnected : s_iconDisconnected;
        var tooltip = connected
            ? "Movesia \u2014 connected (click for options)"
            : "Movesia \u2014 disconnected (click for options)";

        if (icon != null)
            return new MainToolbarContent(icon);
        else
            return new MainToolbarContent(connected ? "M [ON]" : "M [OFF]", tooltip);
    }

    // ---- Icon: square logo with colored dot overlay in bottom-right ----

    private const int kIconSize = 64;
    private const int kDotRadius = 10;

    private static readonly Color kGreen = new Color(0.2f, 0.8f, 0.2f, 1f);
    private static readonly Color kRed = new Color(0.9f, 0.2f, 0.2f, 1f);
    private static readonly Color kOutline = new Color(0f, 0f, 0f, 0.6f);

    private static void EnsureIcons()
    {
        if (s_iconsBuilt) return;
        s_iconsBuilt = true;

        var logoPath = EditorGUIUtility.isProSkin
            ? "Packages/com.movesia.unity/Editor/icons/Movesia-Logo-White.png"
            : "Packages/com.movesia.unity/Editor/icons/Movesia-Logo-Black.png";

        var logo = AssetDatabase.LoadAssetAtPath<Texture2D>(logoPath);
        if (logo == null)
        {
            Debug.LogWarning($"[MovesiaToolbar] Could not load logo at: {logoPath}");
            return;
        }

        s_iconConnected = CompositeIconWithDot(logo, kGreen);
        s_iconDisconnected = CompositeIconWithDot(logo, kRed);
    }

    private const int kLogoPadding = 6;

    private static Texture2D CompositeIconWithDot(Texture2D logo, Color dotColor)
    {
        // Start with a transparent canvas
        var tex = new Texture2D(kIconSize, kIconSize, TextureFormat.RGBA32, false);
        var clear = new Color(0, 0, 0, 0);
        for (int y = 0; y < kIconSize; y++)
        for (int x = 0; x < kIconSize; x++)
            tex.SetPixel(x, y, clear);

        // Scale logo smaller than the canvas, then place it centered
        int logoSize = kIconSize - kLogoPadding * 2;
        var rt = RenderTexture.GetTemporary(logoSize, logoSize, 0, RenderTextureFormat.ARGB32);
        rt.filterMode = FilterMode.Bilinear;
        Graphics.Blit(logo, rt);

        var prev = RenderTexture.active;
        RenderTexture.active = rt;

        var logoTex = new Texture2D(logoSize, logoSize, TextureFormat.RGBA32, false);
        logoTex.ReadPixels(new Rect(0, 0, logoSize, logoSize), 0, 0);
        logoTex.Apply();

        RenderTexture.active = prev;
        RenderTexture.ReleaseTemporary(rt);

        for (int y = 0; y < logoSize; y++)
        for (int x = 0; x < logoSize; x++)
        {
            var src = logoTex.GetPixel(x, y);
            if (src.a > 0.01f)
                tex.SetPixel(x + kLogoPadding, y + kLogoPadding, src);
        }
        Object.DestroyImmediate(logoTex);

        // Draw dot at bottom-right corner, pushed outside the logo area
        int cx = kIconSize - kDotRadius + 3;
        int cy = kDotRadius - 3;

        FillCircle(tex, cx, cy, kDotRadius + 2, kOutline);
        FillCircle(tex, cx, cy, kDotRadius, dotColor);

        tex.Apply();
        tex.hideFlags = HideFlags.HideAndDontSave;
        return tex;
    }

    private static void FillCircle(Texture2D tex, int cx, int cy, int radius, Color color)
    {
        int r2 = radius * radius;
        for (int y = cy - radius; y <= cy + radius; y++)
        for (int x = cx - radius; x <= cx + radius; x++)
        {
            if (x < 0 || x >= tex.width || y < 0 || y >= tex.height) continue;
            int dx = x - cx;
            int dy = y - cy;
            if (dx * dx + dy * dy <= r2)
                tex.SetPixel(x, y, color);
        }
    }
}
#endif
