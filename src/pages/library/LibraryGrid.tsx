import React from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Upload } from 'lucide-react';
import WallpaperCard from '../../components/WallpaperCard';
import MonitorSelectorModal from '../../components/MonitorSelectorModal';
import { useLibraryData } from './useLibraryData';

// shared grid + chrome for all library tabs
export default function LibraryGrid({ filter }: { filter: 'all' | 'videos' | 'images' }) {
    const {
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
    } = useLibraryData();

    const filteredWallpapers = React.useMemo(() => {
        switch (filter) {
            case 'videos':
                return wallpapers.filter(w => w.mediaType === 'video');
            case 'images':
                return wallpapers.filter(w => w.mediaType !== 'video');
            default:
                return wallpapers;
        }
    }, [filter, wallpapers]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            {/* upload action bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={handleUpload}
                    disabled={uploading}
                    style={{
                        padding: '10px 18px',
                        background: uploading
                            ? 'var(--bg-tertiary)'
                            : 'linear-gradient(135deg, var(--accent), #1a86d8)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: uploading ? 'not-allowed' : 'pointer',
                        fontWeight: 600,
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                        if (!uploading) e.currentTarget.style.opacity = '0.9';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                    }}
                >
                    {uploading ? (
                        <>
                            <div
                                style={{
                                    width: '16px',
                                    height: '16px',
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    borderTop: '2px solid white',
                                    borderRadius: '50%',
                                    animation: 'spin 0.8s linear infinite',
                                }}
                            />
                            Yaweee!...
                        </>
                    ) : (
                        <>
                            <Upload size={16} />
                            Upload
                        </>
                    )}
                </button>
            </div>

            {/* empty state */}
            {!loading && filteredWallpapers.length === 0 && (
                <div
                    style={{
                        textAlign: 'center',
                        padding: '80px 40px',
                        background: 'var(--bg-secondary)',
                        borderRadius: '16px',
                        border: '1px solid var(--border-color)',
                    }}
                >
                    <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.15 }}>📁</div>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '10px', color: 'var(--text-primary)' }}>
                        {filter === 'videos'
                            ? 'No video wallpapers yet'
                            : filter === 'images'
                                ? 'No image wallpapers yet'
                                : 'Your collection is empty bruh'}
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                        upload your favorite wallpapers to get started :3
                    </p>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <button
                            onClick={handleUpload}
                            style={{
                                padding: '12px 24px',
                                background: 'linear-gradient(135deg, var(--accent), #1a86d8)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '14px',
                                transition: 'opacity 0.15s',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                        >
                            Upload Wallpaper
                        </button>
                    </div>
                </div>
            )}

            {/* wallpapers grid */}
            {filteredWallpapers.length > 0 && (
                <>
                    <div
                        style={{
                            columns: '4 300px',
                            columnGap: '16px',
                        }}
                    >
                        {filteredWallpapers.slice(0, visibleCount).map((wallpaper) => {
                            const assetUrl = convertFileSrc(wallpaper.path);

                            const thumbSrc = wallpaper.mediaType === 'video'
                                ? thumbs[wallpaper.path]
                                : wallpaper.thumbnail ? convertFileSrc(wallpaper.thumbnail) : assetUrl;

                            return (
                                <WallpaperCard
                                    key={wallpaper.id}
                                    id={wallpaper.id}
                                    name={wallpaper.name}
                                    thumbnail={thumbSrc}
                                    filePath={wallpaper.mediaType === 'video' ? wallpaper.path : undefined}
                                    type={wallpaper.mediaType === 'video' ? 'video' : 'image'}
                                    isActive={isActive(wallpaper)}
                                    onSet={() => handleSetWallpaper(wallpaper)}
                                    onDelete={() => handleDelete(wallpaper)}
                                />
                            );
                        })}
                    </div>
                </>
            )}

            {/* infinite scroll sentinel */}
            {filteredWallpapers.length > visibleCount && (
                <div ref={sentinelRef} style={{ height: '20px', width: '100%', marginTop: '20px' }} />
            )}

            {/* monitor selector modal */}
            <MonitorSelectorModal
                isOpen={selectorOpen}
                onClose={() => { setSelectorOpen(false); setPendingWallpaper(null); }}
                onConfirm={(monitors) => {
                    if (pendingWallpaper) executeSetWallpaper(pendingWallpaper, monitors);
                }}
                title={`Set "${pendingWallpaper?.name || 'Wallpaper'}" on...`}
            />
        </div>
    );
}
