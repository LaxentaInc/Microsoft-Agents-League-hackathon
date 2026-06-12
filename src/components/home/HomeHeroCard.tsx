import showcase from '../../assets/awewww.jpg';

interface HomeHeroCardProps {
    onNavigateToLive: () => void;
}

export default function HomeHeroCard({ onNavigateToLive }: HomeHeroCardProps) {
    return (
        <div
            onClick={() => onNavigateToLive()}
            style={{
                minHeight: '420px',
                position: 'relative', borderRadius: '20px', overflow: 'hidden',
                cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)',
                transition: 'border-color 0.3s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(56,189,248,0.3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
        >
            <img
                src={showcase}
                alt="Live Wallpapers"
                style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', opacity: 0.5, zIndex: 1,
                }}
            />
            <div style={{
                position: 'absolute', inset: 0, zIndex: 2,
                background: 'linear-gradient(to top, rgba(17,17,22,0.95) 5%, rgba(17,17,22,0.4) 50%, transparent 100%)',
            }} />
            <div style={{
                position: 'relative', zIndex: 3, height: '100%',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                padding: '32px',
            }}>
                <span style={{
                    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '1.5px', color: '#38bdf8', marginBottom: '12px',
                }}>
                    Live Wallpapers
                </span>
                <h2 style={{
                    fontSize: '28px', fontWeight: 700, color: '#f8fafc',
                    letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: '10px',
                }}>
                    Animated Desktop Backgrounds
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '360px', lineHeight: 1.5, marginBottom: '20px' }}>
                    High-performance video & interactive scene wallpapers for your desktop.
                </p>
                <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    color: '#38bdf8', fontWeight: 600, fontSize: '14px',
                    marginTop: '8px',
                    transition: 'all 0.2s ease',
                }}>
                    Browse Live →
                </div>
            </div>
        </div>
    );
}
