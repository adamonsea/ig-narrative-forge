import { differenceInDays, differenceInHours, isToday, isYesterday, isThisWeek } from 'date-fns';

export const getRelativeTimeLabel = (dateString: string): string | null => {
  if (!dateString) {
    console.log('No dateString provided to getRelativeTimeLabel');
    return null;
  }
  
  const date = new Date(dateString);
  const now = new Date();
  
  console.log('Checking date:', dateString, 'Parsed:', date, 'Now:', now);
  
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
    console.log('No dateString provided to isNewlyPublished');
    return false;
  }
  
  const date = new Date(dateString);
  const now = new Date();
  const daysDiff = differenceInDays(now, date);
  
  console.log('Checking if newly published:', dateString, 'Days diff:', daysDiff);
  
  return daysDiff <= 2;
};

export const getNewFlagColor = (): string => {
  return 'bg-orange-500/20 text-orange-700 border-orange-200';
};