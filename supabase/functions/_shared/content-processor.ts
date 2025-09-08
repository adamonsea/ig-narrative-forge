import { ContentExtractionResult } from './types.ts';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

// Content extraction strategies in priority order
const CONTENT_SELECTORS = [
  'article',
  '[role="main"] .entry-content',
  '.post-content',
  '.article-content',
  '.content',
  '.entry-content',
  '[data-testid="article-body"]',
  '.story-body',
  '.article-body',
  'main p'
];

const TITLE_SELECTORS = [
  'h1',
  '.entry-title',
  '.post-title',
  '.article-title',
  '[data-testid="headline"]',
  '.headline'
];

const AUTHOR_SELECTORS = [
  '.author',
  '.byline',
  '[rel="author"]',
  '.post-author',
  '[data-testid="author-name"]'
];

const DATE_SELECTORS = [
  'time[datetime]',
  '.date',
  '.published',
  '.post-date',
  '[data-testid="timestamp"]'
];

export async function fetchWithRetry(url: string, maxRetries: number = 3): Promise<string> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 Fetching ${url} (attempt ${attempt}/${maxRetries})`);
      
      // For HTTP/2 issues, try different approaches
      let fetchOptions: RequestInit = {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(15000) // 15 second timeout
      };

      // If this is a retry due to HTTP/2 errors, try with HTTP/1.1 headers
      if (attempt > 1 && lastError?.message.includes('http2')) {
        console.log(`🔄 HTTP/2 error detected, forcing HTTP/1.1 for attempt ${attempt}`);
        fetchOptions.headers = {
          ...DEFAULT_HEADERS,
          'Connection': 'close', // Force HTTP/1.1
          'HTTP2-Settings': '', // Disable HTTP/2
        };
      }
      
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      console.log(`✅ Successfully fetched ${html.length} characters`);
      return html;
      
    } catch (error) {
      lastError = error as Error;
      console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
      
      // If it's an HTTP/2 error, try alternative URL schemes on next attempt
      if (error.message.includes('http2') && attempt < maxRetries) {
        console.log(`🔄 HTTP/2 protocol error detected, will retry with different headers`);
      }
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Failed to fetch after all retries');
}

export function extractContentFromHTML(html: string, url: string): ContentExtractionResult {
  console.log(`🔍 Starting progressive content extraction for: ${url}`);
  
  // Clean HTML from scripts, styles, and other noise
  let cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Extract title
  let title = '';
  for (const selector of TITLE_SELECTORS) {
    const match = new RegExp(`<${selector}[^>]*>([^<]+)`, 'i').exec(cleanHtml);
    if (match && match[1].trim()) {
      title = cleanTitle(match[1]);
      console.log(`✅ Title extracted using pattern: ${title.substring(0, 50)}...`);
      break;
    }
  }
  
  if (!title) {
    const titleMatch = /<title[^>]*>([^<]+)/i.exec(html);
    if (titleMatch) {
      title = cleanTitle(titleMatch[1]);
    }
  }

  // Extract author
  let author = '';
  for (const selector of AUTHOR_SELECTORS) {
    const match = new RegExp(`<[^>]*class[^>]*${selector.replace('.', '')}[^>]*>([^<]+)`, 'i').exec(cleanHtml);
    if (match && match[1].trim()) {
      author = cleanText(match[1]);
      break;
    }
  }

  // Phase 3: Enhanced publication date extraction with better parsing
  let published_at = '';
  for (const selector of DATE_SELECTORS) {
    if (selector.includes('datetime')) {
      const match = /<time[^>]*datetime=["']([^"']+)["'][^>]*>/i.exec(cleanHtml);
      if (match) {
        published_at = match[1];
        break;
      }
    } else {
      const match = new RegExp(`<[^>]*class[^>]*${selector.replace('.', '')}[^>]*>([^<]+)`, 'i').exec(cleanHtml);
      if (match && match[1].trim()) {
        published_at = match[1].trim();
        break;
      }
    }
  }

  // Phase 3: Enhanced date parsing with fallback patterns
  if (!published_at) {
    // Look for common date patterns in text
    const datePatterns = [
      /Published[:\s]*([A-Za-z]+ \d{1,2},? \d{4})/i,
      /(\d{1,2}\/\d{1,2}\/\d{4})/,
      /(\d{4}-\d{2}-\d{2})/,
      /([A-Za-z]+ \d{1,2},? \d{4})/,
      /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}/i
    ];
    
    for (const pattern of datePatterns) {
      const match = cleanHtml.match(pattern);
      if (match) {
        published_at = match[1] || match[0];
        console.log(`📅 Found date using pattern: ${published_at}`);
        break;
      }
    }
  }

  // Phase 3: Normalize and validate the date
  if (published_at) {
    published_at = normalizeDate(published_at);
  }

  // Extract main content using progressive strategies
  let content = '';
  let extractionMethod = '';

  // Strategy 1: Try news-specific extraction
  console.log('🔄 Trying news-specific extraction strategy...');
  content = extractNewsContent(cleanHtml);
  if (content && content.length > 200) {
    extractionMethod = 'news-specific';
    console.log(`✅ Content extracted using news-specific: ${content.length} chars`);
  }

  // Strategy 2: Try article selectors
  if (!content || content.length < 200) {
    console.log('🔄 Trying article selector strategy...');
    for (const selector of CONTENT_SELECTORS) {
      const extracted = extractBySelector(cleanHtml, selector);
      if (extracted && extracted.length > content.length) {
        content = extracted;
        extractionMethod = `selector: ${selector}`;
      }
    }
  }

  // Strategy 3: Paragraph extraction as fallback - FOCUS ON WORD COUNT
  const wordCount = countWords(content);
  if (!content || wordCount < 50) {
    console.log('🔄 Trying paragraph extraction fallback...');
    content = extractParagraphs(cleanHtml);
    extractionMethod = 'paragraph-fallback';
  }

  // Clean and validate content
  content = cleanText(content);
  const wordCount = countWords(content);
  const contentQualityScore = calculateContentQuality(content, title);

  console.log(`📊 Final content quality: ${wordCount} words, ${content.length} chars`);
  console.log(`✅ Extracted ${content.length} chars (${wordCount} words) from ${url}`);

  return {
    title: title || 'Untitled',
    body: content,
    author,
    published_at: published_at || new Date().toISOString(),
    word_count: wordCount,
    content_quality_score: contentQualityScore
  };
}

function extractNewsContent(html: string): string {
  // News-specific patterns
  const newsPatterns = [
    /<div[^>]*class[^>]*story[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class[^>]*article[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class[^>]*content[^>]*>([\s\S]*?)<\/div>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i
  ];

  for (const pattern of newsPatterns) {
    const match = pattern.exec(html);
    if (match) {
      const content = extractTextFromHTML(match[1]);
      if (content.length > 200) {
        return content;
      }
    }
  }

  return '';
}

function extractBySelector(html: string, selector: string): string {
  try {
    if (selector === 'main p') {
      // Special handling for main paragraph extraction
      const mainMatch = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
      if (mainMatch) {
        return extractParagraphs(mainMatch[1]);
      }
    } else {
      const pattern = new RegExp(`<${selector}[^>]*>([\s\S]*?)<\/${selector}>`, 'i');
      const match = pattern.exec(html);
      if (match) {
        return extractTextFromHTML(match[1]);
      }
    }
  } catch (error) {
    console.log(`Error extracting with selector ${selector}: ${error.message}`);
  }
  return '';
}

function extractParagraphs(html: string): string {
  const paragraphs: string[] = [];
  
  // Enhanced extraction for split content (ads, images between paragraphs)
  const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const divMatches = html.match(/<div[^>]*class[^>]*(?:content|article|text)[^>]*>([\s\S]*?)<\/div>/gi) || [];
  
  // Collect all text chunks - lower threshold for better aggregation
  for (const pMatch of pMatches) {
    const text = extractTextFromHTML(pMatch);
    if (text.length > 15) { // Much lower threshold for local news
      paragraphs.push(text);
    }
  }
  
  // Also collect from content divs to handle split articles
  for (const divMatch of divMatches) {
    const text = extractTextFromHTML(divMatch);
    if (text.length > 20 && !isNavigationText(text)) {
      paragraphs.push(text);
    }
  }
  
  return paragraphs.join('\n\n');
}

function isNavigationText(text: string): boolean {
  const navKeywords = ['menu', 'subscribe', 'follow', 'share', 'comment', 'advertisement'];
  const textLower = text.toLowerCase();
  return navKeywords.some(keyword => textLower.includes(keyword)) || text.split(' ').length < 5;
}

function extractTextFromHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(title: string): string {
  return title
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[-|–]\s*.*$/, ''); // Remove site name suffix
}

function cleanText(text: string): string {
  return text
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Phase 3: Enhanced date normalization function
function normalizeDate(dateStr: string): string {
  try {
    // Handle problematic date formats like "Sept. 3, 2025"
    let cleaned = dateStr.trim();
    
    // Fix common abbreviations
    const monthMap = {
      'Jan.': 'January', 'Feb.': 'February', 'Mar.': 'March', 'Apr.': 'April',
      'May.': 'May', 'Jun.': 'June', 'Jul.': 'July', 'Aug.': 'August',
      'Sep.': 'September', 'Sept.': 'September', 'Oct.': 'October', 
      'Nov.': 'November', 'Dec.': 'December'
    };
    
    for (const [abbrev, full] of Object.entries(monthMap)) {
      cleaned = cleaned.replace(new RegExp(abbrev, 'gi'), full);
    }
    
    // Try to parse the cleaned date
    const parsed = new Date(cleaned);
    
    // Check if the date is valid and not in the future
    if (!isNaN(parsed.getTime()) && parsed <= new Date()) {
      return parsed.toISOString();
    }
    
    // If parsing failed, return current date as fallback
    console.warn(`⚠️ Could not parse date: "${dateStr}", using current date`);
    return new Date().toISOString();
    
  } catch (error) {
    console.error(`❌ Date parsing error for "${dateStr}": ${error.message}`);
    return new Date().toISOString();
  }
}

function calculateContentQuality(content: string, title: string): number {
  let score = 0;
  
  // Enhanced word count scoring for 150+ word requirement
  const wordCount = countWords(content);
  if (wordCount >= 500) score += 40;
  else if (wordCount >= 300) score += 35;
  else if (wordCount >= 200) score += 30;
  else if (wordCount >= 150) score += 25; // Target threshold for local news
  else if (wordCount >= 100) score += 20;
  else if (wordCount >= 50) score += 15;
  else if (wordCount >= 25) score += 10;
  
  // Content structure scoring
  if (content.includes('\n\n')) score += 10; // Has paragraphs
  if (title && title.length > 10) score += 10; // Has substantial title
  
  // Content completeness - more realistic for local news
  if (content.length > 2000) score += 20;
  else if (content.length > 1000) score += 15;
  else if (content.length > 500) score += 10;
  else if (content.length > 300) score += 5;
  
  // Reduced penalties - focus on word count over character count
  if (wordCount < 25) score -= 10;
  if (wordCount < 10) score -= 20;
  
  return Math.max(0, Math.min(100, score));
}