import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X, ZoomIn, ZoomOut, CheckCircle, Download, Monitor } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { WallpaperItem } from '../types/wallpaper';
import { useDL } from '../context/DownloadContext';
import MonitorSelectorModal from './MonitorSelectorModal';

interface ImageModalProps {
    image: WallpaperItem;
    onClose: () => void;
    onSetWallpaper: (url: string, referer?: string) => void;
    isLoading: boolean;
    onGoToLibrary?: () => void;
}

// tooltip component for clarity
const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => {
    const [show, setShow] = useState(false);
    return (
        <div
            style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
        >
            {children}
            {show && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(5, 7, 12, 0.98)',
                    color: '#f1f5f9',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    zIndex: 100,
                    border: '1px solid rgba(255,255,255,0.14)',
                    boxShadow: '0 20px 40px -10px rgba(0,0,0,0.7)',
                    pointerEvents: 'none',
                    fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: '0.01em',
                    lineHeight: 1.5,
                    width: 'max-content',
                    maxWidth: '280px',
                    textAlign: 'center',
                    whiteSpace: 'normal' as any,
                }}>
                    {text}
                </div>
            )}
        </div>
    );
};

const ImageModal = ({ image, onClose, onSetWallpaper, isLoading, onGoToLibrary }: ImageModalProps) => {
    const [zoom, setZoom] = useState(1);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [videoLoaded, setVideoLoaded] = useState(false);
    const [displayUrl, setDisplayUrl] = useState<string>(image.thumbnailUrl || image.imageUrl || '');
    const [highResUrl, setHighResUrl] = useState<string | null>(null);
    const [url4k, setUrl4k] = useState<string | null>(null);
    const [isResolving, setIsResolving] = useState(false);
    const [isInLibrary, setIsInLibrary] = useState(false);
    const [selectorOpen, setSelectorOpen] = useState(false);
    const [pendingUrlToUse, setPendingUrlToUse] = useState<string | null>(null);
    const [pendingReferer, setPendingReferer] = useState<string | undefined>(undefined);
    const { start, activeId, progress, isSlow, setIsViewingActiveItem, downloadMode, getLibItemStatus } = useDL();

    // check if already in library on mount
    useEffect(() => {
        if (image.title) {
            invoke<boolean>('is_in_library', { title: image.title }).then(result => {
                setIsInLibrary(result);
            }).catch(() => { });
        }
    }, [image.title]);

    // helper to set high-res url and update display
    const setTopLevelHighRes = useCallback((url: string) => {
        setHighResUrl(url);
        setDisplayUrl(url);
        setImgLoaded(false);
        setIsResolving(false);
        imageKeyRef.current += 1;
    }, []);

    // derived state for set/download mode (single active)
    const isDownloadingThis = activeId === image.id;
    const isSetAction = isDownloadingThis && downloadMode === 'set';
    const downloadProgress = isDownloadingThis ? progress : 0;
    const isSlowNetwork = isDownloadingThis ? isSlow : false;

    // derived state for library queue
    const libStatus = getLibItemStatus(image.id);
    const isLibQueued = !!libStatus && (libStatus.status === 'queued' || libStatus.status === 'downloading');
    const isLibDone = !!libStatus && libStatus.status === 'done';

    const hasResolvedRef = useRef(false);
    const imageKeyRef = useRef(0);

    // source resolution logic
    useEffect(() => {
        hasResolvedRef.current = false;
        setIsResolving(false);
        imageKeyRef.current = 0;
        setHighResUrl(null);
        setDisplayUrl(image.thumbnailUrl || image.imageUrl || '');
        setImgLoaded(false);

        if (image.source === 'wallpaperflare' && image.detailUrl) {
            setIsResolving(true);
            (async () => {
                try {
                    const result: any = await invoke('resolve_wallpaperflare_highres', { detailUrl: image.detailUrl });
                    if (result?.success && result?.url && !hasResolvedRef.current) {
                        hasResolvedRef.current = true;
                        setHighResUrl(result.url);
                        setDisplayUrl(result.url);
                        setImgLoaded(false);
                        setVideoLoaded(false);
                        setIsResolving(false);
                    }
                } catch (e) {
                    setIsResolving(false);
                }
            })();
        } else if (image.source === 'motionbgs' && image.detailUrl) {
            setIsResolving(true);
            (async () => {
                try {
                    const result: any = await invoke('resolve_motionbgs_video', { detailUrl: image.detailUrl });
                    if (result?.success && result?.url && !hasResolvedRef.current) {
                        hasResolvedRef.current = true;
                        setHighResUrl(result.url);
                        setDisplayUrl(result.url);
                        setUrl4k(result.url4k || null);
                        setImgLoaded(false);
                        setVideoLoaded(false);
                        setIsResolving(false);
                    }
                } catch (e) {
                    setIsResolving(false);
                }
            })();
        } else if (image.source === 'wallpaperwaifu' && image.detailUrl) {
            setIsResolving(true);
            (async () => {
                try {
                    const result: any = await invoke('resolve_wallpaperwaifu_video', { detailUrl: image.detailUrl });
                    if (result?.success && result?.url && !hasResolvedRef.current) {
                        hasResolvedRef.current = true;
                        let finalUrl = result.url;
                        if (finalUrl.startsWith('/')) {
                            finalUrl = `https://wallpaperwaifu.com${finalUrl}`;
                        }
                        setHighResUrl(finalUrl);
                        setDisplayUrl(finalUrl);
                        setUrl4k(result.url4k || null);
                        setImgLoaded(false);
                        setVideoLoaded(false);
                        setIsResolving(false);
                    }
                } catch (e) {
                    setIsResolving(false);
                }
            })();
        } else if (image.source === 'wallpapersclan' && image.detailUrl) {
            setIsResolving(true);
            (async () => {
                try {
                    const result: any = await invoke('resolve_wallpapersclan_highres', { detailUrl: image.detailUrl });
                    if (result?.success && result?.url && !hasResolvedRef.current) {
                        hasResolvedRef.current = true;
                        setHighResUrl(result.url);
                        setIsResolving(false);
                    } else {
                        setIsResolving(false);
                    }
                } catch (e) {
                    setIsResolving(false);
                }
            })();
        } else if (image.source === 'konachan' && image.detailUrl) {
            setIsResolving(true);
            (async () => {
                try {
                    const result: any = await invoke('resolve_konachan_highres', { detailUrl: image.detailUrl });
                    if (result?.success && result?.url) {
                        hasResolvedRef.current = true;
                        setTopLevelHighRes(result.url);
                    } else {
                        setIsResolving(false);
                    }
                } catch (e) {
                    setIsResolving(false);
                }
            })();
        } else if (image.source === 'desktophut' && image.detailUrl) {
            setIsResolving(true);
            (async () => {
                try {
                    const result: any = await invoke('resolve_desktophut_video', { detailUrl: image.detailUrl });
                    if (result?.success && result?.url && !hasResolvedRef.current) {
                        hasResolvedRef.current = true;
                        setHighResUrl(result.url);
                        setDisplayUrl(result.url);
                        setUrl4k(result.url4k || null);
                        setImgLoaded(false);
                        setIsResolving(false);
                    }
                } catch (e) {
                    setIsResolving(false);
                }
            })();
        } else {
            setHighResUrl(image.imageUrl || null);
            setDisplayUrl(image.imageUrl || image.thumbnailUrl || '');
        }
    }, [image.id, image.detailUrl, image.source, image.thumbnailUrl, image.imageUrl]);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    useEffect(() => {
        if (activeId && activeId === image.id) {
            setIsViewingActiveItem(true);
            return () => setIsViewingActiveItem(false);
        }
    }, [activeId, image.id, setIsViewingActiveItem]);

    const urlForWallpaper = highResUrl || displayUrl || image.imageUrl || image.thumbnailUrl || '';
    const isKonachanReady = !isResolving;

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        return false;
    }, []);

    const isVideo = useCallback((url?: string) => {
        if (!url) return false;
        const isVideoByExt = /\.(mp4|webm)(?:$|[?#])/i.test(url);
        return isVideoByExt || image.type === 'video';
    }, [image.type]);

    const sourceName = (s: string) => {
        const names: Record<string, string> = {
            wallhaven: 'Wallhaven',
            wallpaperflare: 'WallpaperFlare',
            wallpapersclan: 'WallpapersClan',
            motionbgs: 'MotionBGs',
            wallpaperwaifu: 'WallpaperWaifu',
            konachan: 'Konachan',
            moewalls: 'MoeWalls',
            freepik: 'Freepik',
            desktophut: 'DesktopHut',
            wallpaper_archive: 'LaxentaInc/Wallpaper-Archive',
        };
        return names[s] || s;
    };

    const handleAddToLibrary = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        const downloadUrl = url4k || urlForWallpaper;
        if (!downloadUrl) return;
        if (isLibQueued) return;

        const needsReferer = downloadUrl.includes('wallpaperwaifu.com/download.php') || image.source === 'konachan';
        const referer = needsReferer && image.detailUrl ? image.detailUrl : undefined;
        start(downloadUrl, image, referer, false, 'library');
    }, [url4k, urlForWallpaper, isLibQueued, image, start]);

    const handleSetWallpaper = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();

        if (image.type === 'video' && (image.source === 'motionbgs' || image.source === 'wallpaperwaifu' || image.source === 'desktophut')) {
            const videoUrlToUse = url4k || highResUrl;
            if (!videoUrlToUse) return;

            const needsReferer = videoUrlToUse.includes('wallpaperwaifu.com/download.php');
            const referer = needsReferer && image.detailUrl ? image.detailUrl : undefined;

            setPendingUrlToUse(videoUrlToUse);
            setPendingReferer(referer);
            setSelectorOpen(true);
        } else if (image.type === 'video') {
            window.open(image.imageUrl, '_blank');
        } else {
            if (!urlForWallpaper) return;
            const needsReferer = image.source === 'konachan';
            const referer = needsReferer && image.detailUrl ? image.detailUrl : undefined;
            onSetWallpaper(urlForWallpaper, referer);
        }
    }, [image, url4k, highResUrl, urlForWallpaper, onSetWallpaper]);

    const showUrl = displayUrl || highResUrl || image.imageUrl || image.thumbnailUrl || '';
    const shouldShowVideo = isVideo(showUrl);

    const FONT = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif';
    const TITLE_FONT = '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif';

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'rgba(4, 5, 8, 0.88)',
                    display: 'flex',
                    flexDirection: 'column',
                    backdropFilter: 'blur(16px)', // single root blur
                }}
                onClick={onClose}
                onContextMenu={handleContextMenu}
            >
                {/* top bar */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '20px 32px',
                        paddingTop: '40px',
                        background: 'linear-gradient(180deg, rgba(4,5,8,0.95) 0%, transparent 100%)',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        position: 'relative',
                        zIndex: 10,
                        flexShrink: 0,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flex: 1 }}>
                        <div style={{ minWidth: 0 }}>
                            <h2 style={{
                                fontFamily: TITLE_FONT,
                                fontSize: '16px',
                                fontWeight: 500,
                                color: '#f8fafc',
                                margin: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                letterSpacing: '-0.01em',
                            }}>
                                {(image.title || 'Untitled Wallpaper').replace(/^Download\s+/i, '')}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                                {image.source !== 'motionbgs' && image.source !== 'wallpaperwaifu' && image.source !== 'desktophut' && (
                                    <span style={{
                                        fontFamily: FONT,
                                        fontSize: '9px',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        color: '#3b82f6',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(59, 130, 246, 0.15)',
                                    }}>
                                        {sourceName(image.source)}
                                    </span>
                                )}
                                {image.type === 'video' && (
                                    <span style={{
                                        fontFamily: FONT,
                                        fontSize: '9px',
                                        fontWeight: 600,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        color: '#10b981',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        padding: '3px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(16, 185, 129, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                    }}>
                                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#10b981' }} />
                                        Animated
                                    </span>
                                )}
                                {image.width && image.height && (
                                    <span style={{
                                        fontFamily: FONT,
                                        fontSize: '10px',
                                        fontWeight: 500,
                                        color: '#64748b',
                                        letterSpacing: '0.01em',
                                        padding: '3px 6px',
                                        background: 'rgba(255,255,255,0.02)',
                                        borderRadius: '4px',
                                    }}>
                                        {image.width} × {image.height}
                                    </span>
                                )}
                                {isResolving && (
                                    <span style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontFamily: FONT,
                                        fontSize: '11px',
                                        color: '#3b82f6',
                                        fontWeight: 500,
                                    }}>
                                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                                        optimizing source...
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        {isInLibrary || isLibDone ? (
                            <Tooltip text="Already in library">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onClose();
                                        onGoToLibrary?.();
                                    }}
                                    style={{
                                        fontFamily: FONT,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '10px 20px',
                                        background: 'rgba(52, 211, 153, 0.1)',
                                        color: '#34d399',
                                        border: '1px solid rgba(52, 211, 153, 0.2)',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        letterSpacing: '0.01em',
                                    }}
                                >
                                    <CheckCircle size={16} />
                                    In Library
                                </button>
                            </Tooltip>
                        ) : (
                            <Tooltip text="Add to library">
                                <button
                                    onClick={handleAddToLibrary}
                                    disabled={isLibQueued || !isKonachanReady}
                                    style={{
                                        fontFamily: FONT,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        padding: '10px 20px',
                                        background: isLibQueued
                                            ? 'rgba(59, 130, 246, 0.12)'
                                            : 'rgba(255, 255, 255, 0.05)',
                                        color: isLibQueued ? '#60a5fa' : '#e2e8f0',
                                        border: isLibQueued
                                            ? '1px solid rgba(59, 130, 246, 0.24)'
                                            : '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '10px',
                                        cursor: isLibQueued ? 'not-allowed' : 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        opacity: isLibQueued || !isKonachanReady ? 0.7 : 1,
                                        position: 'relative',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {libStatus && libStatus.status === 'downloading' && libStatus.progress > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            left: 0,
                                            bottom: 0,
                                            height: '3px',
                                            width: `${libStatus.progress}%`,
                                            background: '#3b82f6',
                                        }} />
                                    )}
                                    {isLibQueued ? (
                                        <>
                                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                            {libStatus?.status === 'downloading' && libStatus.progress > 0
                                                ? `${libStatus.progress.toFixed(1)}%`
                                                : 'Queued...'}
                                        </>
                                    ) : !isKonachanReady ? (
                                        <>
                                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                            Resolving...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={16} />
                                            {url4k ? 'Add 4K to Library' : 'Add to Library'}
                                        </>
                                    )}
                                </button>
                            </Tooltip>
                        )}

                        <Tooltip text="Set wallpaper">
                            <button
                                onClick={handleSetWallpaper}
                                disabled={isLoading || isDownloadingThis || !isKonachanReady ||
                                    (image.type === 'video' && (image.source === 'motionbgs' || image.source === 'wallpaperwaifu' || image.source === 'desktophut') && !highResUrl)}
                                style={{
                                    fontFamily: FONT,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 20px',
                                    background: isSetAction
                                        ? 'rgba(52, 211, 153, 0.15)'
                                        : 'linear-gradient(135deg, #2563eb, #6366f1)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: isLoading || !isKonachanReady ? 'not-allowed' : 'pointer',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    opacity: isLoading || !isKonachanReady ? 0.6 : 1,
                                    boxShadow: '0 8px 20px -5px rgba(37, 99, 235, 0.3)',
                                    position: 'relative',
                                    overflow: 'hidden',
                                }}
                            >
                                {isSetAction && downloadProgress > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        left: 0,
                                        bottom: 0,
                                        height: '3px',
                                        width: `${downloadProgress}%`,
                                        background: '#34d399',
                                    }} />
                                )}
                                {isSetAction ? (
                                    <>
                                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                        {downloadProgress > 0 ? `${downloadProgress.toFixed(1)}%` : 'Setting...'}
                                    </>
                                ) : isLoading ? (
                                    <>
                                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                        Applying...
                                    </>
                                ) : (
                                    <>
                                        <Monitor size={16} />
                                        {image.type === 'video'
                                            ? (url4k ? 'Set 4K Live Wallpaper' : 'Set Live Wallpaper')
                                            : (url4k ? 'Set 4K Wallpaper' : 'Set as Wallpaper')
                                        }
                                    </>
                                )}
                            </button>
                        </Tooltip>

                        <button
                            onClick={(e) => { e.stopPropagation(); onClose(); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '40px',
                                height: '40px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: '#94a3b8',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '10px',
                                cursor: 'pointer',
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {isSlowNetwork && isDownloadingThis && (
                        <div style={{
                            position: 'absolute',
                            bottom: '-28px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fontFamily: FONT,
                            fontSize: '11px',
                            color: '#fbbf24',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(0,0,0,0.7)',
                            padding: '4px 12px',
                            borderRadius: '12px',
                        }}>
                            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                            slow connection, please wait...
                        </div>
                    )}
                </div>

                {/* preview part */}
                <div
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                        padding: '24px',
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <img
                        key="modal-thumbnail"
                        src={image.thumbnailUrl || image.imageUrl}
                        alt=""
                        style={{
                            maxWidth: '96%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            display: (shouldShowVideo && videoLoaded) || (!shouldShowVideo && imgLoaded) ? 'none' : 'block',
                            borderRadius: '16px',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                            zIndex: 1,
                        }}
                    />

                    {shouldShowVideo && (
                        <video
                            key={`video-${showUrl}`}
                            {...({ referrerPolicy: "no-referrer" } as any)}
                            src={showUrl}
                            controls
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="auto"
                            onLoadedData={() => setVideoLoaded(true)}
                            onContextMenu={handleContextMenu}
                            draggable={false}
                            style={{
                                display: videoLoaded ? 'block' : 'none',
                                maxWidth: '96%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                borderRadius: '16px',
                                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                                zIndex: 2,
                            }}
                        />
                    )}

                    {!shouldShowVideo && (
                        <img
                            key={`img-${image.source}-${imageKeyRef.current}-${image.id}`}
                            referrerPolicy="no-referrer"
                            src={showUrl}
                            alt={image.title || 'wallpaper'}
                            onLoad={() => setImgLoaded(true)}
                            onContextMenu={handleContextMenu}
                            draggable={false}
                            style={{
                                display: imgLoaded ? 'block' : 'none',
                                maxWidth: '96%',
                                maxHeight: '100%',
                                objectFit: 'contain',
                                borderRadius: '16px',
                                boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                                zIndex: 2,
                            }}
                        />
                    )}

                    {((shouldShowVideo && !videoLoaded) || (!shouldShowVideo && !imgLoaded)) && (
                        <div style={{
                            position: 'absolute',
                            zIndex: 3,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '12px',
                        }}>
                            <Loader2 size={32} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
                            <span style={{
                                fontFamily: FONT,
                                fontSize: '11px',
                                color: '#94a3b8',
                                fontWeight: 500,
                                letterSpacing: '0.05em',
                                textTransform: 'uppercase',
                                background: 'rgba(0,0,0,0.4)',
                                padding: '6px 14px',
                                borderRadius: '20px',
                            }}>
                                {isResolving ? 'Optimizing Source...' :
                                 shouldShowVideo ? 'Buffering Live Preview...' : 'Fetching High-Res...'}
                            </span>
                        </div>
                    )}
                </div>

                {/* footer area */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 32px',
                        paddingBottom: '24px',
                        background: 'linear-gradient(0deg, rgba(4,5,8,0.95) 0%, transparent 100%)',
                        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                        position: 'relative',
                        zIndex: 10,
                        flexShrink: 0,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                            onClick={() => setZoom(Math.max(zoom - 0.25, 0.5))}
                            style={{
                                width: '32px', height: '32px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '6px',
                                color: '#888',
                                cursor: 'pointer',
                            }}
                        >
                            <ZoomOut size={14} />
                        </button>
                        <button
                            onClick={() => setZoom(1)}
                            style={{
                                padding: '4px 12px', height: '32px',
                                display: 'flex', alignItems: 'center',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '6px',
                                color: '#888',
                                cursor: 'pointer',
                                fontFamily: FONT,
                                fontSize: '12px',
                                fontWeight: 500,
                            }}
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            onClick={() => setZoom(Math.min(zoom + 0.25, 3))}
                            style={{
                                width: '32px', height: '32px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '6px',
                                color: '#888',
                                cursor: 'pointer',
                            }}
                        >
                            <ZoomIn size={14} />
                        </button>
                    </div>

                    {image.tags && image.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '60%' }}>
                            {image.tags.slice(0, 8).map((tag, idx) => (
                                <span
                                    key={idx}
                                    style={{
                                        fontFamily: FONT,
                                        padding: '4px 12px',
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        borderRadius: '6px',
                                        fontSize: '11px',
                                        fontWeight: 500,
                                        color: '#64748b',
                                    }}
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                ` }} />
            </div>

            <MonitorSelectorModal
                isOpen={selectorOpen}
                onClose={() => { setSelectorOpen(false); setPendingUrlToUse(null); }}
                onConfirm={(monitors) => {
                    if (pendingUrlToUse) {
                        start(pendingUrlToUse, image, pendingReferer, true, 'set', monitors);
                    }
                }}
                title={`Set Live Wallpaper on...`}
            />
        </>
    );
};

export default ImageModal;