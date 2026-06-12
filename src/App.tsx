import React from 'react';
import EnhancedTitleBar from './components/titlebar';
import ModernNavigation from './components/Newnavigation';
import LoadingScreen from './components/LoadingScreen';
import HomePage from './pages/HomePage';
import AllTab from './pages/library/AllTab';
import VideosTab from './pages/library/VideosTab';
import ImagesTab from './pages/library/ImagesTab';
import StorePage from './pages/StorePage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';

import FeedbackPage from './pages/FeedbackPage';
import InteractiveTab from './pages/desktop/InteractiveTab';
import WidgetsTab from './pages/desktop/WidgetsTab';
import ApiDocsTab from './pages/desktop/ApiDocsTab';
import { DLProvider } from './context/DownloadContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { VisibilityProvider, useVisibility } from './context/WinCloseContext';
import FloatingProgress from './components/floatyfloaty';
import ContextMenu from './components/ContextMenu';
import { invoke } from '@tauri-apps/api/core';
import DesktopPageHeader from './components/DesktopPageHeader';
import DiscoverPage from './pages/DiscoverPage';

function App() {
    const { isVisible } = useVisibility();
    const [isLoading, setIsLoading] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState('home');
    // debounce guard, prevents rapid tab switches from stacking multiple re-renders
    const tabSwitchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [browsingSource, setBrowsingSource] = React.useState<string | null>(null);
    const [browsingLive, setBrowsingLive] = React.useState(false);
    const [isDirectNavigation, setIsDirectNavigation] = React.useState(false);
    const [settingsInitialTab, setSettingsInitialTab] = React.useState<string>('video');

    const [isSidebarExpanded, setIsSidebarExpandedRaw] = React.useState(() => {
        try {
            return localStorage.getItem('sidebar-expanded') === 'true';
        } catch {
            return false;
        }
    });

    // persist sidebar state to localstorage on every change
    const setIsSidebarExpanded = React.useCallback((expanded: boolean) => {
        setIsSidebarExpandedRaw(expanded);
        try {
            localStorage.setItem('sidebar-expanded', String(expanded));
        } catch { /* noop */ }
    }, []);

    React.useEffect(() => {
        invoke('get_settings').then((res: any) => {
            if (res.success && res.settings) {
                if (res.settings.windowVibrancy) {
                    document.body.classList.add('vibrancy-enabled');
                } else {
                    document.body.classList.remove('vibrancy-enabled');
                }
                if (res.settings.perfMode) {
                    if (!res.settings.perfBlurEnabled) document.body.classList.add('perf-no-blur');
                    if (!res.settings.perfAnimationsEnabled) document.body.classList.add('perf-no-animations');
                    if (!res.settings.perfShadowsEnabled) document.body.classList.add('perf-no-shadows');
                }
            }
        }).catch(err => {
            console.error("Failed to load global settings:", err);
        });

        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 4500);

        return () => clearTimeout(timer);
    }, []);

    React.useEffect(() => {
        const syncRpcFocus = () => {
            const focused = isVisible && document.hasFocus();
            invoke('set_discord_rpc_window_focus', { focused }).catch(() => { /* noop */ });
        };

        syncRpcFocus();
        window.addEventListener('focus', syncRpcFocus);
        window.addEventListener('blur', syncRpcFocus);
        document.addEventListener('visibilitychange', syncRpcFocus);

        return () => {
            window.removeEventListener('focus', syncRpcFocus);
            window.removeEventListener('blur', syncRpcFocus);
            document.removeEventListener('visibilitychange', syncRpcFocus);
        };
    }, [isVisible]);


    const handleSourceNavigation = (source: string) => {
        setBrowsingSource(source);
        setBrowsingLive(false);
        setIsDirectNavigation(false);
        setActiveTab('discover-store');
    };

    const handleLiveNavigation = () => {
        setBrowsingLive(true);
        setBrowsingSource(null);
        setActiveTab('discover-store');
    };

    const handleSettingsClick = () => {
        setSettingsInitialTab('video');
        setActiveTab('settings');
        setBrowsingSource(null);
        setBrowsingLive(false);
    };

    const handleUserClick = () => {
        setActiveTab('profile');
        setBrowsingSource(null);
        setBrowsingLive(false);
    };

    const handleNavigateToDisplaySettings = () => {
        setSettingsInitialTab('display');
        setActiveTab('settings');
        setBrowsingSource(null);
        setBrowsingLive(false);
        setIsDirectNavigation(false);
    };

    const handleTabChange = (tab: string) => {
        if (tabSwitchTimer.current) {
            clearTimeout(tabSwitchTimer.current);
            tabSwitchTimer.current = null;
        }

        tabSwitchTimer.current = setTimeout(() => {
            tabSwitchTimer.current = null;
            setActiveTab(tab);
            if (tab === 'discover-store') {
                setIsDirectNavigation(true);
            } else {
                setBrowsingSource(null);
                setBrowsingLive(false);
                setIsDirectNavigation(false);
            }
        }, 50);
    };

    // deep unmount the entire UI when hidden to ensure zero gpu usage
    if (!isVisible) {
        return null;
    }

    if (isLoading) {
        return <LoadingScreen />;
    }

    return (
        <div className="app-container" style={{ minHeight: '100vh', position: 'relative' }}>
            <ContextMenu />
            <EnhancedTitleBar onSettingsClick={handleSettingsClick} onUserClick={handleUserClick} />
            <ModernNavigation
                activeTab={activeTab}
                onTabChange={handleTabChange}
                isExpanded={isSidebarExpanded}
                onExpandChange={setIsSidebarExpanded}
            />

            <div style={{
                marginLeft: isSidebarExpanded ? '212px' : '72px',
                marginTop: '48px',
                minHeight: 'calc(100vh - 48px)',
                transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
                {activeTab === 'home' && (
                    <HomePage
                        onNavigateToSource={handleSourceNavigation}
                        onNavigateToLive={handleLiveNavigation}
                        onNavigateToDisplaySettings={handleNavigateToDisplaySettings}
                        isActive={activeTab === 'home'}
                    />
                )}
                {activeTab === 'discover-home' && (
                    <DiscoverPage onNavigate={(id) => setActiveTab(id)} />
                )}
                {activeTab === 'discover-store' && (
                    <StorePage
                        selectedSource={browsingSource || 'all'}
                        filterType={browsingLive ? 'live' : 'static'}
                        isDirectNavigation={isDirectNavigation}
                        onGoToLibrary={() => setActiveTab('library-all')}
                    />
                )}
                {activeTab === 'library-all' && (
                    <div style={{ padding: '40px' }}>
                        <DesktopPageHeader
                            subtitle="Library"
                            title="All Wallpapers"
                            description="Use Store to Download wallpapers (or upload your own files), click on whichever you like, and save it!! And they will be saved here even when Offline!!"
                        />
                        <AllTab />
                    </div>
                )}
                {activeTab === 'library-videos' && (
                    <div style={{ padding: '40px' }}>
                        <DesktopPageHeader
                            subtitle="Library"
                            title="Video Wallpapers"
                            description="Your live video wallpapers — mp4, webm, mkv, and more."
                        />
                        <VideosTab />
                    </div>
                )}
                {activeTab === 'library-images' && (
                    <div style={{ padding: '40px' }}>
                        <DesktopPageHeader
                            subtitle="Library"
                            title="Image Wallpapers"
                            description="Your static wallpapers — jpg, png, and gif files."
                        />
                        <ImagesTab />
                    </div>
                )}
                {activeTab === 'settings' && (
                    <SettingsPage initialTab={settingsInitialTab} />
                )}
                {activeTab === 'profile' && (
                    <ProfilePage />
                )}

                {activeTab === 'feedback' && (
                    <FeedbackPage />
                )}
                {activeTab === 'discover-interactive' && (
                    <div style={{ padding: '40px' }}>
                        <DesktopPageHeader
                            subtitle="Interactive"
                            title="Interactive Wallpapers"
                            description="Bring your desktop to life with reactive, code-driven wallpapers. Import your own and Create Using the API docs."
                        />
                        <InteractiveTab />
                    </div>
                )}
                {activeTab === 'discover-widgets' && (
                    <div style={{ padding: '40px' }}>
                        <DesktopPageHeader
                            subtitle="Widgets"
                            title="Desktop Widgets"
                            description="Create and Import using API docs, Add clocks, system monitors, music players, and custom widgets to your desktop. (Needs improvements, under dev)"
                        />
                        <WidgetsTab />
                    </div>
                )}
                {activeTab === 'discover-docs' && (
                    <div style={{ padding: '40px' }}>
                        <DesktopPageHeader
                            subtitle="Developer"
                            title="API Documentation"
                            description="Docs for WIDGETS & INTERACTIVES, Build your own with the ColorWall API. Or paste it to AI to get one!"
                        />
                        <ApiDocsTab />
                    </div>
                )}
            </div>
            <FloatingProgress />
        </div>
    );
}

const AppWrapper = () => (
    <VisibilityProvider>
        <ConfirmProvider>
            <DLProvider>
                <App />
            </DLProvider>
        </ConfirmProvider>
    </VisibilityProvider>
);

export { AppWrapper as default };
