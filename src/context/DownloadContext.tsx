import { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { WallpaperItem } from '../types/wallpaper';
import { useConfirm } from './ConfirmContext';

export interface LibQueueItem {
    id: string;
    imageId: string;
    title: string;
    thumbnailUrl?: string;
    progress: number;
    status: 'queued' | 'downloading' | 'done' | 'error';
    error?: string;
}

interface QueueInternal extends LibQueueItem {
    url: string;
    referer?: string;
}

interface PersistedActiveTask {
    url: string;
    image: WallpaperItem;
    referer?: string;
    isVideo: boolean;
    mode: 'download' | 'set';
    targetMonitors?: string[];
}

interface DLState {
    activeId: string | null;
    progress: number;
    isSlow: boolean;
    activeItem: WallpaperItem | null;
    downloadMode: 'download' | 'set' | null;
    libraryQueue: LibQueueItem[];
    start: (url: string, image: WallpaperItem, referer?: string, isVideo?: boolean, mode?: 'download' | 'set' | 'library', targetMonitors?: string[]) => void;
    cancel: () => void;
    dismissLibItem: (id: string) => void;
    clearDoneDownloads: () => void;
    isInLibQueue: (imageId: string) => boolean;
    getLibItemStatus: (imageId: string) => LibQueueItem | undefined;
    isViewingActiveItem: boolean;
    setIsViewingActiveItem: (viewing: boolean) => void;
    cancelAll: () => void;
    cancelLibItem: (id: string) => void;
}

const DLContext = createContext<DLState | null>(null);
const DL_STORAGE_KEY = 'colorwall_dl_state_v1';
export const useDL = () => {
    const ctx = useContext(DLContext);
    if (!ctx) throw new Error('useDL must be used within DLProvider');
    return ctx;
};

export const DLProvider = ({ children }: { children: ReactNode }) => {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [isSlow, setIsSlow] = useState(false);
    const [activeItem, setActiveItem] = useState<WallpaperItem | null>(null);
    const [downloadMode, setDownloadMode] = useState<'download' | 'set' | null>(null);
    const [isViewingActiveItem, setIsViewingActiveItem] = useState(false);
    const [libraryQueue, setLibraryQueue] = useState<LibQueueItem[]>([]);

    const activeIdRef = useRef<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const lastTimeRef = useRef(0);
    const lastProgRef = useRef(0);
    const startTimeRef = useRef(0);
    const queueRef = useRef<QueueInternal[]>([]);
    const curLibIdRef = useRef<string | null>(null);
    const isLibBusyRef = useRef(false);
    const dlTypeRef = useRef<'set' | 'download' | 'library' | null>(null);
    const activeTaskRef = useRef<PersistedActiveTask | null>(null);
    const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { showAlert } = useConfirm();

    const persistState = useCallback(() => {
        try {
            localStorage.setItem(
                DL_STORAGE_KEY,
                JSON.stringify({
                    queue: queueRef.current,
                    activeTask: activeTaskRef.current,
                })
            );
        } catch { }
    }, []);

    const clearActiveTaskState = useCallback(() => {
        activeTaskRef.current = null;
        persistState();
    }, [persistState]);

    const syncQ = useCallback(() => {
        setLibraryQueue(queueRef.current.map(({ url, referer, ...r }) => r));
        persistState();
    }, [persistState]);

    const syncQThrottled = useCallback(() => {
        if (syncTimer.current) return;
        syncTimer.current = setTimeout(() => { syncTimer.current = null; syncQ(); }, 150);
    }, [syncQ]);

    useEffect(() => {
        let off: (() => void) | null = null;
        const setup = async () => {
            off = await listen<{ percentage: number; downloaded?: number; total?: number }>('download-progress', (e) => {
                const dt = dlTypeRef.current;
                if (!dt) return;
                let pct: number;
                if (e.payload.downloaded && e.payload.total && e.payload.total > 0) {
                    pct = Math.round((e.payload.downloaded / e.payload.total) * 10000) / 100;
                } else { pct = e.payload.percentage; }
                pct = Math.min(100, Math.max(0, pct));

                if (dt === 'library') {
                    const lid = curLibIdRef.current;
                    if (lid) {
                        const item = queueRef.current.find(i => i.id === lid);
                        if (item) { item.progress = pct; syncQThrottled(); }
                    }
                } else {
                    setProgress(pct);
                }
                const now = Date.now();
                if (now - startTimeRef.current > 10000 && pct < 5) setIsSlow(true);
                else if (now - lastTimeRef.current > 2000) {
                    const d = pct - lastProgRef.current;
                    if (d < 1 && pct < 99) setIsSlow(true);
                    else if (d >= 1) setIsSlow(false);
                    lastTimeRef.current = now; lastProgRef.current = pct;
                } else { lastTimeRef.current = now; }
            });
        };
        setup();
        return () => { if (off) off(); };
    }, [syncQThrottled]);

    useEffect(() => {
        if (!activeId) return;
        const iv = setInterval(() => { if (Date.now() - lastTimeRef.current > 5000) setIsSlow(true); }, 1000);
        return () => clearInterval(iv);
    }, [activeId]);

    const processQ = useCallback(async () => {
        if (isLibBusyRef.current) return;
        if (dlTypeRef.current === 'set' || dlTypeRef.current === 'download') return;
        const next = queueRef.current.find(i => i.status === 'queued');
        if (!next) return;

        isLibBusyRef.current = true;
        dlTypeRef.current = 'library';
        curLibIdRef.current = next.id;
        activeIdRef.current = next.imageId;
        lastTimeRef.current = Date.now(); startTimeRef.current = Date.now(); lastProgRef.current = 0;
        setIsSlow(false);
        next.status = 'downloading'; next.progress = 0; syncQ();

        try {
            await invoke('download_to_library', { url: next.url, title: next.title || 'wallpaper', referer: next.referer });
            next.status = 'done'; next.progress = 100;
        } catch (err) {
            next.status = 'error'; next.error = String(err);
        }

        syncQ();
        isLibBusyRef.current = false; dlTypeRef.current = null; curLibIdRef.current = null; activeIdRef.current = null;
        persistState();

        if (next.status === 'done') {
            const nid = next.id;
            setTimeout(() => { queueRef.current = queueRef.current.filter(i => i.id !== nid); syncQ(); }, 8000);
        }
        setTimeout(() => processQ(), 50);
    }, [syncQ, persistState]);

    const start = useCallback(async (
        url: string, image: WallpaperItem, referer?: string, isVideo = false,
        mode: 'download' | 'set' | 'library' = 'download', targetMonitors?: string[]
    ) => {
        if (mode === 'library') {
            if (queueRef.current.some(i => i.imageId === image.id && (i.status === 'queued' || i.status === 'downloading'))) return;
            queueRef.current = [...queueRef.current, {
                id: `lib_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                imageId: image.id, title: image.title || 'Untitled',
                thumbnailUrl: image.thumbnailUrl || image.imageUrl,
                progress: 0, status: 'queued', url, referer,
            }];
            syncQ(); processQ();
            return;
        }

        if (activeIdRef.current === image.id) return;
        if (activeIdRef.current && activeIdRef.current !== image.id) {
            if (abortRef.current) abortRef.current.abort();
            activeIdRef.current = null;
            dlTypeRef.current = null;
            setActiveId(null);
            setActiveItem(null);
            setDownloadMode(null);
            setProgress(0);
        }
        activeIdRef.current = image.id;
        dlTypeRef.current = mode === 'set' ? 'set' : 'download';
        setActiveId(image.id); setActiveItem(image); setDownloadMode(mode);
        setProgress(0); setIsSlow(false);
        abortRef.current = new AbortController();
        lastTimeRef.current = Date.now(); startTimeRef.current = Date.now(); lastProgRef.current = 0;
        activeTaskRef.current = {
            url,
            image,
            referer,
            isVideo,
            mode: mode === 'set' ? 'set' : 'download',
            targetMonitors,
        };
        persistState();

        try {
            const urlPath = new URL(url).pathname;
            const urlFilename = urlPath.split('/').pop() || '';
            const ext = urlFilename.includes('.') ? urlFilename.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg') : (isVideo ? 'mp4' : 'jpg');
            const baseName = image.title ? image.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_').substring(0, 50) : `wallpaper_${Date.now()}`;
            const filename = `${baseName}.${ext}`;

            let result: any;
            if (isVideo && mode === 'set') {
                let monitors = targetMonitors;
                if (!monitors || monitors.length === 0) {
                    try {
                        const all = await invoke('get_monitors') as any[];
                        const primary = all.find((m: any) => m.isPrimary);
                        monitors = [primary?.id || all[0]?.id || ""];
                    } catch { monitors = [""]; }
                }
                result = await invoke('set_video_wallpaper_on_monitors', { videoUrl: url, monitorIds: monitors, referer });
            } else {
                result = await invoke('download_wallpaper', { url, suggestedFilename: filename, referer });
            }

            if (result && !result.success) {
                throw new Error(result.error || 'Failed to download or set wallpaper');
            }

            if (!abortRef.current?.signal.aborted) {
                setProgress(100);
                setTimeout(() => {
                    activeIdRef.current = null; dlTypeRef.current = null;
                    setActiveId(null); setActiveItem(null); setDownloadMode(null); setProgress(0);
                    clearActiveTaskState();
                    processQ();
                }, 2000);
            }
        } catch (err) {
            console.error(err);
            if (!abortRef.current?.signal.aborted) {
                showAlert({ title: 'Download Failed', message: String(err), isDanger: true });
                activeIdRef.current = null; dlTypeRef.current = null;
                setActiveId(null); setActiveItem(null); setDownloadMode(null);
                clearActiveTaskState();
                processQ();
            }
        }
    }, [showAlert, syncQ, processQ, persistState, clearActiveTaskState]);

    const cancel = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
        activeIdRef.current = null; dlTypeRef.current = null;
        setActiveId(null); setActiveItem(null); setDownloadMode(null); setProgress(0);
        clearActiveTaskState();
        processQ();
    }, [processQ, clearActiveTaskState]);

    const cancelAll = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
        activeIdRef.current = null; dlTypeRef.current = null;
        setActiveId(null); setActiveItem(null); setDownloadMode(null); setProgress(0);
        clearActiveTaskState();
        
        const downloading = queueRef.current.find(i => i.status === 'downloading');
        if (downloading) {
            invoke('cancel_library_download', { url: downloading.url }).catch(console.error);
        }

        queueRef.current = queueRef.current.filter(i => i.status === 'done' || i.status === 'error');
        syncQ();
        isLibBusyRef.current = false;
    }, [syncQ, clearActiveTaskState]);

    const cancelLibItem = useCallback((id: string) => {
        const item = queueRef.current.find(i => i.id === id);
        if (!item) return;

        if (item.status === 'downloading' && curLibIdRef.current === id) {
            invoke('cancel_library_download', { url: item.url }).catch(console.error);
            queueRef.current = queueRef.current.filter(i => i.id !== id);
            curLibIdRef.current = null;
            isLibBusyRef.current = false;
            syncQ();
            setTimeout(() => processQ(), 50);
        } else if (item.status === 'queued') {
            queueRef.current = queueRef.current.filter(i => i.id !== id);
            syncQ();
        }
    }, [syncQ, processQ]);

    const dismissLibItem = useCallback((id: string) => {
        queueRef.current = queueRef.current.filter(i => i.id !== id); syncQ();
    }, [syncQ]);

    const clearDoneDownloads = useCallback(() => {
        queueRef.current = queueRef.current.filter(i => i.status === 'queued' || i.status === 'downloading'); syncQ();
    }, [syncQ]);

    const isInLibQueue = useCallback((imageId: string) => {
        return queueRef.current.some(i => i.imageId === imageId && (i.status === 'queued' || i.status === 'downloading' || i.status === 'done'));
    }, []);

    const getLibItemStatus = useCallback((imageId: string) => {
        const item = queueRef.current.find(i => i.imageId === imageId);
        if (!item) return undefined;
        const { url, referer, ...rest } = item;
        return rest;
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(DL_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as { queue?: QueueInternal[]; activeTask?: PersistedActiveTask | null };
            const persistedQueue = (parsed.queue || []).map((item) => {
                if (item.status === 'downloading') {
                    return { ...item, status: 'queued' as const, progress: 0 };
                }
                return item;
            });
            queueRef.current = persistedQueue;
            syncQ();
            if (persistedQueue.some((q) => q.status === 'queued')) {
                setTimeout(() => processQ(), 50);
            }
            if (parsed.activeTask) {
                const task = parsed.activeTask;
                setTimeout(() => {
                    start(task.url, task.image, task.referer, task.isVideo, task.mode, task.targetMonitors);
                }, 150);
            }
        } catch { }
    }, [start, processQ, syncQ]);

    return (
        <DLContext.Provider value={{
            activeId, progress, isSlow, activeItem, downloadMode,
            libraryQueue, start, cancel, dismissLibItem, clearDoneDownloads,
            isInLibQueue, getLibItemStatus, isViewingActiveItem, setIsViewingActiveItem,
            cancelAll, cancelLibItem,
        }}>
            {children}
        </DLContext.Provider>
    );
};
