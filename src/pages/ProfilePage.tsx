import React from 'react';
import { motion } from 'framer-motion';
import { Save, User } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface SystemInfo {
    screen_width: number;
    screen_height: number;
    total_memory_gb: number;
    used_memory_gb: number;
    cpu_name: string;
    cpu_usage: number;
    gpu_name: string;
    gpu_usage: number;
    os_name: string;
    os_version: string;
    disk_total_gb: number;
    disk_used_gb: number;
}

export default function ProfilePage() {
    const [displayName, setDisplayName] = React.useState('');
    const [systemName, setSystemName] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [systemInfo, setSystemInfo] = React.useState<SystemInfo | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        loadProfile();
        loadSystemInfo();
    }, []);

    const loadProfile = async () => {
        try {
            const sysName: string = await invoke('get_username');
            const result: any = await invoke('get_settings');
            if (result.success && result.settings) {
                setDisplayName(result.settings.displayName || '');
                setSystemName(result.settings.displayName || sysName);
            } else {
                setSystemName(sysName);
            }
        } catch (error) {
            console.error('failed to load profile:', error);
        }
    };

    const loadSystemInfo = async () => {
        try {
            setLoading(true);
            const info: SystemInfo = await invoke('get_system_info');
            setSystemInfo(info);
        } catch (error) {
            console.error('failed to load system info:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const result: any = await invoke('get_settings');
            if (result.success && result.settings) {
                const settings = result.settings;
                settings.displayName = displayName.trim() || null;

                const saveResult: any = await invoke('save_settings', { settings });
                if (saveResult.success) {
                    setSystemName(displayName.trim() || systemName);
                }
            }
        } catch (error) {
            console.error('failed to save profile:', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ padding: '40px 48px', maxWidth: '900px' }}>
            {/* profile section */}
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                style={{ marginBottom: '48px' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
                    <div
                        style={{
                            width: '80px',
                            height: '80px',
                            borderRadius: '50%',
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <User size={40} color="rgba(59, 130, 246, 0.8)" />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '32px', fontWeight: 700, background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px', letterSpacing: '1px' }}>
                            {systemName || 'User'}
                        </h1>
                        <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
                            pleeez enter display name inside me~
                        </p>
                    </div>
                </div>

                <div>
                    <label style={{
                        display: 'block',
                        // color: 'var(--text-secondary)',
                        background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        fontSize: '14px',
                        fontWeight: 500,
                        marginBottom: '12px',
                    }}>
                        Display Name
                    </label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder={systemName || "enter display name... plez enter it inside me~"}
                            maxLength={30}
                            style={{
                                flex: 1,
                                padding: '14px 18px',
                                fontSize: '15px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                border: '1.5px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '12px',
                                color: 'white',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                        />
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            style={{
                                padding: '14px 24px',
                                background: saving ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.15)',
                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                borderRadius: '12px',
                                color: '#60a5fa',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: saving ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'background 0.2s',
                            }}
                        >
                            {saving ? (
                                <>
                                    <div
                                        style={{
                                            width: '14px',
                                            height: '14px',
                                            border: '2px solid rgba(96, 165, 250, 0.3)',
                                            borderTop: '2px solid #60a5fa',
                                            borderRadius: '50%',
                                            animation: 'spin 0.8s linear infinite',
                                        }}
                                    />
                                    saving...
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    save
                                </>
                            )}
                        </button>
                    </div>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '8px' }}>
                        Leave empty to use your system username, well unless it's "MY-PC"
                    </p>
                </div>
            </motion.div>

            {/* system info section - improved spacing */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
            >
                <h2 style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    marginBottom: '24px',
                    color: 'var(--text-secondary)',
                }}>
                    System Info
                </h2>

                {loading ? (
                    <div style={{
                        color: 'var(--text-tertiary)',
                        fontSize: '14px',
                        padding: '20px 0',
                    }}>
                        Checking...
                    </div>
                ) : systemInfo ? (
                    <div style={{
                        padding: '24px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '12px',
                    }}>
                        <div style={{
                            display: 'grid',
                            gap: '14px',
                            fontSize: '14px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                <span style={{
                                    color: 'var(--text-tertiary)',
                                    minWidth: '100px',
                                    display: 'inline-block',
                                }}>Resolution:</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {systemInfo.screen_width} x {systemInfo.screen_height}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                <span style={{
                                    color: 'var(--text-tertiary)',
                                    minWidth: '100px',
                                    display: 'inline-block',
                                }}>OS:</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {systemInfo.os_name} {systemInfo.os_version}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                <span style={{
                                    color: 'var(--text-tertiary)',
                                    minWidth: '100px',
                                    display: 'inline-block',
                                }}>CPU:</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {systemInfo.cpu_name}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                <span style={{
                                    color: 'var(--text-tertiary)',
                                    minWidth: '100px',
                                    display: 'inline-block',
                                }}>GPU:</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {systemInfo.gpu_name}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                <span style={{
                                    color: 'var(--text-tertiary)',
                                    minWidth: '100px',
                                    display: 'inline-block',
                                }}>Memory:</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {systemInfo.total_memory_gb.toFixed(1)} GB
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline' }}>
                                <span style={{
                                    color: 'var(--text-tertiary)',
                                    minWidth: '100px',
                                    display: 'inline-block',
                                }}>Disk:</span>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                    {systemInfo.disk_total_gb.toFixed(1)} GB
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{
                        color: 'var(--text-tertiary)',
                        fontSize: '14px',
                        padding: '20px 0',
                    }}>
                        failed to load system info
                    </div>
                )}
            </motion.div>
        </div>
    );
}
