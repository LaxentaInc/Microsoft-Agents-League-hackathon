import { motion, AnimatePresence } from 'framer-motion';

interface PerformanceSettingsProps {
    settings: any;
    handleSaveSettings: (keyOrSettings: any, value?: any) => Promise<void>;
}

export default function PerformanceSettings({ settings, handleSaveSettings }: PerformanceSettingsProps) {
    const saving = false; // Add dummy since removing saving state earlier

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.5 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2Z" fill={settings.perfMode ? '#facc15' : 'none'} stroke={settings.perfMode ? '#facc15' : '#888'} strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
                    Performance
                </h2>
                {settings.perfMode && (
                    <span style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        background: 'rgba(250, 204, 21, 0.2)',
                        color: 'rgb(250, 204, 21)',
                        borderRadius: '4px',
                        fontWeight: 600
                    }}>
                        ACTIVE
                    </span>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* master toggle */}
                <div
                    style={{
                        padding: '16px',
                        background: settings.perfMode ? 'rgba(250, 204, 21, 0.08)' : 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 'var(--radius-md)',
                        border: settings.perfMode ? '1px solid rgba(250, 204, 21, 0.25)' : '1px solid var(--border-subtle)',
                        transition: 'var(--transition)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, marginRight: '16px' }}>
                            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                                Performance Mode
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                Disables gpu-heavy visual effects like blur, animations, and shadows.
                                Great for integrated gpus and older hardware.
                            </div>
                            <div style={{
                                fontSize: '12px',
                                color: 'var(--text-tertiary)',
                                padding: '8px 10px',
                                background: 'rgba(0, 0, 0, 0.2)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border-subtle)',
                            }}>
                                💡 Turning this on will disable all visual effects at once. You can re-enable individual ones below.
                            </div>
                        </div>
                        <label className="toggle-switch" style={{ flexShrink: 0 }}>
                            <input
                                type="checkbox"
                                checked={settings.perfMode}
                                onChange={(e) => {
                                    const on = e.target.checked;
                                    const updated = {
                                        perfMode: on,
                                        perfBlurEnabled: !on,
                                        perfAnimationsEnabled: !on,
                                        perfHomepageVideoEnabled: !on,
                                        perfShadowsEnabled: !on,
                                    };
                                    handleSaveSettings(updated);
                                }}
                                disabled={saving}
                            />
                            <span className="toggle-slider" />
                        </label>
                    </div>
                </div>

                {/* per-effect toggles — only visible when perf mode is on */}
                <AnimatePresence>
                    {settings.perfMode && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div style={{
                                padding: '16px',
                                background: 'rgba(0, 0, 0, 0.15)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '14px',
                            }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                    Fine-tune which effects to keep
                                </div>

                                {/* blur toggle */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>Blur Effects</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>backdrop blur on titlebar, sidebar, and modals</div>
                                    </div>
                                    <label className="toggle-switch" style={{ flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={settings.perfBlurEnabled}
                                            onChange={(e) => handleSaveSettings('perfBlurEnabled', e.target.checked)}
                                            disabled={saving}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </div>

                                {/* animations toggle */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>Animations</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>entrance animations, hover effects, transitions</div>
                                    </div>
                                    <label className="toggle-switch" style={{ flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={settings.perfAnimationsEnabled}
                                            onChange={(e) => handleSaveSettings('perfAnimationsEnabled', e.target.checked)}
                                            disabled={saving}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </div>

                                {/* homepage video toggle */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>Homepage Video</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>the cool video on the home screen</div>
                                    </div>
                                    <label className="toggle-switch" style={{ flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={settings.perfHomepageVideoEnabled}
                                            onChange={(e) => handleSaveSettings('perfHomepageVideoEnabled', e.target.checked)}
                                            disabled={saving}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </div>

                                {/* shadows toggle */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 600 }}>Shadows</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>drop shadows on images and cards</div>
                                    </div>
                                    <label className="toggle-switch" style={{ flexShrink: 0 }}>
                                        <input
                                            type="checkbox"
                                            checked={settings.perfShadowsEnabled}
                                            onChange={(e) => handleSaveSettings('perfShadowsEnabled', e.target.checked)}
                                            disabled={saving}
                                        />
                                        <span className="toggle-slider" />
                                    </label>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
