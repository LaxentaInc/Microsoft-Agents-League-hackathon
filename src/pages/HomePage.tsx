import React from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import ConfirmModal from '../components/confirmMod';
import { useVisibility } from '../context/WinCloseContext';
import Greeting from '../components/Greeting';

import HomeHeroCard from '../components/home/HomeHeroCard';
import HomeActiveBanner from '../components/home/HomeActiveBanner';
import HomeQuickActions from '../components/home/HomeQuickActions';
import { getGreeting } from '../components/home/HomeGreetingLogic';

// hardcoded filename so we cache it consistently locally
const HOMEPAGE_VIDEO_FILENAME = 'Shimoe_Koharu_-_Blue_Archive.mp4';
const SESSION_VIDEO_PATH_KEY = 'colorwall_homepage_video_path_mp4_github';

// downloads the homepage hero video via the rust backend, caches the local path
const useHomepageVideo = () => {
    const [videoSrc, setVideoSrc] = React.useState<string | null>(null);
    const [videoReady, setVideoReady] = React.useState(false);

    React.useEffect(() => {
        // check session cache first so we don't re-download every tab switch
        const cachedPath = sessionStorage.getItem(SESSION_VIDEO_PATH_KEY);
        if (cachedPath) {
            setVideoSrc(convertFileSrc(cachedPath));
            return;
        }

        let cancelled = false;

        const fetchVideo = async () => {
            try {
                // Fetch the latest release from the dedicated media repo
                const res = await fetch("https://api.github.com/repos/timeisinsideyjh/likekids/releases/latest");
                const data = await res.json();
                
                // Find the .mp4 asset
                const mp4Asset = data.assets?.find((a: any) => a.name.endsWith('.mp4'));
                const downloadUrl = mp4Asset?.browser_download_url || 'https://github.com/timeisinsideyjh/likekids/releases/download/mp4-mpv/Shimoe_Koharu_-_Blue_Archive.mp4';

                // Let Rust download and cache it from the GitHub CDN
                const result: any = await invoke('download_homepage_asset', {
                    url: downloadUrl,
                    filename: HOMEPAGE_VIDEO_FILENAME,
                });

                if (!cancelled && result.success && result.path) {
                    sessionStorage.setItem(SESSION_VIDEO_PATH_KEY, result.path);
                    setVideoSrc(convertFileSrc(result.path));
                } else if (!cancelled) {
                    console.log('[homepage] video download failed:', result.error);
                }
            } catch (err) {
                if (!cancelled) {
                    console.log('[homepage] could not download hero video:', err);
                }
            }
        };

        fetchVideo();
        return () => { cancelled = true; };
    }, []);

    return { videoSrc, videoReady, setVideoReady };
};

interface HomePageProps {
    onNavigateToSource: (source: string) => void;
    onNavigateToLive: () => void;
    onNavigateToDisplaySettings: () => void;
    isActive?: boolean;
}

const PROFILE_HINT_DISMISSED = 'colorwall_profile_hint_dismissed';

export default function HomePage({ onNavigateToSource, onNavigateToLive, onNavigateToDisplaySettings, isActive = true }: HomePageProps) {
    const { isVisible } = useVisibility();
    const { videoSrc, videoReady, setVideoReady } = useHomepageVideo();
    const [greeting, setGreeting] = React.useState<string>('Welcome to ColorWall');
    const [greetingTheme, setGreetingTheme] = React.useState<'blue' | 'gold'>('blue');
    const [showProfileHint, setShowProfileHint] = React.useState(() => {
        return localStorage.getItem(PROFILE_HINT_DISMISSED) !== 'true';
    });
    const [videoState, setVideoState] = React.useState<{ isActive: boolean; activeKind?: 'video' | 'scene' | 'mixed' | 'unknown' }>({ isActive: false });
    const [modal, setModal] = React.useState<{ isOpen: boolean; title: string; message: string; isDanger: boolean }>({
        isOpen: false,
        title: '',
        message: '',
        isDanger: false,
    });

    React.useEffect(() => {
        const initGreeting = async () => {
            // roughly 8% chance of gold theme, seems fair to me
            if (Math.random() > 0.92) {
                setGreetingTheme('gold');
            }
            try {
                const username: string = await invoke('get_username');
                const hour = new Date().getHours();

                if (username) {
                    setGreeting(getGreeting(hour, username));
                }
            } catch (error) {
                console.log('Could not get username, using default greeting');
                const hour = new Date().getHours();
                if (hour >= 0 && hour < 6) setGreeting('Good night!');
                else if (hour >= 6 && hour < 12) setGreeting('Good morning!');
                else if (hour >= 12 && hour < 18) setGreeting('Good afternoon!');
                else setGreeting('Good evening!');
            }
        };

        initGreeting();
    }, []);

    React.useEffect(() => {
        const loadWallpaperStatus = async () => {
            try {
                const video: any = await invoke('get_video_wallpaper_status');
                const entries = Object.values(video.monitorWallpapers || {}) as Array<{ kind?: string }>;
                const kinds = new Set(entries.map((e) => (e?.kind || '').toLowerCase()).filter(Boolean));
                let activeKind: 'video' | 'scene' | 'mixed' | 'unknown' = 'unknown';
                if (kinds.has('scene') && kinds.has('video')) activeKind = 'mixed';
                else if (kinds.has('scene')) activeKind = 'scene';
                else if (kinds.has('video')) activeKind = 'video';
                setVideoState({ isActive: !!video?.isActive, activeKind });
            } catch {
                setVideoState({ isActive: false, activeKind: 'unknown' });
            }
        };
        loadWallpaperStatus();
    }, []);

    const videoRef = React.useRef<HTMLVideoElement>(null);

    // check if perf mode wants the homepage video disabled
    const [perfVideoDisabled, setPerfVideoDisabled] = React.useState(false);
    React.useEffect(() => {
        invoke('get_settings').then((res: any) => {
            if (res.success && res.settings?.perfMode && !res.settings?.perfHomepageVideoEnabled) {
                setPerfVideoDisabled(true);
            }
        }).catch(() => { });
    }, []);

    const [uploading, setUploading] = React.useState(false);

    const handleUpload = async () => {
        try {
            setUploading(true);
            const selected = await openDialog({
                multiple: false,
                filters: [{ name: 'Media', extensions: ['mp4', 'mkv', 'jpg', 'jpeg', 'png', 'gif', 'webm', 'avi', 'mov', 'wmv'] }],
            });

            if (selected && typeof selected === 'string') {
                const result: any = await invoke('register_local_wallpaper', { filePath: selected });
                const filename = selected.split(/[\/\\]/).pop() || 'File';
                if (result.success) {
                    setModal({ isOpen: true, title: 'Wallpaper Added!', message: `"${filename}" has been added to your library.`, isDanger: false });
                } else {
                    setModal({ isOpen: true, title: 'Upload Failed', message: result.error, isDanger: true });
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setUploading(false);
        }
    };

    const shouldRenderVideo = isVisible && isActive && !!videoSrc && !perfVideoDisabled;

    return (
        <div style={{ position: 'relative', minHeight: '100%', overflow: 'hidden' }}>
            {shouldRenderVideo && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        zIndex: 0,
                        pointerEvents: 'none',
                        opacity: videoReady ? 1 : 0,
                        transition: 'opacity 1.2s ease-out',
                    }}
                >
                    <video
                        ref={videoRef}
                        src={videoSrc}
                        autoPlay
                        loop
                        muted
                        playsInline
                        onCanPlayThrough={() => setVideoReady(true)}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.65) 100%)',
                        }}
                    />
                </div>
            )}

            <div style={{ position: 'relative', zIndex: 1, padding: '40px 48px' }}>
                <ConfirmModal
                    isOpen={modal.isOpen}
                    title={modal.title}
                    message={modal.message}
                    isDanger={modal.isDanger}
                    hideButtons={true}
                    noBlur={true}
                    onConfirm={() => setModal({ ...modal, isOpen: false })}
                    onCancel={() => setModal({ ...modal, isOpen: false })}
                />

                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '40px',
                    maxWidth: '1400px',
                    margin: '0 auto',
                    paddingTop: '60px',
                }}>

                    {/* main side-by-side layout */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '40px',
                        alignItems: 'start',
                    }}>

                        {/* left column - greeting + quick actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '48px', paddingTop: '16px' }}>
                            {/* greeting */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <Greeting isVisible={isVisible} text={greeting} theme={greetingTheme} />
                                <p style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: '15px',
                                    lineHeight: 1.6,
                                    maxWidth: '440px',
                                    opacity: 0.9,
                                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                                }}>
                                    A desktop customization engine built for performance and you.
                                </p>

                                {showProfileHint && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                                        <span style={{ color: 'var(--text-tertiary)', fontSize: '13px', opacity: 0.7 }}>
                                            You can change your username anytime from the profile icon in the titlebar.
                                        </span>
                                        <button
                                            onClick={() => {
                                                setShowProfileHint(false);
                                                localStorage.setItem(PROFILE_HINT_DISMISSED, 'true');
                                            }}
                                            style={{
                                                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                                color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer',
                                                padding: '4px 10px', borderRadius: '6px', whiteSpace: 'nowrap',
                                            }}
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* quick actions */}
                            <HomeQuickActions
                                uploading={uploading}
                                onUpload={handleUpload}
                                onNavigateToSource={onNavigateToSource}
                            />
                        </div>

                        {/* right column - active banner + hero card */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '80px' }}>
                            {/* wallpaper active banner */}
                            <HomeActiveBanner
                                videoState={videoState}
                                onNavigateToDisplaySettings={onNavigateToDisplaySettings}
                            />

                            {/* hero card */}
                            <HomeHeroCard
                                onNavigateToLive={onNavigateToLive}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
