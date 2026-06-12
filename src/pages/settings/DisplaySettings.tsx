import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Layout, MonitorCheck, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MonitorLayout from '../../components/MonitorLayout';

export default function DisplaySettings() {
    const [videoState, setVideoState] = React.useState<{ isActive: boolean; activeKind?: 'video' | 'scene' | 'interactive' | 'mixed' | 'unknown' }>({ isActive: false });
    const [stoppingWallpaper, setStoppingWallpaper] = React.useState(false);

    const loadWallpaperStatus = React.useCallback(async () => {
        try {
            const video: any = await invoke('get_video_wallpaper_status');
            const entries = Object.values(video.monitorWallpapers || {}) as Array<{ kind?: string }>;
            const kinds = new Set(entries.map((e) => (e?.kind || '').toLowerCase()).filter(Boolean));
            let activeKind: 'video' | 'scene' | 'interactive' | 'mixed' | 'unknown' = 'unknown';
            if (kinds.size > 1) activeKind = 'mixed';
            else if (kinds.has('scene')) activeKind = 'scene';
            else if (kinds.has('interactive')) activeKind = 'interactive';
            else if (kinds.has('video')) activeKind = 'video';
            setVideoState({ isActive: !!video?.isActive, activeKind });
        } catch {
            setVideoState({ isActive: false, activeKind: 'unknown' });
        }
    }, []);

    React.useEffect(() => {
        loadWallpaperStatus();
    }, [loadWallpaperStatus]);

    const stopAllWallpapers = async () => {
        try {
            setStoppingWallpaper(true);
            const result: any = await invoke('stop_video_wallpaper_command');
            if (result?.success) {
                setVideoState({ isActive: false, activeKind: 'unknown' });
            }
        } catch (error) {
            console.error('failed to stop wallpapers:', error);
        } finally {
            setStoppingWallpaper(false);
        }
    };

    return (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <Layout size={24} style={{ color: 'var(--accent)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
                    Display Configuration (Multi Monitors)
                </h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                You can Click a Display to set wallpaper there. Click again to stop it for that display.
            </p>

            <MonitorLayout />

            <AnimatePresence>
                {videoState.isActive && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '14px',
                            padding: '16px 18px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-subtle)',
                            background: 'rgba(255,255,255,0.02)',
                            marginTop: '14px',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <MonitorCheck size={15} style={{ color: 'var(--accent)' }} />
                                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    Stop Active Wallpaper Sessions on ALL Monitors
                                </span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                {videoState.activeKind === 'scene'
                                    ? 'Scene wallpaper is active. This action stops it across every monitor.'
                                    : videoState.activeKind === 'interactive'
                                        ? 'Interactive wallpaper is active. This action stops it across every monitor.'
                                        : videoState.activeKind === 'mixed'
                                            ? 'Multiple wallpaper types are active. This action stops them for ALL monitors. If you want to disable for one monitor, use the Modal above.'
                                            : 'Video wallpaper is active. This action stops it for ALL monitors. If you want to disable for one monitor, use the Modal above.'}
                            </div>
                        </div>
                        <button
                            onClick={stopAllWallpapers}
                            disabled={stoppingWallpaper}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-medium)',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: stoppingWallpaper ? 'not-allowed' : 'pointer',
                                opacity: stoppingWallpaper ? 0.7 : 1,
                            }}
                        >
                            <Square size={13} />
                            {stoppingWallpaper ? 'Stopping...' : 'Stop All Wallpapers'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
