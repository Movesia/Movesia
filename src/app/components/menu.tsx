import { useEventListener } from '@/app/hooks';
import { MenuChannels } from '@/channels/menuChannels';
import { fixAcceleratorText } from '@/menu/accelerators';
import menuGroups from '@/menu/appMenu';
import appLogo from '@/app/assets/Movesia-Logo-Black.svg';

import { useRef } from 'react';
import { Menu as MenuIcon, ChevronRight } from 'lucide-react';

import type React from 'react';
import type { MenuItemWithUrl } from '@/menu/appMenu';

export default function Menu () {
  const popupRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEventListener('keydown', (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.altKey) closeMenu();
  });

  useEventListener('mousedown', (event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      closeMenu();
    }
  });

  const toggleMenu = (e: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    if (popupRef.current?.classList.contains('active')) {
      closeMenu();
    } else {
      popupRef.current?.classList.add('active');
      containerRef.current?.classList.add('active');
    }
  };

  const closeMenu = () => {
    popupRef.current?.classList.remove('active');
    containerRef.current?.classList.remove('active');
  };

  const handleAction = (menuItem: MenuItemWithUrl) => {
    closeMenu();
    const actionId = menuItem.id;
    if (actionId) {
      if (actionId === MenuChannels.OPEN_URL && menuItem.url) {
        return electron.ipcRenderer.invoke(MenuChannels.OPEN_URL, menuItem.url);
      }
      return electron.ipcRenderer.invoke(actionId);
    }
  };

  const renderItemAccelerator = (menuItem: Electron.MenuItemConstructorOptions) => {
    if (menuItem.id === MenuChannels.WEB_ZOOM_IN) {
      const firstKey = __DARWIN__ ? '⌘' : 'Ctrl';
      const plus = __DARWIN__ ? '' : '+';
      const thirdKey = '+';
      return `${firstKey}${plus}${thirdKey}`;
    }

    if (menuItem.accelerator) {
      return fixAcceleratorText(menuItem.accelerator);
    }
  };

  return (
    <section className='window-titlebar-menu'>
      {/* App logo */}
      <section className='window-titlebar-icon'>
        <img src={appLogo} alt='App logo' />
      </section>

      <div className='menu-item' ref={containerRef}>
        <button
          className='menu-title'
          type='button'
          tabIndex={0}
          onClick={toggleMenu}
          onKeyDown={toggleMenu}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <MenuIcon className='w-4 h-4' />
        </button>
        <div className='menu-popup' ref={popupRef}>
          {menuGroups.map((group) => (
            <div key={group.label} className='submenu-parent'>
              <div className='menu-popup-item submenu-trigger'>
                <div className='popup-item-name'>{group.label}</div>
                <ChevronRight className='w-3 h-3 text-muted-foreground' />
              </div>
              <div className='submenu-popup'>
                {group.items.map((menuItem, itemIndex) => {
                  if (menuItem.type === 'separator') {
                    return <div key={`${group.label}_sep_${itemIndex}`} className='popup-item-separator' />;
                  }

                  return (
                    <button
                      key={`${group.label}_item_${itemIndex}`}
                      className='menu-popup-item'
                      onMouseDown={(e) => e.preventDefault()}
                      onKeyDown={(e) => e.preventDefault()}
                      type='button'
                      tabIndex={0}
                      onClick={() => handleAction(menuItem)}
                    >
                      <div className='popup-item-name'>{menuItem.label}</div>
                      <div className='popup-item-shortcut'>{renderItemAccelerator(menuItem)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
