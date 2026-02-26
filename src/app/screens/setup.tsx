import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Plug,
  RefreshCw,
  FolderOpen,
  Check,
  Loader2,
  ChevronDown,
  AlertCircle,
  Download,
} from 'lucide-react'
import { Button } from '@/app/components/ui/button'
import { Badge } from '@/app/components/ui/badge'
import { cn } from '@/app/lib/utils'
import MovesiaLogo from '@/app/assets/Movesia-Logo-Black.svg?react'
import UnityLogo from '@/app/assets/unity-logo.svg?react'

// =============================================================================
// Types
// =============================================================================

interface UnityProject {
  path: string
  name: string
  editorVersion?: string
}

interface PackageStatus {
  installed: boolean
  version?: string
}

type StepStatus = 'pending' | 'active' | 'completed' | 'error'

// =============================================================================
// Project Dropdown
// =============================================================================

function ProjectDropdown({
  projects,
  selected,
  onSelect,
  onBrowse,
  onRefresh,
  loading,
}: {
  projects: UnityProject[]
  selected: UnityProject | null
  onSelect: (p: UnityProject) => void
  onBrowse: () => void
  onRefresh: () => void
  loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={dropdownRef} className='relative'>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm transition-colors cursor-pointer',
          'hover:bg-accent/50',
          open && 'ring-2 ring-ring/20',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className='truncate'>
          {selected ? selected.name : 'Select a Unity project...'}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className='absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg'>
          <div className='max-h-56 overflow-y-auto p-1'>
            {loading ? (
              <div className='flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground'>
                <Loader2 className='size-4 animate-spin' />
                Scanning for projects...
              </div>
            ) : projects.length === 0 ? (
              <div className='py-6 text-center text-sm text-muted-foreground'>
                No Unity projects found.
              </div>
            ) : (
              projects.map((p) => (
                <button
                  key={p.path}
                  onClick={() => {
                    onSelect(p)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors cursor-pointer',
                    'hover:bg-accent',
                    selected?.path === p.path && 'bg-accent',
                  )}
                >
                  <span className='text-sm font-medium text-foreground'>{p.name}</span>
                  <span className='text-xs text-muted-foreground truncate w-full'>
                    {p.editorVersion && (
                      <span className='mr-2'>Unity {p.editorVersion}</span>
                    )}
                    {p.path}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Bottom actions */}
          <div className='border-t p-1 flex gap-1'>
            <button
              onClick={() => {
                onBrowse()
                setOpen(false)
              }}
              className='flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer'
            >
              <FolderOpen className='size-3.5' />
              Browse...
            </button>
            <button
              onClick={() => onRefresh()}
              className='flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer'
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Step Card
// =============================================================================

function StepCard({
  icon: Icon,
  title,
  description,
  status,
  action,
  badge,
  children,
}: {
  icon: React.ElementType
  title: string
  description: string
  status: StepStatus
  action?: React.ReactNode
  badge?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        status === 'completed' && 'border-primary/30 bg-primary/5',
        status === 'active' && 'border-border bg-card',
        status === 'pending' && 'border-border/50 bg-card/50 opacity-60',
        status === 'error' && 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div className='flex items-start gap-3'>
        {/* Icon */}
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            status === 'completed' && 'bg-primary/10 text-primary',
            status === 'active' && 'bg-muted text-foreground',
            status === 'pending' && 'bg-muted text-muted-foreground',
            status === 'error' && 'bg-destructive/10 text-destructive',
          )}
        >
          {status === 'completed' ? (
            <Check className='size-5' />
          ) : (
            <Icon className='size-5' />
          )}
        </div>

        {/* Content */}
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2'>
            <h3 className='text-sm font-semibold text-foreground'>{title}</h3>
            {badge}
          </div>
          <p className='text-xs text-muted-foreground mt-0.5 leading-relaxed'>
            {description}
          </p>
          {children && <div className='mt-3'>{children}</div>}
        </div>

        {/* Action */}
        {action && <div className='shrink-0'>{action}</div>}
      </div>
    </div>
  )
}

// =============================================================================
// Setup Screen
// =============================================================================

export function SetupScreen() {
  const navigate = useNavigate()

  // -- State ----------------------------------------------------------------
  const [projects, setProjects] = useState<UnityProject[]>([])
  const [selectedProject, setSelectedProject] = useState<UnityProject | null>(null)
  const [scanning, setScanning] = useState(true)
  const [browseError, setBrowseError] = useState<string | null>(null)

  const [packageStatus, setPackageStatus] = useState<PackageStatus>({ installed: false })
  const [checkingPackage, setCheckingPackage] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  const [unityRunning, setUnityRunning] = useState(false)
  const [checkingUnity, setCheckingUnity] = useState(false)

  const [wsConnected, setWsConnected] = useState(false)

  // -- Scanning projects ----------------------------------------------------
  const scanProjects = useCallback(async () => {
    setScanning(true)
    setBrowseError(null)
    try {
      const result = await electron.ipcRenderer.invoke('unity:scan-projects')
      setProjects(result ?? [])
    } catch (err) {
      console.error('Failed to scan projects:', err)
    } finally {
      setScanning(false)
    }
  }, [])

  // Scan projects on mount
  useEffect(() => {
    scanProjects()
  }, [])

  // -- Browse for project ---------------------------------------------------
  const browseForProject = useCallback(async () => {
    setBrowseError(null)
    try {
      const result = await electron.ipcRenderer.invoke('unity:browse-project')
      if (!result) return // cancelled
      if (result.error) {
        setBrowseError(result.error)
        return
      }
      if (result.project) {
        // Add to list if not already there
        setProjects((prev) => {
          const exists = prev.some((p) => p.path === result.project.path)
          return exists ? prev : [...prev, result.project]
        })
        setSelectedProject(result.project)
      }
    } catch (err) {
      console.error('Failed to browse for project:', err)
    }
  }, [])

  // -- Set project path on agent service when project changes ---------------
  // This starts the WebSocket server and sets the target project on UnityManager
  useEffect(() => {
    if (!selectedProject) {
      setPackageStatus({ installed: false })
      setUnityRunning(false)
      setWsConnected(false)
      setInstallError(null)
      return
    }

    let cancelled = false

    async function initProject() {
      setCheckingPackage(true)
      setCheckingUnity(true)

      try {
        // Tell the agent service about the selected project.
        // This starts the WebSocket server if not already running
        // and sets the target project on UnityManager.
        await electron.ipcRenderer.invoke('unity:set-project', selectedProject!.path)

        const [pkgResult, runningResult] = await Promise.all([
          electron.ipcRenderer.invoke('unity:check-package', selectedProject!.path),
          electron.ipcRenderer.invoke('unity:check-running', selectedProject!.path),
        ])

        if (!cancelled) {
          setPackageStatus(pkgResult ?? { installed: false })
          setUnityRunning(runningResult ?? false)
        }
      } catch (err) {
        console.error('Failed to initialize project:', err)
      } finally {
        if (!cancelled) {
          setCheckingPackage(false)
          setCheckingUnity(false)
        }
      }
    }

    initProject()
    return () => { cancelled = true }
  }, [selectedProject])

  // -- Poll Unity running + WebSocket connection every 3s -------------------
  useEffect(() => {
    if (!selectedProject) return

    const interval = setInterval(async () => {
      try {
        const [running, status] = await Promise.all([
          electron.ipcRenderer.invoke('unity:check-running', selectedProject.path),
          electron.ipcRenderer.invoke('unity:status'),
        ])
        setUnityRunning(running ?? false)
        setWsConnected(status?.connected ?? false)
      } catch {
        // ignore poll errors
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [selectedProject])

  // -- Install package ------------------------------------------------------
  const handleInstall = useCallback(async () => {
    if (!selectedProject) return
    setInstalling(true)
    setInstallError(null)

    try {
      const result = await electron.ipcRenderer.invoke(
        'unity:install-package',
        selectedProject.path
      )

      if (result?.success) {
        setPackageStatus({ installed: true, version: result.version })
      } else {
        setInstallError(result?.error ?? 'Installation failed.')
      }
    } catch (err) {
      console.error('Failed to install package:', err)
      setInstallError('An unexpected error occurred during installation.')
    } finally {
      setInstalling(false)
    }
  }, [selectedProject])

  // -- Auto-redirect when all checks pass (including WS connection) ---------
  const allDone = selectedProject && packageStatus.installed && unityRunning && wsConnected

  useEffect(() => {
    if (allDone) {
      // Small delay so the user sees all steps completed
      const timeout = setTimeout(() => {
        navigate('/chat')
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [allDone, navigate])

  // -- Step statuses --------------------------------------------------------
  const step1Status: StepStatus = selectedProject ? 'completed' : 'active'

  const step2Status: StepStatus = !selectedProject
    ? 'pending'
    : installing
      ? 'active'
      : installError
        ? 'error'
        : checkingPackage
          ? 'active'
          : packageStatus.installed
            ? 'completed'
            : 'active'

  const step3Status: StepStatus = !selectedProject || !packageStatus.installed
    ? 'pending'
    : checkingUnity
      ? 'active'
      : unityRunning
        ? 'completed'
        : 'active'

  const step4Status: StepStatus =
    !selectedProject || !packageStatus.installed || !unityRunning
      ? 'pending'
      : wsConnected
        ? 'completed'
        : 'active'

  // -- Render ---------------------------------------------------------------
  return (
    <div className='flex h-full items-center justify-center overflow-y-auto'>
      <div className='w-full max-w-lg px-6 py-8'>
        {/* Header */}
        <div className='mb-8 text-center'>
          <h1 className='text-xl font-bold text-foreground'>Set up your project</h1>
          <p className='mt-1.5 text-sm text-muted-foreground'>
            Connect Movesia to your Unity project in a few steps.
          </p>
        </div>

        {/* Steps */}
        <div className='space-y-3'>
          {/* Step 1: Select project */}
          <StepCard
            icon={Box}
            title='Select your Unity project'
            description='Choose a project from Unity Hub or browse for one manually.'
            status={step1Status}
          >
            <ProjectDropdown
              projects={projects}
              selected={selectedProject}
              onSelect={setSelectedProject}
              onBrowse={browseForProject}
              onRefresh={scanProjects}
              loading={scanning}
            />
            {browseError && (
              <div className='mt-2 flex items-center gap-1.5 text-xs text-destructive'>
                <AlertCircle className='size-3.5 shrink-0' />
                {browseError}
              </div>
            )}
          </StepCard>

          {/* Step 2: Install package */}
          <StepCard
            icon={MovesiaLogo}
            title='Install the Movesia package'
            description={
              packageStatus.installed
                ? 'The Movesia Unity package is installed and ready.'
                : 'Install the Movesia package into your Unity project to enable communication.'
            }
            status={step2Status}
            badge={
              packageStatus.installed && packageStatus.version ? (
                <Badge variant='secondary' className='text-[10px] px-1.5 py-0'>
                  v{packageStatus.version}
                </Badge>
              ) : undefined
            }
            action={
              selectedProject && !packageStatus.installed && !installing ? (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleInstall}
                  className='text-xs'
                >
                  <Download className='size-3.5' />
                  Install
                </Button>
              ) : installing ? (
                <Button
                  variant='outline'
                  size='sm'
                  disabled
                  className='text-xs'
                >
                  <Loader2 className='size-3.5 animate-spin' />
                  Installing...
                </Button>
              ) : undefined
            }
          >
            {installError && (
              <div className='flex items-start gap-1.5 text-xs text-destructive'>
                <AlertCircle className='size-3.5 shrink-0 mt-0.5' />
                <span>{installError}</span>
              </div>
            )}
          </StepCard>

          {/* Step 3: Open Unity */}
          <StepCard
            icon={UnityLogo}
            title='Open Unity'
            description={
              unityRunning
                ? 'Unity has your project open. You\'re good to go.'
                : 'Make sure Unity is running with your project open. Movesia needs it to work.'
            }
            status={step3Status}
            action={
              selectedProject && packageStatus.installed && !unityRunning && !checkingUnity ? (
                <Badge variant='outline' className='text-[10px] gap-1'>
                  <span className='size-1.5 rounded-full bg-amber-500 animate-pulse' />
                  Waiting
                </Badge>
              ) : selectedProject && packageStatus.installed && unityRunning ? (
                <Badge variant='outline' className='text-[10px] gap-1 border-green-500/30 text-green-600'>
                  <span className='size-1.5 rounded-full bg-green-500' />
                  Running
                </Badge>
              ) : undefined
            }
          />

          {/* Step 4: Connect to Unity */}
          <StepCard
            icon={Plug}
            title='Connect to Unity'
            description={
              wsConnected
                ? 'Movesia is connected to the Unity Editor. You\'re all set!'
                : 'Waiting for Unity to connect. If you just installed the package, focus the Unity Editor so it compiles the new scripts.'
            }
            status={step4Status}
            action={
              selectedProject && packageStatus.installed && unityRunning && !wsConnected ? (
                <Badge variant='outline' className='text-[10px] gap-1'>
                  <span className='size-1.5 rounded-full bg-amber-500 animate-pulse' />
                  Waiting
                </Badge>
              ) : wsConnected ? (
                <Badge variant='outline' className='text-[10px] gap-1 border-primary/30 text-primary'>
                  <span className='size-1.5 rounded-full bg-primary' />
                  Connected
                </Badge>
              ) : undefined
            }
          />
        </div>

      </div>
    </div>
  )
}
