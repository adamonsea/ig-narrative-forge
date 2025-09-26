import { useState, useMemo } from 'react';

interface Story {
  id: string;
  title: string;
  author: string;
  publication_name: string;
  created_at: string;
  updated_at: string;
  cover_illustration_url?: string;
  cover_illustration_prompt?: string;
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
    word_count: number;
    visual?: {
      image_url: string;
      alt_text: string;
    };
  }>;
  article: {
    source_url: string;
    published_at: string;
    region: string;
  };
}

interface KeywordCount {
  keyword: string;
  count: number;
}

export const useKeywordFilter = (stories: Story[], topicKeywords: string[] = []) => {
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Count how many times each topic keyword appears in stories
  const availableKeywords = useMemo((): KeywordCount[] => {
    if (topicKeywords.length === 0) {
      return [];
    }

    const keywordCounts = new Map<string, number>();
    
    // Initialize counts for all topic keywords
    topicKeywords.forEach(keyword => {
      keywordCounts.set(keyword.toLowerCase(), 0);
    });

    // Count occurrences of each topic keyword in stories
    stories.forEach(story => {
      const text = `${story.title} ${story.slides.map(slide => slide.content).join(' ')}`.toLowerCase();
      
      topicKeywords.forEach(keyword => {
        const keywordLower = keyword.toLowerCase();
        // Count occurrences of this keyword (including partial matches)
        const regex = new RegExp(keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = text.match(regex);
        if (matches) {
          keywordCounts.set(keywordLower, (keywordCounts.get(keywordLower) || 0) + matches.length);
        }
      });
    });

    // Return keywords that appear at least once in the stories, sorted by frequency
    return Array.from(keywordCounts.entries())
      .filter(([_, count]) => count > 0)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count);
  }, [stories, topicKeywords]);

  // Filter stories based on selected keywords
  const filteredStories = useMemo(() => {
    if (selectedKeywords.length === 0) {
      return stories;
    }

    return stories.filter(story => {
      const text = `${story.title} ${story.slides.map(slide => slide.content).join(' ')}`.toLowerCase();
      return selectedKeywords.some(keyword => 
        text.includes(keyword.toLowerCase())
      );
    });
  }, [stories, selectedKeywords]);

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

  return {
    selectedKeywords,
    availableKeywords,
    filteredStories,
    isModalOpen,
    setIsModalOpen,
    toggleKeyword,
    clearAllFilters,
    removeKeyword,
    hasActiveFilters: selectedKeywords.length > 0
  };
};