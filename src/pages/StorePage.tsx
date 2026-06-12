import React from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { Search, RefreshCcw, Loader2 } from 'lucide-react';
import WelcomeModal from '../components/WelcomeModal';
import ImageModal from '../components/ImageModal';
import { LoadingSpinner, SkeletonGrid } from '../components/LoadingState';
import { StoreWallpaperCard } from '../components/StoreWallpaperCard';
import { WallpaperItem } from '../types/wallpaper';
import { storeCache } from '../utils/storeCache';
import { useConfirm } from '../context/ConfirmContext';
import { useVisibility } from '../context/WinCloseContext';
interface AutocompleteTag {
    name: string;
    count?: number;
}


// max items to restore from cache when revisiting the page
const MAX_CACHE_RESTORE = 30;


interface StorePageProps {
    selectedSource: string;
    filterType?: 'all' | 'live' | 'static';
    isDirectNavigation?: boolean;
    onGoToLibrary?: () => void;
}

export default function StorePage({ selectedSource, filterType = 'all', isDirectNavigation = false, onGoToLibrary }: StorePageProps) {
    const { showAlert } = useConfirm();
    const { isVisible } = useVisibility();
    const DISPLAY_FONT = "'Inter', sans-serif";
    const UI_FONT = "'Space Grotesk', sans-serif";
    // try to restore type from cache first, fallback to prop
    const getCachedType = (): 'static' | 'live' | 'all' => {
        const cached = storeCache.get();
        if (cached.wallpapers.length > 0 && cached.type) {
            return cached.type;
        }
        return filterType as any;
    };

    const [wallpapers, setWallpapers] = React.useState<WallpaperItem[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [hasMore, setHasMore] = React.useState(true);
    const [tagCount, setTagCount] = React.useState<number>(0);
    const [autocompleteResults, setAutocompleteResults] = React.useState<AutocompleteTag[]>([]);
    const [isTagLoading, setIsTagLoading] = React.useState(false);
    const [showDropdown, setShowDropdown] = React.useState(false);
    
    // Dropdown ref for clicking outside
    const dropdownRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch tag count on mount
    React.useEffect(() => {
        invoke<number>('get_cached_tag_count').then(count => {
            setTagCount(count);
        }).catch(e => console.error('Failed to get tag count:', e));
    }, []);

    // Debounced autocomplete
    React.useEffect(() => {
        if (searchQuery.trim().length < 2) {
            setAutocompleteResults([]);
            setShowDropdown(false);
            setIsTagLoading(false);
            return;
        }
        
        setIsTagLoading(true);
        const timeoutId = setTimeout(async () => {
            try {
                const results: AutocompleteTag[] = await invoke('autocomplete_tags', {
                    query: searchQuery.trim(),
                    isNsfw: false
                });
                setAutocompleteResults(results);
                setShowDropdown(true);
            } catch (e) {
                console.error('Autocomplete error:', e);
            } finally {
                setIsTagLoading(false);
            }
        }, 300);
        
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);
    const [loadingMore, setLoadingMore] = React.useState(false);
    const [selectedImage, setSelectedImage] = React.useState<WallpaperItem | null>(null);
    const [settingWallpaper, setSettingWallpaper] = React.useState<string | null>(null);
    const [showWelcome, setShowWelcome] = React.useState(false);
    const [currentType, setCurrentType] = React.useState<'static' | 'live' | 'all'>(getCachedType);
    const pageRef = React.useRef(1);

    // session keys
    const welcomedie = 'colorwall_store_welcome_dismissed';

    // track active type to ignore stale requests
    const activeTypeRef = React.useRef(currentType);
    activeTypeRef.current = currentType;

    // track if we've done initial load this mount
    const initializedRef = React.useRef(false);

    // track if user has made a choice from modal (to avoid re-showing)
    const hasUserChosenRef = React.useRef(false);

    // save state to cache on unmount or updates
    React.useEffect(() => {
        if (wallpapers.length > 0) {
            storeCache.set({
                wallpapers,
                page: pageRef.current,
                hasMore,
                searchQuery,
                source: selectedSource,
                type: currentType
            });
        }
    }, [wallpapers, hasMore, searchQuery, selectedSource, currentType]);

    React.useLayoutEffect(() => {
        if (initializedRef.current && wallpapers.length > 0) {
            const cached = storeCache.get();
            if (cached.scrollTop > 0) {
                window.scrollTo(0, cached.scrollTop);
            }
        }
    }, [loading]);

    React.useEffect(() => {
        const handleUnmount = () => {
            storeCache.set({ scrollTop: window.scrollY }); // save scroll pos
        };
        return () => handleUnmount();
    }, []);

    // auto-drop the store cache after 2 min of being off this tab to free memory
    React.useEffect(() => {
        // cancel any pending cache drop from a previous unmount
        const pending = (window as any).__storeCacheDropTimer;
        if (pending) clearTimeout(pending);
        (window as any).__storeCacheDropTimer = null;

        return () => {
            // schedule a cache drop 2min after leaving
            (window as any).__storeCacheDropTimer = setTimeout(() => {
                storeCache.clear();
                console.log('[store] cache auto-dropped after 2min inactivity');
            }, 2 * 60 * 1000);
        };
    }, []);

    // buffer for batching incoming items to reduce re-renders
    const batchBufferRef = React.useRef<WallpaperItem[]>([]);
    const batchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const isFirstBatchRef = React.useRef(true);

    const flushBatch = React.useCallback((append: boolean) => {
        const items = batchBufferRef.current;
        if (items.length === 0) return;
        batchBufferRef.current = [];

        setWallpapers((prev) => {
            // if not appending and this is the first batch, replace entirely
            if (!append && isFirstBatchRef.current) {
                isFirstBatchRef.current = false;
                return items;
            }
            // deduplicate
            const prevIds = new Set(prev.map(w => w.id));
            const unique = items.filter(f => !prevIds.has(f.id));
            if (unique.length === 0) return prev;
            return [...prev, ...unique];
        });
    }, []);

    const searchWallpapers = React.useCallback(
        async (pageNum: number = 1, append: boolean = false, queryOverride?: string) => {
            // clear batch state
            batchBufferRef.current = [];
            if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
            isFirstBatchRef.current = !append;

            if (append) {
                setLoadingMore(true);
            } else {
                setLoading(true);
                // don't clear wallpapers[] here - reduces flash/jank
                // they get replaced when the first batch flushes
            }

            try {
                let sourcesToUse: string[] = [];

                console.log('[DEBUG] Search triggered:', { currentType, selectedSource, searchQuery });

                if (currentType === 'live') {
                    sourcesToUse = ['motionbgs', 'wallpaperwaifu', 'desktophut'];
                } else if (currentType === 'all') {
                    sourcesToUse = ['wallhaven', 'moewalls', 'wallpaperflare', 'wallpapersclan', 'motionbgs', 'wallpaperwaifu', 'konachan', 'desktophut', 'wallpaper_archive', 'wallpaper_archive_laxentainc'];
                } else {
                    if (selectedSource !== 'all') {
                        sourcesToUse = [selectedSource];
                    } else {
                        sourcesToUse = ['wallhaven', 'moewalls', 'wallpaperflare', 'wallpapersclan', 'konachan', 'desktophut', 'wallpaper_archive', 'wallpaper_archive_laxentainc'];
                    }
                }

                console.log('[DEBUG] Using sources:', sourcesToUse);

                let finalQuery = queryOverride !== undefined ? queryOverride : searchQuery;
                if (!finalQuery) {
                    const roll = Math.random();
                    if (roll < 0.4) {
                        finalQuery = '';
                    } else {
                        const staticTags = ['anime', 'landscape', 'city', 'galaxy', 'character', 'minimal'];
                        const liveTags = ['live wallpaper', 'anime', 'rain', 'night', 'space', 'snow', 'genshin', 'wuthering waves'];
                        const pool = currentType === 'live' ? liveTags : staticTags;
                        finalQuery = pool[Math.floor(Math.random() * pool.length)];
                    }
                    console.log('[DEBUG] Auto-selected default query:', { currentType, finalQuery });
                }

                let totalFilteredCount = 0;
                const onEvent = new Channel();
                
                onEvent.onmessage = (message: any) => {
                    if (activeTypeRef.current !== currentType) return;
                    
                    if (message.isComplete) {
                        // flush any remaining buffered items before marking complete
                        if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
                        flushBatch(append);
                        
                        setLoading(false);
                        setLoadingMore(false);
                        
                        // Wait for state to settle, then check if we should allow more loading
                        setHasMore(totalFilteredCount >= 12 || (append && totalFilteredCount > 0));
                        return;
                    }

                    if (message.items && message.items.length > 0) {
                        const normalized = message.items.map((item: any): WallpaperItem => ({
                            id: item.id,
                            source: item.source,
                            title: item.title,
                            imageUrl: item.imageUrl || item.image_url,
                            thumbnailUrl: item.thumbnailUrl || item.thumbnail_url || item.imageUrl || item.image_url,
                            type: item.type === 'video' || item.media_type === 'video' ? 'video' : 'image',
                            width: item.width,
                            height: item.height,
                            tags: item.tags,
                            detailUrl: item.detailUrl || item.detail_url,
                            metadata: item.metadata,
                            original: item,
                        }));

                        let filtered = normalized;
                        if (currentType === 'live') {
                            filtered = normalized.filter((item: WallpaperItem) => item.type === 'video');
                        } else if (currentType === 'static') {
                            filtered = normalized.filter((item: WallpaperItem) => item.type === 'image');
                        }

                        if (filtered.length > 0) {
                            totalFilteredCount += filtered.length;
                            // push into batch buffer instead of updating state per-source
                            batchBufferRef.current.push(...filtered);
                            // debounce flush - coalesce concurrent source responses into one render
                            if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
                            batchTimerRef.current = setTimeout(() => flushBatch(append), 80);
                        }
                    }
                };

                await invoke('search_wallpapers', {
                    query: finalQuery || '',
                    sources: sourcesToUse,
                    limitPerSource: 30,
                    randomize: true,
                    page: pageNum,
                    purity: '100',
                    aiArt: false,
                    onEvent: onEvent,
                });
                
            } catch (error) {
                if (activeTypeRef.current !== currentType) return;
                console.error('Search failed:', error);
                setHasMore(false);
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [searchQuery, selectedSource, currentType, flushBatch]
    );

    // initial load logic - runs once per mount
    React.useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        // always try to restore from cache first (if valid and not expired)
        const cached = storeCache.get();
        const cacheValid = storeCache.isValid(cached.source, cached.type, cached.searchQuery);

        if (cacheValid && cached.wallpapers.length > 0) {
            // restore from cache
            console.log('[StorePage] Restoring from cache:', cached.wallpapers.length, 'items');
            // only restore a limited slice to avoid dumping 100+ cards into the dom at once
            const restoreSlice = cached.wallpapers.slice(0, MAX_CACHE_RESTORE);
            setWallpapers(restoreSlice);
            setHasMore(true); // user can still scroll to load more
            setSearchQuery(cached.searchQuery);
            setCurrentType(cached.type);
            pageRef.current = cached.page;
            hasUserChosenRef.current = true; // user already made a choice before
            return;
        }

        // no valid cache - show welcome modal if direct navigation and not dismissed
        const alreadyDismissed = sessionStorage.getItem(welcomedie) === 'true';
        if (isDirectNavigation && !alreadyDismissed) {
            setShowWelcome(true);
            // don't fetch yet, wait for user choice
            return;
        }

        // no cache, no modal needed - just fetch
        searchWallpapers(1, false);
    }, []); // empty deps - only run on mount

    // handle type changes from user interaction (after initial load)
    const prevTypeRef = React.useRef(currentType);
    React.useEffect(() => {
        // skip if this is the initial value or same as before
        if (prevTypeRef.current === currentType) return;
        prevTypeRef.current = currentType;

        // user changed type, fetch new data
        console.log('[StorePage] Type changed to:', currentType);
        pageRef.current = 1;
        storeCache.clear(); // clear cache since type changed
        searchWallpapers(1, false);
    }, [currentType, searchWallpapers]);

    React.useEffect(() => {
        const handleScroll = () => {
            if (
                window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 600 &&
                !loadingMore &&
                !loading &&
                hasMore
            ) {
                const nextPage = pageRef.current + 1;
                pageRef.current = nextPage;
                searchWallpapers(nextPage, true);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [loadingMore, loading, hasMore, searchWallpapers]);

    const handleSearch = (queryOverride?: string) => {
        pageRef.current = 1;
        setHasMore(true);
        // don't clear wallpapers - batch flush will atomically replace on first results
        searchWallpapers(1, false, queryOverride);
    };

    const handleRefresh = () => {
        storeCache.clear();
        pageRef.current = 1;
        setHasMore(true);
        // don't clear wallpapers - batch flush will atomically replace on first results
        searchWallpapers(1, false);
    };

    const handleWelcomeChoice = (type: 'static' | 'live' | 'all') => {
        hasUserChosenRef.current = true;
        sessionStorage.setItem(welcomedie, 'true');
        setShowWelcome(false);

        // Clear and show loading immediately
        setWallpapers([]);
        setLoading(true);
        pageRef.current = 1;

        if (type !== currentType) {
            setCurrentType(type);
        }

        // Trigger search directly instead of relying on useEffect
        // This ensures immediate response
        setTimeout(() => searchWallpapers(1, false), 0);
    };

    // Handle modal close (clicking outside or X) - defaults to 'all'
    const handleWelcomeClose = () => {
        handleWelcomeChoice('all');
    };

    const handleSetWallpaper = async (url: string, referer?: string) => {
        if (!selectedImage || settingWallpaper) return;

        setSettingWallpaper(selectedImage.id);
        try {
            const result: any = await invoke('set_wallpaper', { imageUrl: url, referer });

            if (result.success) {
                setSelectedImage(null);
            } else {
                showAlert({ title: 'Failed', message: result.error, isDanger: true });
            }
        } catch (error) {
            console.error('Set wallpaper failed:', error);
            showAlert({ title: 'Error', message: String(error), isDanger: true });
        } finally {
            setSettingWallpaper(null);
        }
    };

    return (
        <div style={{ padding: '40px', scrollBehavior: 'smooth' }}>
            {showWelcome && (
                <WelcomeModal
                    onClose={handleWelcomeClose}
                    onSelectType={handleWelcomeChoice}
                />
            )}

            <div style={{ marginBottom: '36px' }}>


                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '28px', maxWidth: '100%' }}>
                    <div style={{
                        fontFamily: UI_FONT,
                        fontSize: '13px',
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        color: 'var(--text-tertiary)',
                    }}>
                        Home / Store · {tagCount.toLocaleString()} tags
                    </div>
                    <div style={{ lineHeight: 1.1, marginBottom: '24px' }}>
                        <motion.h1
                          animate={isVisible ? { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] } : {}}
                            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 4 }}
                            style={{
                            fontSize: 'clamp(36px, 5vw, 64px)',
                            fontWeight: 900,
                            fontFamily: DISPLAY_FONT,
                            margin: 0,
                            backgroundImage: 'linear-gradient(90deg, #fff 0%, #0078d4 50%, #fff 100%)',
                            backgroundSize: '200% 100%',
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            letterSpacing: '0.04em',
                            color: '#ffffff'
                        }}>
                          DESKTOP    
                        </motion.h1>   
                        <h1 style={{
                            fontSize: 'clamp(36px, 5vw, 64px)',
                            fontWeight: 900,
                            fontFamily: DISPLAY_FONT,
                            margin: 0,
                            letterSpacing: '0.04em',
                            color: '#0078D4',
                            paddingLeft: '40px'
                        }}>
                            WALLPAPERS
                        </h1>
                    </div>

                    <div style={{
                        display: 'flex',
                        background: 'var(--bg-secondary)',
                        padding: '6px',
                        borderRadius: '16px',
                        border: '1px solid var(--border-color)',
                        gap: '6px',
                        marginBottom: '24px'
                    }}>
                        {(['all', 'live', 'static'] as const).map((type) => (
                            <motion.button
                                key={type}
                                whileHover={{ scale: currentType === type ? 1 : 1.02 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    if (type !== currentType) {
                                        setCurrentType(type);
                                        hasUserChosenRef.current = true;
                                        setLoading(true);
                                        setTimeout(() => handleSearch(), 50);
                                    }
                                }}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    fontFamily: UI_FONT,
                                    letterSpacing: '0.01em',
                                    background: currentType === type ? 'linear-gradient(135deg, var(--accent), var(--accent-hover))' : 'transparent',
                                    color: currentType === type ? 'white' : 'var(--text-secondary)',
                                    transition: 'all 0.2s',
                                    boxShadow: currentType === type ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                                }}
                            >
                                {type === 'all' ? 'All' : type === 'live' ? 'Live' : 'Static'}
                            </motion.button>
                        ))}
                    </div>

                    <div className="hide-scrollbar" style={{
                        display: 'flex',
                        gap: '8px',
                        flexWrap: 'wrap',
                        width: '100%',
                        maxWidth: '100%',
                        paddingBottom: '8px',
                        marginBottom: '24px'
                    }}>
                        {(currentType === 'live' 
                            ? ['LIVE WALLPAPER', 'ANIME', 'RAIN', 'NIGHT', 'SPACE', 'SNOW', 'GENSHIN', 'WUTHERING WAVES'] 
                            : ['4K', '5K', 'ANIME', 'NATURE', 'ARTWORK', 'SPACE', 'GAMES', 'DIGITAL ART', 'ILLUSTRATION']
                        ).map(tag => (
                            <button
                                key={tag}
                                onClick={() => {
                                    setSearchQuery(tag);
                                    handleSearch(tag);
                                }}
                                style={{
                                    padding: '6px 16px',
                                    background: 'var(--bg-secondary)',
                                    borderRadius: '20px',
                                    border: '1px solid var(--border-color)',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    fontFamily: UI_FONT,
                                    color: 'var(--text-secondary)',
                                    whiteSpace: 'nowrap',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
                                onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '16px', maxWidth: '700px' }}>
                    <div style={{ position: 'relative', flex: 1 }} ref={dropdownRef}>
                        <Search
                            style={{
                                position: 'absolute',
                                left: '18px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                color: 'var(--text-tertiary)',
                                pointerEvents: 'none',
                            }}
                            size={20}
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            onFocus={() => {
                                if (autocompleteResults.length > 0) setShowDropdown(true);
                            }}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (currentType === 'live' && val.length > 16) {
                                    return; // limit live wallpapers searches to 16 chars
                                }
                                setSearchQuery(val);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setShowDropdown(false);
                                    handleSearch();
                                }
                            }}
                            placeholder={currentType === 'live' ? "Search wallpapers (max 16 chars)..." : "Search wallpapers..."}
                            style={{
                                width: '100%',
                                padding: '16px 52px',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '14px',
                                color: 'var(--text-primary)',
                                fontSize: '15px',
                                fontFamily: UI_FONT,
                                fontWeight: 500,
                                outline: 'none',
                                transition: 'border-color 0.2s',
                            }}
                        />
                        {isTagLoading && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{
                                    position: 'absolute',
                                    right: '18px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--accent)',
                                    pointerEvents: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                            >
                                <Loader2 className="animate-spin" size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            </motion.div>
                        )}
                        
                        {/* Dropdown */}
                        {showDropdown && autocompleteResults.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    marginTop: '8px',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '12px',
                                    padding: '8px',
                                    zIndex: 50,
                                    boxShadow: 'var(--shadow-lg)',
                                    maxHeight: '300px',
                                    overflowY: 'auto'
                                }}
                                className="hide-scrollbar"
                            >
                                {autocompleteResults.map((tag) => (
                                    <div
                                        key={tag.name}
                                        onClick={() => {
                                            setSearchQuery(tag.name);
                                            setShowDropdown(false);
                                            handleSearch(tag.name);
                                        }}
                                        style={{
                                            padding: '12px 16px',
                                            cursor: 'pointer',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            transition: 'background 0.2s',
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                                    >
                                        <span style={{ fontFamily: UI_FONT, fontWeight: 500 }}>{tag.name}</span>
                                        {tag.count !== undefined && (
                                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: UI_FONT }}>
                                                {tag.count.toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </div>

                    <button
                        onClick={handleRefresh}
                        disabled={loading || loadingMore}
                        title="Shuffle - load fresh wallpapers"
                        style={{
                            padding: '14px 18px',
                            background: loading ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '14px',
                            color: loading ? 'var(--text-tertiary)' : 'var(--text-primary)',
                            fontFamily: UI_FONT,
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: loading || loadingMore ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: loading || loadingMore ? 0.5 : 1,
                            transition: 'opacity 0.15s, background 0.15s',
                        }}
                    >
                        {loading ? (
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                            <RefreshCcw size={16} />
                        )}
                        Refresh
                    </button>

                    <button
                        onClick={() => handleSearch()}
                        disabled={loading || loadingMore}
                        style={{
                            padding: '14px 28px',
                            background: loading || loadingMore ? 'var(--bg-tertiary)' : 'var(--accent)',
                            border: 'none',
                            borderRadius: '14px',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: 600,
                            fontFamily: UI_FONT,
                            cursor: loading || loadingMore ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            opacity: loading || loadingMore ? 0.6 : 1,
                            transition: 'opacity 0.15s, background 0.15s',
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                Searching...
                            </>
                        ) : (
                            <>
                                <Search size={16} />
                                Search
                            </>
                        )}
                    </button>
                </div>
            </div>

            {loading && wallpapers.length === 0 ? (
                <div style={{ width: '100%' }}>
                    <SkeletonGrid count={12} />
                </div>
            ) : wallpapers.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{
                        textAlign: 'center',
                        padding: '80px 20px',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>No wallpapers found</h3>
                    <p style={{ fontSize: '14px' }}>Try a different search query</p>
                </motion.div>
            ) : (
                <>
                    <div
                        style={{
                            columnCount: 'auto',
                            columnWidth: '320px',
                            columnGap: '16px',
                            marginBottom: '40px',
                            contain: 'layout style',
                        }}
                    >
                        {wallpapers.map((wallpaper, index) => (
                            <StoreWallpaperCard
                                key={wallpaper.id}
                                wallpaper={wallpaper}
                                index={index}
                                onClick={() => setSelectedImage(wallpaper)}
                            />
                        ))}
                    </div>

                    {loadingMore && (
                        <div style={{ textAlign: 'center', padding: '32px 0' }}>
                            <LoadingSpinner text="Loading more..." />
                        </div>
                    )}

                    {!hasMore && wallpapers.length > 0 && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '32px 0',
                                color: 'var(--text-tertiary)',
                                fontSize: '14px',
                            }}
                        >
                            That's all for now LMAO i did not have too much time, it's for the hackathon on microsoft, so it sort of rushed, a little!
                        </div>
                    )}
                </>
            )}

            {selectedImage && (
                <ImageModal
                    image={selectedImage}
                    onClose={() => setSelectedImage(null)}
                    onSetWallpaper={handleSetWallpaper}
                    isLoading={settingWallpaper === selectedImage.id}
                    onGoToLibrary={onGoToLibrary}
                />
            )}
        </div>
    );
}
