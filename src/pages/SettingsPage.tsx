import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';

import { Cog as SettingsIcon, Layout, Monitor, Leaf, Info, Gamepad2 } from 'lucide-react';
import PerfModeOverlay from '../components/PerfModeOverlay';
import { useConfirm } from '../context/ConfirmContext';

import VideoSettings from './settings/VideoSettings';
import DisplaySettings from './settings/DisplaySettings';
import TaskbarSettings from './settings/TaskbarSettings';
import PerformanceSettings from './settings/PerformanceSettings';
import AdvancedSettings from './settings/AdvancedSettings';

import AboutSettings from './settings/AboutSettings';
import DiscordSettings from './settings/DiscordSettings';

interface AppSettings {
    audioEnabled: boolean;
    liveWallpaperEnabled: boolean;
    videoPlayer: 'wmf' | 'mpv';
    mpvPath: string | null;
    mpvPreset: string;
    discordRpcEnabled: boolean;
    discordCustomStatus: string;
    discordCustomDetails: string;
    taskbarEffect: string;
    taskbarOpacity: number;
    taskbarColor: string;
    windowVibrancy: boolean;
    pauseOnFullscreen: boolean;
    perfMode: boolean;
    perfBlurEnabled: boolean;
    perfAnimationsEnabled: boolean;
    perfHomepageVideoEnabled: boolean;
    perfShadowsEnabled: boolean;
}

interface VideoState {
    isActive: boolean;
    videoPath?: string;
    videoUrl?: string;
    activeKind?: 'video' | 'scene' | 'mixed' | 'unknown';
}

const TABS = [
    { id: 'video', label: 'Basic Settings', icon: SettingsIcon },
    { id: 'display', label: 'Displays', icon: Layout },
    { id: 'taskbar', label: 'Taskbar', icon: Monitor },
    { id: 'performance', label: 'Performance', icon: Leaf },
    { id: 'advanced', label: 'Renderer', icon: SettingsIcon },
    { id: 'discord', label: 'Discord RPC', icon: Gamepad2 },

    { id: 'about', label: 'About', icon: Info },
];

interface SettingsPageProps {
    initialTab?: string;
}

export default function SettingsPage({ initialTab = 'video' }: SettingsPageProps) {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [settings, setSettings] = useState<AppSettings>({
        audioEnabled: false, liveWallpaperEnabled: true, videoPlayer: 'wmf', mpvPath: null, mpvPreset: 'Performance',
        discordRpcEnabled: true, discordCustomStatus: '', discordCustomDetails: '',
        taskbarEffect: 'Default', taskbarOpacity: 0.5, taskbarColor: '#000000',
        windowVibrancy: false, pauseOnFullscreen: true, perfMode: false, perfBlurEnabled: true,
        perfAnimationsEnabled: true, perfHomepageVideoEnabled: true, perfShadowsEnabled: true,
    });

    const [videoState, setVideoState] = useState<VideoState>({ isActive: false });
    const [startupEnabled, setStartupEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showPerfOverlay, setShowPerfOverlay] = useState(false);
    const { showAlert } = useConfirm();

    const applyPerfClasses = useCallback((s: AppSettings) => {
        const toggle = (cls: string, on: boolean) => document.body.classList.toggle(cls, on);
        toggle('perf-no-blur', s.perfMode && !s.perfBlurEnabled);
        toggle('perf-no-animations', s.perfMode && !s.perfAnimationsEnabled);
        toggle('perf-no-shadows', s.perfMode && !s.perfShadowsEnabled);
    }, []);

    const loadData = useCallback(async () => {
        try {
            const [settingsRes, video, startupRes]: any = await Promise.all([
                invoke('get_settings'),
                invoke('get_video_wallpaper_status'),
                invoke('get_startup_enabled'),
            ]);

            if (settingsRes && settingsRes.success && settingsRes.settings) {
                setSettings(settingsRes.settings);
                if (settingsRes.settings.windowVibrancy) {
                    document.body.classList.add('vibrancy-enabled');
                } else {
                    document.body.classList.remove('vibrancy-enabled');
                }
                applyPerfClasses(settingsRes.settings);
            }

            if (video) {
                const entries = Object.values(video.monitorWallpapers || {}) as Array<{ kind?: string }>;
                const kinds = new Set(entries.map((e) => (e?.kind || '').toLowerCase()).filter(Boolean));
                let activeKind: VideoState['activeKind'] = 'unknown';
                if (kinds.has('scene') && kinds.has('video')) activeKind = 'mixed';
                else if (kinds.has('scene')) activeKind = 'scene';
                else if (kinds.has('video')) activeKind = 'video';
                setVideoState({ ...video, activeKind });
            }
            setStartupEnabled(startupRes === true);
        } catch (error) {
            console.error('Failed to load settings:', error);
        } finally {
            setLoading(false);
        }
    }, [applyPerfClasses]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

    const handleSaveFullSettings = async (newSettings: AppSettings) => {
        try {
            const result: any = await invoke('save_settings', { settings: newSettings });
            if (result.success) {
                const playerChanged = settings.videoPlayer !== newSettings.videoPlayer || settings.mpvPath !== newSettings.mpvPath || settings.mpvPreset !== newSettings.mpvPreset;
                setSettings(newSettings);
                applyPerfClasses(newSettings);

                // when the player backend changes, we must stop the old player
                // before starting the new one to prevent both running at once
                if (playerChanged && videoState.isActive && videoState.videoPath) {
                    try {
                        // stop the old player process first
                        await invoke('stop_video_wallpaper_command');
                        // small delay to let the process fully exit
                        await new Promise(r => setTimeout(r, 300));
                        // now spawn with the new backend
                        await invoke('set_local_video_wallpaper', { filePath: videoState.videoPath });
                    } catch (err) {
                        console.error('player switch failed:', err);
                    }
                }
            }
        } catch (error) {
            console.error('Save failed:', error);
        }
    };

    const handleToggleStartup = async () => {
        const newValue = !startupEnabled;
        try {
            const result: boolean = await invoke('set_startup_enabled', { enabled: newValue });
            if (result) {
                setStartupEnabled(newValue);
            }
        } catch (error) {
            console.error('Failed to toggle startup:', error);
            showAlert({ title: 'Startup Error', message: 'failed to change startup setting: ' + error, isDanger: true });
        }
    };

    // wrapper to pass down to simple components
    const handleUpdateSetting = async (keyOrSettings: string | Partial<AppSettings>, value?: any) => {
        let updated;
        if (typeof keyOrSettings === 'string') {
            if (keyOrSettings === 'perfMode' && value !== settings.perfMode) {
                setShowPerfOverlay(true);
            }
            updated = { ...settings, [keyOrSettings]: value };
        } else {
            if ('perfMode' in keyOrSettings && keyOrSettings.perfMode !== settings.perfMode) {
                setShowPerfOverlay(true);
            }
            updated = { ...settings, ...keyOrSettings };
        }
        setSettings(updated);
        await handleSaveFullSettings(updated);
    };

    if (loading) {
        return (
            <div style={{ padding: '80px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ animation: 'spin 1s linear infinite', width: '24px', height: '24px', border: '2px solid rgba(0,120,212,0.25)', borderTop: '2px solid var(--accent)', borderRadius: '50%' }} />
            </div>
        );
    }

    const renderActiveTab = () => {
        switch (activeTab) {
            case 'video': return (
                <VideoSettings
                    settings={settings}
                    handleSaveSettings={handleUpdateSetting}
                    startupEnabled={startupEnabled}
                    handleToggleStartup={handleToggleStartup}
                />
            );
            case 'display': return <DisplaySettings />;
            case 'taskbar': return <TaskbarSettings settings={settings} handleSaveSettings={handleUpdateSetting} />;
            case 'performance': return <PerformanceSettings settings={settings} handleSaveSettings={handleUpdateSetting} />;
            case 'advanced': return <AdvancedSettings settings={settings} handleSaveSettings={handleUpdateSetting} />;
            case 'discord': return <DiscordSettings settings={settings} handleSaveSettings={handleUpdateSetting} />;

            case 'about': return <AboutSettings />;
            default: return null;
        }
    };



    return (
        <div style={{
            display: 'flex',
            height: 'calc(100vh - 84px)',
            overflow: 'hidden',
            background: 'var(--bg-primary)',
        }}>
            <div style={{
                width: '272px',
                minWidth: '272px',
                padding: '22px 12px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                overflowY: 'hidden',
                borderRight: '1px solid var(--border-subtle)',
                background: 'var(--bg-primary)',
            }}>
                <div style={{ padding: '8px 10px 16px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '4px' }}>
                    <div style={{
                        fontSize: '26px',
                        fontWeight: 700,
                        letterSpacing: '-0.015em',
                        color: 'var(--text-primary)',
                        marginBottom: '6px',
                    }}>
                        Settings
                    </div>
                    <div style={{
                        fontSize: '12px',
                        lineHeight: 1.45,
                        color: 'var(--text-secondary)',
                        maxWidth: '30ch',
                    }}>
                        Manage wallpaper, renderer, privacy, and performance preferences.
                    </div>
                </div>

                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '11px 13px',
                                borderRadius: '10px',
                                border: isActive ? '1px solid rgba(0,120,212,0.35)' : '1px solid transparent',
                                cursor: 'pointer',
                                textAlign: 'left',
                                background: isActive ? 'rgba(0,120,212,0.15)' : 'transparent',
                                color: isActive ? '#dbeeff' : 'var(--text-secondary)',
                                fontWeight: isActive ? 600 : 500,
                                fontSize: '13px',
                                lineHeight: 1.2,
                                letterSpacing: '0.01em',
                                opacity: 1,
                                transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                    e.currentTarget.style.color = 'var(--text-primary)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                }
                            }}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div style={{
                flex: 1,
                padding: '20px 26px 24px',
                overflowY: 'auto',
                position: 'relative',
                background: 'transparent',
            }}>
                <motion.div
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.22 }}
                    style={{
                        width: '100%',
                        minHeight: '100%',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '12px',
                        background: 'rgba(0,0,0,0.16)',
                        padding: '20px 22px',
                    }}
                >
                    {renderActiveTab()}
                </motion.div>
            </div>

            <PerfModeOverlay
                show={showPerfOverlay}
                active={settings.perfMode}
                onDone={() => setShowPerfOverlay(false)}
            />
        </div>
    );
}
