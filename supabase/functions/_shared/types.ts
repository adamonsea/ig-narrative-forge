// Shared types and interfaces for all scraping functions

export interface RegionConfig {
  name: string;
  keywords: string[];
  landmarks: string[];
  postcodes: string[];
  organizations: string[];
}

export interface ArticleData {
  title: string;
  body: string;
  author?: string;
  published_at?: string;
  source_url: string;
  image_url?: string;
  canonical_url?: string;
  word_count: number;
  regional_relevance_score: number;
  content_quality_score: number;
  processing_status: 'new' | 'processing' | 'processed' | 'discarded';
  is_snippet?: boolean;
  snippet_reason?: string;
  import_metadata: Record<string, any>;
}

export interface ScrapingResult {
  success: boolean;
  articles: ArticleData[];
  articlesFound: number;
  articlesScraped: number;
  errors: string[];
  method: 'rss' | 'html' | 'api' | 'fallback' | 'metadata';
}

export interface ContentExtractionResult {
  title: string;
  body: string;
  author?: string;
  published_at?: string;
  word_count: number;
  content_quality_score: number;
}

export interface ScrapingConfig {
  method: 'rss' | 'html' | 'api' | 'fallback';
  url: string;
  headers?: Record<string, string>;
  retryAttempts: number;
  timeout: number;
  userAgent?: string;
  contentSelector?: string;
  titleSelector?: string;
  authorSelector?: string;
}

export interface StructuredArticleCandidate {
  url: string;
  headline?: string;
  datePublished?: string;
  image?: string;
  keywords?: string[];
}