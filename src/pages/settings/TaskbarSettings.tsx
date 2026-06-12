import { Monitor } from 'lucide-react';
import { motion } from 'framer-motion';

interface TaskbarSettingsProps {
    settings: any;
    handleSaveSettings: (key: string, value: any) => Promise<void>;
}

export default function TaskbarSettings({ settings, handleSaveSettings }: TaskbarSettingsProps) {
    const saving = false;

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.5 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <Monitor size={24} style={{ color: 'var(--accent)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
                    Taskbar
                </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                    style={{
                        padding: '16px',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                    }}
                >
                    <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                        Taskbar Style
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        Customize the appearance of your Windows taskbar.
                    </div>

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {['Default', 'Transparent', 'Blur', 'Acrylic'].map((effect) => (
                            <label
                                key={effect}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    padding: '12px 16px',
                                    background: settings.taskbarEffect === effect ? 'rgba(0, 120, 212, 0.15)' : 'rgba(0,0,0,0.2)',
                                    border: settings.taskbarEffect === effect ? '1px solid rgba(0, 120, 212, 0.4)' : '1px solid var(--border-subtle)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    transition: 'var(--transition)',
                                    minWidth: '100px',
                                    opacity: saving ? 0.7 : 1,
                                }}
                            >
                                <input
                                    type="radio"
                                    name="taskbarEffect"
                                    value={effect}
                                    checked={settings.taskbarEffect === effect}
                                    onChange={() => handleSaveSettings('taskbarEffect', effect)}
                                    disabled={saving}
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{effect}</div>
                            </label>
                        ))}
                    </div>

                    {/* Opacity Slider for Acrylic only */}
                    {settings.taskbarEffect === 'Acrylic' && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            style={{ marginTop: '20px' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 600 }}>Tint Opacity</div>
                                <div style={{ fontSize: '14px', color: 'var(--accent)' }}>
                                    {Math.round((settings.taskbarOpacity || 0) * 100)}%
                                </div>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={settings.taskbarOpacity || 0}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    handleSaveSettings('taskbarOpacity', val);
                                }}
                                style={{ width: '100%', accentColor: 'var(--accent)' }}
                            />

                            {/* Color Picker */}
                            <div style={{ marginTop: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 600 }}>Tint Color</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                        Windows supports single-color tint only
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    {/* Custom Color SWATCH */}
                                    <div style={{ position: 'relative', width: '48px', height: '48px' }}>
                                        <div
                                            style={{
                                                position: 'absolute', inset: 0,
                                                background: settings.taskbarColor || '#000000',
                                                borderRadius: '12px',
                                                border: '2px solid rgba(255,255,255,0.1)',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                                            }}
                                        />
                                        <input
                                            type="color"
                                            value={settings.taskbarColor || '#000000'}
                                            onChange={(e) => {
                                                handleSaveSettings('taskbarColor', e.target.value);
                                            }}
                                            style={{
                                                position: 'absolute', inset: 0, opacity: 0,
                                                width: '100%', height: '100%', cursor: 'pointer'
                                            }}
                                        />
                                    </div>

                                    {/* Hex Input */}
                                    <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0 12px', borderRadius: '8px', height: '48px', flex: 1, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span style={{ color: 'var(--text-tertiary)', marginRight: '4px', fontFamily: 'monospace' }}>#</span>
                                        <input
                                            type="text"
                                            value={(settings.taskbarColor || '').replace('#', '').toUpperCase()}
                                            onChange={(e) => {
                                                let val = e.target.value;
                                                handleSaveSettings('taskbarColor', '#' + val);
                                            }}
                                            style={{
                                                background: 'transparent', border: 'none', color: 'var(--text-primary)',
                                                fontSize: '14px', fontFamily: 'monospace', fontWeight: 600, width: '100%', outline: 'none',
                                                textTransform: 'uppercase'
                                            }}
                                            spellCheck={false}
                                        />
                                    </div>
                                </div>

                                {/* Preset Colors */}
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                                    {['#000000', '#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560', '#00ADB5', '#222831', '#FFFFFF'].map((color) => (
                                        <button
                                            key={color}
                                            onClick={() => handleSaveSettings('taskbarColor', color)}
                                            style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '50%',
                                                background: color,
                                                border: settings.taskbarColor === color ? '2px solid white' : '2px solid transparent',
                                                boxShadow: settings.taskbarColor === color ? '0 0 0 2px var(--accent)' : 'none',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                transform: settings.taskbarColor === color ? 'scale(1.1)' : 'scale(1)',
                                            }}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
