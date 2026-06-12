import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const COLOR_ON  = '#f5c518';
const COLOR_OFF = '#d1d5db';

interface PerfModeOverlayProps {
  show: boolean;
  active: boolean;
  onDone: () => void;
}

export default function PerfModeOverlay({ show, active, onDone }: PerfModeOverlayProps) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [show, onDone]);

  const accent = active ? COLOR_ON : COLOR_OFF;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="perf-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'rgba(6, 6, 8, 0.96)',
            pointerEvents: 'none',
          }}
        >
          {/* ColorWall / Rendering Engine header */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.0, duration: 0.2 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            <span style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.9)',
              letterSpacing: '0.01em',
            }}>
              ColorWall
            </span>
            <span style={{
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.3)',
              display: 'inline-block',
            }} />
            <span style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 13,
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.01em',
            }}>
              Rendering Engine
            </span>
          </motion.div>

          {/* Small label above */}
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.2 }}
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 12,
              letterSpacing: '0.15em',
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
            }}
          >
            switching to
          </motion.span>

          {/* Big mode name */}
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.22 }}
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 52,
              fontWeight: 700,
              letterSpacing: '0.02em',
              color: accent,
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            {active ? 'Performance' : 'Standard'}
          </motion.span>

          {/* Thin divider line that draws itself */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.2, duration: 0.35, ease: 'easeOut' }}
            style={{
              height: 1,
              width: 320,
              background: accent,
              opacity: 0.3,
              transformOrigin: 'left',
              marginTop: 8,
            }}
          />

          {/* Subtitle */}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.2 }}
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 13,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.04em',
              marginTop: 4,
            }}
          >
            {active ? 'Visual effects off' : 'Visual effects on'}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}