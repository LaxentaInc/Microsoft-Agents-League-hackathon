import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { generateVideoThumbnail, getCachedThumbnail } from '../../utils/videoThumbnail';
import { useConfirm } from '../../context/ConfirmContext';

export interface UserWallpaper {
    id: string;
    name: string;
    path: string;
    mediaType: string;
    thumbnail?: string;
    addedAt: number;
}

export interface MonitorWallpaperEntry {
    kind?: 'video' | 'interactive' | 'scene';
    path?: string;
    videoPath?: string; // legacy fallback
    videoUrl?: string;
    originalUrl?: string;
    enabled?: boolean;
}

export function useLibraryData() {
    const [wallpapers, setWallpapers] = React.useState<UserWallpaper[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [currentWallpaper, setCurrentWallpaper] = React.useState('');
    const [monitorWallpapers, setMonitorWallpapers] = React.useState<Record<string, MonitorWallpaperEntry>>({});
    const [uploading, setUploading] = React.useState(false);
    const [visibleCount, setVisibleCount] = React.useState(12);
    const sentinelRef = React.useRef<HTMLDivElement>(null);
    const [selectorOpen, setSelectorOpen] = React.useState(false);
    const [pendingWallpaper, setPendingWallpaper] = React.useState<UserWallpaper | null>(null);
    const [thumbs, setThumbs] = React.useState<Record<string, string>>({});
    const { showConfirm, showAlert } = useConfirm();

    const loadWallpapers = React.useCallback(async () => {
        try {
            const result: any = await invoke('list_user_wallpapers');
            if (result.success) {
                setWallpapers(result.wallpapers || []);
            }
        } catch (error) {
            console.error(error);
        }
    }, []);

    const loadCurrentState = React.useCallback(async () => {
        try {
            const [currentWp, map]: any = await Promise.all([
                invoke('get_current_wallpaper'),
                invoke('get_monitor_wallpaper_info'),
            ]);

            if (currentWp?.success && currentWp?.message) {
                setCurrentWallpaper(currentWp.message);
            }

            if (map) setMonitorWallpapers(map);
        } catch (error) {
            console.error(error);
        }
    }, []);

    React.useEffect(() => {
        (async () => {
            setLoading(true);
            await Promise.all([loadWallpapers(), loadCurrentState()]);
            setLoading(false);
        })();
    }, [loadWallpapers, loadCurrentState]);

    // infinite scroll observer
    React.useEffect(() => {
        if (loading || wallpapers.length <= visibleCount) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisibleCount((prev) => Math.min(prev + 20, wallpapers.length));
                }
            },
            { rootMargin: '400px' }
        );

        if (sentinelRef.current) {
            observer.observe(sentinelRef.current);
        }

        return () => observer.disconnect();
    }, [loading, wallpapers.length, visibleCount]);

    // generate thumbnails for video files sequentially
    React.useEffect(() => {
        if (loading) return;
        let cancelled = false;

        const generateThumbs = async () => {
            const videos = wallpapers.filter(w => w.mediaType === 'video');
            for (const wp of videos) {
                if (cancelled) break;
                const cached = await getCachedThumbnail(wp.path);
                if (cached) {
                    setThumbs(prev => ({ ...prev, [wp.path]: cached }));
                    continue;
                }
                const src = convertFileSrc(wp.path);
                const thumb = await generateVideoThumbnail(src, wp.path);
                if (cancelled) break;
                if (thumb) {
                    setThumbs(prev => ({ ...prev, [wp.path]: thumb }));
                }
            }
        };

        generateThumbs();
        return () => { cancelled = true; };
    }, [loading, wallpapers]);

    const handleUpload = async () => {
        try {
            setUploading(true);
            const selected = await openDialog({
                multiple: false,
                filters: [
                    {
                        name: 'Media',
                        extensions: ['mp4', 'mkv', 'jpg', 'jpeg', 'png', 'gif', 'webm', 'avi', 'mov', 'wmv'],
                    },
                ],
            });

            if (selected && typeof selected === 'string') {
                const result: any = await invoke('register_local_wallpaper', {
                    filePath: selected,
                });

                if (result.success) {
                    await loadWallpapers();
                } else {
                    showAlert({ title: 'Upload Failed', message: result.error, isDanger: true });
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setUploading(false);
        }
    };

    const handleSetWallpaper = React.useCallback(async (wallpaper: UserWallpaper) => {
        if (wallpaper.mediaType === 'video') {
            setPendingWallpaper(wallpaper);
            setSelectorOpen(true);
        } else {
            try {
                const result: any = await invoke('set_local_wallpaper', {
                    filePath: wallpaper.path,
                });

                if (result.success) {
                    await loadCurrentState();
                } else {
                    showAlert({ title: 'Failed', message: result.error, isDanger: true });
                }
            } catch (error) {
                console.error(error);
            }
        }
    }, [loadCurrentState]);

    const executeSetWallpaper = async (wallpaper: UserWallpaper, targetMonitors: string[]) => {
        if (!targetMonitors || targetMonitors.length === 0) return;

        try {
            const urlFormat = `file:///${wallpaper.path.replace(/\\/g, '/')}`;
            const result: any = await invoke('set_video_wallpaper_on_monitors', {
                videoUrl: urlFormat,
                monitorIds: targetMonitors,
                referer: null
            });

            if (result.success) {
                await loadCurrentState();
            } else {
                showAlert({ title: 'Wallpaper Error', message: 'failed to set wallpaper: ' + result.error, isDanger: true });
            }
        } catch (error) {
            console.error(error);
            showAlert({ title: 'Error', message: 'error setting wallpaper', isDanger: true });
        }
    };

    const handleDelete = React.useCallback(async (wallpaper: UserWallpaper) => {
        const confirmed = await showConfirm({
            title: 'Delete Wallpaper',
            message: `are you sure you want to delete "${wallpaper.name}" from your library?`,
            confirmText: 'Delete',
            isDanger: true,
        });
        if (!confirmed) return;

        try {
            const result: any = await invoke('delete_user_wallpaper', {
                wallpaperPath: wallpaper.path,
            });

            if (result.success) {
                await loadWallpapers();
            } else {
                showAlert({ title: 'Delete Failed', message: result.error, isDanger: true });
            }
        } catch (error) {
            console.error(error);
        }
    }, [loadWallpapers, showConfirm, showAlert]);

    const isActive = React.useCallback((wallpaper: UserWallpaper) => {
        if (wallpaper.mediaType === 'video') {
            const normalizedWpPath = wallpaper.path.replace(/\\/g, '/');
            return Object.values(monitorWallpapers).some(
                entry => (
                    (entry.path && entry.path.replace(/\\/g, '/') === normalizedWpPath) || 
                    (entry.videoPath && entry.videoPath.replace(/\\/g, '/') === normalizedWpPath)
                ) && entry.enabled !== false
            );
        } else {
            return currentWallpaper.includes(wallpaper.name) || currentWallpaper === wallpaper.path;
        }
    }, [monitorWallpapers, currentWallpaper]);

    return {
        wallpapers,
        loading,
        uploading,
        thumbs,
        visibleCount,
        sentinelRef,
        selectorOpen,
        setSelectorOpen,
        pendingWallpaper,
        setPendingWallpaper,
        handleUpload,
        handleSetWallpaper,
        handleDelete,
        executeSetWallpaper,
        isActive,
    };
}
