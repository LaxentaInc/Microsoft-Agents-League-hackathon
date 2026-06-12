import { useState, useEffect, useCallback } from 'react';
import { LampFloor, Volume2, Monitor, HardDrive, Folder, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { useConfirm } from '../../context/ConfirmContext';

interface VideoSettingsProps {
    settings: any;
    handleSaveSettings: (key: string, value: any) => Promise<void>;
    startupEnabled: boolean;
    handleToggleStartup: () => Promise<void>;
}

export default function VideoSettings({ 
    settings, 
    handleSaveSettings,
    startupEnabled,
    handleToggleStartup,
}: VideoSettingsProps) {
    const [clearing, setClearing] = useState(false);
    const [storagePath, setStoragePath] = useState('');
    const [cacheInfo, setCacheInfo] = useState({ sizeMB: '0', fileCount: 0 });
    const { showConfirm, showAlert } = useConfirm();

    const loadStorageData = useCallback(async () => {
        try {
            const [pathRes, cache]: any = await Promise.all([
                invoke('get_wallpaper_storage_path'),
                invoke('get_cache_size'),
            ]);
            if (pathRes.success && pathRes.path) setStoragePath(pathRes.path);
            if (cache.success) setCacheInfo({ sizeMB: cache.sizeMb, fileCount: cache.fileCount });
        } catch (error) {
            console.error('failed to load storage data:', error);
        }
    }, []);

    useEffect(() => { loadStorageData(); }, [loadStorageData]);

    const handleClearCache = async () => {
        const confirmed = await showConfirm({
            title: 'Clear Cache',
            message: 'are you sure you want to clear all downloaded wallpapers and cache? this cannot be undone.',
            confirmText: 'Clear Cache',
            isDanger: true,
        });
        if (!confirmed) return;
        setClearing(true);
        try {
            await invoke('clear_cache');
            showAlert({ title: 'Cache Cleared', message: 'cache cleared successfully!' });
            await loadStorageData();
        } catch (error) {
            console.error('failed to clear cache:', error);
            showAlert({ title: 'Error', message: 'failed to clear cache: ' + error, isDanger: true });
        } finally {
            setClearing(false);
        }
    };

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <LampFloor size={24} style={{ color: 'var(--accent)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
                    Video Wallpaper
                </h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Controls for how video wallpapers behave and play on your system.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', transition: 'var(--transition)' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                            Enable/Pause Live Wallpaper
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Allow the live wallpaper to run on your desktop
                        </div>
                    </div>
                    <label className="toggle-switch">
                        <input type="checkbox" checked={settings.liveWallpaperEnabled} onChange={(e) => handleSaveSettings('liveWallpaperEnabled', e.target.checked)} />
                        <span className="toggle-slider" />
                    </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', transition: 'var(--transition)' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <Volume2 size={16} style={{ color: 'var(--accent)' }} />
                            <div style={{ fontSize: '15px', fontWeight: 600 }}>
                                Enable Video Audio
                            </div>
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Play audio from some video wallpapers (not all have audio)
                        </div>
                    </div>
                    <label className="toggle-switch">
                        <input type="checkbox" checked={settings.audioEnabled} onChange={(e) => handleSaveSettings('audioEnabled', e.target.checked)} />
                        <span className="toggle-slider" />
                    </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', transition: 'var(--transition)' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                            Auto Pause on Fullscreen
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Automatically pause the wallpaper when a fullscreen application or game is focused
                        </div>
                    </div>
                    <label className="toggle-switch">
                        <input type="checkbox" checked={settings.pauseOnFullscreen} onChange={(e) => handleSaveSettings('pauseOnFullscreen', e.target.checked)} />
                        <span className="toggle-slider" />
                    </label>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', transition: 'var(--transition)' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                            Start with Windows
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            Launch ColorWall automatically when Windows starts
                        </div>
                    </div>
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={startupEnabled}
                            onChange={handleToggleStartup}
                        />
                        <span className="toggle-slider" />
                    </label>
                </div>

                {/* window effects */}
                <div style={{ padding: '16px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <Monitor size={16} style={{ color: 'var(--accent)' }} />
                                <div style={{ fontSize: '15px', fontWeight: 600 }}>Mica / Acrylic Effect</div>
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Enable frosted glass effect on the app window (Windows 10/11)
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                May cause lag when dragging the window on some systems
                            </div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={settings.windowVibrancy}
                                onChange={async (e) => {
                                    const enabled = e.target.checked;
                                    try {
                                        await invoke('set_window_vibrancy', { enabled });
                                        if (enabled) {
                                            document.body.classList.add('vibrancy-enabled');
                                        } else {
                                            document.body.classList.remove('vibrancy-enabled');
                                        }
                                        handleSaveSettings('windowVibrancy', enabled);
                                    } catch (err) {
                                        console.error('failed to set vibrancy:', err);
                                    }
                                }}
                            />
                            <span className="toggle-slider" />
                        </label>
                    </div>
                </div>

                {/* storage */}
                <div style={{ padding: '16px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <HardDrive size={16} style={{ color: 'var(--text-secondary)' }} />
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>Storage</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Folder size={14} style={{ color: 'var(--text-tertiary)' }} />
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Wallpaper path</div>
                    </div>
                    <div style={{
                        fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'Consolas, Monaco, monospace',
                        background: 'rgba(0, 0, 0, 0.3)', padding: '8px 12px', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)', overflow: 'auto', wordBreak: 'break-all', marginBottom: '12px',
                    }}>
                        {storagePath || 'Not available'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>
                                {cacheInfo.sizeMB} MB
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                {cacheInfo.fileCount} files cached
                            </div>
                        </div>
                        <button onClick={handleClearCache} disabled={clearing} className="btn-secondary" style={{ opacity: clearing ? 0.7 : 1 }}>
                            <Trash2 size={14} />
                            {clearing ? 'Clearing...' : 'Clear Cache'}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
