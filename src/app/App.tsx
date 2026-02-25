import { useState, useCallback } from 'react';
import { ThemeProvider } from '@/app/components/theme-provider';
import { TooltipProvider } from '@/app/components/ui/tooltip';
import { SidebarProvider, SidebarInset } from '@/app/components/ui/sidebar';
import { AppSidebar } from '@/app/components/app-sidebar';
import type { UserProfile } from '@/app/components/app-sidebar';
import Titlebar from '@/app/components/titlebar';
import { useRendererListener } from '@/app/hooks';
import { ChatScreen } from '@/app/screens/chat';
import { MenuChannels } from '@/channels/menuChannels';
import type { Thread } from '@/app/lib/types/chat';

import { Route, HashRouter as Router, Routes } from 'react-router-dom';

const onMenuEvent = (_: Electron.IpcRendererEvent, channel: string, ...args: unknown[]) => {
  electron.ipcRenderer.invoke(channel, args);
};

// Mock user for development — will be replaced with auth state
const MOCK_USER: UserProfile = {
  name: 'John Doe',
  email: 'john@movesia.dev',
};

// Mock threads for development — will be replaced with IPC-backed data
const INITIAL_THREADS: Thread[] = [
  // Today
  { id: '1', title: 'Show me the scene hierarchy for the main dungeon level', createdAt: new Date(), messageCount: 4, projectName: 'Dungeon Crawler', projectVersion: '6000.0.32f1' },
  { id: '2', title: 'Create player movement script with wall sliding', createdAt: new Date(Date.now() - 1800000), messageCount: 6, projectName: 'Dungeon Crawler', projectVersion: '6000.0.32f1' },
  { id: '3', title: 'Implement shadcn sidebar component for the app', createdAt: new Date(Date.now() - 3600000), messageCount: 12, projectName: 'Movesia', projectVersion: '6000.0.32f1' },
  { id: '4', title: 'Fix sidebar component dependency issues and rebuild', createdAt: new Date(Date.now() - 7200000), messageCount: 8, projectName: 'Movesia', projectVersion: '6000.0.32f1' },
  { id: '5', title: 'Analyze app and review chat UI settings panel', createdAt: new Date(Date.now() - 10800000), messageCount: 5, projectName: 'Dungeon Crawler', projectVersion: '6000.0.32f1' },
  // Yesterday
  { id: '6', title: 'Fix missing references in EnemySpawner prefab', createdAt: new Date(Date.now() - 86400000), messageCount: 3, projectName: 'Space Shooter', projectVersion: '6000.0.28f1' },
  { id: '7', title: 'Set up ProBuilder for level design workflow', createdAt: new Date(Date.now() - 90000000), messageCount: 9, projectName: 'Dungeon Crawler', projectVersion: '6000.0.32f1' },
  { id: '8', title: 'Debug physics collisions on moving platforms', createdAt: new Date(Date.now() - 100000000), messageCount: 15, projectName: 'Space Shooter', projectVersion: '6000.0.28f1' },
  { id: '9', title: 'Create enemy AI patrol system with waypoints', createdAt: new Date(Date.now() - 110000000), messageCount: 11, projectName: 'Dungeon Crawler', projectVersion: '6000.0.32f1' },
  // Older
  { id: '10', title: 'Analyze project build size and optimize textures', createdAt: new Date(Date.now() - 172800000), messageCount: 2, projectName: 'Space Shooter', projectVersion: '6000.0.28f1' },
  { id: '11', title: 'Configure post-processing volume for underwater scene', createdAt: new Date(Date.now() - 259200000), messageCount: 7, projectName: 'Ocean Explorer', projectVersion: '6000.0.30f1' },
  { id: '12', title: 'Add inventory system with drag and drop UI', createdAt: new Date(Date.now() - 345600000), messageCount: 20, projectName: 'Dungeon Crawler', projectVersion: '6000.0.32f1' },
  { id: '13', title: 'Set up multiplayer networking with Unity Transport', createdAt: new Date(Date.now() - 432000000), messageCount: 14, projectName: 'Space Shooter', projectVersion: '6000.0.28f1' },
  { id: '14', title: 'Optimize shader performance for mobile build target', createdAt: new Date(Date.now() - 518400000), messageCount: 6, projectName: 'Ocean Explorer', projectVersion: '6000.0.30f1' },
  { id: '15', title: 'Create save and load system with JSON serialization', createdAt: new Date(Date.now() - 604800000), messageCount: 10, projectName: 'Dungeon Crawler', projectVersion: '6000.0.32f1' },
];

export default function App () {
  useRendererListener(MenuChannels.MENU_EVENT, onMenuEvent);

  const [threads, setThreads] = useState<Thread[]>(INITIAL_THREADS);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>('1');

  const handleNewThread = useCallback(() => {
    const newThread: Thread = {
      id: `thread-${Date.now()}`,
      title: 'New Chat',
      createdAt: new Date(),
      messageCount: 0,
    };
    setThreads((prev) => [newThread, ...prev]);
    setCurrentThreadId(newThread.id);
  }, []);

  const handleDeleteThread = useCallback((threadId: string) => {
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
    setCurrentThreadId((prev) => (prev === threadId ? null : prev));
  }, []);

  return (
    <ThemeProvider defaultTheme='light' storageKey='movesia-theme'>
      <TooltipProvider>
        <Router>
          <SidebarProvider defaultOpen={false} className='flex-col h-full min-h-0'>
            <Titlebar />
            <div className='min-h-0 flex-1 flex'>
              <AppSidebar
                threads={threads}
                currentThreadId={currentThreadId}
                user={MOCK_USER}
                onSelectThread={setCurrentThreadId}
                onNewThread={handleNewThread}
                onDeleteThread={handleDeleteThread}
              />
              <SidebarInset>
                <Routes>
                  <Route path='/' Component={ChatScreen} />
                </Routes>
              </SidebarInset>
            </div>
          </SidebarProvider>
        </Router>
      </TooltipProvider>
    </ThemeProvider>
  );
}
