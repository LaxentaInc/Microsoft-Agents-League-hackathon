import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { User, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import bannerImage from '../assets/LxColorWall.png';

interface EnhancedTitleBarProps {
    onSettingsClick?: () => void;
    onUserClick?: () => void;
}

export default function EnhancedTitleBar({ onSettingsClick, onUserClick }: EnhancedTitleBarProps) {
    const [isMaximized, setIsMaximized] = React.useState(false);

    const minimize = async () => {
        const window = getCurrentWindow();
        await window.minimize();
    };

    const toggleMaximize = async () => {
        const window = getCurrentWindow();
        const maximized = await window.isMaximized();
        if (maximized) {
            await window.unmaximize();
        } else {
            await window.maximize();
        }
        setIsMaximized(!maximized);
    };

    const close = async () => {
        const window = getCurrentWindow();
        await window.close();
    };

    return (
        <div
            className="titlebar"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                height: '48px',
                background: 'rgba(15, 15, 20, 0.4)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 12px',
                zIndex: 9999,
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                // @ts-ignore
                WebkitAppRegion: 'drag',
                overflow: 'visible',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
                {/* <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LaxentaLogo />
                </div> */}

                {/* <span
                    style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        background: 'linear-gradient(to right, #60a5fa, #818cf8)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        position: 'relative',
                        zIndex: 1,
                    }}
                >
                    ColorWall
                </span> */}
            </div>

            <div style={{
                position: 'absolute',
                left: '48%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
            }}>
                <img
                    src={bannerImage}
                    alt="ColorWall Banner"
                    style={{
                        height: '108px',
                        width: '180px', // auto is good but this is fine too unless monitor huge but idk
                    }}
                />
            </div>

            <div style={{
                display: 'flex',
                gap: '4px',
                // @ts-ignore
                WebkitAppRegion: 'no-drag'
            }}>
                <motion.button
                    whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onUserClick}
                    style={{
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        borderRadius: '6px',
                    }}
                >
                    <User size={18} />
                </motion.button>
                <motion.button
                    whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onSettingsClick}
                    style={{
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        borderRadius: '6px',
                    }}
                >
                    <Settings size={18} />
                </motion.button>
                <div style={{ width: '1px', height: '28px', background: 'rgba(255, 255, 255, 0.15)', margin: '0 8px', alignSelf: 'center' }} />
                <motion.button
                    whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={minimize}
                    style={{
                        width: '46px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        fontSize: '16px',
                    }}
                >
                    ─
                </motion.button>
                <motion.button
                    whileHover={{ backgroundColor: 'var(--bg-hover)' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleMaximize}
                    style={{
                        width: '46px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        fontSize: '16px',
                    }}
                >
                    {isMaximized ? '❐' : '☐'}
                </motion.button>
                <motion.button
                    whileHover={{ backgroundColor: '#e81123' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={close}
                    style={{
                        width: '46px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        fontSize: '16px',
                    }}
                >
                    ✕
                </motion.button>
            </div>
        </div>
    );
}