import { useState, useEffect } from 'react';
import { Settings, Download, CheckCircle2, XCircle, FolderOpen, ExternalLink, Cpu, Zap, Sparkles, RefreshCw, Trash2, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfirm } from '../../context/ConfirmContext';

interface AdvancedSettingsProps {
    settings: any;
    handleSaveSettings: (keyOrSettings: any, value?: any) => Promise<void>;
}

// status of the mpv setup - drives the ui state
type MpvStatus = 'unconfigured' | 'validating' | 'valid' | 'invalid' | 'downloading';

export default function AdvancedSettings({ settings, handleSaveSettings }: AdvancedSettingsProps) {
    const [mpvDownloading, setMpvDownloading] = useState(false);
    const [mpvProgress, setMpvProgress] = useState(0);
    const [mpvStatus, setMpvStatus] = useState<MpvStatus>(settings.mpvPath ? 'valid' : 'unconfigured');
    const [statusMessage, setStatusMessage] = useState('');
    const [mpvVersion, setMpvVersion] = useState('');
    // tracks whether the mpv config panel is shown separate from the active player
    // this lets users explore mpv setup without switching the active backend
    const [showMpvPanel, setShowMpvPanel] = useState(settings.videoPlayer === 'mpv');
    const { showAlert, showConfirm } = useConfirm();

    // whether mpv is actually usable (has valid path)
    const mpvReady = !!settings.mpvPath && mpvStatus === 'valid';

    // check if mpv is already auto-installed
    useEffect(() => {
        if (!settings.mpvPath) {
            invoke('check_mpv_installed').then((res: any) => {
                if (res.success && res.path) {

                    handleSaveSettings('mpvPath', res.path);
                    setMpvStatus('valid');
                    setStatusMessage('auto-detected from previous install');
                }
            }).catch(() => {});
        }
    }, []);

    // listen for mpv download progress
    useEffect(() => {
        const unlisten = listen('mpv-download-progress', (event: any) => {
            setMpvProgress(event.payload.percentage || 0);
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);

    const handleAutoSetupMpv = async () => {
        try {
            const check: any = await invoke('check_mpv_installed');
            if (check.success && check.path) {
                const confirmed = await showConfirm({
                    title: 'MPV Already Installed',
                    message: `An existing installation of MPV was found at:\n\n${check.path}\n\nDo you want to reinstall?`,
                    confirmText: 'Reinstall',
                    isDanger: true,
                });
                if (!confirmed) {
    
                    handleSaveSettings({ mpvPath: check.path, videoPlayer: 'mpv' } as any);
                    setMpvStatus('valid');
                    setStatusMessage('linked to existing installation — now active');
                    return;
                }
            }
        } catch (err) {
            console.error('check failed:', err);
        }

        setMpvDownloading(true);
        setMpvProgress(0);
        setMpvStatus('downloading');
        setStatusMessage('downloading latest mpv release...');
        try {
            const result: any = await invoke('download_and_setup_mpv');
            if (result.success && result.path) {

                handleSaveSettings({ mpvPath: result.path, videoPlayer: 'mpv' } as any);
                setMpvStatus('valid');
                setStatusMessage('installed and configured — now active');
                showAlert({ title: 'MPV Installed', message: 'mpv has been downloaded and configured! it is now your active renderer.' });
            } else {
                setMpvStatus('invalid');
                setStatusMessage(result.error || 'download failed');
            }
        } catch (error: any) {
            setMpvStatus('invalid');
            setStatusMessage(String(error));
        } finally {
            setMpvDownloading(false);
            setMpvProgress(0);
        }
    };

    const validateAndSetMpvPath = async (selected: string) => {
        setMpvStatus('validating');
        setStatusMessage('checking if this is a valid mpv executable...');
        try {
            const result: string = await invoke('validate_mpv_path', { path: selected });
            setMpvStatus('valid');
            setMpvVersion(result.trim());
            setStatusMessage('executable verified — mpv is now active');
            // set path AND switch to mpv as the active player
            handleSaveSettings({ mpvPath: selected, videoPlayer: 'mpv' } as any);

        } catch (error: any) {
            console.error('failed to validate mpv path:', error);
            setMpvStatus('invalid');
            setStatusMessage(String(error));
        }
    };

    const handleClearPath = () => {
        // clearing the mpv path means mpv can't run, so revert to wmf
        handleSaveSettings({ mpvPath: null, videoPlayer: 'wmf' } as any);
        setMpvStatus('unconfigured');
        setStatusMessage('');
        setMpvVersion('');
    };

    // helper to render the status indicator chip
    const renderStatusChip = () => {
        if (mpvStatus === 'unconfigured') return null;

        const configs: Record<string, { bg: string; border: string; color: string; icon: any; label: string }> = {
            validating: {
                bg: 'rgba(59, 130, 246, 0.1)',
                border: 'rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                icon: <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />,
                label: 'Validating...',
            },
            valid: {
                bg: 'rgba(34, 197, 94, 0.1)',
                border: 'rgba(34, 197, 94, 0.3)',
                color: '#4ade80',
                icon: <CheckCircle2 size={13} />,
                label: 'Configured',
            },
            invalid: {
                bg: 'rgba(239, 68, 68, 0.1)',
                border: 'rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                icon: <XCircle size={13} />,
                label: 'Error',
            },
            downloading: {
                bg: 'rgba(139, 92, 246, 0.1)',
                border: 'rgba(139, 92, 246, 0.3)',
                color: '#a78bfa',
                icon: <Download size={13} style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />,
                label: `Downloading ${Math.round(mpvProgress)}%`,
            },
        };

        const c = configs[mpvStatus];
        if (!c) return null;

        return (
            <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    color: c.color,
                }}
            >
                {c.icon}
                {c.label}
            </motion.span>
        );
    };

    const presets = [
        {
            id: 'Performance',
            label: 'Performance',
            desc: 'minimal gpu usage, prioritizes smooth playback on low-end hardware',
            icon: <Zap size={18} />,
            gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(16, 185, 129, 0.06))',
            borderActive: 'rgba(34, 197, 94, 0.4)',
            accentColor: '#4ade80',
            tag: 'low gpu',
        },
        {
            id: 'High',
            label: 'High Quality',
            desc: 'spline36 scaling with frame interpolation for smooth motion',
            icon: <Cpu size={18} />,
            gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.06))',
            borderActive: 'rgba(59, 130, 246, 0.4)',
            accentColor: '#60a5fa',
            tag: 'balanced',
        },
        {
            id: 'Ultra',
            label: 'Ultra',
            desc: 'ewa lanczos scaling, debanding, anti-ringing, and vsync',
            icon: <Sparkles size={18} />,
            gradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12), rgba(139, 92, 246, 0.06))',
            borderActive: 'rgba(168, 85, 247, 0.4)',
            accentColor: '#c084fc',
            tag: 'high gpu',
        },
    ];

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <Settings size={24} style={{ color: 'var(--accent)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
                    Renderer
                </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* player selection cards */}
                <div
                    style={{
                        padding: '20px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                    }}
                >
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                        Video Player Backend
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Choose which engine renders your video wallpapers.
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        {/* wmf card */}
                        <button
                            onClick={() => {
                                handleSaveSettings('videoPlayer', 'wmf');
                                setShowMpvPanel(false);
                            }}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                padding: '16px',
                                background: settings.videoPlayer === 'wmf'
                                    ? 'linear-gradient(135deg, rgba(0, 120, 212, 0.15), rgba(0, 120, 212, 0.05))'
                                    : 'rgba(0,0,0,0.2)',
                                border: settings.videoPlayer === 'wmf'
                                    ? '1.5px solid rgba(0, 120, 212, 0.5)'
                                    : '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                color: 'inherit',
                                transition: 'all 0.25s ease',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            {settings.videoPlayer === 'wmf' && (
                                <div style={{
                                    position: 'absolute', top: '8px', right: '8px',
                                }}>
                                    <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />
                                </div>
                            )}
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>WMF</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                Windows Media Foundation — built-in, zero setup required. Works out of the box.
                            </div>
                            <span style={{
                                fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                                borderRadius: '4px', background: 'rgba(0, 120, 212, 0.15)',
                                color: settings.videoPlayer === 'wmf' ? '#60a5fa' : 'var(--text-tertiary)',
                                alignSelf: 'flex-start',
                            }}>
                                DEFAULT
                            </span>
                        </button>

                        {/* mpv card */}
                        <button
                            onClick={() => {
                                if (mpvReady) {
                                    // mpv is configured, safe to switch
                                    handleSaveSettings('videoPlayer', 'mpv');
                                }
                                // always show the setup panel so they can configure or see status
                                setShowMpvPanel(true);
                            }}
                            style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                padding: '16px',
                                background: settings.videoPlayer === 'mpv'
                                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.05))'
                                    : showMpvPanel
                                        ? 'rgba(139, 92, 246, 0.04)'
                                        : 'rgba(0,0,0,0.2)',
                                border: settings.videoPlayer === 'mpv'
                                    ? '1.5px solid rgba(139, 92, 246, 0.5)'
                                    : showMpvPanel
                                        ? '1px solid rgba(139, 92, 246, 0.25)'
                                        : '1px solid var(--border-subtle)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                color: 'inherit',
                                transition: 'all 0.25s ease',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            {settings.videoPlayer === 'mpv' && (
                                <div style={{
                                    position: 'absolute', top: '8px', right: '8px',
                                }}>
                                    <CheckCircle2 size={16} style={{ color: '#a78bfa' }} />
                                </div>
                            )}
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>MPV</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                                Open-source player — supports more codecs, quality presets, and advanced rendering.
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{
                                    fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                                    borderRadius: '4px', background: 'rgba(139, 92, 246, 0.15)',
                                    color: settings.videoPlayer === 'mpv' ? '#c084fc' : 'var(--text-tertiary)',
                                }}>
                                    ADVANCED
                                </span>
                                {!mpvReady && (
                                    <span style={{
                                        fontSize: '10px', fontWeight: 600, padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: 'rgba(251, 191, 36, 0.12)',
                                        color: '#fbbf24',
                                    }}>
                                        SETUP REQUIRED
                                    </span>
                                )}
                            </div>
                        </button>
                    </div>
                </div>

                {/* mpv configuration panel shown when mpv card is clicked */}
                <AnimatePresence>
                    {showMpvPanel && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                {/* mpv setup card */}
                                <div
                                    style={{
                                        padding: '20px',
                                        background: 'rgba(139, 92, 246, 0.04)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid rgba(139, 92, 246, 0.15)',
                                    }}
                                >
                                    {/* setup header with status */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <div>
                                            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '2px' }}>
                                                MPV Setup
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                {settings.mpvPath ? 'mpv is ready to use' : 'mpv needs to be installed before use'}
                                            </div>
                                        </div>
                                        {renderStatusChip()}
                                    </div>

                                    {/* two-option setup: auto or manual */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '12px',
                                        marginBottom: statusMessage ? '16px' : '0',
                                    }}>
                                        {/* auto setup option */}
                                        <button
                                            onClick={handleAutoSetupMpv}
                                            disabled={mpvDownloading}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '20px 16px',
                                                background: 'rgba(0, 0, 0, 0.2)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: 'var(--radius-md)',
                                                cursor: mpvDownloading ? 'wait' : 'pointer',
                                                color: 'inherit',
                                                transition: 'all 0.25s ease',
                                                position: 'relative',
                                                overflow: 'hidden',
                                                textAlign: 'center',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!mpvDownloading) {
                                                    e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.4)';
                                                    e.currentTarget.style.background = 'rgba(34, 197, 94, 0.06)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)';
                                            }}
                                        >
                                            {/* download progress bar overlay */}
                                            {mpvDownloading && (
                                                <div style={{
                                                    position: 'absolute',
                                                    left: 0, top: 0, bottom: 0,
                                                    width: `${mpvProgress}%`,
                                                    background: 'rgba(34, 197, 94, 0.08)',
                                                    transition: 'width 0.3s ease',
                                                    borderRadius: 'var(--radius-md)',
                                                }} />
                                            )}
                                            <div style={{
                                                width: '40px', height: '40px',
                                                borderRadius: '12px',
                                                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.1))',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                position: 'relative', zIndex: 1,
                                            }}>
                                                <Download size={18} style={{ color: '#4ade80' }} />
                                            </div>
                                            <div style={{ position: 'relative', zIndex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                                                    {mpvDownloading
                                                        ? `Downloading... ${Math.round(mpvProgress)}%`
                                                        : settings.mpvPath ? 'Reinstall MPV' : 'Auto Install'}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.4' }}>
                                                    {mpvDownloading
                                                        ? 'please wait...'
                                                        : 'downloads and configures mpv automatically'}
                                                </div>
                                            </div>
                                            {settings.mpvPath && !mpvDownloading && (
                                                <span style={{
                                                    fontSize: '10px', color: 'var(--text-tertiary)',
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    position: 'relative', zIndex: 1,
                                                }}>
                                                    <RefreshCw size={10} /> reinstall
                                                </span>
                                            )}
                                        </button>

                                        {/* manual browse option */}
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const { open } = await import('@tauri-apps/plugin-dialog');
                                                    const selected = await open({
                                                        multiple: false,
                                                        filters: [{ name: 'Executable', extensions: ['exe'] }],
                                                        title: 'Select mpv.exe'
                                                    });
                                                    if (selected && typeof selected === 'string') {
                                        
                                                        validateAndSetMpvPath(selected);
                                                    }
                                                } catch (err) {
                                                    console.error('file picker error:', err);
                                                }
                                            }}
                                            style={{
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '20px 16px',
                                                background: 'rgba(0, 0, 0, 0.2)',
                                                border: '1px solid var(--border-subtle)',
                                                borderRadius: 'var(--radius-md)',
                                                cursor: 'pointer',
                                                color: 'inherit',
                                                transition: 'all 0.25s ease',
                                                textAlign: 'center',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                                                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.06)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.2)';
                                            }}
                                        >
                                            <div style={{
                                                width: '40px', height: '40px',
                                                borderRadius: '12px',
                                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.1))',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <FolderOpen size={18} style={{ color: '#a78bfa' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                                                    Browse Manually
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', lineHeight: '1.4' }}>
                                                    select an existing mpv.exe from your system
                                                </div>
                                            </div>
                                        </button>
                                    </div>

                                    {/* status message area — replaces the old terminal */}
                                    <AnimatePresence>
                                        {statusMessage && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -4 }}
                                                style={{
                                                    padding: '12px 16px',
                                                    borderRadius: 'var(--radius-md)',
                                                    background: mpvStatus === 'valid'
                                                        ? 'rgba(34, 197, 94, 0.06)'
                                                        : mpvStatus === 'invalid'
                                                            ? 'rgba(239, 68, 68, 0.06)'
                                                            : 'rgba(59, 130, 246, 0.06)',
                                                    border: `1px solid ${
                                                        mpvStatus === 'valid'
                                                            ? 'rgba(34, 197, 94, 0.2)'
                                                            : mpvStatus === 'invalid'
                                                                ? 'rgba(239, 68, 68, 0.2)'
                                                                : 'rgba(59, 130, 246, 0.2)'
                                                    }`,
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: '10px',
                                                }}
                                            >
                                                <div style={{ paddingTop: '1px' }}>
                                                    {mpvStatus === 'valid' && <CheckCircle2 size={15} style={{ color: '#4ade80' }} />}
                                                    {mpvStatus === 'invalid' && <XCircle size={15} style={{ color: '#f87171' }} />}
                                                    {(mpvStatus === 'validating' || mpvStatus === 'downloading') && <Info size={15} style={{ color: '#60a5fa' }} />}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{
                                                        fontSize: '12px',
                                                        color: mpvStatus === 'valid' ? '#4ade80' : mpvStatus === 'invalid' ? '#f87171' : '#60a5fa',
                                                        fontWeight: 600,
                                                        marginBottom: '2px',
                                                    }}>
                                                        {mpvStatus === 'valid' ? 'Ready' : mpvStatus === 'invalid' ? 'Something went wrong' : 'Working...'}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                                                        {statusMessage}
                                                    </div>
                                                    {mpvVersion && mpvStatus === 'valid' && (
                                                        <div style={{
                                                            fontSize: '11px',
                                                            color: 'var(--text-tertiary)',
                                                            fontFamily: 'Consolas, Monaco, monospace',
                                                            marginTop: '6px',
                                                            padding: '4px 8px',
                                                            background: 'rgba(0, 0, 0, 0.2)',
                                                            borderRadius: '4px',
                                                            display: 'inline-block',
                                                        }}>
                                                            {mpvVersion}
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* current path display — only when a path is set */}
                                    {settings.mpvPath && (
                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(139, 92, 246, 0.1)' }}>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px', fontWeight: 500 }}>
                                                Current path
                                            </div>
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                            }}>
                                                <div style={{
                                                    flex: 1,
                                                    padding: '8px 12px',
                                                    background: 'rgba(0, 0, 0, 0.25)',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: '1px solid var(--border-subtle)',
                                                    fontSize: '12px',
                                                    fontFamily: 'Consolas, Monaco, monospace',
                                                    color: 'var(--text-secondary)',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {settings.mpvPath}
                                                </div>
                                                <button
                                                    onClick={handleClearPath}
                                                    title="Remove MPV path"
                                                    style={{
                                                        padding: '8px',
                                                        background: 'rgba(239, 68, 68, 0.08)',
                                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                                        borderRadius: 'var(--radius-md)',
                                                        color: '#f87171',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        transition: 'all 0.2s ease',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                                                        e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* manual download link */}
                                    <div style={{
                                        marginTop: '16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '11px',
                                        color: 'var(--text-tertiary)',
                                    }}>
                                        <ExternalLink size={11} />
                                        <span>prefer to install manually?</span>
                                        <a
                                            href="https://mpv.io/installation/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#a78bfa', textDecoration: 'none', fontWeight: 500 }}
                                        >
                                            mpv.io/installation
                                        </a>
                                    </div>
                                </div>

                                {/* rendering quality presets — separate section */}
                                <div
                                    style={{
                                        padding: '20px',
                                        background: 'rgba(0, 0, 0, 0.2)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border-subtle)',
                                    }}
                                >
                                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                                        Rendering Quality
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                        Controls gpu usage vs visual quality. Takes effect on next wallpaper load.
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {presets.map((preset) => {
                                            const isSelected = settings.mpvPreset === preset.id;
                                            return (
                                                <button
                                                    key={preset.id}
                                                    onClick={() => handleSaveSettings('mpvPreset', preset.id)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '14px',
                                                        padding: '14px 16px',
                                                        background: isSelected ? preset.gradient : 'rgba(0,0,0,0.15)',
                                                        border: isSelected
                                                            ? `1.5px solid ${preset.borderActive}`
                                                            : '1px solid var(--border-subtle)',
                                                        borderRadius: 'var(--radius-md)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.25s ease',
                                                        textAlign: 'left',
                                                        color: 'inherit',
                                                        position: 'relative',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isSelected) {
                                                            e.currentTarget.style.borderColor = preset.borderActive;
                                                            e.currentTarget.style.background = preset.gradient;
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isSelected) {
                                                            e.currentTarget.style.borderColor = 'var(--border-subtle)';
                                                            e.currentTarget.style.background = 'rgba(0,0,0,0.15)';
                                                        }
                                                    }}
                                                >
                                                    {/* selection indicator */}
                                                    {isSelected && (
                                                        <div style={{
                                                            position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                                                        }}>
                                                            <CheckCircle2 size={16} style={{ color: preset.accentColor }} />
                                                        </div>
                                                    )}

                                                    <div style={{
                                                        width: '36px', height: '36px',
                                                        borderRadius: '10px',
                                                        background: isSelected
                                                            ? `${preset.borderActive}`
                                                            : 'rgba(255,255,255,0.05)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                        color: isSelected ? 'white' : 'var(--text-secondary)',
                                                        transition: 'all 0.25s ease',
                                                    }}>
                                                        {preset.icon}
                                                    </div>

                                                    <div style={{ flex: 1 }}>
                                                        <div style={{
                                                            fontWeight: 600, fontSize: '13px',
                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                            marginBottom: '2px',
                                                        }}>
                                                            {preset.label}
                                                            <span style={{
                                                                fontSize: '10px',
                                                                padding: '1px 7px',
                                                                borderRadius: '4px',
                                                                background: isSelected ? preset.borderActive : 'rgba(255,255,255,0.05)',
                                                                color: isSelected ? 'white' : 'var(--text-tertiary)',
                                                                fontWeight: 600,
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.5px',
                                                            }}>
                                                                {preset.tag}
                                                            </span>
                                                        </div>
                                                        <div style={{
                                                            fontSize: '11px',
                                                            color: 'var(--text-secondary)',
                                                            lineHeight: '1.4',
                                                        }}>
                                                            {preset.desc}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
