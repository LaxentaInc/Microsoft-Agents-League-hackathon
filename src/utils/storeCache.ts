import { WallpaperItem } from '../types/wallpaper';

interface StoreCache {
    wallpapers: WallpaperItem[];
    page: number;
    scrollTop: number;
    searchQuery: string;
    source: string;
    type: 'all' | 'live' | 'static';
    hasMore: boolean;
    timestamp: number;
}

const CACHE_KEY = 'colorwall_store_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

const DEFAULT_CACHE: StoreCache = {
    wallpapers: [],
    page: 1,
    scrollTop: 0,
    searchQuery: '',
    source: 'all',
    type: 'all',
    hasMore: true,
    timestamp: 0
};

const readCache = (): StoreCache => {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
            return JSON.parse(raw) as StoreCache;
        }
    } catch (e) {
        console.warn('[storeCache] failed to read cache:', e);
    }
    return { ...DEFAULT_CACHE };
};

const writeCache = (cache: StoreCache): void => {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('[storeCache] failed to write cache:', e);
    }
};

export const storeCache = {
    get: (): StoreCache => readCache(),

    set: (data: Partial<StoreCache>): void => {
        const current = readCache();
        const updated = { ...current, ...data, timestamp: Date.now() };
        writeCache(updated);
    },

    clear: (): void => {
        sessionStorage.removeItem(CACHE_KEY);
    },

    isValid: (source: string, type: string, query: string): boolean => {
        const cache = readCache();
        const isExpired = Date.now() - cache.timestamp > CACHE_EXPIRY_MS;

        return (
            !isExpired &&
            cache.wallpapers.length > 0 &&
            cache.source === source &&
            cache.type === type &&
            cache.searchQuery === query
        );
    }
};

