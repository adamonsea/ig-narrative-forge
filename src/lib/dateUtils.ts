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
  if (daysDiff <= 7) {
    return 'This week';
  }
  
  if (daysDiff > 7) {
    return 'Older than a week';
  }
  
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