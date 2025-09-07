import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ContentFingerprint {
  id: string;
  title: string;
  body: string;
  source_url: string;
  keywords: string[];
  entities: string[];
  fingerprint: string;
}

interface SimilarArticle {
  id: string;
  title: string;
  similarity_score: number;
  detection_reason: string[];
  source_url: string;
  created_at: string;
}

interface BulkDeleteOptions {
  keywords?: string[];
  entities?: string[];
  sources?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export const useEnhancedDuplicateDetection = () => {
  const [similarArticles, setSimilarArticles] = useState<Map<string, SimilarArticle[]>>(new Map());
  const [contentFingerprints, setContentFingerprints] = useState<Map<string, ContentFingerprint>>(new Map());
  const [recentDeletions, setRecentDeletions] = useState<Map<string, { keywords: string[], deletedAt: Date }>>(new Map());
  const { toast } = useToast();

  // Enhanced similarity detection using multiple methods
  const detectSimilarContent = (article: any): SimilarArticle[] => {
    const similar: SimilarArticle[] = [];
    const articleFingerprint = generateContentFingerprint(article);
    
    contentFingerprints.forEach((fingerprint, id) => {
      if (id === article.id) return;
      
      const similarities = calculateSimilarities(articleFingerprint, fingerprint);
      
      if (similarities.score > 0.7) {
        similar.push({
          id,
          title: fingerprint.title,
          similarity_score: similarities.score,
          detection_reason: similarities.reasons,
          source_url: fingerprint.source_url,
          created_at: fingerprint.id // placeholder
        });
      }
    });
    
    return similar.sort((a, b) => b.similarity_score - a.similarity_score);
  };

  // Generate content fingerprint for smart comparison
  const generateContentFingerprint = (article: any): ContentFingerprint => {
    const title = article.title?.toLowerCase() || '';
    const body = article.body?.toLowerCase() || '';
    const combinedText = `${title} ${body}`;
    
  // Extract key entities and topics
  const keywords = extractKeywords(combinedText);
  const entities = extractEntities(combinedText);
    
    // Create a content fingerprint hash
    const fingerprint = createFingerprint(title, keywords, entities);
    
    return {
      id: article.id,
      title: article.title,
      body: article.body,
      source_url: article.source_url,
      keywords,
      entities,
      fingerprint
    };
  };

  // Extract meaningful keywords from content
  const extractKeywords = (text: string): string[] => {
    // Remove common words and extract meaningful terms
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'cannot', 'this', 'that', 'these', 'those']);
    
    const words = text
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !commonWords.has(word))
      .slice(0, 20);
    
    // Count word frequency and return top keywords
    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
    
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  };

  // Extract named entities (simplified version)
  const extractEntities = (text: string): string[] => {
    const entities: string[] = [];
    
    // Extract potential place names (capitalized words)
    const placePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = text.match(placePattern) || [];
    
    // Filter for likely place names and organizations
    const filtered = matches
      .filter((match: string) => match.length > 3 && match.length < 30)
      .filter((match: string) => !['The', 'This', 'That', 'These', 'Those', 'They', 'There', 'Then', 'When', 'Where', 'What', 'Who', 'Why', 'How'].includes(match))
      .slice(0, 10);
    
    return [...new Set(filtered)]; // Remove duplicates
  };

  // Create a fingerprint hash for comparison
  const createFingerprint = (title: string, keywords: string[], entities: string[]): string => {
    const combined = [
      title.replace(/[^\w\s]/g, '').toLowerCase(),
      ...keywords.sort(),
      ...entities.sort()
    ].join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(36);
  };

  // Calculate similarity between two content fingerprints
  const calculateSimilarities = (article1: ContentFingerprint, article2: ContentFingerprint) => {
    const reasons: string[] = [];
    let score = 0;
    
    // Title similarity
    const titleSimilarity = calculateStringSimilarity(article1.title, article2.title);
    if (titleSimilarity > 0.7) {
      score += titleSimilarity * 0.4;
      reasons.push('Similar titles');
    }
    
    // Keyword overlap
    const keywordOverlap = calculateArrayOverlap(article1.keywords, article2.keywords);
    if (keywordOverlap > 0.3) {
      score += keywordOverlap * 0.3;
      reasons.push('Similar keywords');
    }
    
    // Entity overlap
    const entityOverlap = calculateArrayOverlap(article1.entities, article2.entities);
    if (entityOverlap > 0.2) {
      score += entityOverlap * 0.2;
      reasons.push('Similar entities');
    }
    
    // Fingerprint similarity
    if (article1.fingerprint === article2.fingerprint) {
      score += 0.1;
      reasons.push('Content fingerprint match');
    }
    
    return { score, reasons };
  };

  // Calculate string similarity using Jaccard similarity
  const calculateStringSimilarity = (str1: string, str2: string): number => {
    const set1 = new Set(str1.toLowerCase().split(/\s+/));
    const set2 = new Set(str2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  };

  // Calculate overlap between two arrays
  const calculateArrayOverlap = (arr1: string[], arr2: string[]): number => {
    if (arr1.length === 0 && arr2.length === 0) return 0;
    
    const set1 = new Set(arr1.map(s => s.toLowerCase()));
    const set2 = new Set(arr2.map(s => s.toLowerCase()));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  };

  // Bulk delete articles based on criteria
  const bulkDeleteArticles = async (options: BulkDeleteOptions) => {
    try {
      let query = supabase
        .from('articles')
        .select('id, title, body')
        .eq('processing_status', 'new');

      // Apply filters based on options
      if (options.dateRange) {
        query = query
          .gte('created_at', options.dateRange.start.toISOString())
          .lte('created_at', options.dateRange.end.toISOString());
      }

      const { data: articles, error } = await query;
      
      if (error) throw error;

      const articlesToDelete: string[] = [];

      articles?.forEach(article => {
        let shouldDelete = false;

        // Check keyword matching
        if (options.keywords && options.keywords.length > 0) {
          const articleText = `${article.title} ${article.body}`.toLowerCase();
          const hasKeywords = options.keywords.some(keyword => 
            articleText.includes(keyword.toLowerCase())
          );
          if (hasKeywords) shouldDelete = true;
        }

        // Check entity matching
        if (options.entities && options.entities.length > 0) {
          const articleEntities = extractEntities(`${article.title} ${article.body}`);
          const hasEntities = options.entities.some(entity => 
            articleEntities.some(ae => ae.toLowerCase().includes(entity.toLowerCase()))
          );
          if (hasEntities) shouldDelete = true;
        }

        if (shouldDelete) {
          articlesToDelete.push(article.id);
        }
      });

      if (articlesToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('articles')
          .update({ processing_status: 'discarded' })
          .in('id', articlesToDelete);

        if (deleteError) throw deleteError;

        // Store deletion info for similar article detection
        const deletionInfo = {
          keywords: options.keywords || [],
          deletedAt: new Date()
        };
        
        articlesToDelete.forEach(id => {
          setRecentDeletions(prev => new Map(prev.set(id, deletionInfo)));
        });

        toast({
          title: 'Bulk Deletion Complete',
          description: `Deleted ${articlesToDelete.length} similar articles`,
        });

        return articlesToDelete.length;
      }

      return 0;
    } catch (error: any) {
      console.error('Error in bulk delete:', error);
      toast({
        title: 'Bulk Delete Failed',
        description: error.message,
        variant: 'destructive',
      });
      return 0;
    }
  };

  // Check if new article is similar to recently deleted ones
  const checkAgainstRecentDeletions = (article: any): boolean => {
    const articleKeywords = extractKeywords(`${article.title} ${article.body}`);
    const articleEntities = extractEntities(`${article.title} ${article.body}`);
    
    for (const [deletedId, deletionInfo] of recentDeletions.entries()) {
      // Only check deletions from last 24 hours
      if (Date.now() - deletionInfo.deletedAt.getTime() > 24 * 60 * 60 * 1000) {
        continue;
      }

      // Check keyword overlap
      const keywordOverlap = calculateArrayOverlap(articleKeywords, deletionInfo.keywords);
      if (keywordOverlap > 0.5) {
        return true;
      }
    }

    return false;
  };

  // Update content fingerprints when articles change
  const updateFingerprints = useCallback((articles: any[]) => {
    const newFingerprints = new Map<string, ContentFingerprint>();
    
    articles.forEach(article => {
      if (article.processing_status !== 'discarded') {
        const fingerprint = generateContentFingerprint(article);
        newFingerprints.set(article.id, fingerprint);
      }
    });
    
    setContentFingerprints(newFingerprints);
    
    // Update similar articles map
    const newSimilarArticles = new Map<string, SimilarArticle[]>();
    articles.forEach(article => {
      if (article.processing_status !== 'discarded') {
        const similar = detectSimilarContent(article);
        if (similar.length > 0) {
          newSimilarArticles.set(article.id, similar);
        }
      }
    });
    
    setSimilarArticles(newSimilarArticles);
  }, [contentFingerprints]); // Add contentFingerprints as dependency for detectSimilarContent

  // Clean up old deletion records
  useEffect(() => {
    const cleanup = () => {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      setRecentDeletions(prev => {
        const cleaned = new Map(prev);
        for (const [id, info] of cleaned.entries()) {
          if (info.deletedAt.getTime() < oneDayAgo) {
            cleaned.delete(id);
          }
        }
        return cleaned;
      });
    };

    const interval = setInterval(cleanup, 60 * 60 * 1000); // Clean up every hour
    return () => clearInterval(interval);
  }, []);

  return {
    similarArticles,
    contentFingerprints,
    recentDeletions,
    detectSimilarContent,
    bulkDeleteArticles,
    checkAgainstRecentDeletions,
    updateFingerprints
  };
};