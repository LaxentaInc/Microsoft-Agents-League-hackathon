import { motion } from 'framer-motion';
import { useVisibility } from '../context/WinCloseContext';

// reusable page header for the desktop sub-pages
export default function DesktopPageHeader({ subtitle, title, description }: {
    subtitle: string;
    title: string;
    description: string;
}) {
    const { isVisible } = useVisibility();

    return (
        <motion.div
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.45 }}
            style={{ marginBottom: '28px' }}
        >
            <span style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '11px',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                fontWeight: 700,
                color: 'var(--text-tertiary)',
            }}>
                {subtitle}
            </span>
            <motion.h1
                animate={isVisible ? { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] } : {}}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 4 }}
                style={{
                    fontSize: 'clamp(30px, 4vw, 42px)',
                    fontWeight: 800,
                    fontFamily: "'Inter', sans-serif",
                    backgroundSize: '200% 100%',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundImage: 'linear-gradient(90deg, #fff 0%, #0078d4 50%, #fff 100%)',
                    letterSpacing: '-0.02em',
                    margin: '6px 0 0',
                    lineHeight: 1.08,
                }}
            >
                {title}
            </motion.h1>
            <p style={{
                margin: '8px 0 2px',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '14px',
                lineHeight: 1.5,
                letterSpacing: '0.01em',
                color: 'var(--text-secondary)',
            }}>
                {description}
            </p>
        </motion.div>
    );
}

