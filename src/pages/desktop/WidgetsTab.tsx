import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Trash2, Component, Power, ChevronDown, ChevronRight, Plus, XCircle, Lock, Unlock, RotateCcw } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { convertFileSrc } from '@tauri-apps/api/core';
import { PropertyControl, ColorwallProperty } from '../../components/InteractivePropertiesPanel';
import MonitorSelectorModal from '../../components/MonitorSelectorModal';

interface WidgetManifest {
    id: string;
    name: string;
    description?: string;
    author?: string;
    version?: string;
    preview?: string;
    builtin: boolean;
    folderPath?: string;
    tweaks?: Record<string, ColorwallProperty>;
}

interface WidgetInstance {
    widgetId: string;
    instanceId: string;
    position?: { x: string; y: string };
    tweakOverrides: Record<string, any>;
    enabled: boolean;
    zIndex?: number;
    monitorId?: string;
}

interface SceneWidgetConfig {
    widgets: WidgetInstance[];
}

export default function WidgetsTab() {
    const [widgets, setWidgets] = React.useState<WidgetManifest[]>([]);
    const [globalConfig, setGlobalConfig] = React.useState<SceneWidgetConfig>({ widgets: [] });
    const [loading, setLoading] = React.useState(true);
    const [expandedInstances, setExpandedInstances] = React.useState<Set<string>>(new Set());
    const [isMonitorSelectorOpen, setIsMonitorSelectorOpen] = React.useState(false);
    const [pendingWidgetToAdd, setPendingWidgetToAdd] = React.useState<WidgetManifest | null>(null);
    const { showConfirm, showAlert } = useConfirm();

    const loadData = React.useCallback(async () => {
        try {
            setLoading(true);
            const [widgetsRes, configRes]: [any, any] = await Promise.all([
                invoke('list_widgets'),
                invoke('get_global_widgets'),
            ]);
            if (widgetsRes.success) {
                setWidgets(widgetsRes.widgets || []);
            }
            if (configRes.success && configRes.config) {
                setGlobalConfig(configRes.config);
            }
        } catch (error) {
            console.error('failed to load widget data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadData();
    }, [loadData]);

    // ── actions ──

    const handleImportWidget = async () => {
        try {
            const selected = await openDialog({
                directory: true,
                multiple: false,
                title: 'Select Widget Folder',
            });

            if (selected && typeof selected === 'string') {
                const res: any = await invoke('import_widget', { sourcePath: selected });
                if (res.success) {
                    await loadData();
                    showAlert({ title: 'Success', message: 'Widget imported successfully.' });
                } else {
                    showAlert({ title: 'Import Failed', message: res.error || 'Unknown error', isDanger: true });
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleDeleteWidget = async (widget: WidgetManifest) => {
        if (widget.builtin) return;

        const confirmed = await showConfirm({
            title: 'Delete Widget',
            message: `Are you sure you want to delete "${widget.name}"? This removes it from your library.`,
            confirmText: 'Delete',
            isDanger: true,
        });

        if (!confirmed) return;

        try {
            const res: any = await invoke('delete_widget', { widgetId: widget.id });
            if (res.success) {
                await loadData();
            } else {
                showAlert({ title: 'Delete Failed', message: res.error, isDanger: true });
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleAddToDesktop = (widget: WidgetManifest) => {
        setPendingWidgetToAdd(widget);
        setIsMonitorSelectorOpen(true);
    };

    const handleConfirmMonitorSelection = async (monitorIds: string[]) => {
        if (!pendingWidgetToAdd) return;
        setIsMonitorSelectorOpen(false);
        try {
            const res: any = await invoke('spawn_widget_on_desktop', { 
                widgetId: pendingWidgetToAdd.id,
                monitorIds: monitorIds
            });
            if (res.success && res.config) {
                setGlobalConfig(res.config);
            } else {
                showAlert({ title: 'Failed', message: res.error || 'Could not add widget', isDanger: true });
            }
        } catch (error) {
            console.error(error);
        } finally {
            setPendingWidgetToAdd(null);
        }
    };

    const handleCancelMonitorSelection = () => {
        setIsMonitorSelectorOpen(false);
        setPendingWidgetToAdd(null);
    };

    const handleRemoveFromDesktop = async (instanceId: string) => {
        try {
            const res: any = await invoke('remove_widget_from_desktop', { instanceId });
            if (res.success && res.config) {
                setGlobalConfig(res.config);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleKillAll = async () => {
        if (globalConfig.widgets.length === 0) return;

        const confirmed = await showConfirm({
            title: 'Kill All Widgets',
            message: 'This will remove all active widgets from your desktop and clean up any lingering overlay windows.',
            confirmText: 'Kill All',
            isDanger: true,
        });

        if (!confirmed) return;

        try {
            const res: any = await invoke('kill_all_widgets');
            if (res.success) {
                setGlobalConfig({ widgets: [] });
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleUpdateTweak = async (instanceId: string, tweakName: string, value: any) => {
        // optimistic update
        setGlobalConfig((prev) => ({
            ...prev,
            widgets: prev.widgets.map((w) => {
                if (w.instanceId === instanceId) {
                    return {
                        ...w,
                        tweakOverrides: { ...w.tweakOverrides, [tweakName]: value },
                    };
                }
                return w;
            }),
        }));
    };

    // reset all tweak overrides for an instance back to manifest defaults
    const handleResetTweaks = (instanceId: string) => {
        setGlobalConfig((prev) => ({
            ...prev,
            widgets: prev.widgets.map((w) => {
                if (w.instanceId === instanceId) {
                    return { ...w, tweakOverrides: {} };
                }
                return w;
            }),
        }));
    };

    // toggle lock (disable dragging) — stored as a special tweak override
    const handleToggleLock = (instanceId: string) => {
        setGlobalConfig((prev) => ({
            ...prev,
            widgets: prev.widgets.map((w) => {
                if (w.instanceId === instanceId) {
                    const isLocked = w.tweakOverrides.__cw_locked === true;
                    return {
                        ...w,
                        tweakOverrides: { ...w.tweakOverrides, __cw_locked: !isLocked },
                    };
                }
                return w;
            }),
        }));
    };

    const handleSaveGlobalConfig = async () => {
        try {
            await invoke('save_global_widgets', { config: globalConfig });
        } catch (error) {
            console.error('failed to save global config:', error);
        }
    };

    // auto-save when tweaks change (debounced)
    const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    React.useEffect(() => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            if (globalConfig.widgets.length > 0) {
                handleSaveGlobalConfig();
            }
        }, 500);
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [globalConfig]);

    const toggleExpanded = (instanceId: string) => {
        setExpandedInstances((prev) => {
            const next = new Set(prev);
            if (next.has(instanceId)) next.delete(instanceId);
            else next.add(instanceId);
            return next;
        });
    };

    const activeWidgets = globalConfig.widgets || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>
            <MonitorSelectorModal
                isOpen={isMonitorSelectorOpen}
                onClose={handleCancelMonitorSelection}
                onConfirm={handleConfirmMonitorSelection}
                title="Select Monitors for Widget"
            />

            {/* ── active widgets section ── */}
            {activeWidgets.length > 0 && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Active on Desktop
                        </div>
                        <button
                            onClick={handleKillAll}
                            style={{
                                padding: '6px 12px',
                                background: 'rgba(220, 38, 38, 0.12)',
                                color: '#ef4444',
                                border: '1px solid rgba(220, 38, 38, 0.2)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(220, 38, 38, 0.25)';
                                e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.4)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(220, 38, 38, 0.12)';
                                e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.2)';
                            }}
                        >
                            <Power size={12} />
                            Kill All
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activeWidgets.map((instance) => {
                            const manifest = widgets.find((w) => w.id === instance.widgetId);
                            const isExpanded = expandedInstances.has(instance.instanceId);
                            const tweakKeys = manifest?.tweaks ? Object.keys(manifest.tweaks) : [];
                            const isLocked = instance.tweakOverrides.__cw_locked === true;
                            const hasOverrides = Object.keys(instance.tweakOverrides).filter(k => k !== '__cw_locked').length > 0;

                            return (
                                <div
                                    key={instance.instanceId}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.025)',
                                        border: '1px solid rgba(255, 255, 255, 0.06)',
                                        borderRadius: '12px',
                                        overflow: 'hidden',
                                        transition: 'border-color 0.15s ease',
                                    }}
                                >
                                    {/* instance header */}
                                    <div
                                        style={{
                                            padding: '10px 12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            cursor: tweakKeys.length > 0 ? 'pointer' : 'default',
                                        }}
                                        onClick={() => tweakKeys.length > 0 && toggleExpanded(instance.instanceId)}
                                    >
                                        {tweakKeys.length > 0 && (
                                            <div style={{ color: 'var(--text-tertiary)', display: 'flex' }}>
                                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </div>
                                        )}

                                        <Component size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                color: 'var(--text-primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                            }}>
                                                {manifest?.name || instance.widgetId}
                                                {instance.monitorId && (
                                                    <span style={{
                                                        fontSize: '9px',
                                                        padding: '2px 6px',
                                                        background: 'rgba(59, 130, 246, 0.15)',
                                                        color: '#60a5fa',
                                                        borderRadius: '4px',
                                                        fontWeight: 700,
                                                        textTransform: 'uppercase',
                                                    }}>
                                                        {instance.monitorId}
                                                    </span>
                                                )}
                                            </div>
                                            {manifest?.version && (
                                                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                                                    v{manifest.version}
                                                </div>
                                            )}
                                        </div>

                                        {/* action buttons */}
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            {/* lock toggle */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleLock(instance.instanceId);
                                                }}
                                                style={{
                                                    background: isLocked ? 'rgba(0, 120, 212, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                                    border: '1px solid',
                                                    borderColor: isLocked ? 'rgba(0, 120, 212, 0.2)' : 'transparent',
                                                    color: isLocked ? 'var(--accent)' : 'var(--text-secondary)',
                                                    cursor: 'pointer',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    transition: 'all 0.15s',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 500,
                                                }}
                                                title={isLocked ? 'Unlock widget (enable dragging)' : 'Lock widget (disable dragging)'}
                                                onMouseEnter={(e) => {
                                                    if (!isLocked) {
                                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                                                        e.currentTarget.style.color = 'var(--text-primary)';
                                                    }
                                                }}
                                                onMouseLeave={(e) => {
                                                    if (!isLocked) {
                                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                                    }
                                                }}
                                            >
                                                {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                                {isLocked ? 'Unlock Position' : 'Lock Position'}
                                            </button>

                                            {/* reset tweaks */}
                                            {tweakKeys.length > 0 && hasOverrides && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleResetTweaks(instance.instanceId);
                                                    }}
                                                    style={{
                                                        background: 'rgba(255, 255, 255, 0.05)',
                                                        border: '1px solid transparent',
                                                        color: 'var(--text-secondary)',
                                                        cursor: 'pointer',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        transition: 'all 0.15s',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        fontSize: '11px',
                                                        fontWeight: 500,
                                                    }}
                                                    title="Reset tweaks to defaults"
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(245, 158, 11, 0.1)';
                                                        e.currentTarget.style.color = '#f59e0b';
                                                        e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.2)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                                        e.currentTarget.style.borderColor = 'transparent';
                                                    }}
                                                >
                                                    <RotateCcw size={12} />
                                                    Reset
                                                </button>
                                            )}

                                            {/* remove */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveFromDesktop(instance.instanceId);
                                                }}
                                                style={{
                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                    border: '1px solid transparent',
                                                    color: 'var(--text-secondary)',
                                                    cursor: 'pointer',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    transition: 'all 0.15s',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 500,
                                                }}
                                                title="Remove from desktop"
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                                    e.currentTarget.style.color = '#ef4444';
                                                    e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                                    e.currentTarget.style.color = 'var(--text-secondary)';
                                                    e.currentTarget.style.borderColor = 'transparent';
                                                }}
                                            >
                                                <XCircle size={12} />
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    {/* tweaks body */}
                                    {isExpanded && tweakKeys.length > 0 && manifest?.tweaks && (
                                        <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                            {tweakKeys.map((key) => {
                                                const propConfig = manifest.tweaks![key];
                                                const value =
                                                    instance.tweakOverrides[key] !== undefined
                                                        ? instance.tweakOverrides[key]
                                                        : propConfig.value;

                                                return (
                                                    <PropertyControl
                                                        key={key}
                                                        name={key}
                                                        property={propConfig}
                                                        value={value}
                                                        onChange={(val) => handleUpdateTweak(instance.instanceId, key, val)}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── widget library section ── */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Widget Library
                    </div>
                    <button
                        onClick={handleImportWidget}
                        style={{
                            padding: '6px 12px',
                            background: 'rgba(139, 92, 246, 0.12)',
                            color: 'rgb(167, 139, 250)',
                            border: '1px solid rgba(139, 92, 246, 0.25)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.22)';
                            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)';
                            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.25)';
                        }}
                    >
                        <FolderOpen size={12} />
                        Import
                    </button>
                </div>

                {loading ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} style={{ height: '100px', background: 'var(--bg-secondary)', borderRadius: '10px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        ))}
                    </div>
                ) : widgets.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-tertiary)' }}>
                        <Component size={40} style={{ opacity: 0.15, marginBottom: '12px' }} />
                        <p style={{ margin: 0, fontSize: '13px' }}>No widgets installed.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                        {widgets.map((widget, index) => (
                            <WidgetCard
                                key={widget.id || `widget-${index}`}
                                widget={widget}
                                onAdd={() => handleAddToDesktop(widget)}
                                onDelete={() => handleDeleteWidget(widget)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── widget library card ──

function WidgetCard({
    widget,
    onAdd,
    onDelete,
}: {
    widget: WidgetManifest;
    onAdd: () => void;
    onDelete: () => void;
}) {
    const [hovered, setHovered] = React.useState(false);
    const [imgError, setImgError] = React.useState(false);

    const [previewHtml, setPreviewHtml] = React.useState<string | null>(null);

    React.useEffect(() => {
        // Fetch the raw HTML for the live preview
        invoke('get_widget_preview_html', { widgetId: widget.id })
            .then((html: any) => {
                if (html && html.trim().startsWith('<')) {
                    setPreviewHtml(html);
                }
            })
            .catch(console.error);
    }, [widget.id]);

    const previewSrc =
        widget.folderPath && widget.preview
            ? convertFileSrc(`${widget.folderPath}/${widget.preview}`)
            : undefined;

    // per-widget-type gradient so the library doesn't look like a wall of identical purple squares
    const gradientMap: Record<string, string> = {
        'clock': 'linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(99, 102, 241, 0.15))',
        'clock-clean': 'linear-gradient(135deg, rgba(14, 165, 233, 0.3), rgba(59, 130, 246, 0.15))',
        'now-playing': 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(236, 72, 153, 0.15))',
        'visualizer': 'linear-gradient(135deg, rgba(245, 158, 11, 0.3), rgba(239, 68, 68, 0.15))',
        'system': 'linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(59, 130, 246, 0.15))',
        'day-banner': 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 182, 212, 0.15))',
    };
    const fallbackGradient = gradientMap[widget.id] || 'linear-gradient(135deg, rgba(139, 92, 246, 0.25), rgba(59, 130, 246, 0.15))';

    return (
        <div
            style={{
                background: 'var(--bg-secondary)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '10px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                position: 'relative',
                transition: 'transform 0.2s ease, border-color 0.2s ease',
                transform: hovered ? 'translateY(-1px)' : 'none',
                borderColor: hovered ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                cursor: 'pointer',
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onAdd}
        >
            {/* thumbnail */}
            <div
                style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    borderRadius: '8px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    position: 'relative',
                    flexShrink: 0,
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.05)',
                }}
            >
                {previewHtml ? (
                    <iframe
                        srcDoc={previewHtml}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            background: 'transparent',
                            pointerEvents: 'none',
                        }}
                        sandbox="allow-scripts"
                    />
                ) : previewSrc && !imgError ? (
                    <img
                        src={previewSrc}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        background: fallbackGradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '20px',
                        fontWeight: 700,
                        color: 'rgba(255, 255, 255, 0.5)',
                        fontFamily: "'Space Grotesk', sans-serif",
                        letterSpacing: '-0.02em',
                    }}>
                        {widget.name ? widget.name.charAt(0).toUpperCase() : '?'}
                    </div>
                )}
            </div>

            {/* info */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div
                        style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}
                    >
                        {widget.name}
                    </div>
                    {widget.builtin && (
                        <div
                            style={{
                                fontSize: '9px',
                                padding: '1px 5px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                borderRadius: '4px',
                                color: 'var(--text-tertiary)',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                            }}
                        >
                            Built-in
                        </div>
                    )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    {widget.author || 'Unknown'} {widget.version && `• v${widget.version}`}
                </div>
                <div
                    style={{
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        marginTop: '2px',
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        lineHeight: 1.4,
                    }}
                >
                    {widget.description || 'No description.'}
                </div>
            </div>

            {/* add indicator on hover */}
            {hovered && (
                <div
                    style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        display: 'flex',
                        gap: '4px',
                    }}
                >
                    <div
                        style={{
                            background: 'rgba(139, 92, 246, 0.2)',
                            color: 'rgb(167, 139, 250)',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '10px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                        }}
                    >
                        <Plus size={10} />
                        Add
                    </div>
                    {!widget.builtin && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            style={{
                                background: 'rgba(220, 38, 38, 0.15)',
                                color: '#ef4444',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '4px',
                                cursor: 'pointer',
                            }}
                            title="Delete Widget"
                        >
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
