import { useState, useMemo } from 'react';

interface KeywordCount {
  keyword: string;
  count: number;
}

export const useKeywordFilterWithDatabase = (topicKeywords: string[] = []) => {
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Generate available keywords from topic keywords
  const availableKeywords = useMemo<KeywordCount[]>(() => {
    return topicKeywords.map(keyword => ({
      keyword,
      count: 0 // Count will be handled by the server
    })).sort((a, b) => a.keyword.localeCompare(b.keyword));
  }, [topicKeywords]);

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords(prev => 
      prev.includes(keyword) 
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword]
    );
  };

  const clearAllFilters = () => {
    setSelectedKeywords([]);
  };

  const removeKeyword = (keyword: string) => {
    setSelectedKeywords(prev => prev.filter(k => k !== keyword));
  };

  const hasActiveFilters = selectedKeywords.length > 0;

  return {
    selectedKeywords,
    availableKeywords,
    isModalOpen,
    setIsModalOpen,
    toggleKeyword,
    clearAllFilters,
    removeKeyword,
    hasActiveFilters
  };
};