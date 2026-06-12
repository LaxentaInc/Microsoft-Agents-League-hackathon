import React from 'react';
import { FolderUp, Palette, Layers } from 'lucide-react';

interface HomeQuickActionsProps {
    uploading: boolean;
    onUpload: () => void;
    onNavigateToSource: (source: string) => void;
}

export default function HomeQuickActions({ uploading, onUpload, onNavigateToSource }: HomeQuickActionsProps) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{
                fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '1.5px', color: '#94a3b8', marginBottom: '4px',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            }}>
                Quick Actions
            </span>
            <QuickActionTile
                icon={<FolderUp size={18} />}
                label={uploading ? 'Importing...' : 'Upload File'}
                description="Add videos or images from your PC"
                onClick={onUpload}
                disabled={uploading}
            />
            <QuickActionTile
                icon={<Palette size={18} />}
                label="Browse Store"
                description="Discover wallpapers from curated sources"
                onClick={() => onNavigateToSource('all')}
            />
        </div>
    );
}

function QuickActionTile({ icon, label, description, onClick, disabled }: {
    icon: React.ReactNode;
    label: string;
    description: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <div
            onClick={disabled ? undefined : onClick}
            style={{
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
                if (!disabled) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(56,189,248,0.25)';
                }
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }}
        >
            <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(56,189,248,0.08)',
                border: '1px solid rgba(56,189,248,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#7dd3fc', flexShrink: 0,
            }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '1px', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{label}</div>
                <div style={{ fontSize: '11px', color: '#cbd5e1', lineHeight: 1.3, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{description}</div>
            </div>
        </div>
    );
}
