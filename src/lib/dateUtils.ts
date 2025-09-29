import { differenceInDays, differenceInHours, isToday, isYesterday, isThisWeek } from 'date-fns';

export const getRelativeTimeLabel = (dateString: string): string | null => {
  if (!dateString) {
    return null;
  }
  
  const date = new Date(dateString);
  const now = new Date();
  
  if (isToday(date)) {
    return 'Today';
  }
  
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  
  if (isThisWeek(date)) {
    return 'This week';
  }
  
  const daysDiff = differenceInDays(now, date);
  if (daysDiff <= 30) {
    return 'This month';
  }
  
  // Stories older than 30 days should not be visible
  return null;
};

export const getRelativeTimeColor = (dateString: string): string => {
  const date = new Date(dateString);
  
  if (isToday(date)) {
    return 'border-0 text-black font-semibold bg-[#FFCC00]';
  }
  
  if (isYesterday(date)) {
    return 'border-0 text-white font-semibold bg-[#00BAFF]';
  }
  
  if (isThisWeek(date)) {
    return 'border-0 text-white font-semibold bg-[#CE00FF]';
  }
  
  // This month (beyond this week)
  return 'border-0 text-white font-semibold bg-[#090202]';
};

export const isNewlyPublished = (dateString: string): boolean => {
  if (!dateString) {
    return false;
  }
  
  const date = new Date(dateString);
  const now = new Date();
  const daysDiff = differenceInDays(now, date);
  
  return daysDiff <= 2;
};

// New function for first 3 stories (position-based, not time-based)
export const isNewStory = (storyIndex: number): boolean => {
  return storyIndex < 3;
};

export const getNewFlagColor = (): string => {
  return 'border-0 text-white font-semibold bg-[#FF0000]';
};

// Currentness tag functions for arrival articles
export const getCurrentnessTag = (publishedAt?: string, createdAt?: string): string => {
  // Use published_at if available, fallback to created_at
  const dateToUse = publishedAt || createdAt;
  
  if (!dateToUse) {
    return 'new in feed';
  }
  
  const date = new Date(dateToUse);
  const now = new Date();
  
  if (isToday(date)) {
    return 'today';
  }
  
  if (isYesterday(date)) {
    return 'yesterday';
  }
  
  const daysDiff = differenceInDays(now, date);
  if (daysDiff <= 30) {
    return `${daysDiff} days ago`;
  }
  
  // Fallback for very old articles (shouldn't happen with our 1-month visibility limit)
  return 'archived';
};

export const getCurrentnessColor = (publishedAt?: string, createdAt?: string): string => {
  const dateToUse = publishedAt || createdAt;
  
  if (!dateToUse) {
    return 'border-0 text-white font-semibold bg-[#FF0000]';
  }
  
  const date = new Date(dateToUse);
  
  if (isToday(date)) {
    return 'border-0 text-black font-semibold bg-[#FFCC00]';
  }
  
  if (isYesterday(date)) {
    return 'border-0 text-white font-semibold bg-[#00BAFF]';
  }
  
  // For older articles
  return 'border-0 text-white font-semibold bg-[#090202]';
};

// Popular badge utilities
export const getPopularBadgeStyle = (): string => {
  return 'bg-[#58FFBC] text-white border-0';
};

export interface PopularityData {
  period_type: string;
  swipe_count: number;
  rank_position: number;
}

export const isPopularStory = (popularityData?: PopularityData): boolean => {
  if (!popularityData) return false;
  
  const { period_type, rank_position } = popularityData;
  
  switch (period_type) {
    case 'today':
      return rank_position <= 2;
    case 'yesterday':
      return rank_position <= 1;
    case 'this_week':
      return rank_position <= 2;
    case 'this_month':
      return rank_position <= 2;
    default:
      return false;
  }
};