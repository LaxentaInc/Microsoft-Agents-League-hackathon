import React, { useState, useRef } from 'react';
import { useInView } from '../hooks/useInView';
import { WallpaperItem } from '../types/wallpaper';

interface StoreWallpaperCardProps {
    wallpaper: WallpaperItem;
    index: number;
    onClick: () => void;
}

export const StoreWallpaperCard: React.FC<StoreWallpaperCardProps> = ({ wallpaper, onClick }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    // trigger once so images stay loaded when scrolled out of view
    const inView = useInView(cardRef, '600px', true);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    // calculate aspect ratio - default to 16/9 if no dimensions
    const aspectRatio = wallpaper.width && wallpaper.height
        ? `${wallpaper.width} / ${wallpaper.height}`
        : '16/9';

    // resolution label
    const resLabel = wallpaper.width && wallpaper.height
        ? `${wallpaper.width}×${wallpaper.height}`
        : null;

    // tags to show on hover (limit to 4)
    const tags = wallpaper.tags?.slice(0, 4) || [];

    return (
        <div
            ref={cardRef}
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                breakInside: 'avoid',
                marginBottom: '16px',
                cursor: 'pointer',
                borderRadius: '12px',
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: 'var(--bg-secondary)',
                aspectRatio: aspectRatio,
                // css containment prevents reflow from propagating up
                contain: 'layout style paint',
            }}
        >
            {/* shimmer placeholder while image loads */}
            {!isLoaded && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary) 50%, var(--bg-secondary) 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 2s infinite linear',
                        zIndex: 1,
                    }}
                />
            )}

            {inView && (
                <img
                    src={wallpaper.thumbnailUrl}
                    alt={wallpaper.title || ''}
                    onLoad={() => setIsLoaded(true)}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        borderRadius: '12px',
                        opacity: isLoaded ? 1 : 0,
                        transition: 'opacity 0.25s ease',
                        position: 'relative',
                        zIndex: 2,
                    }}
                    loading="lazy"
                />
            )}

            {/* hover overlay - just a simple gradient, no fancy stuff */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: isHovered ? '100%' : '0%',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 40%, transparent 100%)',
                    zIndex: 3,
                    transition: 'height 0.2s ease, opacity 0.2s ease',
                    opacity: isHovered ? 1 : 0,
                    pointerEvents: 'none',
                    borderRadius: '12px',
                }}
            />

            {/* bottom info - shows on hover */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '10px',
                    zIndex: 4,
                    opacity: isHovered ? 1 : 0,
                    transition: 'opacity 0.2s ease',
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                }}
            >
                {/* tags */}
                {tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {tags.map((tag, i) => (
                            <span
                                key={i}
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: 'rgba(255,255,255,0.9)',
                                    background: 'rgba(255,255,255,0.15)',
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    textTransform: 'lowercase',
                                    lineHeight: 1.3,
                                }}
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* resolution + source */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {resLabel && (
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'rgba(255,255,255,0.65)',
                        }}>
                            {resLabel}
                        </span>
                    )}
                    <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.45)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                    }}>
                        {wallpaper.source}
                    </span>
                </div>
            </div>

            {/* live badge for video wallpapers */}
            {wallpaper.type === 'video' && (
                <div
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'white',
                        background: 'rgba(255, 50, 50, 0.8)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        zIndex: 5,
                        pointerEvents: 'none',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                    }}
                >
                    Live
                </div>
            )}
        </div>
    );
};
