# CLAUDE.md — Movesia Electron App

## Project Overview

This is the **Movesia Electron desktop app** — a standalone desktop application that embeds the Movesia LangGraph agent for Unity Editor integration. It replaces the VS Code extension host with Electron while reusing the same agent, tools, Unity WebSocket layer, React UI, and persistence.

Built on the **Reactronite** boilerplate (Electron Forge + Vite + React 19 + Tailwind v4).

## Build & Dev Commands

```bash
pnpm install                    # Install dependencies
pnpm dev                        # Dev mode (Forge start + Vite HMR)
pnpm run package                # Package for current platform
pnpm run make                   # Build distributable installers
pnpm run lint                   # ESLint (flat config)
pnpm run format                 # Prettier
pnpm run clean                  # Remove node_modules + .vite + lockfile
```

**Package manager: pnpm** (not npm). The `pnpm-lock.yaml` is the lockfile.

## Architecture

### Process Model

```
Main Process (src/main.ts)
├── AppWindow (src/appWindow.ts)
│   ├── BrowserWindow creation + lifecycle
│   ├── Window state management (src/windowState.ts)
│   └── IPC handler registration
├── IPC Handlers (src/ipc/)
│   └── menuIPC.ts — Window controls, zoom, devtools, menu
├── Menu System (src/menu/)
│   ├── appMenu.ts — Application menu template
│   ├── contextMenu.ts — Right-click context menu
│   └── accelerators.ts — Keyboard shortcuts
├── [TODO] Agent Service — LangGraph agent bridge
├── [TODO] Auth Service — OAuth 2.1 PKCE
├── [TODO] Unity Manager — WebSocket server
└── [TODO] Database — sql.js persistence

Preload Script (src/preload.ts)
├── IPC bridge: ipcRenderer.{send, invoke, on, once, removeListener}
├── Process versions: chrome, node, electron
└── Exposed as: window.electron

Renderer Process (src/app/)
├── index.tsx — React root (createRoot)
├── App.tsx — Root component (HashRouter + ThemeProvider + Titlebar)
├── screens/
│   ├── landing.tsx — Placeholder landing page (needs Movesia replacement)
│   ├── [TODO] chatView.tsx — Chat interface (from extension)
│   ├── [TODO] signIn.tsx — OAuth sign-in
│   ├── [TODO] projectSelector.tsx — Unity project selection
│   ├── [TODO] installPackage.tsx — Package installation
│   └── [TODO] settings.tsx — Settings page
├── components/
│   ├── titlebar.tsx — Custom frameless titlebar
│   ├── window-controls.tsx — Min/max/close buttons (Windows)
│   ├── menu.tsx — Custom menu bar
│   ├── menu-item.tsx — Menu item component
│   ├── control-button.tsx — Window control button
│   ├── mode-toggle.tsx — Dark/light theme toggle
│   ├── theme-provider.tsx — Theme context provider
│   └── ui/ — shadcn/ui primitives (badge, button, card, dropdown-menu)
├── hooks/
│   ├── useRendererListener.ts — IPC event listener hook
│   └── useEventListener.ts — DOM event listener hook
├── lib/
│   └── utils.ts — cn() helper (clsx + tailwind-merge)
└── styles/
    └── globals.css — Tailwind v4 theme (shadcn/ui design tokens)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | Electron entry. Squirrel startup handling, app lifecycle, React DevTools |
| `src/appWindow.ts` | Creates BrowserWindow (frameless, 960x660 min), loads Vite dev server or built files |
| `src/preload.ts` | Context bridge — exposes `window.electron.ipcRenderer.*` |
| `src/windowState.ts` | Tracks window state transitions (minimize, maximize, fullscreen, etc.) |
| `src/webContents.ts` | `sendToRenderer()` helper with destroyed-check, `emitEvent()` for menu clicks |
| `src/channels/menuChannels.ts` | IPC channel name constants |
| `src/ipc/menuIPC.ts` | Main process IPC handlers (window controls, zoom, devtools, menu execution) |
| `src/app/App.tsx` | React root — HashRouter + ThemeProvider + Titlebar + Routes |
| `src/app/styles/globals.css` | Tailwind v4 config — CSS variables, `@theme inline`, `@custom-variant dark` |
| `forge.config.ts` | Electron Forge config — makers (Squirrel, ZIP, DEB, RPM), Vite plugin, fuses |

### Build System (Vite + Electron Forge)

Three Vite configurations in `config/`:

1. **`vite.main.config.ts`** — Main process
   - ESM output (`formats: ['es']`)
   - Externals: electron, node builtins, all dependencies
   - Hot restart on rebuild

2. **`vite.preload.config.ts`** — Preload script
   - ESM output, inline dynamic imports
   - Hot reload (sends full-reload to renderer)

3. **`vite.renderer.config.ts`** — Renderer (React)
   - Plugins: `@tailwindcss/vite`, `vite-plugin-svgr`, `vite-tsconfig-paths`, `vite-plugin-checker`
   - Global defines: `__WIN32__`, `__DARWIN__`, `__LINUX__`, `__DEV__`, `__APP_NAME__`, `__APP_VERSION__`
   - Base: `./` (relative paths for file:// protocol)

All extend `vite.base.config.ts` (shared externals, build config, dev server exposure).

### IPC Communication

**Preload bridge** (`window.electron`):
```typescript
electron.ipcRenderer.invoke(channel, ...args)  // Request → Response (async)
electron.ipcRenderer.send(channel, ...args)     // Fire-and-forget
electron.ipcRenderer.on(channel, listener)      // Subscribe to events
electron.ipcRenderer.removeListener(channel, listener) // Cleanup
```

**Current channels** (menu/window only):
- `window-minimize`, `window-maximize`, `window-toggle-maximize`, `window-close`
- `web-toggle-devtools`, `web-actual-size`, `web-zoom-in`, `web-zoom-out`, `web-toggle-fullscreen`
- `menu-event`, `execute-menu-item-by-id`, `show-context-menu`

**Channels to add** (for Movesia agent integration):
- `chat:send` — Send chat message to agent
- `chat:stream-event` — Streaming events from agent to renderer
- `auth:sign-in`, `auth:sign-out`, `auth:state-changed` — OAuth flow
- `unity:status` — Connection status updates
- `unity:select-project` — Project selection
- `unity:install-package` — Package installation
- `threads:list`, `threads:delete`, `threads:create` — Thread management
- `projects:scan`, `projects:select` — Unity project scanning

### Renderer Routing

Currently: `HashRouter` with single `/` route (landing page).

**Target routes** (migrated from VS Code extension):
```
/signIn          → OAuth sign-in page (public)
/projectSelector → Unity project selection (protected)
/installPackage  → Package installation (protected)
/chatView        → Main chat interface (protected)
/settings        → Settings page (protected)
```

### Window Configuration

- **Frameless** window (`frame: false`) with custom titlebar component
- **macOS**: `titleBarStyle: 'hidden'` (native traffic light buttons)
- **Windows**: Custom minimize/maximize/close controls
- **Min size**: 960x660
- **Background**: `#1a1a1a`
- **State persistence**: `electron-window-state` (position + size)
- **Security**: `contextIsolation: true`, `nodeIntegration: false`

### Styling

- **Tailwind v4** via `@tailwindcss/vite` plugin (no PostCSS)
- **shadcn/ui** design tokens in `globals.css` using `@theme inline`
- **Dark mode**: `@custom-variant dark (&:is(.dark *))` + ThemeProvider
- **CSS variables**: oklch color space, `--background`, `--foreground`, `--primary`, etc.
- **Animations**: `tw-animate-css` (Tailwind v4 compatible)

## Global Type Definitions

`src/@types/globals.d.ts`:
- `electron` — Preload bridge (typed as `typeof globals` from preload)
- `__WIN32__`, `__DARWIN__`, `__LINUX__` — Platform booleans
- `__DEV__` — Development mode flag
- `__APP_NAME__`, `__APP_VERSION__` — App metadata

`src/@types/electron-forge.d.ts`:
- `MAIN_WINDOW_VITE_DEV_SERVER_URL` — Vite dev server URL (defined by Forge)
- `MAIN_WINDOW_VITE_NAME` — Renderer name for production file loading

## Dependencies

### Runtime
| Package | Version | Purpose |
|---------|---------|---------|
| `react` | 19 | UI framework |
| `react-dom` | 19 | React DOM renderer |
| `react-router-dom` | 7 | Client-side routing (HashRouter) |
| `electron-squirrel-startup` | 1 | Windows installer handling |
| `electron-window-state` | 5 | Window position/size persistence |
| `@radix-ui/react-dropdown-menu` | 2 | Dropdown primitives |
| `@radix-ui/react-slot` | 1 | Slot composition |
| `class-variance-authority` | 0.7 | Component variant styling |
| `clsx` + `tailwind-merge` | latest | Class name utilities |
| `lucide-react` | latest | Icon library |
| `tw-animate-css` | 1 | Tailwind v4 animations |

### Dev
| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | 38 | Desktop runtime |
| `@electron-forge/*` | 7.8 | Build + packaging |
| `@electron/fuses` | 2 | Security fuses |
| `vite` | 7 | Build tool |
| `@tailwindcss/vite` | 4 | Tailwind v4 Vite plugin |
| `@vitejs/plugin-react` | 5 | React fast refresh |
| `typescript` | 5.9 | Type checking |
| `vite-plugin-checker` | 0.11 | TS + ESLint checking in dev |
| `vite-plugin-svgr` | 4.5 | SVG as React components |
| `vite-tsconfig-paths` | 5 | `@/` path alias support |

### Dependencies to Add (from extension migration)
- `@langchain/langgraph` — Agent framework
- `@langchain/openai` — OpenRouter LLM
- `sql.js` — WASM SQLite persistence
- `ws` — WebSocket server (Unity connection)
- `zod` v3.25.67 (pinned!) — Schema validation
- `zustand` — Lightweight state management

## Key Constraints

- **pnpm only** — Do not use npm or yarn
- **ESM throughout** — `"type": "module"`, ESNext target, bundler module resolution
- **Context isolation** — All renderer ↔ main communication MUST go through the preload IPC bridge. Never use `nodeIntegration: true`
- **Zod 3.25.67** — Must be pinned with overrides when adding LangChain deps
- **HashRouter** — Required for Electron's `file://` protocol (not BrowserRouter)
- **Tailwind v4** — Uses `@theme` directives, not PostCSS-based v3 config
- **Electron Fuses** — Security fuses are enabled; `RunAsNode` is disabled
- **`@/` import alias** — Maps to `./src/*` via tsconfig paths (resolved by `vite-tsconfig-paths`)

## Common Tasks

### Adding a New IPC Channel

1. Add the channel name to `src/channels/` (create new file or extend existing)
2. Add the handler in `src/ipc/` (registered in `appWindow.ts` → `registerMainIPC()`)
3. The preload already exposes generic `ipcRenderer.invoke/send/on` — no preload changes needed
4. Use `electron.ipcRenderer.invoke('channel-name', payload)` in renderer

### Adding a New Route

1. Create the screen component in `src/app/screens/`
2. Add `<Route path='/myRoute' Component={MyScreen} />` in `App.tsx`
3. Navigate with `useNavigate()` from `react-router-dom`

### Adding New UI Components

shadcn/ui components are in `src/app/components/ui/`. To add more:
1. Create the component file in `ui/` following the existing pattern
2. Use the `cn()` helper from `lib/utils.ts` for class merging
3. Follow the shadcn/ui `@theme inline` CSS variable pattern in `globals.css`
