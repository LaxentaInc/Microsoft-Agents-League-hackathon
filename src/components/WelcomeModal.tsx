import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, Video, Sparkles } from 'lucide-react';

interface WelcomeModalProps {
    onClose: () => void;
    onSelectType: (type: 'static' | 'live' | 'all') => void;
}

export default function WelcomeModal({ onClose, onSelectType }: WelcomeModalProps) {
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.4)',
                    backdropFilter: 'blur(20px)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px',
                }}
                onClick={onClose}
            >
                <div onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: '600px', width: '100%' }}>
                    <div style={{ marginBottom: '40px' }}>
                        <h2 style={{
                            fontSize: '48px',
                            fontWeight: 800,
                            marginBottom: '16px',
                            letterSpacing: '-0.03em',
                            textShadow: '0 4px 20px rgba(0,0,0,0.3)',
                            background: 'linear-gradient(to bottom, #fff, #ccc)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            What's your vibe today?
                        </h2>
                    </div>

                    <div style={{
                        display: 'flex',
                        gap: '24px',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        marginBottom: '48px'
                    }}>
                        <MinimalButton
                            icon={<ImageIcon size={32} />}
                            title="Static"
                            subtitle="4K Images"
                            onClick={() => onSelectType('static')}
                            delay={0.2}
                        />

                        <MinimalButton
                            icon={<Video size={32} />}
                            title="Live"
                            subtitle="Animated & Video"
                            onClick={() => onSelectType('live')}
                            delay={0.25}
                        />

                        <MinimalButton
                            icon={<Sparkles size={32} />}
                            title="Surprise Me"
                            subtitle="Show Everything"
                            onClick={() => onSelectType('all')}
                            delay={0.3}
                        />
                    </div>

                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        whileHover={{ scale: 1.05, color: 'white' }}
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.5)',
                            fontSize: '15px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            letterSpacing: '0.02em'
                        }}
                    >
                        No thanks, just browsing
                    </motion.button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

interface MinimalButtonProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onClick: () => void;
    delay: number;
}

function MinimalButton({ icon, title, subtitle, onClick, delay }: MinimalButtonProps) {
    return (
        <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay, type: "spring", stiffness: 300, damping: 20 }}
            whileHover={{ y: -5, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                padding: '32px',
                minWidth: '160px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                cursor: 'pointer',
                color: 'white',
                backdropFilter: 'blur(10px)',
            }}
        >
            <div style={{ color: 'var(--accent)' }}>{icon}</div>
            <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>{title}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.5)' }}>{subtitle}</div>
            </div>
        </motion.button>
    );
}
