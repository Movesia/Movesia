import { MenuChannels } from '@/channels/menuChannels';

const MenuItems: Electron.MenuItemConstructorOptions[] = [
  {
    label: 'Menu',
    submenu: [
      {
        id: MenuChannels.WEB_ACTUAL_SIZE,
        label: 'Reset Zoom',
        role: 'resetZoom',
        accelerator: 'CmdOrCtrl+0',
      },
      {
        id: MenuChannels.WEB_ZOOM_IN,
        label: 'Zoom In',
        role: 'zoomIn',
      },
      {
        id: MenuChannels.WEB_ZOOM_OUT,
        label: 'Zoom Out',
        role: 'zoomOut',
        accelerator: 'CmdOrCtrl+-',
      },
      {
        type: 'separator',
      },
      {
        id: MenuChannels.WEB_TOGGLE_FULLSCREEN,
        label: 'Toggle Full Screen',
        role: 'togglefullscreen',
      },
      {
        type: 'separator',
      },
      {
        id: MenuChannels.WEB_TOGGLE_DEVTOOLS,
        label: 'Toggle Developer Tools',
        role: 'toggleDevTools',
        accelerator: 'CmdOrCtrl+Shift+I',
      },
      {
        type: 'separator',
      },
      {
        id: MenuChannels.WINDOW_CLOSE,
        label: 'Exit',
        role: 'quit',
        accelerator: 'CmdOrCtrl+Q',
      },
    ],
  },
];

export default MenuItems;
