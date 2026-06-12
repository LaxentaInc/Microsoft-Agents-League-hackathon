import { useRef, useState } from 'react';
import { Trash2, Check, Sliders, Monitor } from 'lucide-react';
import { useInView } from '../hooks/useInView';
import { convertFileSrc } from '@tauri-apps/api/core';

// interactive wallpaper info from the backend
interface InteractiveWallpaperData {
    id: string;
    name: string;
    folderPath: string;
    entryFile: string;
    format: string;
    previewImage?: string;
    author?: string;
    description?: string;
    wallpaperType?: string;
    properties?: Record<string, any>;
    addedAt: number;
}

interface InteractiveWallpaperCardProps {
    wallpaper: InteractiveWallpaperData;
    staticThumbnail?: string;
    isActive?: boolean;
    onSet?: () => void;
    onDelete?: () => void;
    onCustomize?: () => void;
}

export type { InteractiveWallpaperData };

export default function InteractiveWallpaperCard({
    wallpaper,
    staticThumbnail,
    isActive,
    onSet,
    onDelete,
    onCustomize,
}: InteractiveWallpaperCardProps) {
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [hovered, setHovered] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);
    const inView = useInView(cardRef, '400px', true);
    const iframeInView = useInView(cardRef, '100px', false);

    const previewSrc = wallpaper.previewImage
        ? convertFileSrc(wallpaper.previewImage)
        : undefined;

    // use static frame if available from DB, otherwise fallback to animated previewSrc
    const displaySrc = staticThumbnail || previewSrc;

    const hasProperties = wallpaper.properties && Object.keys(wallpaper.properties).length > 0;

    return (
        <div
            ref={cardRef}
            style={{
                position: 'relative',
                borderRadius: '12px',
                overflow: 'hidden',
                cursor: 'default',
                border: isActive ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
                breakInside: 'avoid',
                marginBottom: '18px',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                background: '#0a0a0a',
                transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
                boxShadow: hovered ? '0 8px 24px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* preview image container mapped exactly to video card dims to prevent shifts */}
            <div style={{ position: 'relative', background: '#0a0a0a', aspectRatio: '16 / 9' }}>
                {inView && displaySrc ? (
                    <>
                        <img
                            alt={wallpaper.name}
                            src={displaySrc}
                            style={{
                                position: 'absolute', inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                                opacity: imgLoaded ? 1 : 0,
                                transition: 'opacity 0.3s',
                            }}
                            loading="lazy"
                            onLoad={() => setImgLoaded(true)}
                            onError={() => setImgError(true)}
                            onContextMenu={(e) => e.preventDefault()}
                            draggable={false}
                        />
                        {/* Play fully animated GIF/Video overtop ONLY when hovered */}
                        {hovered && staticThumbnail && previewSrc && (
                            <img
                                alt="animated preview"
                                src={previewSrc}
                                style={{
                                    position: 'absolute', inset: 0,
                                    width: '100%', height: '100%',
                                    objectFit: 'cover', display: 'block', zIndex: 1,
                                    opacity: 1,
                                }}
                                onContextMenu={(e) => e.preventDefault()}
                                draggable={false}
                            />
                        )}
                    </>
                ) : (
                    iframeInView ? (
                        <iframe
                            src={`http://asset.localhost/${wallpaper.entryFile.replace(/\\/g, '/')}`}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                border: 'none',
                                background: 'transparent',
                                pointerEvents: 'none', // prevent intercepting hovers/clicks
                            }}
                            sandbox="allow-scripts allow-same-origin"
                            onLoad={() => setImgLoaded(true)}
                        />
                    ) : (
                        <div style={{
                            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.2)', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase'
                        }}>
                            Scroll to load
                        </div>
                    )
                )}

                {/* loading spinner */}
                {!imgLoaded && !imgError && inView && displaySrc && (
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

                {/* hover gradient */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 2,
                    background: hovered
                        ? 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)'
                        : 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 35%)',
                    transition: 'background 0.3s ease',
                    pointerEvents: 'none',
                }} />

                {/* active badge — top right */}
                {isActive && (
                    <div style={{
                        position: 'absolute', top: '8px', right: '8px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 8px',
                        background: 'var(--accent)',
                        borderRadius: '4px',
                        fontSize: '10px', fontWeight: 600,
                        color: 'white', zIndex: 3,
                    }}>
                        <Check size={10} /> Active
                    </div>
                )}

                {/* bottom: name + hover actions */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    zIndex: 3, padding: '10px',
                }}>
                    {/* name + author */}
                    <div style={{ marginBottom: hovered && (onSet || onDelete) ? '8px' : '0' }}>
                        <div style={{
                            fontSize: '12px', fontWeight: 600,
                            color: 'rgba(255,255,255,0.9)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {wallpaper.name}
                        </div>
                        {wallpaper.author && (
                            <div style={{
                                fontSize: '10px', color: 'rgba(255,255,255,0.45)',
                                marginTop: '2px',
                            }}>
                                by {wallpaper.author}
                            </div>
                        )}
                    </div>

                    {/* action buttons — hover only */}
                    {hovered && (onSet || onDelete || onCustomize) && (
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {onSet && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onSet(); }}
                                    style={{
                                        flex: 1,
                                        padding: '6px 12px',
                                        fontSize: '11px', fontWeight: 600,
                                        background: 'var(--accent)',
                                        color: 'white', border: 'none',
                                        borderRadius: '6px', cursor: 'pointer',
                                        transition: 'opacity 0.15s',
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'center', gap: '4px',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                                >
                                    <Monitor size={11} /> Set
                                </button>
                            )}
                            {isActive && hasProperties && onCustomize && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onCustomize(); }}
                                    style={{
                                        padding: '6px 8px',
                                        background: 'rgba(0, 120, 212, 0.8)',
                                        color: 'white', border: 'none',
                                        borderRadius: '6px', cursor: 'pointer',
                                        transition: 'opacity 0.15s',
                                        display: 'flex', alignItems: 'center',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                                >
                                    <Sliders size={12} />
                                </button>
                            )}
                            {onDelete && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                    style={{
                                        padding: '6px 8px',
                                        background: 'rgba(220, 38, 38, 0.8)',
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
