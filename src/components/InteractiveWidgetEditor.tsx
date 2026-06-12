import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Trash2, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { PropertyControl, ColorwallProperty } from './InteractivePropertiesPanel';
import { useConfirm } from '../context/ConfirmContext';

interface WidgetManifest {
    id: string;
    name: string;
    description?: string;
    author?: string;
    version?: string;
    builtin: boolean;
    tweaks?: Record<string, ColorwallProperty>;
}

interface WidgetPosition {
    x: string;
    y: string;
}

interface WidgetInstance {
    widgetId: string;
    instanceId: string;
    position?: WidgetPosition;
    tweakOverrides: Record<string, any>;
    enabled: boolean;
    zIndex?: number;
}

interface SceneWidgetConfig {
    widgets: WidgetInstance[];
}

interface InteractiveWidgetEditorProps {
    folderPath: string;
}

export default function InteractiveWidgetEditor({ folderPath }: InteractiveWidgetEditorProps) {
    const [config, setConfig] = useState<SceneWidgetConfig>({ widgets: [] });
    const [availableWidgets, setAvailableWidgets] = useState<WidgetManifest[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());
    const [showAddMenu, setShowAddMenu] = useState(false);
    const { showAlert, showConfirm } = useConfirm();

    useEffect(() => {
        loadData();
    }, [folderPath]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [widgetsRes, configRes]: [any, any] = await Promise.all([
                invoke('list_widgets'),
                invoke('get_widget_config', { wallpaperId: folderPath }),
            ]);

            if (widgetsRes.success) {
                setAvailableWidgets(widgetsRes.widgets || []);
            }
            if (configRes.success && configRes.config) {
                setConfig(configRes.config);
            } else {
                setConfig({ widgets: [] });
            }
        } catch (error) {
            console.error('Failed to load widget data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res: any = await invoke('save_widget_config', {
                wallpaperId: folderPath,
                config,
            });
            if (res.success) {
                // showAlert({ title: 'Saved', message: 'Widget configuration saved.' });
                // We don't show an alert every time to make it feel snappier
            } else {
                showAlert({ title: 'Error', message: res.error || 'Failed to save configuration', isDanger: true });
            }
        } catch (error) {
            console.error(error);
            showAlert({ title: 'Error', message: 'Failed to save configuration', isDanger: true });
        } finally {
            setSaving(false);
        }
    };

    const addWidgetInstance = (manifest: WidgetManifest) => {
        const newInstance: WidgetInstance = {
            widgetId: manifest.id,
            instanceId: `inst_${Math.random().toString(36).substr(2, 9)}`,
            tweakOverrides: {},
            enabled: true,
        };

        setConfig((prev) => ({
            ...prev,
            widgets: [...(prev.widgets || []), newInstance],
        }));
        
        // Auto-expand the new instance
        setExpandedInstances((prev) => {
            const next = new Set(prev);
            next.add(newInstance.instanceId);
            return next;
        });
        
        setShowAddMenu(false);
    };

    const removeWidgetInstance = async (instanceId: string) => {
        const confirmed = await showConfirm({
            title: 'Remove Widget',
            message: 'Are you sure you want to remove this widget from the scene?',
            confirmText: 'Remove',
            isDanger: true,
        });

        if (confirmed) {
            setConfig((prev) => ({
                ...prev,
                widgets: prev.widgets.filter((w) => w.instanceId !== instanceId),
            }));
        }
    };

    const updateInstanceTweak = (instanceId: string, tweakName: string, value: any) => {
        setConfig((prev) => ({
            ...prev,
            widgets: prev.widgets.map((w) => {
                if (w.instanceId === instanceId) {
                    return {
                        ...w,
                        tweakOverrides: {
                            ...w.tweakOverrides,
                            [tweakName]: value,
                        },
                    };
                }
                return w;
            }),
        }));
    };

    const toggleInstanceExpanded = (instanceId: string) => {
        setExpandedInstances((prev) => {
            const next = new Set(prev);
            if (next.has(instanceId)) {
                next.delete(instanceId);
            } else {
                next.add(instanceId);
            }
            return next;
        });
    };

    const toggleInstanceEnabled = (instanceId: string) => {
        setConfig((prev) => ({
            ...prev,
            widgets: prev.widgets.map((w) => {
                if (w.instanceId === instanceId) {
                    return { ...w, enabled: !w.enabled };
                }
                return w;
            }),
        }));
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                Loading widgets...
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    ACTIVE WIDGETS
                </div>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowAddMenu(!showAddMenu)}
                        style={{
                            background: 'rgba(139, 92, 246, 0.15)',
                            color: 'rgb(167, 139, 250)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                        }}
                    >
                        <Plus size={12} /> Add
                    </button>
                    
                    {showAddMenu && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            background: '#15151a',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            width: '200px',
                            maxHeight: '300px',
                            overflowY: 'auto',
                            zIndex: 10,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        }}>
                            {availableWidgets.length === 0 ? (
                                <div style={{ padding: '12px', fontSize: '12px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                                    No widgets installed
                                </div>
                            ) : (
                                availableWidgets.map(manifest => (
                                    <button
                                        key={manifest.id}
                                        onClick={() => addWidgetInstance(manifest)}
                                        style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '10px 12px',
                                            background: 'transparent',
                                            border: 'none',
                                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                                            color: 'var(--text-primary)',
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <div style={{ fontWeight: 600 }}>{manifest.name}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                            {manifest.author || 'Built-in'}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {config.widgets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-tertiary)', fontSize: '12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                    No widgets active on this scene. Click Add to place a widget.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {config.widgets.map((instance) => {
                        const manifest = availableWidgets.find(w => w.id === instance.widgetId);
                        const isExpanded = expandedInstances.has(instance.instanceId);
                        
                        if (!manifest) {
                            return (
                                <div key={instance.instanceId} style={{ padding: '12px', background: 'rgba(220, 38, 38, 0.1)', borderRadius: '8px', fontSize: '12px', color: '#ef4444' }}>
                                    Unknown widget: {instance.widgetId}
                                    <button onClick={() => removeWidgetInstance(instance.instanceId)} style={{ float: 'right', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            );
                        }

                        // Get tweaks list
                        const tweakKeys = manifest.tweaks ? Object.keys(manifest.tweaks) : [];
                        
                        return (
                            <div key={instance.instanceId} style={{ 
                                background: 'rgba(255, 255, 255, 0.02)', 
                                border: '1px solid rgba(255, 255, 255, 0.05)', 
                                borderRadius: '8px',
                                overflow: 'hidden' 
                            }}>
                                {/* Instance Header */}
                                <div 
                                    style={{ 
                                        padding: '12px', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => toggleInstanceExpanded(instance.instanceId)}
                                >
                                    <div style={{ color: 'var(--text-secondary)' }}>
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </div>
                                    
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: instance.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                                            {manifest.name}
                                        </div>
                                    </div>
                                    
                                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        {/* Enable/Disable Toggle */}
                                        <label style={{ position: 'relative', width: '28px', height: '16px', cursor: 'pointer' }}>
                                            <input
                                                type="checkbox"
                                                checked={instance.enabled}
                                                onChange={() => toggleInstanceEnabled(instance.instanceId)}
                                                style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                                            />
                                            <span style={{
                                                position: 'absolute', inset: 0, borderRadius: '8px',
                                                background: instance.enabled ? 'var(--accent)' : 'rgba(255, 255, 255, 0.12)',
                                                transition: 'background 0.2s',
                                            }}>
                                                <span style={{
                                                    position: 'absolute', top: '2px',
                                                    left: instance.enabled ? '14px' : '2px',
                                                    width: '12px', height: '12px', borderRadius: '50%',
                                                    background: 'white', transition: 'left 0.2s',
                                                }} />
                                            </span>
                                        </label>
                                        
                                        <button
                                            onClick={() => removeWidgetInstance(instance.instanceId)}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Instance Tweaks Body */}
                                {isExpanded && (
                                    <div style={{ padding: '0 12px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                        {tweakKeys.length === 0 ? (
                                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '12px', fontStyle: 'italic' }}>
                                                No customizable tweaks for this widget.
                                            </div>
                                        ) : (
                                            tweakKeys.map(key => {
                                                const propConfig = manifest.tweaks![key];
                                                // Resolve actual value (override -> default structure -> default value)
                                                const value = instance.tweakOverrides[key] !== undefined 
                                                    ? instance.tweakOverrides[key] 
                                                    : propConfig.value;
                                                    
                                                return (
                                                    <PropertyControl
                                                        key={key}
                                                        name={key}
                                                        property={propConfig}
                                                        value={value}
                                                        onChange={(val) => updateInstanceTweak(instance.instanceId, key, val)}
                                                    />
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Save Button */}
            <div style={{ marginTop: '16px', paddingBottom: '16px' }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--accent)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '13px',
                        cursor: saving ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        opacity: saving ? 0.7 : 1,
                        transition: 'opacity 0.2s'
                    }}
                >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Configuration'}
                </button>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '8px' }}>
                    Note: Changes will apply when the wallpaper is applied.
                </div>
            </div>
        </div>
    );
}
