import { ThemeProvider } from '@/app/components/theme-provider';
import { TooltipProvider } from '@/app/components/ui/tooltip';
import Titlebar from '@/app/components/titlebar';
import { useRendererListener } from '@/app/hooks';
import { ChatScreen } from '@/app/screens/chat';
import { MenuChannels } from '@/channels/menuChannels';

import { Route, HashRouter as Router, Routes } from 'react-router-dom';

const onMenuEvent = (_: Electron.IpcRendererEvent, channel: string, ...args: unknown[]) => {
  electron.ipcRenderer.invoke(channel, args);
};

export default function App () {
  useRendererListener(MenuChannels.MENU_EVENT, onMenuEvent);

  return (
    <ThemeProvider defaultTheme='light' storageKey='movesia-theme'>
      <TooltipProvider>
        <Router>
          <div className='flex flex-col h-full'>
            <Titlebar />
            <main className='flex-1 overflow-hidden'>
              <Routes>
                <Route path='/' Component={ChatScreen} />
              </Routes>
            </main>
          </div>
        </Router>
      </TooltipProvider>
    </ThemeProvider>
  );
}
