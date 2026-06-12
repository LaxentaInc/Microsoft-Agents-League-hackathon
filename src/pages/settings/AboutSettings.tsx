    import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { motion } from 'framer-motion';

export default function AboutSettings() {
    const [appVersion, setAppVersion] = useState('Loading...');

    useEffect(() => {
        const fetchVersion = async () => {
            try {
                const v = await getVersion();
                setAppVersion(v);
            } catch (e) {
                console.error('Failed to get version', e);
                setAppVersion('Unknown');
            }
        };
        fetchVersion();
    }, []);

    return (
        <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <Info size={24} style={{ color: 'var(--accent)' }} />
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>About</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* App Info */}
                <div
                    style={{
                        padding: '20px',
                        background: 'linear-gradient(135deg, rgba(0, 120, 212, 0.15), rgba(26, 134, 216, 0.08))',
                        borderRadius: 'var(--radius-md)',
                    }}
                >
                    <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.02em' }}>
                        Colorwall
                    </div>
                    <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        Version {appVersion}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        Presented to you by <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Laxenta Inc.</span>
                    </div>
                    <a
                        href="https://colorwall.xyz"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-block',
                            marginTop: '12px',
                            color: 'var(--accent)',
                            fontSize: '14px',
                            textDecoration: 'none',
                            fontWeight: 600,
                            transition: 'color 0.2s ease',
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--accent-hover)'}
                        onMouseOut={(e) => e.currentTarget.style.color = 'var(--accent)'}
                    >
                       
                    </a>
                </div>

                <div
                    style={{
                        padding: '24px',
                        background: 'linear-gradient(135deg, rgba(0, 0, 0, 1), rgba(32, 46, 46, 1))',
                        borderRadius: 'var(--radius-md)',
                        // border: '2px solid rgba(0, 217, 255, 0.4)',
                        // boxShadow: '0 4px 20px rgba(0, 217, 255, 0.15)',
                    }}
                >
                    <div style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        marginBottom: '12px',
                        color: '#000000ff',
                        letterSpacing: '-0.01em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        {/* <span style={{ fontSize: '24px' }}>⭐</span> */}
                        <span>Contributions are Welcome</span>
                    </div>
                    <p style={{
                        fontSize: '24px',
                        color: 'var(--text-secondary)',
                        marginBottom: '16px',
                        lineHeight: '1.6'
                    }}>
                       Made by Oliver Laxenta, I am an hobbyist systems dev, and i love what i do! uh this project is made for partaking in Microsoft Agents League! Hope they like it, cz i tried! - @laxenta.me
                    </p>
                    <a
                        href="https://github.com/LaxentaInc"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-block',
                            padding: '12px 24px',
                            background: 'linear-gradient(135deg, #d1bbbbff, #6ea7a7ff)',
                            color: '#0a0a0a',
                            fontSize: '15px',
                            fontWeight: 700,
                            textDecoration: 'none',
                            borderRadius: 'var(--radius-md)',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 4px 12px rgba(3, 9, 10, 0.3)',
                            fontFamily: 'Segoe UI, system-ui, sans-serif',
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 217, 255, 0.4)';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 217, 255, 0.3)';
                        }}
                    >
                        Visit GitHub Repositories →
                    </a>
                </div>
            </div>
        </motion.div>
    );
}
