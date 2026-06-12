import React from 'react';

interface LazySectionProps {
    children: React.ReactNode;
    // min height to reserve before content loads, prevents layout shift
    minHeight?: number;
    style?: React.CSSProperties;
}


export default function LazySection({ children, minHeight = 100, style }: LazySectionProps) {
    const [visible, setVisible] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setVisible(entry.isIntersecting);
            },
            { rootMargin: '800px' }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} style={{ minHeight: visible ? undefined : minHeight, ...style }}>
            {visible ? children : null}
        </div>
    );
}
