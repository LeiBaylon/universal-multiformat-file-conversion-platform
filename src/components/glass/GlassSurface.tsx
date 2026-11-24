import { type ReactNode, useRef } from 'react';
import { motion } from 'motion/react';
import { MOTION_EASE } from '../../utils/motion';

export type GlassTier = 'primary' | 'secondary' | 'floating' | 'modal';

interface GlassSurfaceProps {
  tier?: GlassTier;
  rim?: boolean;
  interactiveLight?: boolean;
  className?: string;
  children: ReactNode;
  as?: 'section' | 'div' | 'article';
}

const TIER_CLASSES: Record<GlassTier, string> = {
  primary: 'glass-primary',
  secondary: 'glass-secondary',
  floating: 'glass-floating',
  modal: 'glass-modal',
};

export function GlassSurface({
  tier = 'secondary',
  rim = true,
  interactiveLight = false,
  className = '',
  children,
  as = 'div',
}: GlassSurfaceProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactiveLight || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    ref.current.style.setProperty('--specular-x', `${x.toFixed(1)}%`);
    ref.current.style.setProperty('--specular-y', `${y.toFixed(1)}%`);
  };

  const baseClass = `${TIER_CLASSES[tier]} ${rim ? 'glass-rim' : ''} relative overflow-hidden ${className}`;

  const content = (
    <>
      {interactiveLight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300"
          style={{
            background:
              'radial-gradient(420px circle at var(--specular-x, 50%) var(--specular-y, 0%), rgba(255,255,255,0.065), transparent 60%)',
          }}
        />
      )}
      {children}
    </>
  );

  if (as === 'section') {
    return (
      <motion.section
        ref={ref as React.RefObject<HTMLElement>}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: MOTION_EASE }}
        onPointerMove={handlePointerMove}
        className={baseClass}
      >
        {content}
      </motion.section>
    );
  }

  if (as === 'article') {
    return (
      <article ref={ref as React.RefObject<HTMLElement>} onPointerMove={handlePointerMove} className={baseClass}>
        {content}
      </article>
    );
  }

  return (
    <div ref={ref} onPointerMove={handlePointerMove} className={baseClass}>
      {content}
    </div>
  );
}
