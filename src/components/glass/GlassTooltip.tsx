import { type ReactNode, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MOTION_EASE } from '../../utils/motion';

interface GlassTooltipProps {
  label: string;
  enabled?: boolean;
  side?: 'right' | 'bottom' | 'top';
  children: ReactNode;
}

export function GlassTooltip({
  label,
  enabled = true,
  side = 'right',
  children,
}: GlassTooltipProps) {
  const [visible, setVisible] = useState(false);

  const posClass =
    side === 'right'
      ? 'left-full top-1/2 -translate-y-1/2 ml-3'
      : side === 'bottom'
      ? 'top-full left-1/2 -translate-x-1/2 mt-2'
      : 'bottom-full left-1/2 -translate-x-1/2 mb-2';

  const initialOffset = side === 'right' ? { x: -6, y: 0 } : { x: 0, y: -4 };

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => enabled && setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => enabled && setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      <AnimatePresence>
        {enabled && visible && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, ...initialOffset }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, ...initialOffset }}
            transition={{ duration: 0.16, ease: MOTION_EASE }}
            className={`pointer-events-none absolute z-50 ${posClass} glass-floating glass-rim rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] whitespace-nowrap`}
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
