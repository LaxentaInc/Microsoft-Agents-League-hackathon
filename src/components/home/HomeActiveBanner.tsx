import { Activity, Settings2 } from 'lucide-react';

interface HomeActiveBannerProps {
    videoState: { isActive: boolean; activeKind?: 'video' | 'scene' | 'mixed' | 'unknown' };
    onNavigateToDisplaySettings: () => void;
}

export default function HomeActiveBanner({ videoState, onNavigateToDisplaySettings }: HomeActiveBannerProps) {
    if (!videoState.isActive) return null;

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, rgba(0,120,212,0.12), rgba(30,64,175,0.12))',
                border: '1px solid rgba(96,165,250,0.35)',
            }}
        >
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Activity size={15} style={{ color: '#7dd3fc' }} />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#c6e8ff' }}>
                        Wallpaper Active
                    </span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {videoState.activeKind === 'scene'
                        ? 'A scene wallpaper is currently running.'
                        : videoState.activeKind === 'mixed'
                            ? 'Scene and video wallpapers are currently running.'
                            : 'A live video wallpaper is currently running.'}
                </div>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onNavigateToDisplaySettings(); }}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(125,211,252,0.35)',
                    background: 'rgba(14,116,144,0.18)',
                    color: '#bae6fd',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(14,116,144,0.3)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(14,116,144,0.18)'; }}
            >
                <Settings2 size={13} />
                Manage
            </button>
        </div>
    );
}
