// Brand colors for Curatr.pro
export const BRAND_COLORS = {
  // Primary purple accent
  purple: 'hsl(270, 100%, 68%)',
  purpleHex: '#C77DFF',
  
  // Success/positive mint green
  mintGreen: 'hsl(155, 100%, 67%)',
  mintGreenHex: '#55FFAA',
  
  // Dark ink background
  darkInk: 'hsl(214, 50%, 9%)',
  darkInkHex: '#0A0E17',
} as const;

// Deprecated: Topic colors are now brand-focused
// Use BRAND_COLORS.purple for primary actions
// Use BRAND_COLORS.mintGreen for success states
export const generateTopicGradient = (topicId: string): string => {
  console.warn('generateTopicGradient is deprecated. Use brand colors instead.');
  return '';
};

export const generateAccentColor = (topicId: string): string => {
  console.warn('generateAccentColor is deprecated. Use brand colors instead.');
  return '';
};

export const generateRandomTopicColors = () => {
  console.warn('generateRandomTopicColors is deprecated. Use brand colors instead.');
  return {
    gradient: '',
    border: ''
  };
};
