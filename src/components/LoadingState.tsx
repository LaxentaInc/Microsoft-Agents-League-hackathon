interface LoadingStateProps {
    text?: string;
}

export function LoadingSpinner({ text = 'Loading...' }: LoadingStateProps) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '60px 20px',
                gap: '16px',
            }}
        >
            <div
                className="spinner"
                style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid var(--border-medium)',
                    borderTop: '3px solid var(--accent)',
                    borderRadius: '50%',
                }}
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{text}</p>
        </div>
    );
}

export function SkeletonCard() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {/* Main image placeholder */}
            <div
                style={{
                    width: '100%',
                    aspectRatio: '16/9',
                    background: 'linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary) 50%, var(--bg-secondary) 100%)',
                    backgroundSize: '200% 100%',
                    borderRadius: 'var(--radius-lg)',
                    animation: 'shimmer 2s infinite linear',
                    border: '1px solid var(--border-color)',
                }}
            />
            {/* Tag/Source pill placeholder */}
            <div
                style={{
                    width: '35%',
                    height: '24px',
                    background: 'linear-gradient(90deg, var(--bg-secondary) 0%, var(--bg-tertiary) 50%, var(--bg-secondary) 100%)',
                    backgroundSize: '200% 100%',
                    borderRadius: '12px',
                    animation: 'shimmer 2s infinite linear',
                    marginLeft: '8px',
                }}
            />
        </div>
    );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '24px',
            width: '100%',
            padding: '20px 0',
        }}>
            {/* Add global keyframes for the shimmer effect */}
            <style>
                {`
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}
            </style>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} />
            ))}
        </div>
    );
}
