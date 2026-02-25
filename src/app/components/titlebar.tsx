import { useRendererListener } from '@/app/hooks';
import { MenuChannels } from '@/channels/menuChannels';
import { SidebarTrigger } from '@/app/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/app/components/ui/tooltip';

import { useState } from 'react';

import Menu from './menu';
import WindowControls from './window-controls';

import type { WindowState } from '@/windowState';

const handleDoubleClick = () => {
  electron.ipcRenderer.invoke(MenuChannels.WINDOW_TOGGLE_MAXIMIZE);
};

export default function Titlebar () {
  const [windowState, setWindowState] = useState<WindowState>('normal');

  useRendererListener('window-state-changed', (_, windowState: WindowState) => setWindowState(windowState));

  // Hide titlebar in full screen mode on macOS
  if (windowState === 'full-screen' && __DARWIN__) {
    return null;
  }

  return (
    <div onDoubleClick={handleDoubleClick} className='window-titlebar'>
      {__WIN32__ && (
        <>
          <Menu />
          <section className='flex items-center px-2.5' style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className='size-4' />
              </TooltipTrigger>
              <TooltipContent side='bottom'>
                <p>Toggle Sidebar <kbd className='ml-1 text-[10px] opacity-60'>Ctrl+B</kbd></p>
              </TooltipContent>
            </Tooltip>
          </section>
          <WindowControls windowState={windowState} />
        </>
      )}
    </div>
  );
}
