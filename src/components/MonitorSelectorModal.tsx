import React from 'react';
import { invoke } from '@tauri-apps/api/core';

interface MonitorInfo {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isPrimary: boolean;
    dpi: number;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (monitorIds: string[]) => void;
    title?: string;
}

export default function MonitorSelectorModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Select Displays",
}: Props) {
    const [monitors, setMonitors] = React.useState<MonitorInfo[]>([]);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        if (isOpen) loadMonitors();
    }, [isOpen]);

    const loadMonitors = async () => {
        try {
            setLoading(true);
            const data = await invoke('get_monitors') as MonitorInfo[];
            setMonitors(data);
            if (selectedIds.size === 0) {
                const primary = data.find(m => m.isPrimary);
                setSelectedIds(new Set([primary?.id ?? data[0]?.id].filter(Boolean) as string[]));
            }
        } catch (e) {
            console.error('[error] failed to load monitors:', e);
        } finally {
            setLoading(false);
        }
    };

    const toggleMonitor = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            if (next.size > 1) next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const toggleAll = () => {
        if (selectedIds.size === monitors.length) {
            const primary = monitors.find(m => m.isPrimary);
            setSelectedIds(new Set([primary?.id ?? monitors[0]?.id].filter(Boolean) as string[]));
        } else {
            setSelectedIds(new Set(monitors.map(m => m.id)));
        }
    };

    const handleConfirm = () => {
        onConfirm(Array.from(selectedIds));
        onClose();
    };

    if (!isOpen) return null;

    const minX = monitors.length ? Math.min(...monitors.map(m => m.x)) : 0;
    const minY = monitors.length ? Math.min(...monitors.map(m => m.y)) : 0;
    const maxX = monitors.length ? Math.max(...monitors.map(m => m.x + m.width)) : 1;
    const maxY = monitors.length ? Math.max(...monitors.map(m => m.y + m.height)) : 1;
    const totalW = maxX - minX || 1;
    const totalH = maxY - minY || 1;

    const MAP_W = 388;
    const MAP_H = 180;
    const PAD = 16;
    const scale = Math.min((MAP_W - PAD * 2) / totalW, (MAP_H - PAD * 2) / totalH);
    const scaledW = totalW * scale;
    const scaledH = totalH * scale;
    const offX = (MAP_W - scaledW) / 2;
    const offY = (MAP_H - scaledH) / 2;

    // ColorWall blue
    const BLUE = '#3b82f6';
    const BLUE_DIM = 'rgba(59,130,246,0.15)';
    const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
        }}>
            <div style={{ position: 'absolute', inset: 0 }} onClick={onClose} />

            <div style={{
                position: 'relative',
                width: '420px',
                background: 'rgba(15,17,26,0.97)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '14px',
                display: 'flex',
                flexDirection: 'column',
                fontFamily: FONT,
                overflow: 'hidden',
            }}>

                {/* header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <div>
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#f1f5f9',
                            letterSpacing: '-0.01em',
                        }}>
                            {title}
                        </div>
                        <div style={{
                            fontSize: '11px',
                            color: '#475569',
                            marginTop: '2px',
                        }}>
                            Choose which displays to apply the wallpaper to
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '8px',
                            width: '28px', height: '28px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#64748b',
                            cursor: 'pointer',
                            flexShrink: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>

                {/* map */}
                <div style={{ padding: '14px 16px 0' }}>
                    <div style={{
                        position: 'relative',
                        width: MAP_W, height: MAP_H,
                        background: 'rgba(0,0,0,0.35)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.05)',
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                    }}>
                        {/* dot grid */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '10px 10px',
                        }} />

                        {loading ? (
                            <div style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', color: '#334155',
                                letterSpacing: '0.04em',
                            }}>
                                detecting displays…
                            </div>
                        ) : monitors.map((m, i) => {
                            const sel = selectedIds.has(m.id);
                            const w = Math.max(m.width * scale, 28);
                            const h = Math.max(m.height * scale, 22);
                            const x = (m.x - minX) * scale + offX;
                            const y = (m.y - minY) * scale + offY;
                            const showLabel = w > 36 && h > 24;
                            const showRes = w > 62 && h > 38;

                            return (
                                <div
                                    key={m.id}
                                    onClick={() => toggleMonitor(m.id)}
                                    title={`Display ${i + 1} — ${m.width}×${m.height}`}
                                    style={{
                                        position: 'absolute',
                                        left: x, top: y,
                                        width: w, height: h,
                                        background: sel ? BLUE_DIM : 'rgba(255,255,255,0.03)',
                                        border: `1.5px solid ${sel ? BLUE : 'rgba(255,255,255,0.1)'}`,
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        boxSizing: 'border-box',
                                    }}
                                    onMouseEnter={e => {
                                        if (!sel) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)';
                                    }}
                                    onMouseLeave={e => {
                                        if (!sel) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                    }}
                                >
                                    {showLabel && (
                                        <span style={{
                                            fontSize: '9px',
                                            fontWeight: 700,
                                            letterSpacing: '0.05em',
                                            color: sel ? BLUE : '#334155',
                                            whiteSpace: 'nowrap',
                                            lineHeight: 1,
                                        }}>
                                            {i + 1}
                                        </span>
                                    )}
                                    {showRes && (
                                        <span style={{
                                            fontSize: '7px',
                                            color: sel ? 'rgba(59,130,246,0.55)' : '#1e293b',
                                            whiteSpace: 'nowrap',
                                            marginTop: '2px',
                                            fontFamily: 'Menlo, Monaco, monospace',
                                            lineHeight: 1,
                                        }}>
                                            {m.width}×{m.height}
                                        </span>
                                    )}
                                    {m.isPrimary && h > 28 && (
                                        <div style={{
                                            position: 'absolute', top: 3, left: 4,
                                            fontSize: '6px', fontWeight: 700,
                                            letterSpacing: '0.08em', textTransform: 'uppercase',
                                            color: sel ? 'rgba(59,130,246,0.6)' : '#1e293b',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            main
                                        </div>
                                    )}
                                    {sel && (
                                        <div style={{
                                            position: 'absolute', bottom: 3, right: 3,
                                        }}>
                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                <path d="M1.5 5L3.8 7.5L8.5 2" stroke={BLUE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* status */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 18px 14px',
                }}>
                    <button
                        onClick={toggleAll}
                        style={{
                            background: 'none', border: 'none', padding: 0,
                            cursor: 'pointer', color: '#475569',
                            fontFamily: FONT, fontSize: '11px', fontWeight: 500,
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
                        onMouseLeave={e => e.currentTarget.style.color = '#475569'}
                    >
                        {selectedIds.size === monitors.length ? '− deselect all' : '+ select all'}
                    </button>
                    {!loading && (
                        <span style={{
                            fontSize: '11px', color: '#334155',
                            fontFamily: 'Menlo, Monaco, monospace',
                        }}>
                            <span style={{ color: BLUE }}>{selectedIds.size}</span>/{monitors.length} selected
                        </span>
                    )}
                </div>

                {/* footer */}
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '14px 16px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            flex: 1, padding: '9px 0',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '8px',
                            color: '#64748b', fontFamily: FONT,
                            fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#94a3b8'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#64748b'; }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIds.size === 0}
                        style={{
                            flex: 2, padding: '9px 0',
                            background: selectedIds.size > 0 ? BLUE : 'rgba(255,255,255,0.04)',
                            border: '1px solid transparent',
                            borderRadius: '8px',
                            color: selectedIds.size > 0 ? '#fff' : '#334155',
                            fontFamily: FONT, fontSize: '12px', fontWeight: 600,
                            cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                        }}
                        onMouseEnter={e => { if (selectedIds.size > 0) e.currentTarget.style.background = '#2563eb'; }}
                        onMouseLeave={e => { if (selectedIds.size > 0) e.currentTarget.style.background = BLUE; }}
                    >
                        Apply to {selectedIds.size} {selectedIds.size === 1 ? 'display' : 'displays'}
                    </button>
                </div>
            </div>
        </div>
    );
}