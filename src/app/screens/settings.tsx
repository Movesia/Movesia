import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Unplug,
  CreditCard,
  Bot,
  Palette,
  Shield,
  Info,
  Sun,
  Moon,
  Monitor,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { useTheme } from '@/app/components/theme-provider'
import { useUnityStatus } from '@/app/hooks/useUnityStatus'
import { useAuthState } from '@/app/hooks/useAuthState'
import { useSubscription } from '@/app/hooks/useSubscription'
import { Switch } from '@/app/components/ui/switch'
import { Label } from '@/app/components/ui/label'
import { Separator } from '@/app/components/ui/separator'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar'
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

type Section = 'connection' | 'account' | 'agent' | 'theme' | 'privacy' | 'about'

const NAV_ITEMS: { id: Section; label: string; icon: React.ElementType }[] = [
  { id: 'connection', label: 'Connection', icon: Unplug },
  { id: 'account', label: 'Account', icon: CreditCard },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'privacy', label: 'Data & Privacy', icon: Shield },
  { id: 'about', label: 'About', icon: Info },
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
// Section: Connection Status
// =============================================================================

function ConnectionSection () {
  const { connectionState, projectName } = useUnityStatus()
  const [isReconnecting, setIsReconnecting] = useState(false)

  const handleReconnect = async () => {
    setIsReconnecting(true)
    try {
      // Re-trigger the current project connection
      const status = await electron.ipcRenderer.invoke('unity:status')
      if (status?.projectPath) {
        await electron.ipcRenderer.invoke('unity:set-project', status.projectPath)
      }
    } catch {
      // ignore — will show updated status on next poll
    } finally {
      setTimeout(() => setIsReconnecting(false), 2000)
    }
  }

  return (
    <div>
      <SectionHeader title='Connection' description='Unity Editor connection status.' />

      <div className='rounded-lg border border-border p-5'>
        <div className='flex items-start gap-4'>
          {/* Status indicator */}
          <div className={cn(
            'mt-0.5 size-3 rounded-full shrink-0',
            connectionState === 'connected' && 'bg-green-500',
            connectionState === 'compiling' && 'bg-yellow-500 animate-pulse',
            connectionState === 'disconnected' && 'bg-red-500',
            connectionState === 'error' && 'bg-red-500',
          )} />

          <div className='flex-1 min-w-0'>
            {connectionState === 'connected' && (
              <>
                <div className='flex items-center gap-2'>
                  <CheckCircle2 className='size-4 text-green-500' />
                  <span className='text-sm font-medium text-foreground'>Connected to Unity</span>
                </div>
                {projectName && (
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Project: <span className='font-medium text-foreground'>{projectName}</span>
                  </p>
                )}
              </>
            )}

            {connectionState === 'compiling' && (
              <>
                <div className='flex items-center gap-2'>
                  <Loader2 className='size-4 text-yellow-500 animate-spin' />
                  <span className='text-sm font-medium text-foreground'>Unity is compiling...</span>
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>
                  Waiting for script compilation to finish.
                </p>
              </>
            )}

            {(connectionState === 'disconnected' || connectionState === 'error') && (
              <>
                <div className='flex items-center gap-2'>
                  <XCircle className='size-4 text-red-500' />
                  <span className='text-sm font-medium text-foreground'>Not connected</span>
                </div>
                <p className='mt-2 text-xs text-muted-foreground leading-relaxed'>
                  Can't reach Unity — make sure the Movesia plugin is installed and Unity is open.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className='flex items-center gap-3 mt-4 pt-4 border-t border-border'>
          <Button
            variant='outline'
            size='sm'
            onClick={handleReconnect}
            disabled={isReconnecting || connectionState === 'connected'}
          >
            <RefreshCw className={cn('size-3.5', isReconnecting && 'animate-spin')} />
            {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
          </Button>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => electron.ipcRenderer.invoke('open-url', 'https://docs.movesia.com/troubleshooting')}
          >
            Troubleshooting
            <ExternalLink className='size-3' />
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Section: Account & Credits
// =============================================================================

function AccountSection () {
  const { user } = useAuthState()
  const { data: subscription, isLoading: subLoading } = useSubscription()

  const userInitials = (user?.name ?? '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const creditsUsed = subscription?.subscription.creditsUsed ?? 0
  const creditsPerMonth = subscription?.plan.creditsPerMonth ?? 400
  const isUnlimited = creditsPerMonth === -1
  const usagePercent = isUnlimited ? 0 : Math.round((creditsUsed / creditsPerMonth) * 100)
  const planName = subscription?.plan.name ?? 'Free'
  const planSlug = subscription?.plan.slug ?? 'free'

  return (
    <div>
      <SectionHeader title='Account' description='Your plan and usage.' />

      {/* User info card */}
      <div className='rounded-lg border border-border p-5'>
        <div className='flex items-center gap-3'>
          <Avatar>
            {user?.picture && <AvatarImage src={user.picture} alt={user.name ?? ''} />}
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-medium text-foreground truncate'>{user?.name ?? 'Unknown'}</p>
            <p className='text-xs text-muted-foreground truncate'>{user?.email ?? ''}</p>
          </div>
          <Badge variant='secondary'>{subLoading ? '...' : planName}</Badge>
        </div>

        <Separator className='my-4' />

        {/* Credits usage */}
        <div>
          <div className='flex items-center justify-between mb-2'>
            <span className='text-xs font-medium text-foreground'>Operations this month</span>
            <span className='text-xs font-mono text-muted-foreground tabular-nums'>
              {isUnlimited ? 'Unlimited' : `${creditsUsed} / ${creditsPerMonth}`}
            </span>
          </div>
          {!isUnlimited && (
            <>
              <div className='h-2 rounded-full bg-muted overflow-hidden'>
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    usagePercent < 75 ? 'bg-primary' : usagePercent < 90 ? 'bg-yellow-500' : 'bg-red-500',
                  )}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <p className='mt-1.5 text-[11px] text-muted-foreground'>
                {creditsPerMonth - creditsUsed} operations remaining. Resets monthly.
              </p>
            </>
          )}
          {isUnlimited && (
            <p className='text-[11px] text-muted-foreground'>
              Unlimited operations with your {planName} plan.
            </p>
          )}
        </div>

        <Separator className='my-4' />

        {/* Actions */}
        <div className='flex items-center gap-3'>
          {planSlug === 'free' && (
            <Button
              variant='default'
              size='sm'
              onClick={() => electron.ipcRenderer.invoke('open-url', 'https://movesia.com/pricing')}
            >
              Upgrade Plan
            </Button>
          )}
          <Button
            variant='outline'
            size='sm'
            onClick={() => electron.ipcRenderer.invoke('open-url', 'https://movesia.com/billing')}
          >
            Manage Subscription
            <ExternalLink className='size-3' />
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Section: Agent Behavior
// =============================================================================

function AgentSection ({
  settings,
  onChange,
}: {
  settings: SettingsState
  onChange: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
}) {
  return (
    <div>
      <SectionHeader title='Agent Behavior' description='Control how the AI assistant works with your project.' />

      <SettingRow
        label='Confirm before changes'
        description='The agent will ask for your approval before modifying your scene or assets.'
      >
        <Switch
          checked={settings.confirmBeforeChanges}
          onCheckedChange={(v) => onChange('confirmBeforeChanges', v)}
        />
      </SettingRow>

      <Separator />

      <SettingRow
        label='Response detail level'
        description='Concise gives you speed, detailed gives you explanations.'
      >
        <Select value={settings.responseDetail} onValueChange={(v) => onChange('responseDetail', v)}>
          <SelectTrigger size='sm' className='w-28'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='concise'>Concise</SelectItem>
            <SelectItem value='detailed'>Detailed</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <Separator />

      <SettingRow
        label='Search assets first'
        description='The agent will look through your existing project assets before creating new ones.'
      >
        <Switch
          checked={settings.searchAssetsFirst}
          onCheckedChange={(v) => onChange('searchAssetsFirst', v)}
        />
      </SettingRow>
    </div>
  )
}

// =============================================================================
// Section: Theme
// =============================================================================

function ThemeSection () {
  const { theme, setTheme } = useTheme()

  return (
    <div>
      <SectionHeader title='Theme' description='Choose how Movesia looks to you.' />

      <div className='flex gap-3'>
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
// Section: Data & Privacy
// =============================================================================

function PrivacySection ({
  settings,
  onChange,
}: {
  settings: SettingsState
  onChange: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void
}) {
  return (
    <div>
      <SectionHeader title='Data & Privacy' description='How your data is handled.' />

      {/* Trust statement */}
      <div className='rounded-lg border border-border p-4 bg-accent/30 mb-4'>
        <div className='flex items-start gap-3'>
          <Shield className='size-4 mt-0.5 text-primary shrink-0' />
          <div className='text-xs text-muted-foreground leading-relaxed space-y-2'>
            <p>
              When you chat with the agent, Movesia sends your prompts and relevant scene context
              (hierarchy, component data, asset names) to the AI model to generate responses.
            </p>
            <p className='font-medium text-foreground'>
              Your project source code is never stored on our servers.
            </p>
            <p>
              Conversations are processed in real time and not retained after the session ends.
            </p>
          </div>
        </div>
      </div>

      <SettingRow
        label='Store conversation history locally'
        description='Save your chat history on this device so you can revisit past sessions.'
      >
        <Switch
          checked={settings.storeHistory}
          onCheckedChange={(v) => onChange('storeHistory', v)}
        />
      </SettingRow>

      <Separator />

      <SettingRow
        label='Send anonymous usage analytics'
        description='Help us improve Movesia by sharing anonymous usage data. No project content is ever included.'
      >
        <Switch
          checked={settings.sendAnalytics}
          onCheckedChange={(v) => onChange('sendAnalytics', v)}
        />
      </SettingRow>

      <Separator />

      <div className='py-4'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => electron.ipcRenderer.invoke('open-url', 'https://movesia.com/privacy')}
        >
          Read our full Privacy Policy
          <ExternalLink className='size-3' />
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// Section: About & Updates
// =============================================================================

function AboutSection () {
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  const handleCheckUpdate = () => {
    setCheckingUpdate(true)
    // TODO: wire to real update check IPC
    setTimeout(() => setCheckingUpdate(false), 3000)
  }

  return (
    <div>
      <SectionHeader title='About Movesia' description='Version information and resources.' />

      <div className='space-y-4'>
        {/* Version info */}
        <div className='rounded-lg border border-border p-4 space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='text-[13px] text-muted-foreground'>Version</span>
            <div className='flex items-center gap-2'>
              <span className='text-[13px] font-mono text-foreground'>{__APP_VERSION__ ?? '0.1.0'}</span>
              <Badge variant='secondary' className='text-[10px] px-1.5 py-0 font-semibold uppercase tracking-wider'>Beta</Badge>
            </div>
          </div>
        </div>

        {/* Update check */}
        <Button variant='outline' size='sm' onClick={handleCheckUpdate} disabled={checkingUpdate}>
          {checkingUpdate ? (
            <>
              <Loader2 className='size-3.5 animate-spin' />
              Checking for updates...
            </>
          ) : (
            'Check for Updates'
          )}
        </Button>

        {/* Links */}
        <div className='rounded-lg border border-border overflow-hidden'>
          <AboutLink label='Documentation' href='https://docs.movesia.com' />
          <AboutLink label='Changelog' href='https://movesia.com/changelog' />
          <AboutLink label='Support' href='https://movesia.com/support' last />
        </div>

        <p className='text-xs text-muted-foreground/60 pt-2'>
          Made for Game developers.
        </p>
      </div>
    </div>
  )
}

function AboutLink ({ label, href, last }: { label: string; href: string; last?: boolean }) {
  return (
    <button
      onClick={() => electron.ipcRenderer.invoke('open-url', href)}
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
  // Agent behavior
  confirmBeforeChanges: boolean
  responseDetail: string
  searchAssetsFirst: boolean
  // Privacy
  storeHistory: boolean
  sendAnalytics: boolean
}

const DEFAULT_SETTINGS: SettingsState = {
  confirmBeforeChanges: true,
  responseDetail: 'concise',
  searchAssetsFirst: true,
  storeHistory: true,
  sendAnalytics: true,
}

// =============================================================================
// Settings Screen
// =============================================================================

export function SettingsScreen () {
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<Section>('connection')
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS)

  const handleChange = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    // TODO: persist via IPC → electron-store
  }

  return (
    <div className='flex h-full min-h-0'>
      {/* ── Left navigation ── */}
      <nav className='w-56 shrink-0 flex flex-col'>
        <div className='px-5 pt-5 pb-6'>
          <button
            onClick={() => navigate('/chat')}
            className='flex items-center gap-2 text-lg font-semibold text-foreground hover:text-primary transition-colors cursor-pointer'
          >
            <ArrowLeft className='size-4' />
            Settings
          </button>
        </div>

        <div className='flex-1 px-4 pb-4'>
          <div className='flex flex-col gap-1'>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer text-left',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                  )}
                >
                  <Icon className='size-[18px] shrink-0' />
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
          {activeSection === 'connection' && <ConnectionSection />}
          {activeSection === 'account' && <AccountSection />}
          {activeSection === 'agent' && (
            <AgentSection settings={settings} onChange={handleChange} />
          )}
          {activeSection === 'theme' && <ThemeSection />}
          {activeSection === 'privacy' && (
            <PrivacySection settings={settings} onChange={handleChange} />
          )}
          {activeSection === 'about' && <AboutSection />}
        </div>
      </main>
    </div>
  )
}
