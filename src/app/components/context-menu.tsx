import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardPaste, Copy, Scissors, TextSelect } from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface MenuPosition {
  x: number;
  y: number;
}

interface MenuState {
  hasSelection: boolean;
  isEditable: boolean;
}

interface MenuItem {
  label: string;
  shortcut: string;
  icon: React.ReactNode;
  action: () => void;
  visible: boolean;
  enabled: boolean;
}

export function AppContextMenu () {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [state, setState] = useState<MenuState>({ hasSelection: false, isEditable: false });
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Right-click handler
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();

      const target = e.target as HTMLElement;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable ||
        !!target.closest('[contenteditable="true"]');
      const selection = window.getSelection();
      const hasSelection = (selection?.toString().trim().length ?? 0) > 0;

      setState({ hasSelection, isEditable });
      setPosition({ x: e.clientX, y: e.clientY });
      setOpen(true);
    };

    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  // Close on click outside, escape, scroll, resize
  useEffect(() => {
    if (!open) return;

    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('mousedown', onClickOutside, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);

    return () => {
      document.removeEventListener('mousedown', onClickOutside, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [open, close]);

  // Clamp menu position so it doesn't overflow the viewport
  useEffect(() => {
    if (!open || !menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let { x, y } = position;
    if (x + rect.width > vw) x = vw - rect.width - 8;
    if (y + rect.height > vh) y = vh - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;

    if (x !== position.x || y !== position.y) {
      setPosition({ x, y });
    }
  }, [open, position]);

  const exec = useCallback(
    (cmd: string) => {
      document.execCommand(cmd);
      close();
    },
    [close]
  );

  if (!open) return null;

  const items: MenuItem[] = [
    {
      label: 'Cut',
      shortcut: 'Ctrl+X',
      icon: <Scissors className='size-3.5' />,
      action: () => exec('cut'),
      visible: state.isEditable,
      enabled: state.hasSelection,
    },
    {
      label: 'Copy',
      shortcut: 'Ctrl+C',
      icon: <Copy className='size-3.5' />,
      action: () => exec('copy'),
      visible: true,
      enabled: state.hasSelection,
    },
    {
      label: 'Paste',
      shortcut: 'Ctrl+V',
      icon: <ClipboardPaste className='size-3.5' />,
      action: () => exec('paste'),
      visible: state.isEditable,
      enabled: true,
    },
    {
      label: 'Select All',
      shortcut: 'Ctrl+A',
      icon: <TextSelect className='size-3.5' />,
      action: () => exec('selectAll'),
      visible: true,
      enabled: true,
    },
  ];

  const visibleItems = items.filter((item) => item.visible);

  return (
    <div
      ref={menuRef}
      role='menu'
      className={cn(
        'fixed z-[9999] min-w-[180px] rounded-lg border border-border/60 bg-popover p-1 shadow-lg',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{ left: position.x, top: position.y }}
    >
      {visibleItems.map((item, i) => (
        <button
          key={item.label}
          role='menuitem'
          disabled={!item.enabled}
          onClick={item.action}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors',
            'outline-none select-none',
            item.enabled
              ? 'text-popover-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent'
              : 'text-muted-foreground/50 pointer-events-none',
            // Add separator gap before Select All
            i === visibleItems.length - 1 && visibleItems.length > 1 && 'mt-1 border-t border-border/40 pt-1'
          )}
        >
          <span className='text-muted-foreground'>{item.icon}</span>
          <span>{item.label}</span>
          <span className='ml-auto text-[11px] tracking-wide text-muted-foreground/70'>{item.shortcut}</span>
        </button>
      ))}
    </div>
  );
}
