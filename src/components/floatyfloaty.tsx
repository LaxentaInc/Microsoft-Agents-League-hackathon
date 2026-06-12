import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, X, Check, Loader2, Clock, AlertCircle, Trash2, Download } from 'lucide-react';
import { useDL, LibQueueItem } from '../context/DownloadContext';

const FloatingProgress = () => {
    const { activeId, progress, isSlow, cancel, activeItem, isViewingActiveItem, downloadMode, libraryQueue, dismissLibItem, clearDoneDownloads, cancelAll, cancelLibItem } = useDL();
    const [expanded, setExpanded] = useState(true);

    const hasSetDownload = !!activeId && !isViewingActiveItem;
    const hasQueueItems = libraryQueue.length > 0;
    if (!hasSetDownload && !hasQueueItems) return null;

    const activeCount = libraryQueue.filter(i => i.status === 'downloading').length + (hasSetDownload ? 1 : 0);
    const queuedCount = libraryQueue.filter(i => i.status === 'queued').length;
    const doneCount = libraryQueue.filter(i => i.status === 'done').length;

    // build summary text for collapsed view
    const summaryParts: string[] = [];
    if (activeCount > 0) summaryParts.push(`${activeCount} downloading`);
    if (queuedCount > 0) summaryParts.push(`${queuedCount} queued`);
    if (doneCount > 0) summaryParts.push(`${doneCount} done`);
    const summaryText = summaryParts.join(' · ') || 'Downloads';

    const statusIcon = (item: LibQueueItem) => {
        switch (item.status) {
            case 'queued': return <Clock size={12} style={{ color: '#94a3b8' }} />;
            case 'downloading': return <Loader2 size={12} style={{ color: '#60a5fa', animation: 'spin 1s linear infinite' }} />;
            case 'done': return <Check size={12} style={{ color: '#34d399' }} />;
            case 'error': return <AlertCircle size={12} style={{ color: '#f87171' }} />;
        }
    };

    const statusText = (item: LibQueueItem) => {
        switch (item.status) {
            case 'queued': return 'Queued';
            case 'downloading': return `${item.progress.toFixed(1)}%`;
            case 'done': return 'Done';
            case 'error': return 'Failed';
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                layout
                initial={{ y: 80, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 80, opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    zIndex: 99999,
                    width: expanded ? '340px' : '260px',
                    background: 'rgba(15, 15, 20, 0.92)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
                    overflow: 'hidden',
                    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                    transition: 'width 0.3s ease',
                }}
            >
                {/* header */}
                <div
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', cursor: 'pointer',
                        borderBottom: expanded ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        userSelect: 'none',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={14} style={{ color: '#60a5fa' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#e5e5e5', letterSpacing: '0.02em' }}>
                            {summaryText}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {(activeCount > 0 || queuedCount > 0) && expanded && (
                            <button
                                onClick={(e) => { e.stopPropagation(); cancelAll(); }}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#f87171', padding: '2px', display: 'flex',
                                    marginRight: '6px', fontSize: '11px', fontWeight: 600, 
                                    alignItems: 'center', gap: '2px'
                                }}
                                title="cancel all active and queued operations"
                            >
                                <X size={12} /> Cancel All
                            </button>
                        )}
                        {doneCount > 0 && expanded && (
                            <button
                                onClick={(e) => { e.stopPropagation(); clearDoneDownloads(); }}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#64748b', padding: '2px', display: 'flex',
                                }}
                                title="clear completed"
                            >
                                <Trash2 size={12} />
                            </button>
                        )}
                        {expanded ? <ChevronDown size={14} style={{ color: '#64748b' }} /> : <ChevronUp size={14} style={{ color: '#64748b' }} />}
                    </div>
                </div>

                {/* expanded content */}
                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            style={{ overflow: 'hidden' }}
                        >
                            <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '4px 0' }}>
                                {/* set/download active item */}
                                {hasSetDownload && activeItem && (
                                    <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                                <Loader2 size={12} style={{ color: '#a78bfa', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                                                <span style={{
                                                    fontSize: '12px', fontWeight: 500, color: '#d4d4d8',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {activeItem.title || 'Wallpaper'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>
                                                    {progress.toFixed(1)}%
                                                </span>
                                                <button
                                                    onClick={cancel}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px', display: 'flex' }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                        <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                            <motion.div
                                                animate={{ width: `${progress}%` }}
                                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                                style={{ height: '100%', borderRadius: '2px', background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }}
                                            />
                                        </div>
                                        {isSlow && (
                                            <div style={{ fontSize: '10px', color: '#fbbf24', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Loader2 size={9} style={{ animation: 'spin 1s linear infinite' }} /> slow connection
                                            </div>
                                        )}
                                        <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', display: 'block' }}>
                                            {downloadMode === 'set' ? 'setting wallpaper' : 'downloading'}
                                        </span>
                                    </div>
                                )}

                                {/* library queue items */}
                                {libraryQueue.map((item) => (
                                    <motion.div
                                        key={item.id}
                                        layout
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20, height: 0 }}
                                        transition={{ duration: 0.2 }}
                                        style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: item.status === 'downloading' ? '6px' : '0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                                {statusIcon(item)}
                                                <span style={{
                                                    fontSize: '12px', fontWeight: 500,
                                                    color: item.status === 'done' ? '#34d399' : item.status === 'error' ? '#f87171' : '#d4d4d8',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {item.title}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                                <span style={{
                                                    fontSize: '11px', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                                                    color: item.status === 'downloading' ? '#60a5fa' : item.status === 'done' ? '#34d399' : item.status === 'error' ? '#f87171' : '#94a3b8',
                                                }}>
                                                    {statusText(item)}
                                                </span>
                                                <button
                                                    onClick={() => (item.status === 'done' || item.status === 'error') ? dismissLibItem(item.id) : cancelLibItem(item.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '2px', display: 'flex' }}
                                                    title={(item.status === 'done' || item.status === 'error') ? "dismiss" : "cancel"}
                                                >
                                                    <X size={11} />
                                                </button>
                                            </div>
                                        </div>
                                        {item.status === 'downloading' && (
                                            <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                                <motion.div
                                                    animate={{ width: `${item.progress}%` }}
                                                    transition={{ duration: 0.3, ease: 'easeOut' }}
                                                    style={{ height: '100%', borderRadius: '2px', background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}
                                                />
                                            </div>
                                        )}
                                        {item.status === 'error' && item.error && (
                                            <div style={{ fontSize: '10px', color: '#f87171', marginTop: '4px', opacity: 0.8 }}>
                                                {item.error.substring(0, 60)}
                                            </div>
                                        )}
                                    </motion.div>
                                ))}

                                {!hasSetDownload && libraryQueue.length === 0 && (
                                    <div style={{ padding: '20px 16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                                        no active downloads
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* collapsed mini progress bar */}
                {!expanded && activeCount > 0 && (
                    <div style={{ padding: '0 16px 10px' }}>
                        <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <motion.div
                                animate={{ width: `${hasSetDownload ? progress : (libraryQueue.find(i => i.status === 'downloading')?.progress || 0)}%` }}
                                transition={{ duration: 0.3 }}
                                style={{ height: '100%', borderRadius: '2px', background: 'linear-gradient(90deg, #3b82f6, #818cf8)' }}
                            />
                        </div>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
};

export default FloatingProgress;
