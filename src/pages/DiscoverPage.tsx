import { Store, LayoutGrid, Code2, ArrowRight } from 'lucide-react';

interface DiscoverPageProps {
    onNavigate: (id: string) => void;
}
const InteractiveIcon = ({ size = 14, style }: any) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={style}>
    <path d="M1 8h2l1.5-4 2 8 2-6 1.5 4H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
export default function DiscoverPage({ onNavigate }: DiscoverPageProps) {
    const cards = [
        {
            id: 'discover-store',
            title: 'Store & Community',
            description: 'Browse, download, and share wallpapers and widgets created by the community.',
            icon: Store,
            color: '#10b981',
            bg: 'rgba(16, 185, 129, 0.1)',
        },
        {
            id: 'discover-interactive',
            title: 'Interactive Wallpapers',
            description: 'Manage your code-driven wallpapers, import new ones, or generate them with AI.',
            icon: InteractiveIcon,
            color: '#8b5cf6',
            bg: 'rgba(139, 92, 246, 0.1)',
        },
        {
            id: 'discover-widgets',
            title: 'Desktop Widgets',
            description: 'Add and configure beautiful system monitors, clocks, and custom web widgets.',
            icon: LayoutGrid,
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.1)',
        },
        {
            id: 'discover-docs',
            title: 'API Documentation',
            description: 'Learn how to build your own interactive experiences using the ColorWall API.',
            icon: Code2,
            color: '#3b82f6',
            bg: 'rgba(59, 130, 246, 0.1)',
        }
    ];

    return (
        <div style={{ padding: '60px 40px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '60px', textAlign: 'center' }}>
                <h1 style={{ 
                    fontSize: '48px', 
                    fontWeight: 800, 
                    margin: '0 0 16px 0',
                    background: 'linear-gradient(135deg, #ffffff, #a1a1aa)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.02em'
                }}>
                    Discover
                </h1>
                <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
                    Explore the community store, manage your interactive experiences, or learn how to build your own desktop widgets and live wallpapers.
                </p>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '24px',
            }}>
                {cards.map(card => {
                    const Icon = card.icon;
                    return (
                        <button
                            key={card.id}
                            onClick={() => onNavigate(card.id)}
                            style={{
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                                borderRadius: '20px',
                                padding: '36px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                                position: 'relative',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                                e.currentTarget.style.transform = 'translateY(-6px)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                e.currentTarget.style.boxShadow = `0 24px 48px -12px ${card.bg.replace('0.1', '0.2')}`;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <div style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '14px',
                                background: card.bg,
                                color: card.color,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '24px',
                                transition: 'transform 0.3s ease',
                            }}>
                                <Icon size={28} />
                            </div>
                            
                            <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'white', margin: '0 0 12px 0' }}>
                                {card.title}
                            </h3>
                            
                            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', margin: '0 0 32px 0', lineHeight: 1.6, flex: 1 }}>
                                {card.description}
                            </p>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                color: card.color,
                                fontSize: '14px',
                                fontWeight: 600,
                            }}>
                                Explore <ArrowRight size={16} />
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
