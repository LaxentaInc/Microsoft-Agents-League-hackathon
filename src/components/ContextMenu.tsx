import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface MenuItem {
    label: string;
    action: () => void;
    danger?: boolean;
}

interface ContextMenuState {
    x: number;
    y: number;
    visible: boolean;
}

const buildMenuItems = (): MenuItem[] => [
    {
        label: 'Reload',
        action: () => window.location.reload(),
    },
    {
        label: 'Minimize',
        action: () => getCurrentWindow().minimize(),
    },
    {
        label: 'Close',
        action: () => getCurrentWindow().close(),
        danger: true,
    },
];

export default function ContextMenu() {
    const [menu, setMenu] = React.useState<ContextMenuState>({ x: 0, y: 0, visible: false });
    const menuRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();

            // clamp to viewport so menu never goes offscreen
            const x = Math.min(e.clientX, window.innerWidth - 160);
            const y = Math.min(e.clientY, window.innerHeight - 120);

            setMenu({ x, y, visible: true });
        };

        const dismiss = () => setMenu(m => ({ ...m, visible: false }));

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('click', dismiss);
        document.addEventListener('scroll', dismiss, true);
        window.addEventListener('blur', dismiss);

        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('click', dismiss);
            document.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('blur', dismiss);
        };
    }, []);

    if (!menu.visible) return null;

    const items = buildMenuItems();

    return (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: menu.y,
                left: menu.x,
                zIndex: 99999,
                background: 'rgba(22, 22, 28, 0.97)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '4px',
                minWidth: '148px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                userSelect: 'none',
            }}
            // stop click-away from triggering on the menu itself
            onClick={e => e.stopPropagation()}
        >
            {items.map((item, i) => (
                <button
                    key={i}
                    onClick={() => {
                        setMenu(m => ({ ...m, visible: false }));
                        item.action();
                    }}
                    style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '7px',
                        color: item.danger ? '#f87171' : 'rgba(255,255,255,0.85)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = item.danger
                            ? 'rgba(248,113,113,0.12)'
                            : 'rgba(255,255,255,0.07)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}
