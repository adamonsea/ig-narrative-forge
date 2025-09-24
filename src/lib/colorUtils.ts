// Color utility for generating harmonious gradients for topic cards
export const generateTopicGradient = (topicId: string): string => {
  // Create a hash from the topic ID for consistent colors
  let hash = 0;
  for (let i = 0; i < topicId.length; i++) {
    const char = topicId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Harmonious color palettes with subtle gradients
  const gradients = [
    'from-blue-50/80 to-blue-100/60',
    'from-purple-50/80 to-purple-100/60', 
    'from-emerald-50/80 to-emerald-100/60',
    'from-orange-50/80 to-orange-100/60',
    'from-pink-50/80 to-pink-100/60',
    'from-indigo-50/80 to-indigo-100/60',
    'from-teal-50/80 to-teal-100/60',
    'from-rose-50/80 to-rose-100/60',
    'from-cyan-50/80 to-cyan-100/60',
    'from-amber-50/80 to-amber-100/60',
  ];

  const index = Math.abs(hash) % gradients.length;
  return `bg-gradient-to-br ${gradients[index]}`;
};

export const generateAccentColor = (topicId: string): string => {
  let hash = 0;
  for (let i = 0; i < topicId.length; i++) {
    const char = topicId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  const colors = [
    'border-blue-200/60',
    'border-purple-200/60',
    'border-emerald-200/60', 
    'border-orange-200/60',
    'border-pink-200/60',
    'border-indigo-200/60',
    'border-teal-200/60',
    'border-rose-200/60',
    'border-cyan-200/60',
    'border-amber-200/60',
  ];

  const index = Math.abs(hash) % colors.length;
  return colors[index];
};