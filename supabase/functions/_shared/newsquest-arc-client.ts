export interface ArcContentElement {
  type?: string;
  content?: string;
  level?: number;
  items?: Array<ArcContentElement | string>;
  content_elements?: ArcContentElement[];
  text?: string;
  subtype?: string;
  url?: string;
  caption?: string;
  credits?: { by?: Array<{ name?: string }>; };
  additional_properties?: Record<string, unknown>;
  embed_html?: string;
  data?: { url?: string; html?: string; caption?: string };
}

export interface ArcStory {
  _id?: string;
  headlines?: { basic?: string };
  description?: { basic?: string };
  websites?: Record<string, { website_url?: string }>;
  canonical_url?: string;
  publish_date?: string;
  display_date?: string;
  created_date?: string;
  credits?: { by?: Array<{ name?: string }> };
  promo_items?: Record<string, any>;
  content_elements?: ArcContentElement[];
  taxonomy?: { primary_section?: { _id?: string }; sections?: Array<{ _id?: string }> };
  access?: { premium?: boolean; type?: string };
}

export interface NewsquestArcArticle {
  id: string;
  arcSite: string;
  section: string;
  title: string;
  url: string;
  author?: string;
  publishedAt?: string;
  imageUrl?: string;
  summary?: string;
  bodyHtml: string;
  bodyText: string;
}

interface FetchOptions {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export class NewsquestArcClient {
  private readonly hostname: string;
  private readonly sectionPath: string;
  private readonly arcSite: string;

  constructor(hostname: string, sectionPath: string, arcSiteOverride?: string) {
    this.hostname = hostname;
    this.sectionPath = sectionPath.startsWith('/') ? sectionPath : `/${sectionPath}`;
    // Use override from domain profile if provided, otherwise derive dynamically
    this.arcSite = arcSiteOverride || this.deriveArcSite(hostname);
  }

  async fetchSectionArticles(options: FetchOptions = {}): Promise<NewsquestArcArticle[]> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const offset = Math.max(options.offset ?? 0, 0);

    const url = new URL(`https://${this.hostname}/pf/api/v3/content/fetch/story-by-section`);
    url.searchParams.set('section', this.sectionPath);
    url.searchParams.set('_website', this.arcSite);
    url.searchParams.set('size', String(limit));
    url.searchParams.set('from', String(offset));
    url.searchParams.set('sort', 'display_date:desc');
    url.searchParams.set('published', 'true');
    url.searchParams.set('content_alias', 'story');
    url.searchParams.set('apikey', 'story-feed');

    const includedFields = [
      'content_elements',
      'headlines.basic',
      'description.basic',
      'publish_date',
      'display_date',
      'created_date',
      'canonical_url',
      `websites.${this.arcSite}.website_url`,
      'promo_items',
      'credits.by',
      'taxonomy.primary_section',
      'taxonomy.sections',
      'access'
    ];

    for (const field of includedFields) {
      url.searchParams.append('included_fields', field);
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': `https://${this.hostname}/`,
      'Origin': `https://${this.hostname}`,
      'x-arc-site': this.arcSite,
      'x-api-key': 'story-feed'
    };

    const controller = new AbortController();
    const signal = options.signal ?? controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      console.log(`🌐 Arc API Request: ${url.toString()}`);
      console.log(`📍 Section: ${this.sectionPath}, Arc Site: ${this.arcSite}`);
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal,
        redirect: 'follow'
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unable to read response body');
        console.error(`❌ Arc API Error ${response.status}:`, errorBody.substring(0, 500));
        
        // Try fallback strategies for 404
        if (response.status === 404) {
          console.log(`🔄 Attempting Arc API fallback strategies...`);
          
          // Try without leading slash
          if (this.sectionPath.startsWith('/')) {
            const altPath = this.sectionPath.substring(1);
            console.log(`🔄 Fallback 1: Trying without leading slash: ${altPath}`);
            try {
              const altUrl = new URL(url.toString());
              altUrl.searchParams.set('section', altPath);
              const altResponse = await fetch(altUrl.toString(), { method: 'GET', headers, signal });
              if (altResponse.ok) {
                console.log(`✅ Fallback 1 succeeded!`);
                const data = await altResponse.json();
                const stories: ArcStory[] = Array.isArray(data?.content_elements) ? data.content_elements : [];
                return stories
                  .map(story => this.transformStory(story))
                  .filter((article): article is NewsquestArcArticle => Boolean(article && article.bodyText));
              }
            } catch (err) {
              console.log(`❌ Fallback 1 failed:`, err);
            }
          }
          
          // Try root section
          console.log(`🔄 Fallback 2: Trying root section /`);
          try {
            const rootUrl = new URL(url.toString());
            rootUrl.searchParams.set('section', '/');
            const rootResponse = await fetch(rootUrl.toString(), { method: 'GET', headers, signal });
            if (rootResponse.ok) {
              console.log(`✅ Fallback 2 succeeded!`);
              const data = await rootResponse.json();
              const stories: ArcStory[] = Array.isArray(data?.content_elements) ? data.content_elements : [];
              return stories
                .map(story => this.transformStory(story))
                .filter((article): article is NewsquestArcArticle => Boolean(article && article.bodyText));
            }
          } catch (err) {
            console.log(`❌ Fallback 2 failed:`, err);
          }
        }
        
        throw new Error(`Arc API HTTP ${response.status}: ${errorBody.substring(0, 200)}`);
      }

      const data = await response.json();
      const stories: ArcStory[] = Array.isArray(data?.content_elements) ? data.content_elements : [];

      return stories
        .map(story => this.transformStory(story))
        .filter((article): article is NewsquestArcArticle => Boolean(article && article.bodyText));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Derives Arc site slug from hostname dynamically
   * No hardcoded mappings - uses hostname pattern
   */
  private deriveArcSite(hostname: string): string {
    const normalized = hostname.toLowerCase().replace(/^www\./, '');
    
    // Extract the primary part before the first dot (e.g., "sussexexpress" from "sussexexpress.co.uk")
    const [firstPart] = normalized.split('.');
    
    // Clean the part to create a valid Arc site slug (lowercase alphanumeric only)
    const arcSiteSlug = firstPart?.replace(/[^a-z0-9]/g, '') || 'newsquest';
    
    console.log(`🔧 Derived Arc site slug: "${arcSiteSlug}" from hostname "${hostname}"`);
    return arcSiteSlug;
  }

  private transformStory(story: ArcStory | null | undefined): NewsquestArcArticle | null {
    if (!story) {
      return null;
    }

    if (story.access?.premium || story.access?.type === 'subscription') {
      return null; // Skip subscriber-only content
    }

    const title = story.headlines?.basic?.trim();
    if (!title) {
      return null;
    }

    const storyUrl = this.resolveStoryUrl(story);
    if (!storyUrl) {
      return null;
    }

    const { html, text } = this.renderContent(story.content_elements || []);
    const summary = story.description?.basic?.trim();

    if (!html && !text && !summary) {
      return null;
    }

    const author = this.extractAuthor(story);
    const publishedAt = story.publish_date || story.display_date || story.created_date;
    const imageUrl = this.extractLeadImage(story);
    const section = story.taxonomy?.primary_section?._id || this.sectionPath;

    return {
      id: story._id || storyUrl,
      arcSite: this.arcSite,
      section,
      title,
      url: storyUrl,
      author,
      publishedAt,
      imageUrl,
      summary,
      bodyHtml: html || (summary ? `<p>${summary}</p>` : ''),
      bodyText: text || summary || ''
    };
  }

  private extractAuthor(story: ArcStory): string | undefined {
    const credits = story.credits?.by;
    if (!Array.isArray(credits) || credits.length === 0) {
      return undefined;
    }

    const names = credits
      .map(credit => credit?.name?.trim())
      .filter((name): name is string => Boolean(name));

    return names.length ? Array.from(new Set(names)).join(', ') : undefined;
  }

  private extractLeadImage(story: ArcStory): string | undefined {
    const promo = story.promo_items || {};
    const candidates = [
      promo.lead_art?.url,
      promo.basic?.url,
      promo.featured?.url,
      promo.thumbnail?.url
    ];

    for (const candidate of candidates) {
      const resolved = typeof candidate === 'string' ? candidate : candidate?.url;
      if (resolved) {
        return this.toAbsoluteUrl(resolved);
      }
    }

    return undefined;
  }

  private resolveStoryUrl(story: ArcStory): string | null {
    const websiteEntry = story.websites?.[this.arcSite]?.website_url;
    const canonical = story.canonical_url;
    const urlCandidate = websiteEntry || canonical;

    if (!urlCandidate) {
      return null;
    }

    return this.toAbsoluteUrl(urlCandidate);
  }

  private toAbsoluteUrl(url: string): string {
    try {
      return new URL(url, `https://${this.hostname}`).href;
    } catch {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      return `https://${this.hostname}${url.startsWith('/') ? url : `/${url}`}`;
    }
  }

  private renderContent(elements: ArcContentElement[]): { html: string; text: string } {
    const htmlParts: string[] = [];
    const textParts: string[] = [];

    const append = (html: string, text: string) => {
      if (html.trim()) {
        htmlParts.push(html.trim());
      }
      if (text.trim()) {
        textParts.push(text.trim());
      }
    };

    const renderElement = (element: ArcContentElement | string): void => {
      if (typeof element === 'string') {
        append(`<p>${this.escapeHtml(element)}</p>`, element);
        return;
      }

      const type = element.type || 'text';
      switch (type) {
        case 'text': {
          const content = element.content || element.text || '';
          if (content.trim()) {
            append(`<p>${content.trim()}</p>`, this.stripHtml(content));
          }
          break;
        }
        case 'header': {
          const level = element.level && element.level >= 1 && element.level <= 6 ? element.level : 2;
          const content = element.content || element.text || '';
          if (content.trim()) {
            append(`<h${level}>${content.trim()}</h${level}>`, this.stripHtml(content));
          }
          break;
        }
        case 'list': {
          const isOrdered = element.subtype === 'ordered';
          const listTag = isOrdered ? 'ol' : 'ul';
          const items = Array.isArray(element.items) ? element.items : [];
          const itemHtml: string[] = [];
          const itemText: string[] = [];

          for (const item of items) {
            if (typeof item === 'string') {
              itemHtml.push(`<li>${this.escapeHtml(item)}</li>`);
              itemText.push(item);
              continue;
            }

            if (item?.content || item?.text) {
              const textContent = item.content || item.text || '';
              itemHtml.push(`<li>${textContent}</li>`);
              itemText.push(this.stripHtml(textContent));
            } else if (Array.isArray(item?.content_elements)) {
              const nested = this.renderContent(item.content_elements);
              if (nested.html) {
                itemHtml.push(`<li>${nested.html}</li>`);
              }
              if (nested.text) {
                itemText.push(nested.text);
              }
            }
          }

          if (itemHtml.length) {
            append(`<${listTag}>${itemHtml.join('')}</${listTag}>`, itemText.join('\n'));
          }
          break;
        }
        case 'quote':
        case 'pullquote':
        case 'blockquote': {
          const content = element.content || element.text || '';
          if (content.trim()) {
            append(`<blockquote>${content.trim()}</blockquote>`, this.stripHtml(content));
          }
          break;
        }
        case 'raw_html': {
          const raw = element.content || element.text || '';
          if (raw.trim()) {
            append(raw, this.stripHtml(raw));
          }
          break;
        }
        case 'oembed':
        case 'embed': {
          const embedHtml = element.embed_html || element.content || element.data?.html;
          if (embedHtml) {
            append(embedHtml, '');
          }
          break;
        }
        case 'image': {
          const url = element.url || element.data?.url;
          if (url) {
            const caption = element.caption || element.data?.caption || '';
            const resolved = this.toAbsoluteUrl(url);
            append(
              `<figure><img src="${resolved}" alt="${this.escapeHtml(this.stripHtml(caption || ''))}">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`,
              caption ? this.stripHtml(caption) : ''
            );
          }
          break;
        }
        default: {
          if (Array.isArray(element.content_elements)) {
            const nested = this.renderContent(element.content_elements);
            if (nested.html) {
              append(nested.html, nested.text);
            }
          }
          break;
        }
      }
    };

    for (const element of elements) {
      renderElement(element);
    }

    const html = htmlParts.join('\n').replace(/\n{3,}/g, '\n\n');
    const text = textParts.join('\n').replace(/\n{3,}/g, '\n\n');
    return { html, text };
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
