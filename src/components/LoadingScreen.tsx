import { motion } from 'framer-motion';
import { useVisibility } from '../context/WinCloseContext';
import Hyperspeed from './Hyperspeed';
import logo from '../assets/LxColorWall.png';

export default function LoadingScreen() {
    const { isVisible } = useVisibility();

    return (
        <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(135deg, #1a1a1f 0%, #0f0f14 100%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                overflow: 'hidden',
            }}
        >
            {/* Hyperspeed background */}
            <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.6 }}>
                <Hyperspeed effectOptions={{
                    colors: {
                        roadColor: 0x080808,
                        islandColor: 0x0a0a0a,
                        background: 0x000000,
                        shoulderLines: 0xffffff,
                        brokenLines: 0xffffff,
                        leftCars: [0x0078d4, 0x00d9ff, 0x005a9e],
                        rightCars: [0x8b5cf6, 0xa78bfa, 0x7c3aed],
                        sticks: 0x0078d4
                    }
                }} />
            </div>

            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                    duration: 0.8,
                    ease: [0.4, 0, 0.2, 1],
                }}
                style={{
                    position: 'relative',
                    marginBottom: '40px',
                    zIndex: 1,
                }}
            >
                <motion.div
                    animate={isVisible ? { rotate: 360 } : {}}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'linear',
                    }}
                    style={{
                        position: 'absolute',
                        top: '-25px',
                        left: '-25px',
                        right: '-25px',
                        bottom: '-25px',
                        borderRadius: '50%',
                        border: '3px solid transparent',
                        borderTopColor: 'rgba(0, 120, 212, 0.6)',
                        borderRightColor: 'rgba(139, 92, 246, 0.4)',
                    }}
                />

                <motion.img
                    src={logo}
                    alt="Colorwall"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                        duration: 0.8,
                        ease: "easeOut",
                        delay: 0,
                    }}
                    style={{
                        width: '150px',
                        height: '150px',
                        position: 'relative',
                        zIndex: 2,
                        objectFit: 'contain'
                    }}
                />
            </motion.div>

            <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                style={{
                    fontSize: '42px',
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #0078d4, #00d9ff)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    marginBottom: '16px',
                    letterSpacing: '-0.02em',
                    zIndex: 1,
                }}
            >
                Colorwall
            </motion.h1>

            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.0, duration: 0.4 }}
                style={{
                    color: 'var(--text-secondary)',
                    fontSize: '15px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    zIndex: 1,
                }}
            >
                <span>Initializing</span>
                <motion.div style={{ display: 'flex', gap: '4px' }}>
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={i}
                            animate={isVisible ? {
                                opacity: [0.3, 1, 0.3],
                            } : {}}
                            transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                delay: i * 0.2,
                            }}
                            style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: 'var(--accent)',
                            }}
                        />
                    ))}
                </motion.div>
            </motion.div>
        </motion.div>
    );
}
