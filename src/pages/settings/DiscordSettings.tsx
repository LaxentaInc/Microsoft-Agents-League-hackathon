import React from 'react';
import { motion } from 'framer-motion';
import { Gamepad2 } from 'lucide-react';

interface DiscordSettingsProps {
    settings: {
        discordRpcEnabled: boolean;
        discordCustomStatus: string;
        discordCustomDetails: string;
    };
    handleSaveSettings: (keyOrSettings: string | Record<string, any>, value?: any) => Promise<void>;
}

export default function DiscordSettings({ settings, handleSaveSettings }: DiscordSettingsProps) {
    const [status, setStatus] = React.useState(settings.discordCustomStatus || '');
    const [details, setDetails] = React.useState(settings.discordCustomDetails || '');
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        setStatus(settings.discordCustomStatus || '');
        setDetails(settings.discordCustomDetails || '');
    }, [settings.discordCustomStatus, settings.discordCustomDetails]);

    const saveCustomText = async () => {
        setSaving(true);
        try {
            await handleSaveSettings({
                discordCustomStatus: status.trim(),
                discordCustomDetails: details.trim(),
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.35 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <Gamepad2 size={22} style={{ color: 'var(--accent)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Discord Rich Presence</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '16px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px' }}>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                                Enable Discord RPC
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                Show your ColorWall activity on your Discord profile.
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px', lineHeight: 1.45 }}>
                                RPC auto-hides when ColorWall is not focused or is hidden/minimized.
                            </div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={settings.discordRpcEnabled}
                                onChange={(e) => handleSaveSettings('discordRpcEnabled', e.target.checked)}
                            />
                            <span className="toggle-slider" />
                        </label>
                    </div>
                </div>

                <div style={{ padding: '16px', background: 'rgba(0, 0, 0, 0.2)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                        Custom Discord Status
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Override the default presence text. Leave fields empty to use automatic status.
                    </div>

                    <div style={{ display: 'grid', gap: '10px' }}>
                        <input
                            type="text"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            maxLength={128}
                            placeholder="Top line (Details), e.g. Editing wallpaper scene"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                background: 'rgba(0,0,0,0.22)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                fontSize: '13px',
                            }}
                        />
                        <input
                            type="text"
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            maxLength={128}
                            placeholder="Second line (State), e.g. Creating in ColorWall"
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-subtle)',
                                background: 'rgba(0,0,0,0.22)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                fontSize: '13px',
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            Preview: {status.trim() || 'ColorWall'} / {details.trim() || 'Idle / Browsing catalog'}
                        </div>
                        <button
                            onClick={saveCustomText}
                            disabled={saving}
                            className="btn-primary"
                            style={{ opacity: saving ? 0.7 : 1 }}
                        >
                            {saving ? 'Saving...' : 'Save Status'}
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
