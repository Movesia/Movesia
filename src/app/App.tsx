import { useCallback, useEffect } from 'react';
import { ThemeProvider } from '@/app/components/theme-provider';
import { TooltipProvider } from '@/app/components/ui/tooltip';
import { SidebarProvider, SidebarInset } from '@/app/components/ui/sidebar';
import { AppSidebar } from '@/app/components/app-sidebar';
import type { UserProfile } from '@/app/components/app-sidebar';
import Titlebar from '@/app/components/titlebar';
import { useRendererListener } from '@/app/hooks';
import { ChatScreen } from '@/app/screens/chat';
import { SettingsScreen } from '@/app/screens/settings';
import { MenuChannels } from '@/channels/menuChannels';
import { useThreads } from '@/app/hooks/useThreads';
import { useChatState } from '@/app/hooks/useChatState';
import type { ChatMessage } from '@/app/hooks/useChatState';

import { Route, HashRouter as Router, Routes, useNavigate } from 'react-router-dom';

const onMenuEvent = (_: Electron.IpcRendererEvent, channel: string, ...args: unknown[]) => {
  electron.ipcRenderer.invoke(channel, args);
};

// Mock user for development — will be replaced with auth state
const MOCK_USER: UserProfile = {
  name: 'John Doe',
  email: 'john@movesia.dev',
};

function AppShell () {
  const navigate = useNavigate();
  useRendererListener(MenuChannels.MENU_EVENT, onMenuEvent);

  // Thread management (database-backed)
  const {
    threads,
    currentThreadId,
    setCurrentThreadId,
    createThread,
    deleteThread,
    loadThreadMessages,
    refreshThreads,
  } = useThreads();

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

  // Refresh thread list when a chat stream completes (to pick up auto-generated title)
  useEffect(() => {
    if (chatState.status === 'ready' && chatState.threadId) {
      refreshThreads();
    }
  }, [chatState.status, chatState.threadId, refreshThreads]);

  const handleSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  return (
    <SidebarProvider defaultOpen={false} className='flex-col h-full min-h-0'>
      <Titlebar />
      <div className='min-h-0 flex-1 flex'>
        <AppSidebar
          threads={threads}
          currentThreadId={currentThreadId}
          user={MOCK_USER}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
          onDeleteThread={handleDeleteThread}
          onSettings={handleSettings}
        />
        <SidebarInset>
          <Routes>
            <Route
              path='/'
              element={
                <ChatScreen
                  messages={chatState.messages}
                  isLoading={chatState.isLoading}
                  status={chatState.status}
                  error={chatState.error}
                  onSendMessage={chatState.sendMessage}
                />
              }
            />
            <Route path='/settings' Component={SettingsScreen} />
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
      </TooltipProvider>
    </ThemeProvider>
  );
}
