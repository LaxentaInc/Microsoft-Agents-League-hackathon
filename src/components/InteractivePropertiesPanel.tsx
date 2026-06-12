import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Sliders, Puzzle } from 'lucide-react';
import InteractiveWidgetEditor from './InteractiveWidgetEditor';

export interface ColorwallProperty {
    type: string;
    text?: string;
    value: any;
    min?: number;
    max?: number;
    step?: number;
    items?: { label: string; value: any }[];
}

interface InteractivePropertiesPanelProps {
    isOpen: boolean;
    onClose: () => void;
    folderPath: string;
    monitorId: string;
    wallpaperName: string;
}

export default function InteractivePropertiesPanel({
    isOpen,
    onClose,
    folderPath,
    monitorId,
    wallpaperName,
}: InteractivePropertiesPanelProps) {
    const [properties, setProperties] = useState<Record<string, ColorwallProperty>>({});
    const [localValues, setLocalValues] = useState<Record<string, any>>({});
    const [activeTab, setActiveTab] = useState<'properties' | 'widgets'>('properties');

    // load properties when panel opens
    useEffect(() => {
        if (!isOpen || !folderPath) return;

        invoke('get_interactive_properties', { folderPath })
            .then((res: any) => {
                if (res.success && res.properties) {
                    setProperties(res.properties);
                    // init local values from the property defaults
                    const vals: Record<string, any> = {};
                    for (const [key, prop] of Object.entries(res.properties as Record<string, ColorwallProperty>)) {
                        vals[key] = prop.value;
                    }
                    setLocalValues(vals);
                } else {
                    setProperties({});
                    setLocalValues({});
                }
            })
            .catch(console.error);
    }, [isOpen, folderPath]);

    // send a property update to the running wallpaper
    const updateProperty = async (name: string, value: any) => {
        setLocalValues((prev) => ({ ...prev, [name]: value }));
        try {
            await invoke('update_interactive_property', {
                monitorId,
                propertyName: name,
                value,
            });
        } catch (e) {
            console.error('failed to update property:', e);
        }
    };

    if (!isOpen) return null;

    // sort properties by key to keep consistent order
    const sortedKeys = Object.keys(properties).sort();

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                right: 0,
                width: '340px',
                height: '100vh',
                background: 'rgba(15, 15, 20, 0.95)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideInRight 0.2s ease-out',
            }}
        >
            {/* header */}
            <div
                style={{
                    padding: '20px 20px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Scene Configuration
                    </div>
                    <div style={{
                        marginTop: '2px',
                        fontSize: '11px',
                        color: 'var(--text-tertiary)',
                        maxWidth: '200px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {wallpaperName}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                >
                    <X size={16} />
                </button>
            </div>

            {/* tab switcher */}
            <div style={{ padding: '0 20px', display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <button
                    onClick={() => setActiveTab('properties')}
                    style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 0',
                        color: activeTab === 'properties' ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        borderBottom: activeTab === 'properties' ? '2px solid var(--accent)' : '2px solid transparent',
                        transition: 'color 0.2s, border-color 0.2s',
                    }}
                >
                    <Sliders size={14} /> Tweaks
                </button>
                <button
                    onClick={() => setActiveTab('widgets')}
                    style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        padding: '10px 0',
                        color: activeTab === 'widgets' ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        borderBottom: activeTab === 'widgets' ? '2px solid var(--accent)' : '2px solid transparent',
                        transition: 'color 0.2s, border-color 0.2s',
                    }}
                >
                    <Puzzle size={14} /> Widgets
                </button>
            </div>

            {/* content area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {activeTab === 'properties' ? (
                    sortedKeys.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            color: 'var(--text-tertiary)',
                            fontSize: '13px',
                        }}>
                            no customizable properties found
                        </div>
                    ) : (
                        sortedKeys.map((key) => {
                            const prop = properties[key];
                            return (
                                <PropertyControl
                                    key={key}
                                    name={key}
                                    property={prop}
                                    value={localValues[key]}
                                    onChange={(val) => updateProperty(key, val)}
                                />
                            );
                        })
                    )
                ) : (
                    <InteractiveWidgetEditor folderPath={folderPath} />
                )}
            </div>
        </div>
    );
}

// renders a single property control based on its type
export function PropertyControl({
    name,
    property,
    value,
    onChange,
}: {
    name: string;
    property: ColorwallProperty;
    value: any;
    onChange: (val: any) => void;
}) {
    const type = (property.type || '').toLowerCase();

    // label — just render text
    if (type === 'label') {
        return (
            <div style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginTop: '16px',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
            }}>
                {property.value || property.text || name}
            </div>
        );
    }

    // slider
    if (type === 'slider') {
        const min = property.min ?? 0;
        const max = property.max ?? 100;
        const step = property.step ?? 1;
        const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;

        return (
            <div style={{ marginBottom: '14px' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {property.text || name}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        {numValue}
                    </span>
                </div>
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={numValue}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    style={{
                        width: '100%',
                        accentColor: 'var(--accent)',
                        cursor: 'pointer',
                    }}
                />
            </div>
        );
    }

    // checkbox
    if (type === 'checkbox') {
        const boolValue = typeof value === 'boolean' ? value : Boolean(value);

        return (
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    padding: '8px 0',
                }}
            >
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {property.text || name}
                </span>
                <label style={{ position: 'relative', width: '36px', height: '20px', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={boolValue}
                        onChange={(e) => onChange(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    />
                    <span
                        style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '10px',
                            background: boolValue ? 'var(--accent)' : 'rgba(255, 255, 255, 0.12)',
                            transition: 'background 0.2s',
                        }}
                    >
                        <span
                            style={{
                                position: 'absolute',
                                top: '2px',
                                left: boolValue ? '18px' : '2px',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                background: 'white',
                                transition: 'left 0.2s',
                            }}
                        />
                    </span>
                </label>
            </div>
        );
    }

    // color picker
    if (type === 'color') {
        const colorValue = typeof value === 'string' ? value : '#ffffff';

        return (
            <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    {property.text || name}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                        type="color"
                        value={colorValue}
                        onChange={(e) => onChange(e.target.value)}
                        style={{
                            width: '32px',
                            height: '32px',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: 'transparent',
                        }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                        {colorValue}
                    </span>
                </div>
            </div>
        );
    }

    // dropdown
    if (type === 'dropdown' && property.items) {
        return (
            <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    {property.text || name}
                </span>
                <select
                    value={JSON.stringify(value)}
                    onChange={(e) => onChange(JSON.parse(e.target.value))}
                    style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        cursor: 'pointer',
                    }}
                >
                    {property.items.map((item, i) => (
                        <option key={i} value={JSON.stringify(item.value)}>
                            {item.label}
                        </option>
                    ))}
                </select>
            </div>
        );
    }

    // textbox
    if (type === 'textbox') {
        return (
            <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    {property.text || name}
                </span>
                <input
                    type="text"
                    value={typeof value === 'string' ? value : String(value ?? '')}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                    }}
                />
            </div>
        );
    }

    // unknown type — skip quietly
    return null;
}
