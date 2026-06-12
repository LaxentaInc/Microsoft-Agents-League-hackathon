// monitor layout visualizer with toggle
import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Loader2, Copy } from 'lucide-react';

interface MonitorInfo {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isPrimary: boolean;
    dpi: number;
}

interface MonitorWallpaperEntry {
    kind?: string;
    path?: string;
    videoPath?: string;
    videoUrl?: string;
    originalUrl?: string;
    enabled?: boolean;
}


export default function MonitorLayout() {
    const [monitors, setMonitors] = React.useState<MonitorInfo[]>([]);
    const [activeMonitors, setActiveMonitors] = React.useState<string[]>([]);
    const [wallpapers, setWallpapers] = React.useState<Record<string, MonitorWallpaperEntry>>({});
    const [globalVideoPath, setGlobalVideoPath] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [toggling, setToggling] = React.useState<string | null>(null);
    const [hoveredId, setHoveredId] = React.useState<string | null>(null);
    const [feedback, setFeedback] = React.useState<string | null>(null);

    const showFeedback = (msg: string) => {
        setFeedback(msg);
        setTimeout(() => setFeedback(null), 2500);
    };


    const fetchData = async () => {
        try {
            const [result, active, map, status] = await Promise.all([
                invoke('get_monitors') as Promise<MonitorInfo[]>,
                invoke('get_active_monitors') as Promise<string[]>,
                invoke('get_monitor_wallpaper_info') as Promise<Record<string, MonitorWallpaperEntry>>,
                invoke('get_video_wallpaper_status') as Promise<any>,
            ]);
            setMonitors(result);
            setActiveMonitors(active);
            setWallpapers(map || {});
            setGlobalVideoPath(status?.videoPath || null);
        } catch (e) {
            console.error('failed to get monitors:', e);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchData();
        const interval = setInterval(async () => {
            try {
                const [active, map, status] = await Promise.all([
                    invoke('get_active_monitors') as Promise<string[]>,
                    invoke('get_monitor_wallpaper_info') as Promise<Record<string, MonitorWallpaperEntry>>,
                    invoke('get_video_wallpaper_status') as Promise<any>,
                ]);
                setActiveMonitors(active);
                setWallpapers(map || {});
                setGlobalVideoPath(status?.videoPath || null);
            } catch { /* ignore */ }
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const sanitize = (id: string) => id.replace(/\\\\/g, '').replace(/\./g, '');

    const handleToggle = async (monitor: MonitorInfo, index: number) => {
        if (toggling) return;
        setToggling(monitor.id);

        try {
            const result: any = await invoke('toggle_monitor_wallpaper', { monitorId: monitor.id });
            if (result?.success) {
                showFeedback(result.message?.includes('stopped')
                    ? `Stopped on Display ${index + 1}`
                    : `Now playing on Display ${index + 1}`);
            } else if (result?.error) {
                showFeedback(result.error);
            }

            // immediately refresh state
            const [active, map, status] = await Promise.all([
                invoke('get_active_monitors') as Promise<string[]>,
                invoke('get_monitor_wallpaper_info') as Promise<Record<string, MonitorWallpaperEntry>>,
                invoke('get_video_wallpaper_status') as Promise<any>,
            ]);
            setActiveMonitors(active);
            setWallpapers(map || {});
            setGlobalVideoPath(status?.videoPath || null);
        } catch {
            showFeedback('Something went wrong');
        } finally {
            setToggling(null);
        }
    };

    const handleApplyToAll = async () => {
        if (toggling || (Object.keys(wallpapers).length === 0 && !globalVideoPath)) return;
        const targetVideo = Object.values(wallpapers)[0];
        const urlToUse = targetVideo?.originalUrl || targetVideo?.path || targetVideo?.videoPath || globalVideoPath;
        if (!urlToUse) return;

        setToggling('all');
        try {
            const result: any = await invoke('set_video_wallpaper_on_monitors', {
                videoUrl: urlToUse,
                monitorIds: monitors.map(m => m.id),
                referer: null,
            });

            if (result?.success) {
                showFeedback('Applied to all displays');
                fetchData();
            } else {
                showFeedback(result?.error || 'Failed to apply to all');
            }
        } catch (e) {
            showFeedback('Something went wrong');
        } finally {
            setToggling(null);
        }
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '40px', color: 'var(--text-tertiary)', gap: '10px',
            }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: '13px' }}>Detecting displays...</span>
            </div>
        );
    }

    if (monitors.length === 0) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                No displays detected
            </div>
        );
    }

    // calculate bounding box and scale
    const minX = Math.min(...monitors.map(m => m.x));
    const minY = Math.min(...monitors.map(m => m.y));
    const maxX = Math.max(...monitors.map(m => m.x + m.width));
    const maxY = Math.max(...monitors.map(m => m.y + m.height));
    const totalW = maxX - minX;
    const totalH = maxY - minY;

    const containerPad = 32;
    const containerW = 540;
    const containerH = 340;
    const availW = containerW - containerPad * 2;
    const availH = containerH - containerPad * 2;
    const scale = Math.min(availW / totalW, availH / totalH);
    const scaledW = totalW * scale;
    const scaledH = totalH * scale;
    const offX = (containerW - scaledW) / 2;
    const offY = (containerH - scaledH) / 2;

    const assignedMonitorCount = Object.keys(wallpapers).length;
    const anyActive = assignedMonitorCount > 0 || activeMonitors.length > 0;
    const hasAnyWallpaper = Object.keys(wallpapers).length > 0 || !!globalVideoPath;

    return (
        <div style={{
            padding: '16px',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(0, 0, 0, 0.15)',
            border: '1px solid var(--border-subtle)',
            display: 'flex', flexDirection: 'column', gap: '14px',
        }}>
            {/* monitor map */}
            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: containerW,
                aspectRatio: `${containerW} / ${containerH}`,
                margin: '0 auto',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.04)',
            }}>
                {monitors.map((monitor, index) => {
                    const x = (monitor.x - minX) * scale + offX;
                    const y = (monitor.y - minY) * scale + offY;
                    const w = monitor.width * scale;
                    const h = monitor.height * scale;
                    // find actual assignment using sanitized matching
                    const activeMatchId = activeMonitors.find(a => sanitize(a) === sanitize(monitor.id));
                    const mappedKey = Object.keys(wallpapers).find(k => sanitize(k) === sanitize(monitor.id));
                    let entry = mappedKey ? wallpapers[mappedKey] : null;

                    // fallback to global video path if no specific entry exists
                    // this ensures the preview is permanently visible on all unassigned monitors
                    const entryKind = (entry?.kind || '').toLowerCase();
                    const isInteractive = entryKind === 'interactive';
                    // interactive wallpapers store a folder path, not a video file — don't try to render them as video
                    const contentPath = (!isInteractive) ? (entry?.path || entry?.videoPath || globalVideoPath) : undefined;


                    const active = (entry ? entry.enabled !== false : false) || !!activeMatchId;
                    const hovered = hoveredId === monitor.id;
                    const busy = toggling === monitor.id || toggling === 'all';
                    const isWide = w > 70;

                    let filename = '';
                    if (contentPath) {
                        const parts = contentPath.split(/[/\\]/);
                        filename = parts[parts.length - 1] || '';
                    }

                    // video poster for preview if assigned
                    const previewUrl = contentPath ? convertFileSrc(contentPath) : null;

                    return (
                        <div
                            key={monitor.id}
                            onClick={() => handleToggle(monitor, index)}
                            onMouseEnter={() => setHoveredId(monitor.id)}
                            onMouseLeave={() => setHoveredId(null)}
                            style={{
                                position: 'absolute',
                                left: `${(x / containerW) * 100}%`,
                                top: `${(y / containerH) * 100}%`,
                                width: `${(w / containerW) * 100}%`,
                                height: `${(h / containerH) * 100}%`,
                                borderRadius: '8px',
                                border: active
                                    ? '1.5px solid rgba(52, 211, 153, 0.6)'
                                    : hovered
                                        ? '1.5px solid rgba(255, 255, 255, 0.3)'
                                        : '1.5px solid rgba(255, 255, 255, 0.08)',
                                background: '#05070a', // solid dark base for better visibility
                                cursor: busy ? 'wait' : 'pointer',
                                transition: 'border-color 0.2s, background 0.2s, box-shadow 0.2s',
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                gap: '3px',
                                boxShadow: active
                                    ? '0 0 16px rgba(16, 185, 129, 0.1)'
                                    : hovered
                                        ? '0 2px 8px rgba(0, 0, 0, 0.2)'
                                        : 'none',
                                opacity: busy ? 0.5 : 1,
                                userSelect: 'none',
                                overflow: 'hidden', // to clip the video preview
                            }}
                        >
                            {/* preview layer (underneath content) */}
                            {previewUrl && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    opacity: 0.7, zIndex: 0,
                                    pointerEvents: 'none',
                                    transition: 'opacity 0.3s ease'
                                }}>
                                    <video
                                        src={previewUrl}
                                        autoPlay loop muted playsInline
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>
                            )}


                            {/* content layer */}
                            <div style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                gap: '3px', zIndex: 1, position: 'relative',
                                width: '100%', height: '100%', padding: '4px'
                            }}>
                                {busy ? (
                                    <Loader2 size={16} style={{
                                        animation: 'spin 1s linear infinite',
                                        color: 'var(--text-tertiary)',
                                    }} />
                                ) : (
                                    <>
                                        {/* display label */}
                                        <span style={{
                                            fontSize: isWide ? '13px' : '10px',
                                            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                            fontWeight: 600,
                                            color: active ? 'rgb(52, 211, 153)' : 'rgba(255, 255, 255, 0.55)',
                                            letterSpacing: '0.02em',
                                            lineHeight: 1,
                                        }}>
                                            DISPLAY {index + 1}
                                        </span>

                                        {/* resolution */}
                                        {w > 55 && h > 40 && (
                                            <span style={{
                                                fontSize: '9px',
                                                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                                color: active ? 'rgba(52, 211, 153, 0.7)' : 'rgba(255, 255, 255, 0.3)',
                                                fontWeight: 500,
                                            }}>
                                                {monitor.width}×{monitor.height}
                                            </span>
                                        )}


                                        {isInteractive && isWide && h > 60 && (
                                            <span style={{
                                                fontSize: '9px',
                                                color: active ? 'rgba(167, 139, 250, 0.95)' : 'rgba(167, 139, 250, 0.6)',
                                                marginTop: '2px',
                                                background: 'rgba(0,0,0,0.6)',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                            }}>
                                                interactive
                                            </span>
                                        )}
                                        {filename && !isInteractive && isWide && h > 60 && (
                                            <span style={{
                                                fontSize: '9px',
                                                color: active ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                                                marginTop: '2px',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: '90%',
                                                background: 'rgba(0,0,0,0.6)',
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {filename}
                                            </span>
                                        )}

                                        {/* state label — always visible when hovered */}
                                        {hovered && h > 50 && (
                                            <span style={{
                                                fontSize: '9px',
                                                fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
                                                fontWeight: 700,
                                                marginTop: '2px',
                                                letterSpacing: '0.06em',
                                                textTransform: 'uppercase',
                                                color: active ? 'rgb(248, 113, 113)' : 'rgb(52, 211, 153)',
                                                background: 'rgba(0,0,0,0.6)',
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                {active ? '■ stop wallpaper' : '▶ play wallpaper'}
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>

                            {/* primary badge */}
                            {monitor.isPrimary && isWide && (
                                <div style={{
                                    position: 'absolute', top: 5, right: 6,
                                    fontSize: '8px',
                                    fontWeight: 700,
                                    color: 'var(--accent)',
                                    opacity: 0.7,
                                    letterSpacing: '0.05em',
                                    textTransform: 'uppercase',
                                    zIndex: 2,
                                    background: 'rgba(0,0,0,0.5)',
                                    padding: '1px 4px',
                                    borderRadius: '3px'
                                }}>
                                    main
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 80px',
                alignItems: 'center',
                minHeight: '32px',
                padding: '0 8px'
            }}>
                <div /> {/* left spacer */}

                <div style={{ textAlign: 'center' }}>
                    {feedback ? (
                        <span style={{
                            fontSize: '12px', fontWeight: 600,
                            color: feedback.includes('Stopped') || feedback.includes('Failed') ? 'rgb(248, 113, 113)' : 'rgb(52, 211, 153)',
                        }}>
                            {feedback}
                        </span>
                    ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                            {anyActive
                                ? `${Math.max(assignedMonitorCount, activeMonitors.length)} display${Math.max(assignedMonitorCount, activeMonitors.length) > 1 ? 's' : ''} active`
                                : hasAnyWallpaper
                                    ? 'Click any display to play'
                                    : 'Set a wallpaper first'
                            }
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    {monitors.length > 1 && (
                        <button
                            className="btn-glass"
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '4px 10px', fontSize: '11px',
                                opacity: hasAnyWallpaper ? 1 : 0.5,
                                pointerEvents: hasAnyWallpaper && !toggling ? 'auto' : 'none'
                            }}
                            onClick={handleApplyToAll}
                        >
                            <Copy size={12} />
                            Sync
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
