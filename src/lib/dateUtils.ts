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
    return 'bg-green-500/20 text-green-700 border-green-200';
  }
  
  if (isThisWeek(date)) {
    return 'bg-blue-500/20 text-blue-700 border-blue-200';
  }
  
  // This month (beyond this week)
  return 'bg-muted text-muted-foreground border-muted';
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

// New function for 24-hour "New" flag based on story publication to feed
export const isNewInFeed = (dateString: string): boolean => {
  if (!dateString) {
    return false;
  }
  
  const date = new Date(dateString);
  const now = new Date();
  const hoursDiff = differenceInHours(now, date);
  
  return hoursDiff <= 24;
};

export const getNewFlagColor = (): string => {
  return 'bg-orange-500/20 text-orange-700 border-orange-200';
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
    return 'bg-purple-500/20 text-purple-700 border-purple-200';
  }
  
  const date = new Date(dateToUse);
  
  if (isToday(date)) {
    return 'bg-green-500/20 text-green-700 border-green-200';
  }
  
  if (isYesterday(date)) {
    return 'bg-blue-500/20 text-blue-700 border-blue-200';
  }
  
  // For older articles
  return 'bg-muted/50 text-muted-foreground border-muted';
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