import React from 'react';
import { motion } from 'framer-motion';

interface GreetingProps {
    isVisible: boolean;
    text: string;
    theme?: 'blue' | 'gold';
}

const Greeting: React.FC<GreetingProps> = ({ isVisible, text, theme = 'blue' }) => {
    const gradient = theme === 'gold'
        ? 'linear-gradient(90deg, #fff 0%, #eab308 25%, #ca8a04 50%, #eab308 75%, #fff 100%)'
        : 'linear-gradient(90deg, #fff 0%, #0078d4 50%, #fff 100%)';

    return (
        <motion.h1
            animate={isVisible ? {
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            } : {}}
            transition={{
                duration: 6,
                repeat: Infinity,
                ease: 'easeInOut',
                repeatDelay: 4
            }}
            style={{
                fontSize: '48px',
                fontWeight: 800,
                fontFamily: "'Inter', sans-serif",
                backgroundSize: '200% 100%',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundImage: gradient,
                margin: 0,
                letterSpacing: '-0.02em',
                lineHeight: 1.2,
                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))'
            }}
        >
            {text}
        </motion.h1>
    );
};

export default React.memo(Greeting);
