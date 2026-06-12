import { useCallback, useRef, useState } from 'react';
import { Image, Play, Trash2, Check, Monitor, Pencil } from 'lucide-react';
import { useInView } from '../hooks/useInView';
import { convertFileSrc } from '@tauri-apps/api/core';

interface WallpaperCardProps {
    id: string;
    thumbnail?: string;
    /** original file path, needed for video hover preview */
    filePath?: string;
    name?: string;
    type: 'image' | 'video';
    source?: string;
    isActive?: boolean;
    onClick?: () => void;
    onEdit?: () => void;
    onSet?: () => void;
    onDelete?: () => void;
}

export default function WallpaperCard({
    thumbnail,
    filePath,
    name,
    type,
    isActive,
    onClick,
    onEdit,
    onSet,
    onDelete,
}: WallpaperCardProps) {
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [showVideo, setShowVideo] = useState(false);
    const [hovered, setHovered] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inView = useInView(cardRef, '400px', true);

    // start video preview after hovering for 500ms
    const handleMouseEnter = useCallback(() => {
        setHovered(true);
        if (type === 'video' && filePath) {
            hoverTimer.current = setTimeout(() => setShowVideo(true), 500);
        }
    }, [type, filePath]);

    // immediately tear down the video on unhover
    const handleMouseLeave = useCallback(() => {
        setHovered(false);
        if (hoverTimer.current) {
            clearTimeout(hoverTimer.current);
            hoverTimer.current = null;
        }
        if (showVideo) {
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            }
            setShowVideo(false);
        }
    }, [showVideo]);

    // trim extension and clean up filename for display
    const displayName = name
        ? name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
        : undefined;

    return (
        <div
            ref={cardRef}
            onClick={onClick}
            style={{
                position: 'relative',
                borderRadius: '10px',
                overflow: 'hidden',
                cursor: onClick ? 'pointer' : 'default',
                border: isActive ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
                breakInside: 'avoid',
                marginBottom: '16px',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                background: '#0a0a0a',
                transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
                boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* thumbnail / video preview */}
            <div style={{ position: 'relative', background: '#0a0a0a', aspectRatio: '16 / 9' }}>
                {/* loading placeholder */}
                {!imgLoaded && !imgError && inView && thumbnail && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div style={{
                            width: '20px', height: '20px',
                            border: '2px solid rgba(128,128,128,0.15)',
                            borderTop: '2px solid rgba(128,128,128,0.4)',
                            borderRadius: '50%',
                            animation: 'spin 0.6s linear infinite',
                        }} />
                    </div>
                )}

                {/* video hover preview */}
                {showVideo && filePath && (
                    <video
                        ref={videoRef}
                        src={convertFileSrc(filePath)}
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%',
                            objectFit: 'cover', display: 'block', zIndex: 2,
                        }}
                        muted loop playsInline autoPlay
                        onContextMenu={(e) => e.preventDefault()}
                    />
                )}

                {/* static thumbnail */}
                {inView && thumbnail ? (
                    <img
                        alt=""
                        src={thumbnail}
                        style={{
                            position: 'absolute', inset: 0,
                            width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                            opacity: imgLoaded ? 1 : 0,
                            transition: 'opacity 0.3s',
                        }}
                        loading="lazy"
                        onLoad={() => setImgLoaded(true)}
                        onError={() => setImgError(true)}
                        onContextMenu={(e) => e.preventDefault()}
                        draggable={false}
                    />
                ) : !inView ? (
                    <div style={{ position: 'absolute', inset: 0 }} />
                ) : !thumbnail ? (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div style={{
                            width: '20px', height: '20px',
                            border: '2px solid rgba(128,128,128,0.15)',
                            borderTop: '2px solid rgba(128,128,128,0.3)',
                            borderRadius: '50%',
                            animation: 'spin 0.6s linear infinite',
                        }} />
                    </div>
                ) : null}

                {imgError && (
                    <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-tertiary)',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <Image size={28} style={{ margin: '0 auto 6px', opacity: 0.2 }} />
                            <span style={{ fontSize: '11px', opacity: 0.4 }}>failed to load</span>
                        </div>
                    </div>
                )}

                {/* hover gradient overlay */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 3,
                    background: hovered
                        ? 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)'
                        : 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 40%)',
                    transition: 'background 0.3s ease',
                    pointerEvents: 'none',
                }} />

                {/* small type badge — top left, minimal */}
                {type === 'video' && (
                    <div style={{
                        position: 'absolute', top: '8px', left: '8px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px',
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(8px)',
                        borderRadius: '4px',
                        fontSize: '10px', fontWeight: 600,
                        color: 'rgba(255,255,255,0.8)',
                        zIndex: 4, letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                    }}>
                        <Play size={9} fill="currentColor" /> Video
                    </div>
                )}

                {/* active indicator — top right, small dot style */}
                {isActive && (
                    <div style={{
                        position: 'absolute', top: '8px', right: '8px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px',
                        background: 'var(--accent)',
                        borderRadius: '4px',
                        fontSize: '10px', fontWeight: 600,
                        color: 'white', zIndex: 4,
                    }}>
                        <Check size={10} /> Active
                    </div>
                )}

                {/* bottom section: name + actions (only on hover) */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    zIndex: 4, padding: '10px',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                    gap: '8px',
                }}>
                    {/* wallpaper name */}
                    {displayName && (
                        <span style={{
                            fontSize: '12px', fontWeight: 500,
                            color: 'rgba(255,255,255,0.85)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            flex: 1, minWidth: 0,
                            opacity: hovered ? 1 : 0.7,
                            transition: 'opacity 0.2s',
                        }}>
                            {displayName}
                        </span>
                    )}

                    {/* action buttons — only visible on hover */}
                    {hovered && (onEdit || onSet || onDelete) && (
                        <div style={{
                            display: 'flex', gap: '6px', flexShrink: 0,
                        }}>
                            {onEdit && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '11px', fontWeight: 600,
                                        background: 'rgba(255,255,255,0.12)',
                                        color: 'white', border: '1px solid rgba(255,255,255,0.15)',
                                        borderRadius: '6px', cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                                >
                                    <Pencil size={11} /> Edit
                                </button>
                            )}
                            {onSet && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onSet(); }}
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '11px', fontWeight: 600,
                                        background: 'var(--accent)',
                                        color: 'white', border: 'none',
                                        borderRadius: '6px', cursor: 'pointer',
                                        transition: 'opacity 0.15s',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                                >
                                    <Monitor size={11} /> Set
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                    style={{
                                        padding: '6px 8px',
                                        background: 'rgba(220,38,38,0.8)',
                                        color: 'white', border: 'none',
                                        borderRadius: '6px', cursor: 'pointer',
                                        transition: 'opacity 0.15s',
                                        display: 'flex', alignItems: 'center',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                                >
                                    <Trash2 size={12} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}