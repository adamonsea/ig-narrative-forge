// Curatr Design Tokens - "Dark Ink Editorial" Theme
// Use these constants for consistent styling across components

export const colors = {
  // Core brand colors
  brand: {
    darkInk: 'hsl(214, 50%, 9%)',
    purple: 'hsl(270, 100%, 68%)',
    mintGreen: 'hsl(155, 100%, 67%)',
  },
  
  // Background surfaces
  background: {
    primary: 'hsl(214, 50%, 9%)',
    elevated: 'hsl(214, 50%, 12%)',
    card: 'hsl(214, 50%, 14%)',
    hover: 'hsl(214, 50%, 16%)',
  },
  
  // Text colors
  text: {
    primary: 'hsl(0, 0%, 100%)',
    secondary: 'hsl(0, 0%, 85%)',
    muted: 'hsl(0, 0%, 64%)',
    accent: 'hsl(155, 100%, 67%)',
  },
  
  // Accent colors
  accent: {
    green: 'hsl(155, 100%, 67%)',
    greenDark: 'hsl(155, 80%, 35%)',
    purple: 'hsl(270, 100%, 68%)',
    purpleDark: 'hsl(270, 80%, 45%)',
  },
  
  // Status colors
  status: {
    success: 'hsl(155, 100%, 67%)',
    warning: 'hsl(45, 100%, 60%)',
    error: 'hsl(0, 84%, 60%)',
    info: 'hsl(210, 100%, 60%)',
  },
  
  // Border colors
  border: {
    default: 'hsl(214, 30%, 20%)',
    subtle: 'hsl(214, 30%, 15%)',
    accent: 'hsl(155, 100%, 67%)',
  },
} as const;

export const typography = {
  // Font families
  fontFamily: {
    display: "'Playfair Display', serif",
    body: "'Inter', system-ui, sans-serif",
    accent: "'Lexend', system-ui, sans-serif",
  },
  
  // Font sizes (in rem)
  fontSize: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem', // 36px
    '5xl': '3rem',    // 48px
    '6xl': '3.75rem', // 60px
  },
  
  // Font weights
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  
  // Line heights
  lineHeight: {
    tight: '1.1',
    snug: '1.25',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },
  
  // Letter spacing
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

export const spacing = {
  // Base spacing scale (in rem)
  0: '0',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
} as const;

export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  default: '0.25rem', // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
} as const;

export const shadows = {
  // Elevation shadows
  none: 'none',
  sm: '0 1px 2px 0 hsl(0 0% 0% / 0.05)',
  default: '0 1px 3px 0 hsl(0 0% 0% / 0.1), 0 1px 2px -1px hsl(0 0% 0% / 0.1)',
  md: '0 4px 6px -1px hsl(0 0% 0% / 0.1), 0 2px 4px -2px hsl(0 0% 0% / 0.1)',
  lg: '0 10px 15px -3px hsl(0 0% 0% / 0.1), 0 4px 6px -4px hsl(0 0% 0% / 0.1)',
  xl: '0 20px 25px -5px hsl(0 0% 0% / 0.1), 0 8px 10px -6px hsl(0 0% 0% / 0.1)',
  
  // Glow effects
  glowGreen: '0 0 20px hsl(155 100% 67% / 0.3)',
  glowPurple: '0 0 20px hsl(270 100% 68% / 0.3)',
  glowGreenIntense: '0 0 40px hsl(155 100% 67% / 0.5)',
  glowPurpleIntense: '0 0 40px hsl(270 100% 68% / 0.5)',
} as const;

export const transitions = {
  // Duration
  duration: {
    fast: '150ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },
  
  // Easing
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1400px',
} as const;

// Composite tokens for common patterns
export const componentTokens = {
  card: {
    background: colors.background.card,
    border: colors.border.subtle,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
  },
  
  button: {
    primary: {
      background: colors.accent.green,
      text: colors.brand.darkInk,
      hoverBackground: colors.accent.greenDark,
    },
    secondary: {
      background: colors.accent.purple,
      text: colors.text.primary,
      hoverBackground: colors.accent.purpleDark,
    },
  },
  
  input: {
    background: colors.background.elevated,
    border: colors.border.default,
    focusBorder: colors.accent.green,
    text: colors.text.primary,
    placeholder: colors.text.muted,
  },
} as const;

// Type exports for TypeScript consumers
export type Colors = typeof colors;
export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type BorderRadius = typeof borderRadius;
export type Shadows = typeof shadows;
export type Transitions = typeof transitions;
export type Breakpoints = typeof breakpoints;
export type ComponentTokens = typeof componentTokens;
