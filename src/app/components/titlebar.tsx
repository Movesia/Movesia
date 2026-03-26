import { useRendererListener } from '@/app/hooks';
import { MenuChannels } from '@/channels/menuChannels';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { UnityStatusIndicator, statusTooltip } from '@/app/components/chat/UnityStatusIndicator';
import type { UnityStatus } from '@/app/hooks/useUnityStatus';
import { cn } from '@/app/lib/utils';
import { ArrowLeftRight } from 'lucide-react';

import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import Menu from './menu';
import WindowControls from './window-controls';

import type { WindowState } from '@/windowState';

const handleDoubleClick = () => {
  electron.ipcRenderer.invoke(MenuChannels.WINDOW_TOGGLE_MAXIMIZE);
};

interface TitlebarProps {
  unityStatus: UnityStatus
  onSwitchProject: () => void
}

export default function Titlebar ({ unityStatus, onSwitchProject }: TitlebarProps) {
  const [windowState, setWindowState] = useState<WindowState>('normal');
  const location = useLocation();
  const isSignInScreen = location.pathname === '/';
  const isSetupScreen = location.pathname === '/setup';

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

          {/* Unity connection indicator with dropdown — hidden on setup screen */}
          {!isSetupScreen && !isSignInScreen && (
            <div
              className='absolute right-[138px] top-0 bottom-0 flex items-center'
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className='outline-none'>
                    <UnityStatusIndicator
                      connectionState={unityStatus.connectionState}
                      projectName={unityStatus.projectName}
                      className='cursor-pointer'
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' sideOffset={4} className='w-56'>
                  <DropdownMenuLabel className='font-normal'>
                    <div className='flex items-center gap-2'>
                      <span className={cn(
                        'size-2 rounded-full shrink-0',
                        unityStatus.connectionState === 'connected' && 'bg-green-500',
                        unityStatus.connectionState === 'compiling' && 'bg-yellow-500 animate-pulse',
                        (unityStatus.connectionState === 'disconnected' || unityStatus.connectionState === 'error') && 'bg-red-500',
                      )} />
                      <div className='grid flex-1 text-left leading-tight'>
                        <span className='text-sm font-medium truncate'>
                          {unityStatus.projectName ?? 'No project'}
                        </span>
                        <span className='text-xs text-muted-foreground'>
                          {statusTooltip[unityStatus.connectionState]}
                        </span>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onSwitchProject} className='cursor-pointer'>
                    <ArrowLeftRight className='size-4' />
                    Switch Project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <WindowControls windowState={windowState} />
        </>
      )}
    </div>
  );
}
