import { ChevronRight, ChevronLeft, ChevronDown, Mountain, Film, Image as ImageIcon, Layers } from 'lucide-react';
// @ts-ignore
import React, { useState } from 'react';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

const HomeIcon = ({ size = 20, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor"/>
    <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".6"/>
    <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".6"/>
    <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".3"/>
  </svg>
);

const StoreIcon = ({ size = 20, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const LibraryIcon = ({ size = 20, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M6 7l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const DesktopIcon = ({ size = 20, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <rect x="2" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M6 13h4M8 12v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const SettingsIcon = ({ size = 20, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <path d="M13 8A5 5 0 1 1 8 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <path d="M10 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const FeedbackIcon = ({ size = 20, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <path d="M2 12l3-5 2.5 3L10 7l4 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// custom icons for desktop subtabs — more visually distinct than generic lucide icons
const InteractiveIcon = ({ size = 14, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <path d="M1 8h2l1.5-4 2 8 2-6 1.5 4H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const WidgetGridIcon = ({ size = 14, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
    <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.2"/>
    <circle cx="11.5" cy="11.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);

const CodeBracketIcon = ({ size = 14, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <path d="M5.5 3L2 8l3.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10.5 3L14 8l-3.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

interface ModernNavigationProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    isExpanded: boolean;
    onExpandChange: (expanded: boolean) => void;
    updateAvailable?: boolean;
}

// library sub-items
const librarySubTabs = [
    { id: 'library-all', label: 'All', icon: Layers },
    { id: 'library-videos', label: 'Videos', icon: Film },
    { id: 'library-images', label: 'Images', icon: ImageIcon },
];

// discover sub-items
const discoverSubTabs = [
    { id: 'discover-store', label: 'Store', icon: StoreIcon },
    { id: 'discover-interactive', label: 'Interactive', icon: InteractiveIcon },
    { id: 'discover-widgets', label: 'Widgets', icon: WidgetGridIcon },
    { id: 'discover-docs', label: 'API Docs', icon: CodeBracketIcon },
];

const tabs = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'studio', label: 'Studio', icon: Mountain },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function ModernNavigation({ activeTab, onTabChange, isExpanded, onExpandChange, updateAvailable }: ModernNavigationProps) {
    const [discoverExpanded, setDiscoverExpanded] = useState(true);
    const [libraryExpanded, setLibraryExpanded] = useState(true);

    // auto-expand sections when a sub-tab is active
    const isDiscoverActive = activeTab.startsWith('discover');
    const showDiscoverSubs = discoverExpanded || isDiscoverActive;
    const isLibraryActive = activeTab.startsWith('library');
    const showLibrarySubs = libraryExpanded || isLibraryActive;

    const toggleSidebar = async () => {
        try {
            const window = getCurrentWindow();
            const currentSize = await window.innerSize();
            const scaleFactor = await window.scaleFactor();
            const logicalSize = currentSize.toLogical(scaleFactor);

            const isMaximized = await window.isMaximized();

            if (!isMaximized) {
                if (isExpanded) {
                    await window.setSize(new LogicalSize(logicalSize.width - 140, logicalSize.height));
                } else {
                    await window.setSize(new LogicalSize(logicalSize.width + 140, logicalSize.height));
                }
            }
        } catch (e) {
            console.error("Failed to resize window", e);
        }

        onExpandChange(!isExpanded);
    };

    // render a standard nav button
    const renderNavButton = (id: string, label: string, Icon: any, isActive: boolean, opts?: { isSub?: boolean }) => (
        <button
            key={id}
            onClick={() => onTabChange(id)}
            title={!isExpanded ? label : ''}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isExpanded ? 'flex-start' : 'center',
                width: '100%',
                height: opts?.isSub ? '36px' : '44px',
                padding: isExpanded ? (opts?.isSub ? '0 16px 0 38px' : '0 16px') : '0',
                background: isActive
                    ? (opts?.isSub
                        ? 'rgba(0, 120, 212, 0.15)'
                        : 'linear-gradient(135deg, var(--accent), rgba(0, 120, 212, 0.8))')
                    : 'transparent',
                border: 'none',
                borderRadius: opts?.isSub ? '8px' : '12px',
                cursor: 'pointer',
                color: isActive
                    ? (opts?.isSub ? 'var(--accent)' : 'white')
                    : 'var(--text-secondary)',
                position: 'relative',
                transition: 'all 0.2s ease',
                boxShadow: isActive && !opts?.isSub && isExpanded ? '0 4px 12px rgba(0, 120, 212, 0.3)' : 'none',
                whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
                if (!isActive) {
                    e.currentTarget.style.background = opts?.isSub
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'rgba(255, 255, 255, 0.1)';
                }
            }}
            onMouseLeave={(e) => {
                if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                }
            }}
        >
            <Icon size={opts?.isSub ? 14 : 20} style={{ minWidth: opts?.isSub ? '14px' : '20px' }} />

            {/* update notification dot */}
            {id === 'updates' && updateAvailable && !isActive && (
                <span style={{
                    position: 'absolute',
                    top: '8px',
                    right: isExpanded ? '12px' : '10px',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px var(--accent)',
                    animation: 'pulse 2s ease-in-out infinite',
                }} />
            )}

            <span style={{
                marginLeft: opts?.isSub ? '8px' : '12px',
                fontSize: opts?.isSub ? '12px' : '14px',
                fontWeight: isActive ? 600 : 500,
                opacity: isExpanded ? 1 : 0,
                transition: 'opacity 0.2s',
                display: isExpanded ? 'block' : 'none'
            }}>
                {label}
            </span>
        </button>
    );

    // home is rendered from the tabs array
    const preTabs = tabs.slice(0, 1);

    return (
        <div
            className="sidebar"
            style={{
                position: 'fixed',
                top: '48px',
                left: 0,
                width: isExpanded ? '200px' : '60px',
                height: 'calc(100vh - 48px)',
                background: 'rgba(15, 15, 20, 0.4)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                flexDirection: 'column',
                padding: '16px 10px',
                zIndex: 100,
                borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                overflow: 'hidden',
            }}
        >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {preTabs.map((tab) => renderNavButton(tab.id, tab.label, tab.icon, activeTab === tab.id))}

                <button
                    onClick={() => {
                        if (isExpanded) {
                            if (!isDiscoverActive) {
                                onTabChange('discover-home');
                            } else {
                                setDiscoverExpanded(e => !e);
                            }
                        } else {
                            onTabChange('discover-home');
                        }
                    }}
                    title={!isExpanded ? 'Discover' : ''}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isExpanded ? 'flex-start' : 'center',
                        width: '100%',
                        height: '44px',
                        padding: isExpanded ? '0 16px' : '0',
                        background: isDiscoverActive && !showDiscoverSubs
                            ? 'linear-gradient(135deg, var(--accent), rgba(0, 120, 212, 0.8))'
                            : isDiscoverActive
                                ? 'rgba(0, 120, 212, 0.08)'
                                : 'transparent',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        color: isDiscoverActive ? 'white' : 'var(--text-secondary)',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                        if (!isDiscoverActive) {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!isDiscoverActive || showDiscoverSubs) {
                            e.currentTarget.style.background = isDiscoverActive
                                ? 'rgba(0, 120, 212, 0.08)' : 'transparent';
                        }
                    }}
                >
                    <StoreIcon size={20} style={{ minWidth: '20px' }} />
                    <span style={{
                        marginLeft: '12px',
                        fontSize: '14px',
                        fontWeight: 500,
                        opacity: isExpanded ? 1 : 0,
                        transition: 'opacity 0.2s',
                        display: isExpanded ? 'block' : 'none',
                        flex: 1,
                        textAlign: 'left',
                    }}>
                        Discover
                    </span>
                    {isExpanded && (
                        <span style={{
                            color: 'var(--text-tertiary)',
                            transition: 'transform 0.2s ease',
                            transform: showDiscoverSubs ? 'rotate(0deg)' : 'rotate(-90deg)',
                            display: 'flex', alignItems: 'center',
                        }}>
                            <ChevronDown size={14} />
                        </span>
                    )}
                </button>

                <div style={{
                    overflow: 'hidden',
                    maxHeight: showDiscoverSubs ? `${discoverSubTabs.length * 40}px` : '0px',
                    transition: 'max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    paddingLeft: isExpanded ? '0' : '0',
                }}>
                    {discoverSubTabs.map((sub) =>
                        renderNavButton(sub.id, sub.label, sub.icon, activeTab === sub.id, { isSub: true })
                    )}
                </div>

                <button
                    onClick={() => {
                        if (isExpanded) {
                            if (!isLibraryActive) {
                                onTabChange('library-all');
                            } else {
                                setLibraryExpanded(e => !e);
                            }
                        } else {
                            onTabChange('library-all');
                        }
                    }}
                    title={!isExpanded ? 'Library' : ''}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isExpanded ? 'flex-start' : 'center',
                        width: '100%',
                        height: '44px',
                        padding: isExpanded ? '0 16px' : '0',
                        background: isLibraryActive && !showLibrarySubs
                            ? 'linear-gradient(135deg, var(--accent), rgba(0, 120, 212, 0.8))'
                            : isLibraryActive
                                ? 'rgba(0, 120, 212, 0.08)'
                                : 'transparent',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        color: isLibraryActive ? 'white' : 'var(--text-secondary)',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => {
                        if (!isLibraryActive) {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (!isLibraryActive || showLibrarySubs) {
                            e.currentTarget.style.background = isLibraryActive
                                ? 'rgba(0, 120, 212, 0.08)' : 'transparent';
                        }
                    }}
                >
                    <LibraryIcon size={20} style={{ minWidth: '20px' }} />
                    <span style={{
                        marginLeft: '12px',
                        fontSize: '14px',
                        fontWeight: 500,
                        opacity: isExpanded ? 1 : 0,
                        transition: 'opacity 0.2s',
                        display: isExpanded ? 'block' : 'none',
                        flex: 1,
                        textAlign: 'left',
                    }}>
                        Library
                    </span>
                    {isExpanded && (
                        <span style={{
                            color: 'var(--text-tertiary)',
                            transition: 'transform 0.2s ease',
                            transform: showLibrarySubs ? 'rotate(0deg)' : 'rotate(-90deg)',
                            display: 'flex', alignItems: 'center',
                        }}>
                            <ChevronDown size={14} />
                        </span>
                    )}
                </button>

                <div style={{
                    overflow: 'hidden',
                    maxHeight: showLibrarySubs ? `${librarySubTabs.length * 40}px` : '0px',
                    transition: 'max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                }}>
                    {librarySubTabs.map((sub) =>
                        renderNavButton(sub.id, sub.label, sub.icon, activeTab === sub.id, { isSub: true })
                    )}
                </div>

                {renderNavButton('settings', 'Settings', SettingsIcon, activeTab === 'settings')}
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                    onClick={() => onTabChange('feedback')}
                    title={isExpanded ? "Report Bug / Feedback" : "Feedback"}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isExpanded ? 'flex-start' : 'center',
                        width: '100%',
                        height: '40px',
                        padding: isExpanded ? '0 16px' : '0',
                        background: activeTab === 'feedback' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid',
                        borderColor: activeTab === 'feedback' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: activeTab === 'feedback' ? '#ef4444' : 'var(--text-secondary)',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        if (activeTab !== 'feedback') {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.2)';
                            e.currentTarget.style.color = '#ef4444';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (activeTab !== 'feedback') {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                        }
                    }}
                >
                    <FeedbackIcon size={18} style={{ minWidth: '18px' }} />
                    <span style={{
                        marginLeft: '12px',
                        fontSize: '13px',
                        fontWeight: 500,
                        opacity: isExpanded ? 1 : 0,
                        transition: 'opacity 0.2s',
                        display: isExpanded ? 'block' : 'none',
                        whiteSpace: 'nowrap'
                    }}>
                        Feedback
                    </span>
                </button>

                <button
                    onClick={toggleSidebar}
                    title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '40px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                        e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                >
                    {isExpanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                </button>
            </div>
        </div>
    );
}