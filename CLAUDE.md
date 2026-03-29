# CLAUDE.md — Movesia Electron App

## Project Overview

**Movesia** is an AI-powered desktop app for Unity game development. It connects to a running Unity Editor over a local WebSocket, giving a LangGraph agent (powered by Claude via OpenRouter through a Movesia proxy) real-time access to scene hierarchy, GameObjects, components, prefabs, assets, and logs. Users chat with the agent in a React UI and it executes Unity Editor operations on their behalf.

Built on **Electron Forge + Vite + React 19 + Tailwind v4**. Converted from the original VS Code extension into a standalone desktop app.

## Build & Dev Commands

```bash
pnpm install                    # Install dependencies
pnpm dev                        # Dev mode (Forge start + Vite HMR)
pnpm run package                # Package for current platform
pnpm run make                   # Build distributable installers
pnpm run lint                   # ESLint (flat config)
pnpm run lint:fix               # ESLint --fix
pnpm run format                 # Prettier
pnpm run clean                  # Remove node_modules + .vite + lockfile
```

**Package manager: pnpm** (not npm). The `pnpm-lock.yaml` is the lockfile.

## Architecture

### Process Model

```
Main Process (src/main.ts)
├── AppWindow (src/appWindow.ts)
│   ├── BrowserWindow creation + lifecycle (frameless, 960x660 min)
│   ├── Window state management (src/windowState.ts)
│   └── IPC handler registration (all modules)
├── Services (src/services/)
│   ├── auth-service.ts — OAuth 2.1 PKCE client (complete)
│   ├── agent-service.ts — LangGraph agent bridge + WebSocket server
│   ├── app-settings.ts — JSON settings persistence (last project)
│   ├── unity-project-scanner.ts — Find local Unity projects
│   ├── token-tracker.ts — Token usage tracking
│   ├── profile-tokens.ts — Token utilities
│   └── protocol-handler.ts — movesia:// custom protocol + single instance lock
├── IPC Handlers (src/ipc/)
│   ├── authIPC.ts — OAuth sign-in/out, token management
│   ├── agentIPC.ts — Chat streaming, threads, Unity status
│   ├── unityIPC.ts — Project scanning, package installation
│   └── menuIPC.ts — Window controls, zoom, devtools, menu
├── Menu System (src/menu/)
│   ├── appMenu.ts — Application menu template
│   ├── contextMenu.ts — Right-click context menu
│   └── accelerators.ts — Keyboard shortcuts
└── Agent (src/agent/) — see Agent System section below

Preload Script (src/preload.ts)
├── Whitelist-based IPC bridge (validated send + receive channels)
├── Process versions: chrome, node, electron
└── Exposed as: window.electron.ipcRenderer.*

Renderer Process (src/app/)
├── index.tsx — React root (createRoot + error boundary)
├── App.tsx — Root component (HashRouter + ThemeProvider + Sidebar + Routes)
├── screens/
│   ├── signIn.tsx — OAuth sign-in (2-panel layout)
│   ├── setup.tsx — Unity project selection + package installation (3-step wizard)
│   ├── chat.tsx — Chat interface (prompt-kit components + streaming)
│   └── settings.tsx — User profile + sign-out
├── hooks/
│   ├── useAuthState.ts — Auth state + signIn/signOut via IPC
│   ├── useChatState.ts — Chat state + message streaming via IPC
│   ├── useUnityStatus.ts — Unity connection status (polled every 3s)
│   ├── useThreads.ts — Thread management (DB-backed, filtered by project)
│   ├── useRendererListener.ts — IPC event listener hook
│   └── useEventListener.ts — DOM event listener hook
├── components/
│   ├── titlebar.tsx — Custom frameless titlebar (with Unity status)
│   ├── window-controls.tsx — Min/max/close buttons (Windows)
│   ├── app-sidebar.tsx — Thread list + user profile + settings
│   ├── menu.tsx + menu-item.tsx — Custom menu bar
│   ├── control-button.tsx — Window control button
│   ├── mode-toggle.tsx — Dark/light theme toggle
│   ├── theme-provider.tsx — Theme context provider
│   ├── error-boundary.tsx — React error boundary
│   ├── context-menu.tsx — Right-click context menu
│   ├── chat/ — Chat-specific components
│   │   ├── ChatInput.tsx — Message input
│   │   ├── MarkdownRenderer.tsx — Markdown rendering
│   │   ├── ThreadSelector.tsx — Thread picker
│   │   └── UnityStatusIndicator.tsx — Connection indicator
│   ├── prompt-kit/ — Chat UI library components
│   │   ├── chat-container.tsx, message.tsx, prompt-input.tsx
│   │   ├── prompt-suggestion.tsx, tool.tsx, markdown.tsx
│   │   ├── feedback-bar.tsx, loader.tsx, scroll-button.tsx
│   ├── tools/ — Tool invocation rendering
│   │   ├── DefaultToolUI.tsx, ToolUIWrapper.tsx
│   │   ├── registry.ts — Tool UI registry
│   │   └── types.ts
│   └── ui/ — shadcn/ui primitives
│       ├── button, badge, card, input, label, dropdown-menu
│       ├── avatar, slider, switch, textarea, select
│       ├── collapsible, separator, sidebar, skeleton
│       ├── tooltip, sheet
├── lib/
│   ├── utils.ts — cn() helper (clsx + tailwind-merge)
│   └── types/chat.ts — Chat type definitions
└── styles/
    └── globals.css — Tailwind v4 theme (@theme inline + shadcn tokens)
```

### Key Files

| File | Purpose |
|------|---------|
| `src/main.ts` | App entry: Squirrel startup, auto-updater, protocol registration, service initialization, auto-reconnect |
| `src/appWindow.ts` | Creates BrowserWindow (frameless, 960x660 min), registers all IPC handlers |
| `src/preload.ts` | Context bridge — whitelist-based IPC channel validation |
| `src/services/auth-service.ts` | Complete OAuth 2.1 PKCE client (PKCE, temp server, token exchange, safeStorage, refresh) |
| `src/services/agent-service.ts` | Agent lifecycle, WebSocket server, chat streaming (UIMessageStreamProtocol), thread management |
| `src/agent/agent.ts` | Agent factory: creates LangGraph agent with model, tools, middleware, checkpointer |
| `src/agent/prompts.ts` | Unity agent system prompt (Unity 6 APIs, 8 tools, script workflow) |
| `src/app/App.tsx` | React root: auth-gated routing, sidebar, thread management, chat state wiring |
| `forge.config.ts` | Electron Forge: makers (Squirrel/ZIP/DEB/RPM), Vite plugin, fuses, native module handling |

## Agent System

### Overview

The agent is a **LangGraph-based ReAct agent** created via `langchain`'s `createAgent()` with middleware support. It runs entirely in the **main process** (full Node.js access).

### Model

- Uses `ChatOpenAI` routed through the **Movesia proxy** (`{AUTH_SERVER_URL}/api/v1`)
- OAuth access token sent as `Authorization: Bearer` — proxy validates token, forwards to OpenRouter with server-side API key
- Default model: `anthropic/claude-haiku-4.5`

### 8 Unity Tools

All in `src/agent/unity-tools/`:

| Tool | File | Role | Purpose |
|------|------|------|---------|
| `unity_query` | `query.ts` | Observer | Browse hierarchy, inspect objects, find GameObjects, check logs |
| `unity_hierarchy` | `hierarchy.ts` | Architect | Create, destroy, rename, reparent, duplicate GameObjects |
| `unity_component` | `component.ts` | Engineer | Add, modify, remove components (configure = add-or-modify) |
| `unity_prefab` | `prefab.ts` | Factory | Instantiate, create, modify, apply/revert prefabs |
| `unity_scene` | `scene.ts` | Director | Open, save, create scenes; multi-scene management |
| `unity_refresh` | `refresh.ts` | Compiler | Trigger script compilation after creating/editing C# files |
| `unity_deletion` | `deletion.ts` | Janitor | Delete assets (moves to OS trash, recoverable) |
| `unity_material` | `material.ts` | Artist | Create, modify, assign materials |

All tools use `callUnityAsync()` → `UnityManager.sendRequest()` → WebSocket → Unity Editor.

### Additional Tools

- **TavilySearch** — Internet search (optional, requires `TAVILY_API_KEY`)
- **write_todos** — Optimized todo middleware (balanced mode, ~630 tokens vs langchain's ~3,189)
- **Filesystem tools** — From `deepagents` middleware (read/write/ls files in Unity Assets/)
- **Knowledge search** — RAG via Qdrant (currently disabled, infrastructure exists)

### Middleware Stack

1. **FilesystemMiddleware** (`deepagents`) — Provides file access rooted at `{projectPath}/Assets/`
   - `/scratch/` — Per-conversation scratchpad (StateBackend)
   - `/memories/` — Persistent project memory across conversations (StoreBackend via sqlite)
2. **OptimizedTodoMiddleware** — Injected as tool + system prompt (not as LangGraph middleware)

### Unity WebSocket Connection

- `UnityManager` (`src/agent/UnityConnection/`) — manages WebSocket connections
- Server on `127.0.0.1:8765` (started when a project path is set)
- Router, sessions, heartbeat keep-alive
- Unity companion package (`com.movesia.unity`) connects from the Unity Editor

### Database Persistence

- **better-sqlite3** (native module, not sql.js WASM)
- Tables: `conversations` (thread metadata), `messages`, `checkpoints` (LangGraph state snapshots)
- Stored in `app.getPath('userData')`
- `ConversationRepository` for CRUD, `SqliteCheckpointSaver` for LangGraph checkpointing

### Streaming Protocol

`UIMessageStreamProtocol` implements a Vercel AI SDK-compatible event stream:
- `start` → `text-start` → `text-delta`* → `text-end` → `tool-input-start` → `tool-input-delta` → `tool-input-available` → `tool-output-available` → `finish-step` → `finish` → `done`
- Events sent to renderer via IPC (`chat:stream-event`)

## IPC Communication

### Preload Bridge (`window.electron`)

```typescript
electron.ipcRenderer.invoke(channel, ...args)  // Request → Response (async)
electron.ipcRenderer.send(channel, ...args)     // Fire-and-forget
electron.ipcRenderer.on(channel, listener)      // Subscribe to events
electron.ipcRenderer.removeListener(channel, listener) // Cleanup
```

### All IPC Channels

**Auth** (`src/channels/authChannels.ts`):
- `auth:sign-in` — Invoke OAuth flow (main opens browser)
- `auth:sign-out` — Revoke tokens, clear storage
- `auth:get-state` — Get current `{ isAuthenticated, user, expiresAt }`
- `auth:get-token` — Get valid access token (auto-refreshes if needed)
- `auth:state-changed` — Push from main → renderer on auth changes

**Agent** (`src/channels/agentChannels.ts`):
- `chat:send` — Send chat request (streams events back via `chat:stream-event`)
- `chat:stream-event` / `chat:stream-error` — Push streaming events to renderer
- `threads:list` / `threads:delete` / `threads:messages` — Thread management
- `unity:status` / `unity:set-project` — Unity connection

**Unity Setup** (`src/channels/unityChannels.ts`):
- `unity:scan-projects` — Find local Unity projects (reads Unity Hub data)
- `unity:browse-project` — Open file dialog to select project
- `unity:check-running` — Check if Unity has project open (`Temp/UnityLockfile`)
- `unity:check-package` — Check if Movesia package is installed
- `unity:install-package` — Copy bundled package to `Packages/com.movesia.unity`

**Menu/Window** (`src/channels/menuChannels.ts`):
- `window-minimize`, `window-maximize`, `window-close`, etc.
- `web-toggle-devtools`, `web-zoom-in/out`, `web-toggle-fullscreen`
- `menu-event`, `execute-menu-item-by-id`, `show-context-menu`
- `open-url` — Open URL in system browser

**Protocol** (`src/channels/protocolChannels.ts`):
- `protocol:url-received` — Forward `movesia://` URLs from OS to renderer

**Settings**:
- `settings:get-last-project` — Get last-used project for auto-reconnect

### Adding a New IPC Channel

1. Add the channel name to `src/channels/` (new file or extend existing)
2. Add the handler in `src/ipc/` (registered in `appWindow.ts`)
3. **Whitelist in `src/preload.ts`** — add to `ALLOWED_SEND_CHANNELS` or `ALLOWED_RECEIVE_CHANNELS`
4. Use `electron.ipcRenderer.invoke('channel', payload)` in renderer

## OAuth 2.1 PKCE Flow

Fully implemented in `src/services/auth-service.ts`:

1. Generate PKCE pair (code_verifier + S256 code_challenge)
2. Spin up temp HTTP server on `127.0.0.1:0` (OS-assigned port)
3. Encode port in `state` param: `base64url({ csrf, port })`
4. Open system browser → website's `/api/auth/oauth2/authorize`
5. User signs in → website redirects to `/auth/callback?code=...&state=...`
6. Callback page decodes port from state → redirects to `127.0.0.1:{port}/callback`
7. Temp server receives code → exchanges for tokens via POST `/api/auth/oauth2/token`
8. Tokens encrypted with `safeStorage.encryptString()` → stored in `{userData}/.movesia-tokens`
9. Auto-refresh 5 min before expiry (timer-based)
10. State changes broadcast to renderer via `auth:state-changed`

**Config:**
```typescript
AUTH_SERVER_URL = process.env.MOVESIA_AUTH_URL || 'https://movesia.com'
CLIENT_ID = process.env.MOVESIA_OAUTH_CLIENT_ID || 'movesia-desktop-app'
REDIRECT_URI = `${AUTH_SERVER_URL}/auth/callback`
SCOPES = 'openid profile email offline_access'
```

## Renderer Routing

`HashRouter` (required for `file://` protocol):

```
/          → SignInScreen (public — unauthenticated users land here)
/setup     → SetupScreen (protected — project selection + package install)
/chat      → ChatScreen (protected — main chat interface)
/settings  → SettingsScreen (protected — profile + sign-out)
```

**Route protection** in `App.tsx`: redirects unauthenticated users to `/`, authenticated users from `/` to `/setup`.

## User Flow

1. **App starts** → init AuthService, AgentService; auto-reconnect to last project if valid
2. **Sign in** → OAuth flow opens browser → tokens stored → redirected to `/setup`
3. **Select project** → Scan/browse for Unity projects → check if running → install Movesia package → `agentService.setProjectPath()` → navigate to `/chat`
4. **Chat** → Type message → IPC `chat:send` → agent streams events back → text + tool invocations rendered
5. **Sign out** → Clear tokens + redirect to `/`

## Build System (Vite + Electron Forge)

Three Vite configurations in `config/`:

1. **`vite.main.config.ts`** — Main process (ESM, externals: all deps + builtins)
2. **`vite.preload.config.ts`** — Preload script (ESM, inline dynamic imports)
3. **`vite.renderer.config.ts`** — Renderer (React, Tailwind, SVGR, tsconfig paths, checker)
   - Global defines: `__WIN32__`, `__DARWIN__`, `__LINUX__`, `__DEV__`, `__APP_NAME__`, `__APP_VERSION__`

**Native modules** (better-sqlite3, bindings, file-uri-to-path, prebuild-install) are copied via `afterCopy` hook and unpacked from ASAR.

## Styling

- **Tailwind v4** via `@tailwindcss/vite` plugin (no PostCSS)
- **shadcn/ui** design tokens in `globals.css` using `@theme inline`
- **Dark mode**: `@custom-variant dark (&:is(.dark *))` + ThemeProvider (default: light)
- **CSS variables**: oklch color space
- **prompt-kit**: Chat UI components alongside shadcn/ui
- **Fonts**: Geist + Geist Mono (`@fontsource-variable`)
- **Animations**: `tw-animate-css` (Tailwind v4 compatible)

## Dependencies

### Runtime (Key)
| Package | Version | Purpose |
|---------|---------|---------|
| `react` / `react-dom` | 19.1 | UI framework |
| `react-router-dom` | 7.7 | Client routing (HashRouter) |
| `@langchain/langgraph` | 1.1 | Agent framework |
| `@langchain/openai` | 1.2 | LLM via OpenRouter proxy |
| `@langchain/core` | 1.1 | LangChain core |
| `langchain` | 1.2 | createAgent with middleware |
| `deepagents` | 1.8 | Filesystem middleware (CompositeBackend) |
| `better-sqlite3` | 12.6 | SQLite persistence (native module) |
| `ws` | 8.19 | WebSocket server (Unity connection) |
| `zod` | 3.25.67 | Schema validation (PINNED!) |
| `update-electron-app` | 3.1 | Auto-updater (GitHub Releases) |
| `marked` | 17 | Markdown parsing |
| `react-markdown` + `remark-gfm` | 10.1 | Markdown rendering in React |
| `prism-react-renderer` | 2.4 | Code syntax highlighting |
| `use-stick-to-bottom` | 1.1 | Chat auto-scroll |
| `lucide-react` | 0.544 | Icons |
| `electron-squirrel-startup` | 1 | Windows installer handling |
| `electron-window-state` | 5 | Window position/size persistence |

### Dev (Key)
| Package | Version | Purpose |
|---------|---------|---------|
| `electron` | 38.2 | Desktop runtime |
| `@electron-forge/*` | 7.11 | Build + packaging |
| `vite` | 7.0 | Build tool |
| `@tailwindcss/vite` | 4.1 | Tailwind v4 Vite plugin |
| `typescript` | 5.9 | Type checking |
| `husky` + `commitlint` | latest | Git hooks + conventional commits |

## Global Type Definitions

`src/@types/globals.d.ts`:
- `electron` — Preload bridge (typed as `typeof globals` from preload)
- `__WIN32__`, `__DARWIN__`, `__LINUX__` — Platform booleans
- `__DEV__` — Development mode flag
- `__APP_NAME__`, `__APP_VERSION__` — App metadata

## Key Constraints

- **pnpm only** — Do not use npm or yarn
- **ESM throughout** — `"type": "module"`, ESNext target, bundler module resolution
- **Context isolation** — All renderer ↔ main communication MUST go through the preload IPC bridge. Never use `nodeIntegration: true`
- **Zod 3.25.67** — Must be pinned via `pnpm.overrides` for LangChain compatibility
- **HashRouter** — Required for Electron's `file://` protocol (not BrowserRouter)
- **Tailwind v4** — Uses `@theme` directives, not PostCSS-based v3 config
- **Electron Fuses** — RunAsNode disabled, cookie encryption enabled, ASAR integrity validation
- **`@/` import alias** — Maps to `./src/*` via tsconfig paths (resolved by `vite-tsconfig-paths`)
- **Native modules** — better-sqlite3 requires special handling (afterCopy + unpack from ASAR)
- **Single instance** — Only one Movesia instance allowed (protocol handler + lock)
- **Unity 6** (6000.x) APIs only — agent system prompt and tools target Unity 6

## Environment Variables

```env
MOVESIA_AUTH_URL=http://localhost:3000       # Auth server (local dev)
MOVESIA_OAUTH_CLIENT_ID=movesia-desktop-app # OAuth client ID
TAVILY_API_KEY=tvly-...                     # Optional: internet search
LANGSMITH_API_KEY=ls-...                    # Optional: LangSmith tracing
LANGSMITH_PROJECT=movesia                   # Optional: LangSmith project name
```

## Common Tasks

### Adding a New IPC Channel

1. Add channel name to `src/channels/` (create new file or extend existing)
2. Add handler in `src/ipc/` (registered in `appWindow.ts`)
3. **Whitelist in `src/preload.ts`** — add to `ALLOWED_SEND_CHANNELS` or `ALLOWED_RECEIVE_CHANNELS`
4. Use `electron.ipcRenderer.invoke('channel-name', payload)` in renderer

### Adding a New Route

1. Create screen component in `src/app/screens/`
2. Add `<Route path='/myRoute' Component={MyScreen} />` in `App.tsx`
3. Add route protection logic if needed (auth guard in `AppShell`)
4. Navigate with `useNavigate()` from `react-router-dom`

### Adding New UI Components

shadcn/ui components in `src/app/components/ui/`. prompt-kit components in `src/app/components/prompt-kit/`.
1. Create the component file following existing patterns
2. Use `cn()` helper from `lib/utils.ts` for class merging
3. Follow the `@theme inline` CSS variable pattern in `globals.css`

### Adding a New Unity Tool

1. Create tool file in `src/agent/unity-tools/`
2. Export from `src/agent/unity-tools/index.ts`
3. Tool uses `callUnityAsync()` from `connection.ts` to communicate with Unity
4. Add to system prompt in `src/agent/prompts.ts`

## Dev-Only Features (`__DEV__` Flag)

The `__DEV__` global boolean controls developer-only features. It is set at **build time** by Vite in `config/vite.renderer.config.ts`:

```typescript
__DEV__: JSON.stringify(process.env.NODE_ENV === 'development')
```

- **`pnpm dev`** → `__DEV__ = true` (all dev features enabled)
- **`pnpm run package` / `pnpm run make`** → `__DEV__ = false` (dev features stripped out)

### Making a Debug Build for Production Testing

To create a packaged build **with dev features enabled** (for diagnosing production-only bugs):

1. In `config/vite.renderer.config.ts`, temporarily change `__DEV__` to:
   ```typescript
   __DEV__: JSON.stringify(true)
   ```
2. Run `pnpm run package`
3. The resulting build will have all dev features available
4. **Remember to revert the change before building a user release**

### Current Dev Features

| Feature | Trigger | Description |
|---------|---------|-------------|
| Debug Console | `Ctrl+Shift+D` or sidebar menu → "Debug Console" | Shows live main-process logs in the app (ring buffer of last 500 entries, level filtering, copy-to-clipboard) |

### Adding New Dev Features

Gate any dev-only UI behind the `__DEV__` flag so it is automatically stripped from production builds:

```tsx
// In renderer components:
{__DEV__ && <MyDevComponent />}

// In effects:
useEffect(() => {
  if (!__DEV__) return;
  // dev-only logic
}, []);
```

The `__DEV__` flag is only available in the **renderer process** (Vite defines it). For main-process dev gating, use `app.isPackaged` from Electron or check `process.env.NODE_ENV`.
