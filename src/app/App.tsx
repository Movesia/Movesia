import { useCallback, useEffect } from 'react';
import { ThemeProvider } from '@/app/components/theme-provider';
import { TooltipProvider } from '@/app/components/ui/tooltip';
import { SidebarProvider, SidebarInset } from '@/app/components/ui/sidebar';
import { AppSidebar } from '@/app/components/app-sidebar';
import type { UserProfile } from '@/app/components/app-sidebar';
import Titlebar from '@/app/components/titlebar';
import { AppContextMenu } from '@/app/components/context-menu';
import { useRendererListener, useUnityStatus, useAuthState } from '@/app/hooks';
import { ChatScreen } from '@/app/screens/chat';
import { SettingsScreen } from '@/app/screens/settings';
import { SetupScreen } from '@/app/screens/setup';
import { SignInScreen } from '@/app/screens/signIn';
// import { UIDebuggerScreen } from '@/app/screens/ui-debugger';
import { MenuChannels } from '@/channels/menuChannels';
import { useThreads } from '@/app/hooks/useThreads';
import { useChatState } from '@/app/hooks/useChatState';
import type { ChatMessage } from '@/app/hooks/useChatState';
import { useSubscription } from '@/app/hooks/useSubscription';

import { Route, HashRouter as Router, Routes, useNavigate, useLocation } from 'react-router-dom';

const onMenuEvent = (_: Electron.IpcRendererEvent, channel: string, ...args: unknown[]) => {
  electron.ipcRenderer.invoke(channel, args);
};

function AppShell () {
  const navigate = useNavigate();
  const location = useLocation();
  useRendererListener(MenuChannels.MENU_EVENT, onMenuEvent);

  // Auth state (replaces MOCK_USER)
  const { isAuthenticated, user, isLoading: authLoading, signOut } = useAuthState();

  // Route protection — short-circuit while auth state is loading
  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated && location.pathname !== '/') {
      navigate('/', { replace: true });
    }

    if (isAuthenticated && location.pathname === '/') {
      navigate('/setup', { replace: true });
    }
  }, [isAuthenticated, authLoading, location.pathname, navigate]);

  // Build user profile from auth state for sidebar
  const userProfile: UserProfile = user
    ? {
        name: user.name || user.email || 'User',
        email: user.email || '',
        avatar: user.picture,
      }
    : { name: 'User', email: '' };

  // Shared Unity connection status (polled every 3s)
  const unityStatus = useUnityStatus();

  // Thread management (database-backed, filtered by active project)
  const {
    threads,
    currentThreadId,
    setCurrentThreadId,
    createThread,
    deleteThread,
    loadThreadMessages,
    refreshThreads,
  } = useThreads(unityStatus.projectPath);

  // Chat state (IPC-backed streaming)
  const chatState = useChatState();

  // Sync thread selection with chat state
  const handleSelectThread = useCallback(
    async (threadId: string) => {
      setCurrentThreadId(threadId);
      chatState.setThreadId(threadId);

      try {
        const dbMessages = await loadThreadMessages(threadId);
        if (Array.isArray(dbMessages)) {
          const mapped: ChatMessage[] = dbMessages.map((m, i) => ({
            id: `loaded_${i}_${Date.now()}`,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            // Reconstruct toolParts from saved tool_calls (if present)
            toolParts: m.tool_calls?.map((tc: { id: string; name: string; input: unknown; output: unknown }) => ({
              type: tc.name,
              state: 'complete' as const,
              toolCallId: tc.id,
              input: tc.input as Record<string, unknown> | undefined,
              output: tc.output as Record<string, unknown> | undefined,
            })),
          }));
          chatState.setMessages(mapped);
        }
      } catch (err) {
        console.error('[App] Failed to load thread messages:', err);
        chatState.setMessages([]);
      }
    },
    [setCurrentThreadId, chatState, loadThreadMessages]
  );

  const handleNewThread = useCallback(() => {
    const newId = createThread();
    chatState.setThreadId(newId);
    chatState.setMessages([]);
  }, [createThread, chatState]);

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      await deleteThread(threadId);
      if (currentThreadId === threadId) {
        chatState.setThreadId(null);
        chatState.setMessages([]);
      }
    },
    [deleteThread, currentThreadId, chatState]
  );

  // Subscription quota (auto-refresh after chat completes or errors)
  const { refresh: refreshQuota } = useSubscription();

  // Refresh thread list + quota when a chat stream completes
  useEffect(() => {
    if (chatState.status === 'ready' && chatState.threadId) {
      refreshThreads();
      refreshQuota();
    }
  }, [chatState.status, chatState.threadId, refreshThreads, refreshQuota]);

  // Refresh quota on chat errors (to catch 402 quota exceeded)
  useEffect(() => {
    if (chatState.status === 'error') {
      refreshQuota();
    }
  }, [chatState.status, refreshQuota]);

  // Clear stale chat state when the active project changes
  useEffect(() => {
    chatState.setThreadId(null);
    chatState.setMessages([]);
    setCurrentThreadId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unityStatus.projectPath]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const handleSwitchProject = useCallback(() => {
    navigate('/setup');
  }, [navigate]);

  const handleDebug = useCallback(() => {
    navigate('/debug');
  }, [navigate]);

  const handleUpgradePlan = useCallback(() => {
    electron.ipcRenderer.invoke('open-url', 'https://movesia.com/pricing');
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      navigate('/', { replace: true });
    } catch (err) {
      console.error('[App] Sign-out failed:', err);
    }
  }, [signOut, navigate]);

  // Show loading spinner while auth state is resolving (prevents flash of wrong route)
  if (authLoading) {
    return (
      <div className='flex h-full items-center justify-center'>
        <div className='h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent' />
      </div>
    );
  }

  return (
    <SidebarProvider defaultOpen={false} className='flex-col h-full min-h-0'>
      <Titlebar unityStatus={unityStatus} onSwitchProject={handleSwitchProject} />
      <div className='min-h-0 flex-1 flex'>
        <AppSidebar
          threads={threads}
          currentThreadId={currentThreadId}
          user={userProfile}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
          onDeleteThread={handleDeleteThread}
          onSettings={handleSettings}
          onSwitchProject={handleSwitchProject}
          onSignOut={handleSignOut}
          onDebug={__DEV__ ? handleDebug : undefined}
          onUpgradePlan={handleUpgradePlan}
        />
        <SidebarInset>
          <Routes>
            <Route path='/' Component={SignInScreen} />
            <Route path='/setup' Component={SetupScreen} />
            <Route
              path='/chat'
              element={
                <ChatScreen
                  messages={chatState.messages}
                  isLoading={chatState.isLoading}
                  status={chatState.status}
                  error={chatState.error}
                  onSendMessage={chatState.sendMessage}
                  onStop={chatState.stop}
                  onApproveAll={chatState.approveAllTools}
                  onRejectAll={chatState.rejectAllTools}
                />
              }
            />
            <Route path='/settings' Component={SettingsScreen} />
            {/* {__DEV__ && <Route path='/debug' Component={UIDebuggerScreen} />} */}
          </Routes>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default function App () {
  return (
    <ThemeProvider defaultTheme='light' storageKey='movesia-theme'>
      <TooltipProvider>
        <Router>
          <AppShell />
        </Router>
        <AppContextMenu />
      </TooltipProvider>
    </ThemeProvider>
  );
}
