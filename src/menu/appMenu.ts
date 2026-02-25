import { MenuChannels } from '@/channels/menuChannels';

export type MenuItemWithUrl = Electron.MenuItemConstructorOptions & { url?: string };

export interface MenuGroup {
  label: string;
  items: MenuItemWithUrl[];
}

const MenuGroups: MenuGroup[] = [
  {
    label: 'File',
    items: [
      {
        id: MenuChannels.WINDOW_CLOSE,
        label: 'Exit',
        role: 'quit',
        accelerator: 'CmdOrCtrl+Q',
      },
    ],
  },
  {
    label: 'View',
    items: [
      {
        id: MenuChannels.WEB_ACTUAL_SIZE,
        label: 'Actual Size',
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
    ],
  },
  {
    label: 'Help',
    items: [
      {
        id: MenuChannels.OPEN_URL,
        label: 'Documentation',
        url: 'https://movesia.com/docs',
      },
      {
        type: 'separator',
      },
      {
        id: MenuChannels.OPEN_URL,
        label: 'About Movesia',
        url: 'https://movesia.com',
      },
    ],
  },
];

export default MenuGroups;
