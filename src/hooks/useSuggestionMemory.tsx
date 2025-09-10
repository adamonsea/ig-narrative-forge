import { useState, useEffect } from 'react';

interface SuggestionMemoryItem {
  id: string;
  timestamp: number;
  confidence_score: number;
  shown: boolean;
  added: boolean;
  rejected: boolean;
}

interface KeywordSuggestionMemory extends SuggestionMemoryItem {
  keyword: string;
  rationale: string;
}

interface SourceSuggestionMemory extends SuggestionMemoryItem {
  url: string;
  source_name: string;
  type: string;
  rationale: string;
  technical_validation?: any;
}

export function useSuggestionMemory<T extends SuggestionMemoryItem>(
  storageKey: string
) {
  const [memory, setMemory] = useState<T[]>([]);

  useEffect(() => {
    loadMemory();
  }, [storageKey]);

  const loadMemory = () => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Clean up old entries (older than 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const cleaned = parsed.filter((item: T) => item.timestamp > thirtyDaysAgo);
        setMemory(cleaned);
        
        // Update storage if we cleaned anything
        if (cleaned.length !== parsed.length) {
          localStorage.setItem(storageKey, JSON.stringify(cleaned));
        }
      }
    } catch (error) {
      console.warn('Failed to load suggestion memory:', error);
      setMemory([]);
    }
  };

  const saveMemory = (newMemory: T[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(newMemory));
      setMemory(newMemory);
    } catch (error) {
      console.warn('Failed to save suggestion memory:', error);
    }
  };

  const addSuggestions = (suggestions: Omit<T, 'id' | 'timestamp' | 'shown' | 'added' | 'rejected'>[]) => {
    const newItems = suggestions.map(suggestion => ({
      ...suggestion,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      shown: true,
      added: false,
      rejected: false
    })) as T[];

    const updatedMemory = [...memory, ...newItems];
    saveMemory(updatedMemory);
    return newItems;
  };

  const markAsAdded = (id: string) => {
    const updatedMemory = memory.map(item => 
      item.id === id ? { ...item, added: true } : item
    );
    saveMemory(updatedMemory);
  };

  const markAsRejected = (id: string) => {
    const updatedMemory = memory.map(item => 
      item.id === id ? { ...item, rejected: true } : item
    );
    saveMemory(updatedMemory);
  };

  const filterNewSuggestions = <S extends Record<string, any>>(
    newSuggestions: S[]
  ): S[] => {
    return newSuggestions.filter(suggestion => {
      const identifier = (suggestion as any).keyword || (suggestion as any).url;
      if (!identifier) return true;
      
      // Check if we've seen this suggestion before
      return !memory.some(memItem => {
        const memIdentifier = (memItem as any).keyword || (memItem as any).url;
        return memIdentifier === identifier;
      });
    });
  };

  const getPreviouslySeen = () => {
    return memory.filter(item => item.shown);
  };

  const getStats = () => {
    const total = memory.length;
    const added = memory.filter(item => item.added).length;
    const rejected = memory.filter(item => item.rejected).length;
    const pending = total - added - rejected;
    
    return { total, added, rejected, pending };
  };

  const clearMemory = () => {
    localStorage.removeItem(storageKey);
    setMemory([]);
  };

  return {
    memory,
    addSuggestions,
    markAsAdded,
    markAsRejected,
    filterNewSuggestions,
    getPreviouslySeen,
    getStats,
    clearMemory,
    loadMemory
  };
}

export type { KeywordSuggestionMemory, SourceSuggestionMemory };