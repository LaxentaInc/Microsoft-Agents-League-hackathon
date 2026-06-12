import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Zap, Wand2 } from 'lucide-react';
import InteractiveWallpaperCard from '../../components/InteractiveWallpaperCard';
import type { InteractiveWallpaperData } from '../../components/InteractiveWallpaperCard';
import InteractivePropertiesPanel from '../../components/InteractivePropertiesPanel';
import MonitorSelectorModal from '../../components/MonitorSelectorModal';
import AIGeneratorModal from '../../components/AIGeneratorModal';
import { generateImageThumbnail, getCachedThumbnail } from '../../utils/videoThumbnail';
import { useConfirm } from '../../context/ConfirmContext';

// interface InteractiveTabProps {
//     // header action buttons rendered by the parent
//     onHeaderActions?: (actions: React.ReactNode) => void;
// }

export default function InteractiveTab() {
    const [interactiveWallpapers, setInteractiveWallpapers] = React.useState<InteractiveWallpaperData[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [thumbs, setThumbs] = React.useState<Record<string, string>>({});
    const [monitorWallpapers, setMonitorWallpapers] = React.useState<Record<string, any>>({});

    const [selectorOpen, setSelectorOpen] = React.useState(false);
    const [pendingInteractive, setPendingInteractive] = React.useState<InteractiveWallpaperData | null>(null);
    const [propertiesOpen, setPropertiesOpen] = React.useState(false);
    const [propertiesTarget, setPropertiesTarget] = React.useState<InteractiveWallpaperData | null>(null);
    const [propertiesMonitor, setPropertiesMonitor] = React.useState('');
    const [downloadingIAssets, setDownloadingIAssets] = React.useState(false);
    const [aiModalOpen, setAiModalOpen] = React.useState(false);
    const { showConfirm, showAlert } = useConfirm();

    const loadInteractiveWallpapers = React.useCallback(async () => {
        try {
            const [result, monitorInfo]: any = await Promise.all([
                invoke('list_interactive_wallpapers'),
                invoke('get_monitor_wallpaper_info')
            ]);
            
            if (result.success) {
                setInteractiveWallpapers(result.wallpapers || []);
            }
            if (monitorInfo) {
                setMonitorWallpapers(monitorInfo);
            }
        } catch (error) {
            console.error(error);
        }
    }, []);

    React.useEffect(() => {
        (async () => {
            setLoading(true);
            await loadInteractiveWallpapers();
            setLoading(false);
        })();
    }, [loadInteractiveWallpapers]);

    // handle interactive assets downloading state
    React.useEffect(() => {
        invoke('check_interactive_assets_downloading').then((isDownloading: any) => {
            if (isDownloading) setDownloadingIAssets(true);
        }).catch(console.error);

        const unlistenPromise = listen('iassets-download-complete', (event: any) => {
            setDownloadingIAssets(false);
            if (event.payload?.success) {
                showAlert({ title: 'Success', message: 'default interactive wallpapers downloaded.' });
                loadInteractiveWallpapers().catch(console.error);
            } else {
                showAlert({ title: 'Download Failed', message: event.payload?.error || 'unknown error', isDanger: true });
            }
        });

        return () => {
            unlistenPromise.then(fn => fn()).catch(console.error);
        };
    }, [loadInteractiveWallpapers, showAlert]);

    // generate thumbnails
    React.useEffect(() => {
        if (loading) return;
        let cancelled = false;

        const generateThumbs = async () => {
            for (const iw of interactiveWallpapers) {
                if (cancelled) break;
                if (!iw.previewImage) continue;

                const cached = await getCachedThumbnail(iw.previewImage);
                if (cached) {
                    setThumbs(prev => ({ ...prev, [iw.previewImage as string]: cached }));
                    continue;
                }
                const src = convertFileSrc(iw.previewImage);
                const thumb = await generateImageThumbnail(src, iw.previewImage);
                if (cancelled) break;
                if (thumb) {
                    setThumbs(prev => ({ ...prev, [iw.previewImage as string]: thumb }));
                }
            }
        };

        generateThumbs();
        return () => { cancelled = true; };
    }, [loading, interactiveWallpapers]);

    const handleImportInteractive = async () => {
        try {
            const selected = await openDialog({
                directory: true,
                multiple: false,
                title: 'Select Interactive Wallpaper Folder',
            });

            if (selected && typeof selected === 'string') {
                const result: any = await invoke('import_interactive_wallpaper', {
                    folderPath: selected,
                });

                if (result.success) {
                    await loadInteractiveWallpapers();
                } else {
                    showAlert({ title: 'Import Failed', message: result.error || 'failed to import wallpaper', isDanger: true });
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleSetInteractive = React.useCallback(async (wallpaper: InteractiveWallpaperData) => {
        setPendingInteractive(wallpaper);
        setSelectorOpen(true);
    }, []);

    const handleDownloadDefaults = async (isResync = false) => {
        if (isResync) {
            const confirmed = await showConfirm({
                title: 'Resync Default Pack',
                message: 'This will delete and re-download the default interactive wallpapers. Continue?',
                confirmText: 'Resync',
            });
            if (!confirmed) return;
        }

        try {
            setDownloadingIAssets(true);
            const cmd = isResync ? 'resync_interactive_assets' : 'download_interactive_assets';
            const result: any = await invoke(cmd);
            if (result === 'installed' || result === 'already installed') {
                if (!isResync && result !== 'already installed') {
                    showAlert({ title: 'Success', message: 'Default interactive wallpapers downloaded.' });
                }
                setDownloadingIAssets(false);
                await loadInteractiveWallpapers();
            } else if (result === 'downloading') {
                // already downloading
            } else if (result === 'started') {
                // event listener handles completion
            } else {
                setDownloadingIAssets(false);
                showAlert({ title: 'Download Failed', message: result || 'Unknown error', isDanger: true });
            }
        } catch (error: any) {
            console.error(error);
            setDownloadingIAssets(false);
            showAlert({ title: 'Error', message: String(error), isDanger: true });
        }
    };

    const executeSetInteractive = async (wallpaper: InteractiveWallpaperData, targetMonitors: string[]) => {
        if (!targetMonitors || targetMonitors.length === 0) return;

        try {
            const result: any = await invoke('set_interactive_wallpaper', {
                folderPath: wallpaper.folderPath,
                monitorIds: targetMonitors,
            });

            if (!result.success) {
                showAlert({ title: 'Failed', message: result.error || 'unknown error', isDanger: true });
            } else {
                await loadInteractiveWallpapers();
            }
        } catch (error) {
            console.error(error);
            showAlert({ title: 'Error', message: 'error setting interactive wallpaper', isDanger: true });
        }
    };

    const handleDeleteInteractive = React.useCallback(async (wallpaper: InteractiveWallpaperData) => {
        const confirmed = await showConfirm({
            title: 'Delete Interactive Wallpaper',
            message: `are you sure you want to delete "${wallpaper.name}" from your interactive library?`,
            confirmText: 'Delete',
            isDanger: true,
        });
        if (!confirmed) return;

        try {
            const result: any = await invoke('delete_interactive_wallpaper', {
                folderPath: wallpaper.folderPath,
            });

            if (result.success) {
                await loadInteractiveWallpapers();
            } else {
                showAlert({ title: 'Delete Failed', message: result.error, isDanger: true });
            }
        } catch (error) {
            console.error(error);
        }
    }, [loadInteractiveWallpapers, showConfirm, showAlert]);

    const handleCustomize = React.useCallback((wallpaper: InteractiveWallpaperData) => {
        setPropertiesTarget(wallpaper);
        setPropertiesMonitor('primary');
        setPropertiesOpen(true);
    }, []);

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
                {/* ── interactive library section ── */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Interactive Library
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => setAiModalOpen(!aiModalOpen)}
                                style={{
                                    padding: '6px 12px',
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    color: 'rgb(52, 211, 153)',
                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '11px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.22)';
                                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)';
                                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.25)';
                                }}
                            >
                                <Wand2 size={12} />
                                Generate with AI
                            </button>

                            <button
                                onClick={handleImportInteractive}
                                style={{
                                    padding: '6px 12px',
                                    background: 'rgba(139, 92, 246, 0.12)',
                                    color: 'rgb(167, 139, 250)',
                                    border: '1px solid rgba(139, 92, 246, 0.25)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '11px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.22)';
                                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)';
                                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.25)';
                                }}
                            >
                                <FolderOpen size={12} />
                                Import
                            </button>

                            {interactiveWallpapers.length > 0 && (
                                <button
                                    onClick={() => handleDownloadDefaults(true)}
                                    disabled={downloadingIAssets}
                                    style={{
                                        padding: '6px 12px',
                                        background: 'rgba(14, 165, 233, 0.12)',
                                        color: 'rgb(56, 189, 248)',
                                        border: '1px solid rgba(14, 165, 233, 0.25)',
                                        borderRadius: '8px',
                                        cursor: downloadingIAssets ? 'wait' : 'pointer',
                                        fontWeight: 600,
                                        fontSize: '11px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'all 0.15s ease',
                                        opacity: downloadingIAssets ? 0.6 : 1,
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!downloadingIAssets) {
                                            e.currentTarget.style.background = 'rgba(14, 165, 233, 0.22)';
                                            e.currentTarget.style.borderColor = 'rgba(14, 165, 233, 0.4)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!downloadingIAssets) {
                                            e.currentTarget.style.background = 'rgba(14, 165, 233, 0.12)';
                                            e.currentTarget.style.borderColor = 'rgba(14, 165, 233, 0.25)';
                                        }
                                    }}
                                >
                                    <Zap size={12} />
                                    {downloadingIAssets ? 'Downloading...' : 'Resync Defaults'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* AI Generator Inline Panel */}
                    <AIGeneratorModal 
                        isOpen={aiModalOpen}
                        onClose={() => setAiModalOpen(false)}
                        onSuccess={() => {
                            loadInteractiveWallpapers();
                            showAlert({ title: 'Success', message: 'AI Wallpaper generated and saved!' });
                        }}
                    />

                    {loading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} style={{
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '10px',
                                    aspectRatio: '16/9',
                                    animation: 'pulse 1.5s ease-in-out infinite',
                                }} />
                            ))}
                        </div>
                    ) : interactiveWallpapers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-tertiary)' }}>
                            <Wand2 size={40} style={{ opacity: 0.15, marginBottom: '12px' }} />
                            <p style={{ margin: '0 0 16px 0', fontSize: '13px' }}>No interactive wallpapers installed.</p>
                            <button
                                onClick={() => handleDownloadDefaults(false)}
                                disabled={downloadingIAssets}
                                style={{
                                    padding: '8px 16px',
                                    background: 'var(--accent)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: downloadingIAssets ? 'wait' : 'pointer',
                                    fontWeight: 600,
                                    fontSize: '12px',
                                    transition: 'all 0.2s ease',
                                    opacity: downloadingIAssets ? 0.7 : 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {downloadingIAssets ? 'Downloading Assets...' : 'Download Default Pack'}
                            </button>
                        </div>
                    ) : (
                <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '22px'
                }}>
                    {interactiveWallpapers.map((iw) => {
                        const normalizedWpPath = iw.folderPath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
                        const isActive = Object.values(monitorWallpapers).some(
                            (entry: any) => {
                                const ep = entry.path ? entry.path.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '') : '';
                                const evp = entry.videoPath ? entry.videoPath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '') : '';
                                return (ep === normalizedWpPath || evp === normalizedWpPath) && entry.enabled !== false;
                            }
                        );
                        
                        return (
                            <InteractiveWallpaperCard
                                key={iw.id}
                                wallpaper={iw}
                                staticThumbnail={iw.previewImage ? thumbs[iw.previewImage] : undefined}
                                isActive={isActive}
                                onSet={() => handleSetInteractive(iw)}
                                onDelete={() => handleDeleteInteractive(iw)}
                                onCustomize={() => handleCustomize(iw)}
                            />
                        );
                    })}
                </div>
            )}
            </div>
            </div>

            {/* monitor selector modal */}
            <MonitorSelectorModal
                isOpen={selectorOpen}
                onClose={() => { setSelectorOpen(false); setPendingInteractive(null); }}
                onConfirm={(monitors) => {
                    if (pendingInteractive) executeSetInteractive(pendingInteractive, monitors);
                }}
                title={`Set "${pendingInteractive?.name || 'Wallpaper'}" on...`}
            />

            {/* interactive properties panel */}
            <InteractivePropertiesPanel
                isOpen={propertiesOpen}
                onClose={() => { setPropertiesOpen(false); setPropertiesTarget(null); }}
                folderPath={propertiesTarget?.folderPath || ''}
                monitorId={propertiesMonitor}
                wallpaperName={propertiesTarget?.name || ''}
            />

            {/* keyframe animations */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.4; }
                    50% { opacity: 0.2; }
                }
            `}</style>
        </>
    );
}
