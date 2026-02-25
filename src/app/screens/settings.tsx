import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Settings2,
  Palette,
  Bot,
  Unplug,
  Keyboard,
  Info,
  Sun,
  Moon,
  Monitor,
  ExternalLink,
  FolderOpen,
  RotateCcw,
} from 'lucide-react'
import { useTheme } from '@/app/components/theme-provider'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Separator } from '@/app/components/ui/separator'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Slider } from '@/app/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import { cn } from '@/app/lib/utils'

// =============================================================================
// Types & Constants
// =============================================================================

type Section = 'general' | 'appearance' | 'model' | 'unity' | 'shortcuts' | 'about'

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'model', label: 'AI Model', icon: Bot },
  { id: 'unity', label: 'Unity', icon: Unplug },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
]

const SHORTCUTS = [
  { action: 'New chat', keys: 'Ctrl+N' },
  { action: 'Toggle sidebar', keys: 'Ctrl+B' },
  { action: 'Settings', keys: 'Ctrl+,' },
  { action: 'Send message', keys: 'Enter' },
  { action: 'New line in message', keys: 'Shift+Enter' },
  { action: 'Toggle theme', keys: 'Ctrl+Shift+T' },
  { action: 'Zoom in', keys: 'Ctrl+=' },
  { action: 'Zoom out', keys: 'Ctrl+-' },
  { action: 'Reset zoom', keys: 'Ctrl+0' },
  { action: 'Toggle fullscreen', keys: 'F11' },
  { action: 'Developer tools', keys: 'Ctrl+Shift+I' },
]

// =============================================================================
// Setting Row — reusable layout for each setting
// =============================================================================

function SettingRow ({
  label,
  description,
  children,
  className,
}: {
  label: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-8 py-4', className)}>
      <div className='min-w-0 flex-1'>
        <Label className='text-[13px] font-medium text-foreground'>{label}</Label>
        {description && (
          <p className='mt-0.5 text-xs text-muted-foreground leading-relaxed'>{description}</p>
        )}
      </div>
      <div className='shrink-0'>{children}</div>
    </div>
  )
}

// =============================================================================
// Section: General
// =============================================================================

function GeneralSection ({
  settings,
  onChange,
}: {
  settings: SettingsState
  onChange: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
}) {
  return (
    <div>
      <SectionHeader title='General' description='App behavior and startup preferences.' />

      <SettingRow label='Launch at startup' description='Automatically open Movesia when you log in.'>
        <Switch
          checked={settings.launchAtStartup}
          onCheckedChange={(v) => onChange('launchAtStartup', v)}
        />
      </SettingRow>

      <Separator />

      <SettingRow label='Show in system tray' description='Keep Movesia running in the background when you close the window.'>
        <Switch
          checked={settings.showInTray}
          onCheckedChange={(v) => onChange('showInTray', v)}
        />
      </SettingRow>

      <Separator />

      <SettingRow label='Check for updates' description='Automatically check for new versions on startup.'>
        <Switch
          checked={settings.autoUpdate}
          onCheckedChange={(v) => onChange('autoUpdate', v)}
        />
      </SettingRow>

      <Separator />

      <SettingRow label='Default project path' description='Default directory when scanning for Unity projects.'>
        <div className='flex items-center gap-2'>
          <Input
            value={settings.defaultProjectPath}
            onChange={(e) => onChange('defaultProjectPath', e.target.value)}
            placeholder='C:\Users\...\Projects'
            className='w-56 h-8 text-xs font-mono'
          />
          <Button variant='outline' size='icon-sm' className='shrink-0'>
            <FolderOpen className='size-3.5' />
          </Button>
        </div>
      </SettingRow>

      <Separator />

      <div className='py-4'>
        <Label className='text-[13px] font-medium text-foreground'>Clear data</Label>
        <p className='mt-0.5 text-xs text-muted-foreground leading-relaxed'>
          Remove all conversation history and cached data. This cannot be undone.
        </p>
        <Button variant='outline' size='sm' className='mt-3 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30'>
          <RotateCcw className='size-3.5' />
          Clear all data
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// Section: Appearance
// =============================================================================

function AppearanceSection ({
  settings,
  onChange,
}: {
  settings: SettingsState
  onChange: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
}) {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <SectionHeader title='Appearance' description='Customize the look and feel of the app.' />

      {/* Theme selector — visual cards */}
      <div className='py-4'>
        <Label className='text-[13px] font-medium text-foreground'>Theme</Label>
        <p className='mt-0.5 text-xs text-muted-foreground leading-relaxed'>
          Choose how Movesia looks to you.
        </p>
        <div className='flex gap-3 mt-3'>
          <ThemeCard
            label='Light'
            icon={Sun}
            active={theme === 'light'}
            onClick={() => setTheme('light')}
            preview='light'
          />
          <ThemeCard
            label='Dark'
            icon={Moon}
            active={theme === 'dark'}
            onClick={() => setTheme('dark')}
            preview='dark'
          />
          <ThemeCard
            label='System'
            icon={Monitor}
            active={theme === 'system'}
            onClick={() => setTheme('system')}
            preview='system'
          />
        </div>
      </div>

      <Separator />

      <SettingRow label='Font size' description='Adjust the base font size for the interface.'>
        <Select value={settings.fontSize} onValueChange={(v) => onChange('fontSize', v)}>
          <SelectTrigger size='sm' className='w-28'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='small'>Small</SelectItem>
            <SelectItem value='medium'>Medium</SelectItem>
            <SelectItem value='large'>Large</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <Separator />

      <SettingRow label='Compact mode' description='Use denser spacing throughout the interface.'>
        <Switch
          checked={settings.compactMode}
          onCheckedChange={(v) => onChange('compactMode', v)}
        />
      </SettingRow>

      <Separator />

      <SettingRow label='Show timestamps' description='Display timestamps on chat messages.'>
        <Switch
          checked={settings.showTimestamps}
          onCheckedChange={(v) => onChange('showTimestamps', v)}
        />
      </SettingRow>
    </div>
  )
}

function ThemeCard ({
  label,
  icon: Icon,
  active,
  onClick,
  preview,
}: {
  label: string
  icon: React.ElementType
  active: boolean
  onClick: () => void
  preview: 'light' | 'dark' | 'system'
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all cursor-pointer w-28',
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/30 hover:bg-accent/50',
      )}
    >
      <div
        className={cn(
          'w-full h-16 rounded-md flex items-center justify-center overflow-hidden',
          preview === 'light' && 'bg-[#f5f5f5] border border-[#e0e0e0]',
          preview === 'dark' && 'bg-[#1a1a1a] border border-[#333]',
          preview === 'system' && 'border border-border',
        )}
      >
        {preview === 'system' ? (
          <div className='flex w-full h-full'>
            <div className='w-1/2 bg-[#f5f5f5] flex items-center justify-center'>
              <Sun className='size-4 text-[#666]' />
            </div>
            <div className='w-1/2 bg-[#1a1a1a] flex items-center justify-center'>
              <Moon className='size-4 text-[#999]' />
            </div>
          </div>
        ) : (
          <Icon className={cn('size-5', preview === 'light' ? 'text-[#666]' : 'text-[#999]')} />
        )}
      </div>
      <span className={cn(
        'text-xs font-medium',
        active ? 'text-primary' : 'text-muted-foreground',
      )}>
        {label}
      </span>
    </button>
  )
}

// =============================================================================
// Section: AI Model
// =============================================================================

function ModelSection ({
  settings,
  onChange,
}: {
  settings: SettingsState
  onChange: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
}) {
  return (
    <div>
      <SectionHeader title='AI Model' description='Configure the language model used by the agent.' />

      <SettingRow label='API key' description='Your OpenRouter API key for model access.'>
        <Input
          type='password'
          value={settings.apiKey}
          onChange={(e) => onChange('apiKey', e.target.value)}
          placeholder='sk-or-...'
          className='w-56 h-8 text-xs font-mono'
        />
      </SettingRow>

      <Separator />

      <SettingRow label='Model' description='The language model powering the assistant.'>
        <Select value={settings.model} onValueChange={(v) => onChange('model', v)}>
          <SelectTrigger size='sm' className='w-52'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='anthropic/claude-haiku-4.5'>Claude Haiku 4.5</SelectItem>
            <SelectItem value='anthropic/claude-sonnet-4'>Claude Sonnet 4</SelectItem>
            <SelectItem value='anthropic/claude-opus-4'>Claude Opus 4</SelectItem>
            <SelectItem value='anthropic/claude-sonnet-4.5'>Claude Sonnet 4.5</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <Separator />

      <div className='py-4'>
        <div className='flex items-center justify-between gap-8'>
          <div className='min-w-0 flex-1'>
            <Label className='text-[13px] font-medium text-foreground'>Temperature</Label>
            <p className='mt-0.5 text-xs text-muted-foreground leading-relaxed'>
              Controls randomness. Lower values are more focused, higher values more creative.
            </p>
          </div>
          <span className='text-xs font-mono text-muted-foreground tabular-nums w-8 text-right'>
            {settings.temperature.toFixed(1)}
          </span>
        </div>
        <Slider
          value={[settings.temperature]}
          onValueChange={([v]) => onChange('temperature', v)}
          min={0}
          max={1}
          step={0.1}
          className='mt-3 w-full max-w-sm'
        />
      </div>

      <Separator />

      <SettingRow label='Max tokens' description='Maximum length of the model response.'>
        <Select value={settings.maxTokens} onValueChange={(v) => onChange('maxTokens', v)}>
          <SelectTrigger size='sm' className='w-32'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='1024'>1,024</SelectItem>
            <SelectItem value='2048'>2,048</SelectItem>
            <SelectItem value='4096'>4,096</SelectItem>
            <SelectItem value='8192'>8,192</SelectItem>
            <SelectItem value='16384'>16,384</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <Separator />

      <SettingRow label='Stream responses' description='Show tokens as they are generated instead of waiting for the full response.'>
        <Switch
          checked={settings.streamResponses}
          onCheckedChange={(v) => onChange('streamResponses', v)}
        />
      </SettingRow>
    </div>
  )
}

// =============================================================================
// Section: Unity
// =============================================================================

function UnitySection ({
  settings,
  onChange,
}: {
  settings: SettingsState
  onChange: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
}) {
  return (
    <div>
      <SectionHeader title='Unity Connection' description='Manage the WebSocket connection to the Unity Editor.' />

      <SettingRow label='WebSocket port' description='The local port used to communicate with the Unity Editor.'>
        <Input
          type='number'
          value={settings.wsPort}
          onChange={(e) => onChange('wsPort', e.target.value)}
          className='w-24 h-8 text-xs font-mono text-center'
        />
      </SettingRow>

      <Separator />

      <SettingRow label='Auto-connect' description='Automatically connect to Unity when the app starts.'>
        <Switch
          checked={settings.autoConnect}
          onCheckedChange={(v) => onChange('autoConnect', v)}
        />
      </SettingRow>

      <Separator />

      <SettingRow label='Connection timeout' description='How long to wait before giving up on a connection attempt.'>
        <Select value={settings.connectionTimeout} onValueChange={(v) => onChange('connectionTimeout', v)}>
          <SelectTrigger size='sm' className='w-28'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='5'>5 seconds</SelectItem>
            <SelectItem value='10'>10 seconds</SelectItem>
            <SelectItem value='30'>30 seconds</SelectItem>
            <SelectItem value='60'>60 seconds</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <Separator />

      <SettingRow label='Auto-install package' description='Prompt to install the Movesia Unity package when opening a project without it.'>
        <Switch
          checked={settings.autoInstallPackage}
          onCheckedChange={(v) => onChange('autoInstallPackage', v)}
        />
      </SettingRow>
    </div>
  )
}

// =============================================================================
// Section: Shortcuts
// =============================================================================

function ShortcutsSection () {
  return (
    <div>
      <SectionHeader title='Keyboard Shortcuts' description='Quick reference for keyboard shortcuts.' />

      <div className='rounded-lg border border-border overflow-hidden mt-1'>
        {SHORTCUTS.map((shortcut, i) => (
          <div
            key={shortcut.action}
            className={cn(
              'flex items-center justify-between px-4 py-2.5',
              i !== SHORTCUTS.length - 1 && 'border-b border-border',
            )}
          >
            <span className='text-[13px] text-foreground'>{shortcut.action}</span>
            <kbd className='px-2 py-0.5 rounded bg-muted text-[11px] font-mono text-muted-foreground border border-border'>
              {shortcut.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Section: About
// =============================================================================

function AboutSection () {
  return (
    <div>
      <SectionHeader title='About Movesia' description='Version information and resources.' />

      <div className='space-y-4 mt-1'>
        {/* Version info */}
        <div className='rounded-lg border border-border p-4 space-y-3'>
          <AboutRow label='App version' value={__APP_VERSION__ ?? '0.1.0'} />
          <Separator />
          <AboutRow label='Electron' value={String(electron?.versions?.electron ?? 'N/A')} />
          <Separator />
          <AboutRow label='Chromium' value={String(electron?.versions?.chrome ?? 'N/A')} />
          <Separator />
          <AboutRow label='Node.js' value={String(electron?.versions?.node ?? 'N/A')} />
        </div>

        {/* Links */}
        <div className='rounded-lg border border-border overflow-hidden'>
          <AboutLink label='Website' href='https://movesia.dev' />
          <AboutLink label='Documentation' href='https://docs.movesia.dev' />
          <AboutLink label='Changelog' href='https://movesia.dev/changelog' />
          <AboutLink label='Report an issue' href='https://github.com/movesia/movesia/issues' last />
        </div>

        <p className='text-xs text-muted-foreground/60 pt-2'>
          Made for Unity developers.
        </p>
      </div>
    </div>
  )
}

function AboutRow ({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-center justify-between'>
      <span className='text-[13px] text-muted-foreground'>{label}</span>
      <span className='text-[13px] font-mono text-foreground'>{value}</span>
    </div>
  )
}

function AboutLink ({ label, href, last }: { label: string; href: string; last?: boolean }) {
  return (
    <button
      onClick={() => window.open(href, '_blank')}
      className={cn(
        'flex w-full items-center justify-between px-4 py-2.5 text-[13px] text-foreground hover:bg-accent/50 transition-colors cursor-pointer',
        !last && 'border-b border-border',
      )}
    >
      {label}
      <ExternalLink className='size-3.5 text-muted-foreground' />
    </button>
  )
}

// =============================================================================
// Section Header
// =============================================================================

function SectionHeader ({ title, description }: { title: string; description: string }) {
  return (
    <div className='pb-4'>
      <h2 className='text-lg font-semibold text-foreground'>{title}</h2>
      <p className='text-sm text-muted-foreground mt-0.5'>{description}</p>
    </div>
  )
}

// =============================================================================
// Settings State
// =============================================================================

interface SettingsState {
  // General
  launchAtStartup: boolean
  showInTray: boolean
  autoUpdate: boolean
  defaultProjectPath: string
  // Appearance
  fontSize: string
  compactMode: boolean
  showTimestamps: boolean
  // Model
  apiKey: string
  model: string
  temperature: number
  maxTokens: string
  streamResponses: boolean
  // Unity
  wsPort: string
  autoConnect: boolean
  connectionTimeout: string
  autoInstallPackage: boolean
}

const DEFAULT_SETTINGS: SettingsState = {
  launchAtStartup: false,
  showInTray: true,
  autoUpdate: true,
  defaultProjectPath: '',
  fontSize: 'medium',
  compactMode: false,
  showTimestamps: false,
  apiKey: '',
  model: 'anthropic/claude-haiku-4.5',
  temperature: 0.3,
  maxTokens: '4096',
  streamResponses: true,
  wsPort: '8765',
  autoConnect: true,
  connectionTimeout: '10',
  autoInstallPackage: true,
}

// =============================================================================
// Settings Screen
// =============================================================================

export function SettingsScreen () {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<Section>('general')
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)

  const handleChange = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    // TODO: persist via IPC → electron-store
  }

  return (
    <div className='flex h-full min-h-0'>
      {/* ── Left navigation ── */}
      <nav className='w-52 shrink-0 border-r border-border flex flex-col'>
        <div className='p-3'>
          <button
            onClick={() => navigate('/')}
            className='flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer px-2 py-1.5 -ml-1 rounded-md hover:bg-accent/50'
          >
            <ArrowLeft className='size-4' />
            Settings
          </button>
        </div>

        <div className='flex-1 px-3 pb-3'>
          <div className='flex flex-col gap-0.5'>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors cursor-pointer text-left',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                >
                  <Icon className='size-4 shrink-0' />
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* ── Right content area ── */}
      <main className='flex-1 overflow-y-auto'>
        <div className='max-w-xl mx-auto px-8 py-6'>
          {activeSection === 'general' && (
            <GeneralSection settings={settings} onChange={handleChange} />
          )}
          {activeSection === 'appearance' && (
            <AppearanceSection settings={settings} onChange={handleChange} />
          )}
          {activeSection === 'model' && (
            <ModelSection settings={settings} onChange={handleChange} />
          )}
          {activeSection === 'unity' && (
            <UnitySection settings={settings} onChange={handleChange} />
          )}
          {activeSection === 'shortcuts' && <ShortcutsSection />}
          {activeSection === 'about' && <AboutSection />}
        </div>
      </main>
    </div>
  )
}
