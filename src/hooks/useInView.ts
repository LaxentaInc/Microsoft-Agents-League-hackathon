import { useState, useEffect, useRef, RefObject } from 'react';

export function useInView(ref: RefObject<Element | null>, rootMargin = '400px', triggerOnce = false) {
    const [isIntersecting, setIntersecting] = useState(false);
    // latch so once visible, stays visible even after effect cleanup
    const hasTriggeredRef = useRef(false);

    useEffect(() => {
        // if already triggered once and triggerOnce is on, skip
        if (triggerOnce && hasTriggeredRef.current) return;
        if (!ref.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIntersecting(true);
                    if (triggerOnce) {
                        hasTriggeredRef.current = true;
                        if (ref.current) observer.unobserve(ref.current);
                    }
                } else if (!triggerOnce) {
                    setIntersecting(false);
                }
            },
            { rootMargin }
        );

        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [ref, rootMargin, triggerOnce]);

    return triggerOnce ? (isIntersecting || hasTriggeredRef.current) : isIntersecting;
}
