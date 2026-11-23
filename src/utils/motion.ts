import type { Variants } from 'motion/react';

/**
 * Standardized Apple-inspired Liquid Glass motion tokens.
 * Compositor-only transforms and opacity; settles briskly without bounce.
 */
export const MOTION_EASE = [0.16, 1, 0.3, 1] as const;

export const MOTION_DURATIONS = {
  micro: 0.16,
  panel: 0.24,
  sidebar: 0.34,
  page: 0.36,
  modal: 0.28,
} as const;

export const SPRING_SNAPPY = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 34,
  mass: 0.85,
};

export const SPRING_FLUID = {
  type: 'spring' as const,
  stiffness: 310,
  damping: 32,
  mass: 1,
};

export const PAGE_SLIDE_VARIANTS: Variants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 28 : -28,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      duration: MOTION_DURATIONS.page,
      ease: MOTION_EASE,
    },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -24 : 24,
    transition: {
      duration: 0.22,
      ease: MOTION_EASE,
    },
  }),
};

export const PANEL_SLIDE_VARIANTS: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATIONS.panel, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.16, ease: MOTION_EASE },
  },
};

export const DROPDOWN_VARIANTS: Variants = {
  initial: { opacity: 0, y: -8, scale: 0.985 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    y: -6,
    scale: 0.985,
    transition: { duration: 0.15, ease: MOTION_EASE },
  },
};

export const MODAL_VARIANTS: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.975 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: MOTION_DURATIONS.modal, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    y: 12,
    scale: 0.975,
    transition: { duration: 0.18, ease: MOTION_EASE },
  },
};

export const TOAST_VARIANTS: Variants = {
  initial: { opacity: 0, x: 28, scale: 0.96 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: 0.26, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    x: 24,
    scale: 0.96,
    transition: { duration: 0.18, ease: MOTION_EASE },
  },
};

export const ACCORDION_VARIANTS: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.24, ease: MOTION_EASE },
  },
  exit: {
    opacity: 0,
    height: 0,
    transition: { duration: 0.18, ease: MOTION_EASE },
  },
};
