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

  // Extract and count keywords from stories
  const availableKeywords = useMemo((): KeywordCount[] => {
    const keywordCounts = new Map<string, number>();
    
    // Add topic keywords with high priority
    topicKeywords.forEach(keyword => {
      keywordCounts.set(keyword.toLowerCase(), 999); // High count to ensure they appear
    });

    // Analyze story content for keywords
    stories.forEach(story => {
      const text = `${story.title} ${story.slides.map(slide => slide.content).join(' ')}`.toLowerCase();
      
      // Extract meaningful words (filter out common words)
      const words = text.match(/\b[a-z]{3,}\b/g) || [];
      const commonWords = new Set([
        'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 
        'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'who', 
        'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'with', 'that', 'have', 'this', 
        'will', 'your', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 
        'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 
        'them', 'well', 'were', 'what', 'year', 'about', 'after', 'could', 'first', 'into', 'might', 
        'other', 'right', 'should', 'their', 'these', 'think', 'through', 'where', 'would', 'years'
      ]);
      
      words.forEach(word => {
        if (!commonWords.has(word) && word.length >= 3) {
          keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
        }
      });
    });

    // Filter keywords that appear at least 3 times and sort by frequency
    return Array.from(keywordCounts.entries())
      .filter(([_, count]) => count >= 3)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Limit to top 20 keywords
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