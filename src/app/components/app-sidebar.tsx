import { useState, useMemo, useRef, useCallback } from 'react'
import {
  Plus,
  Search,
  Trash2,
  ChevronsUpDown,
  Settings,
  LogOut,
  User,
  ArrowLeftRight,
  // Bug,
  ArrowUpCircle,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/app/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip'
import { useLocation } from 'react-router-dom'
import type { Thread } from '@/app/lib/types/chat'

// =============================================================================
// Types
// =============================================================================

export interface UserProfile {
  name: string
  email: string
  avatar?: string
}

interface AppSidebarProps {
  threads: Thread[]
  currentThreadId: string | null
  user: UserProfile
  onSelectThread: (threadId: string) => void
  onNewThread: () => void
  onDeleteThread: (threadId: string) => void
  onSettings?: () => void
  onProfile?: () => void
  onSignOut?: () => void
  onSwitchProject?: () => void
  onDebug?: () => void
  onUpgradePlan?: () => void
}

// =============================================================================
// Helpers
// =============================================================================

function formatRelativeTime (date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function groupThreads (threads: Thread[]) {
  const today: Thread[] = []
  const yesterday: Thread[] = []
  const older: Thread[] = []

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)

  threads.forEach((thread) => {
    if (thread.createdAt >= todayStart) {
      today.push(thread)
    } else if (thread.createdAt >= yesterdayStart) {
      yesterday.push(thread)
    } else {
      older.push(thread)
    }
  })

  return { today, yesterday, older }
}

// =============================================================================
// ThreadMenuItem
// =============================================================================

function ThreadMenuItem ({
  thread,
  isActive,
  onSelect,
  onDelete,
}: {
  thread: Thread
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const titleRef = useRef<HTMLSpanElement>(null)

  const handleMouseEnter = useCallback(() => {
    const el = titleRef.current
    if (!el) return
    const overflow = el.scrollWidth - el.clientWidth
    if (overflow > 0) {
      el.style.setProperty('--scroll-distance', `-${overflow}px`)
      el.classList.add('is-overflowing')
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    const el = titleRef.current
    if (!el) return
    const inner = el.querySelector('.thread-title-inner') as HTMLElement | null
    if (!inner) { el.classList.remove('is-overflowing'); return }

    // Get current animated position and freeze it there
    const computed = getComputedStyle(inner)
    const currentTransform = computed.transform // matrix(...)
    inner.style.animation = 'none'
    inner.style.transform = currentTransform

    // Force reflow then animate back to start
    void inner.offsetWidth
    inner.style.transition = 'transform 0.4s ease-out'
    inner.style.transform = 'translateX(0)'

    const cleanup = () => {
      inner.style.animation = ''
      inner.style.transform = ''
      inner.style.transition = ''
      el.classList.remove('is-overflowing')
      inner.removeEventListener('transitionend', cleanup)
    }
    inner.addEventListener('transitionend', cleanup)
  }, [])

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={onSelect}
        isActive={isActive}
        tooltip={thread.title}
        size='lg'
        className='h-auto py-2 cursor-pointer group/thread'
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className='grid flex-1 text-left leading-tight min-w-0'>
          <span ref={titleRef} className='overflow-hidden whitespace-nowrap text-sm font-medium fade-text'>
            <span className='inline-block thread-title-inner'>{thread.title}</span>
          </span>
          <span className='overflow-hidden whitespace-nowrap text-[11px] text-sidebar-foreground/50 mt-1'>
            {thread.messageCount > 0 && `${thread.messageCount} msg${thread.messageCount !== 1 ? 's' : ''}`}
            {thread.projectName && <>{thread.messageCount > 0 && <span className='mx-1 opacity-40'>·</span>}{thread.projectName}</>}
            {(thread.messageCount > 0 || thread.projectName) && <span className='mx-1 opacity-40'>·</span>}{formatRelativeTime(thread.updatedAt)}
          </span>
        </div>
      </SidebarMenuButton>
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <SidebarMenuAction
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            showOnHover
            className='!top-1/2 !-translate-y-1/2 size-6 rounded-full bg-sidebar-accent hover:bg-sidebar-accent-foreground/10 hover:text-sidebar-accent-foreground flex items-center justify-center cursor-pointer transition-colors duration-300'
          >
            <Trash2 className='size-3' />
            <span className='sr-only'>Delete</span>
          </SidebarMenuAction>
        </TooltipTrigger>
        <TooltipContent side='bottom'>
          <p>Delete</p>
        </TooltipContent>
      </Tooltip>
    </SidebarMenuItem>
  )
}

// =============================================================================
// ThreadGroup
// =============================================================================

function ThreadGroup ({
  label,
  threads,
  currentThreadId,
  onSelectThread,
  onDeleteThread,
}: {
  label: string
  threads: Thread[]
  currentThreadId: string | null
  onSelectThread: (threadId: string) => void
  onDeleteThread: (threadId: string) => void
}) {
  if (threads.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {threads.map((thread) => (
            <ThreadMenuItem
              key={thread.id}
              thread={thread}
              isActive={thread.id === currentThreadId}
              onSelect={() => onSelectThread(thread.id)}
              onDelete={() => onDeleteThread(thread.id)}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// =============================================================================
// AppSidebar
// =============================================================================

export function AppSidebar ({
  threads,
  currentThreadId,
  user,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onSettings,
  onProfile,
  onSignOut,
  onSwitchProject,
  onDebug,
  onUpgradePlan,
}: AppSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const { state: sidebarState, isMobile } = useSidebar()
  const pathname = useLocation().pathname
  const isSignInScreen = pathname === '/'
  const isSetupScreen = pathname === '/setup'

  const userInitials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads
    const query = searchQuery.toLowerCase()
    return threads.filter((t) => t.title.toLowerCase().includes(query))
  }, [threads, searchQuery])

  const grouped = useMemo(() => groupThreads(filteredThreads), [filteredThreads])

  const hasThreads = filteredThreads.length > 0

  if (isSignInScreen) return null

  return (
    <Sidebar collapsible='icon'>
      <SidebarHeader>
        <SidebarMenu>
          {/* Sidebar toggle — always visible (icon when collapsed) */}
          <SidebarMenuItem className='flex justify-end mb-2'>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className='size-7 cursor-pointer' />
              </TooltipTrigger>
              <TooltipContent side='right'>
                <p>Toggle Sidebar <kbd className='ml-1 text-[10px] opacity-60'>Ctrl+B</kbd></p>
              </TooltipContent>
            </Tooltip>
          </SidebarMenuItem>

          {/* New Chat — always visible (icon when collapsed) */}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onNewThread} tooltip='New Chat' className='cursor-pointer'>
              <Plus className='shrink-0' />
              <span>New Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Switch Project — only when expanded */}
          {sidebarState === 'expanded' && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={onSwitchProject} tooltip='Switch Project' className='cursor-pointer'>
                <ArrowLeftRight className='shrink-0' />
                <span>Switch Project</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>

        {/* Search (hidden when collapsed to icons) */}
        {sidebarState === 'expanded' && (
          <div className='px-2 pb-1'>
            <div className='flex items-center gap-2 px-2 py-1.5 rounded-md bg-sidebar-accent/50 border border-sidebar-border/50'>
              <Search className='w-3.5 h-3.5 text-sidebar-foreground/50 shrink-0' />
              <input
                type='text'
                placeholder='Search...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className='flex-1 bg-transparent text-xs outline-none placeholder:text-sidebar-foreground/40 text-sidebar-foreground'
              />
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        {sidebarState === 'expanded' && isSetupScreen ? (
          <div className='flex flex-1 items-center justify-center px-4'>
            <p className='text-xs text-sidebar-foreground/50'>Select a project</p>
          </div>
        ) : sidebarState === 'expanded' ? (
          <>
            <ThreadGroup
              label='Today'
              threads={grouped.today}
              currentThreadId={currentThreadId}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
            />
            <ThreadGroup
              label='Yesterday'
              threads={grouped.yesterday}
              currentThreadId={currentThreadId}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
            />
            <ThreadGroup
              label='Older'
              threads={grouped.older}
              currentThreadId={currentThreadId}
              onSelectThread={onSelectThread}
              onDeleteThread={onDeleteThread}
            />

            {/* Empty state */}
            {!hasThreads && (
              <div className='px-4 py-6 text-center'>
                <p className='text-xs text-sidebar-foreground/50'>
                  {searchQuery ? 'No matching sessions' : 'No previous sessions'}
                </p>
              </div>
            )}
          </>
        ) : null}
      </SidebarContent>

      <SidebarFooter className='border-t border-sidebar-border'>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size='lg'
                  tooltip={user.name}
                  className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground outline-none ring-0 focus-visible:ring-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:!p-0'
                >
                  <Avatar size='sm' className='group-data-[collapsible=icon]:size-7'>
                    {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                    <AvatarFallback className='text-[10px] group-data-[collapsible=icon]:text-xs'>{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className='grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden'>
                    <span className='truncate font-medium'>{user.name}</span>
                    <span className='truncate text-xs text-sidebar-foreground/60'>{user.email}</span>
                  </div>
                  <ChevronsUpDown className='ml-auto size-4 group-data-[collapsible=icon]:hidden' />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className='w-[--radix-dropdown-menu-trigger-width] min-w-56'
                side={isMobile ? 'bottom' : 'right'}
                align='end'
                sideOffset={4}
              >
                <DropdownMenuLabel className='font-normal'>
                  <div className='flex items-center gap-2 px-1 py-0.5 text-left text-sm'>
                    <Avatar size='sm'>
                      {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                      <AvatarFallback className='text-[10px]'>{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className='grid flex-1 text-left text-sm leading-tight'>
                      <span className='truncate font-medium'>{user.name}</span>
                      <span className='truncate text-xs text-muted-foreground'>{user.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onProfile} className='cursor-pointer'>
                    <User />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onSettings} className='cursor-pointer'>
                    <Settings />
                    Settings
                  </DropdownMenuItem>
                  {/* {__DEV__ && onDebug && (
                    <DropdownMenuItem onClick={onDebug} className='cursor-pointer'>
                      <Bug />
                      UI Debugger
                    </DropdownMenuItem>
                  )} */}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={onUpgradePlan} className='cursor-pointer'>
                    <ArrowUpCircle />
                    Upgrade Plan
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className='cursor-pointer'>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
