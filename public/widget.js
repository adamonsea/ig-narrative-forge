/**
 * Curatr Embeddable Widget
 * Displays feed headlines with branding
 * 
 * Usage:
 * <div id="curatr-widget" 
 *      data-feed="your-feed-slug"
 *      data-max="5"
 *      data-theme="auto"
 *      data-accent="#3b82f6">
 * </div>
 * <script src="https://curatr.pro/widget.js" async></script>
 */
(function() {
  'use strict';

  const API_BASE = 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1';
  const WIDGET_VERSION = '1.3.0';
  const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes cache

  // Validate URL to prevent XSS (only allow http/https)
  function isValidUrl(url) {
    if (!url) return false;
    return url.startsWith('http://') || url.startsWith('https://');
  }

  // Generate a simple visitor hash for deduplication
  function getVisitorHash() {
    const stored = localStorage.getItem('curatr_visitor_hash');
    if (stored) return stored;
    
    const hash = 'v_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    try {
      localStorage.setItem('curatr_visitor_hash', hash);
    } catch (e) {
      // localStorage not available
    }
    return hash;
  }

  // Track analytics event
  function trackEvent(feedSlug, eventType, storyId = null) {
    try {
      const payload = {
        feedSlug,
        eventType,
        storyId,
        visitorHash: getVisitorHash(),
        referrerUrl: window.location.href
      };

      // Use sendBeacon for reliable tracking (doesn't block navigation)
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          `${API_BASE}/widget-analytics`,
          JSON.stringify(payload)
        );
      } else {
        // Fallback to fetch
        fetch(`${API_BASE}/widget-analytics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        }).catch(() => {});
      }
    } catch (e) {
      // Silently fail analytics
    }
  }

  // Find all widget containers
  function initWidgets() {
    const containers = document.querySelectorAll('[data-feed]');
    containers.forEach(initWidget);
  }

  function initWidget(container) {
    const feedSlug = container.dataset.feed;
    const maxStories = parseInt(container.dataset.max) || 5;
    const theme = container.dataset.theme || 'auto';
    const accentColor = container.dataset.accent;
    const width = container.dataset.width || 'responsive';
    const layout = width === 'wide' ? 'wide' : 'compact';
    const customTitle = container.dataset.title || '';
    // Custom avatar URL with XSS validation
    const customAvatar = isValidUrl(container.dataset.avatar) ? container.dataset.avatar : '';

    if (!feedSlug) {
      console.error('Curatr Widget: Missing data-feed attribute');
      return;
    }

    // Create Shadow DOM for style isolation
    const shadow = container.attachShadow({ mode: 'open' });

    // Detect theme preference
    const prefersDark = theme === 'dark' || 
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // Inject styles
    const styles = document.createElement('style');
    styles.textContent = getStyles(prefersDark, accentColor, width, layout);
    shadow.appendChild(styles);

    // Create widget container
    const wrapper = document.createElement('div');
    wrapper.className = 'eezee-widget';
    
    // Try to show cached data immediately while fetching fresh data
    const cached = getCachedData(feedSlug);
    if (cached) {
      wrapper.innerHTML = renderWidget(cached, prefersDark, accentColor, layout, customTitle, customAvatar);
      attachClickHandlers(shadow, feedSlug);
    } else {
      wrapper.innerHTML = getLoadingHTML();
    }
    shadow.appendChild(wrapper);

    // Fetch fresh data
    fetchFeedData(feedSlug, maxStories)
      .then(data => {
        // Cache the successful response
        setCachedData(feedSlug, data);
        
        wrapper.innerHTML = renderWidget(data, prefersDark, accentColor, layout, customTitle, customAvatar);
        
        // Track impression after successful render (only if not cached initially)
        if (!cached) {
          trackEvent(feedSlug, 'impression');
        }
        
        // Attach click handlers for story tracking
        attachClickHandlers(shadow, feedSlug);
      })
      .catch(error => {
        console.error('Curatr Widget Error:', error);
        
        // If we have cached data, keep showing it (graceful degradation)
        if (cached) {
          console.log('Curatr Widget: Using cached data due to fetch error');
          // Already showing cached data, no need to update
        } else {
          // No cache available, show minimal error state
          wrapper.innerHTML = getGracefulErrorHTML(feedSlug);
        }
      });
  }

  // Cache management for graceful degradation
  function getCacheKey(feedSlug) {
    return `curatr_widget_cache_${feedSlug}`;
  }

  function getCachedData(feedSlug) {
    try {
      const cached = localStorage.getItem(getCacheKey(feedSlug));
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      
      // Check if cache is still valid
      if (Date.now() - timestamp > CACHE_TTL_MS) {
        localStorage.removeItem(getCacheKey(feedSlug));
        return null;
      }
      
      return data;
    } catch (e) {
      return null;
    }
  }

  function setCachedData(feedSlug, data) {
    try {
      localStorage.setItem(getCacheKey(feedSlug), JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      // localStorage full or unavailable - ignore
    }
  }

  // Attach click handlers to track story clicks
  function attachClickHandlers(shadow, feedSlug) {
    const storyLinks = shadow.querySelectorAll('[data-story-id]');
    storyLinks.forEach(link => {
      link.addEventListener('click', () => {
        const storyId = link.dataset.storyId;
        trackEvent(feedSlug, 'click', storyId);
      });
    });
  }

  async function fetchFeedData(feedSlug, maxStories) {
    const response = await fetch(
      `${API_BASE}/widget-feed-data?feed=${encodeURIComponent(feedSlug)}&max=${maxStories}`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status}`);
    }

    return response.json();
  }

  function renderWidget(data, isDark, accentOverride, layout = 'compact', customTitle = '', customAvatar = '') {
    const { feed, stories } = data;
    const accent = accentOverride || feed.brand_color || '#3b82f6';
    const displayName = customTitle || feed.name;

    if (!stories || stories.length === 0) {
      return `
        <div class="widget-empty">
          <p>No stories available</p>
        </div>
      `;
    }

    // Priority: customAvatar > icon_url > logo_url > text fallback
    const avatarUrl = customAvatar || feed.icon_url || feed.logo_url;
    const logoHTML = avatarUrl 
      ? `<img src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(displayName)}" class="widget-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="widget-logo-text" style="background: ${accent}; display: none;">${displayName.charAt(0)}</span>`
      : `<span class="widget-logo-text" style="background: ${accent}">${displayName.charAt(0)}</span>`;

    // Wide layout with featured story + list
    if (layout === 'wide' && stories.length > 0) {
      const featured = stories[0];
      const remaining = stories.slice(1);

      const featuredImageHTML = featured.image_url 
        ? `<div class="featured-image"><img src="${featured.image_url}" alt="" /></div>`
        : '';

      const remainingHTML = remaining.map(story => {
        const sourceHTML = story.source_name 
          ? `<span class="story-source">${escapeHTML(story.source_name)}</span>`
          : '';
        // Fresh stories (< 2 hours) get a pulsing bullet with green transition
        const isFresh = story.age_minutes !== undefined && story.age_minutes < 120;
        const bulletClass = isFresh ? 'story-bullet fresh-pulse' : 'story-bullet';
        const bulletStyle = isFresh 
          ? `--accent-color: ${accent}; --fresh-color: #22c55e;`
          : `background: ${accent}`;
        return `
          <a href="${story.url}" target="_blank" rel="noopener" class="story-item-compact" data-story-id="${story.id || ''}">
            <span class="${bulletClass}" style="${bulletStyle}"></span>
            <div class="story-content">
              <span class="story-title">${escapeHTML(story.title)}</span>
              ${sourceHTML}
            </div>
          </a>
        `;
      }).join('');

      const featuredSourceHTML = featured.source_name 
        ? `<span class="story-source">${escapeHTML(featured.source_name)}</span>`
        : '';

      // Build CTA text - prefer weekly count, fallback to generic
      const wideCtaText = feed.stories_this_week > 0 
        ? `${feed.stories_this_week} stories this week →`
        : 'View all stories →';

      return `
        <div class="widget-header">
          ${logoHTML}
          <span class="widget-name">${escapeHTML(displayName)}</span>
        </div>
        <div class="widget-grid">
          <a href="${featured.url}" target="_blank" rel="noopener" class="featured-story" data-story-id="${featured.id || ''}">
            ${featuredImageHTML}
            <h3 class="featured-title">${escapeHTML(featured.title)}</h3>
            ${featuredSourceHTML}
          </a>
          <div class="stories-list">
            ${remainingHTML}
          </div>
        </div>
        <div class="widget-footer">
          <a href="https://curatr.pro/feed/${feed.slug}" target="_blank" rel="noopener" class="widget-cta" style="color: ${accent}">
            ${wideCtaText}
          </a>
          <span class="widget-attribution">
            Powered by <a href="https://curatr.pro" target="_blank" rel="noopener">Curatr</a>
          </span>
        </div>
      `;
    }

    // Default compact list layout
    const storiesHTML = stories.map(story => {
      const sourceHTML = story.source_name && story.source_url 
        ? `<a href="${story.source_url}" target="_blank" rel="noopener" class="story-source" onclick="event.stopPropagation();">${escapeHTML(story.source_name)}</a>`
        : story.source_name 
          ? `<span class="story-source">${escapeHTML(story.source_name)}</span>`
          : '';
      
      // Fresh stories (< 2 hours) get a pulsing bullet with green transition
      const isFresh = story.age_minutes !== undefined && story.age_minutes < 120;
      const bulletClass = isFresh ? 'story-bullet fresh-pulse' : 'story-bullet';
      const bulletStyle = isFresh 
        ? `--accent-color: ${accent}; --fresh-color: #22c55e;`
        : `background: ${accent}`;
      
      return `
        <a href="${story.url}" target="_blank" rel="noopener" class="story-item" data-story-id="${story.id || ''}">
          <span class="${bulletClass}" style="${bulletStyle}"></span>
          <div class="story-content">
            <span class="story-title">${escapeHTML(story.title)}</span>
            ${sourceHTML}
          </div>
        </a>
      `;
    }).join('');

    // Build CTA text - prefer weekly count, fallback to generic
    const ctaText = feed.stories_this_week > 0 
      ? `${feed.stories_this_week} stories this week →`
      : 'View all stories →';

    return `
      <div class="widget-header">
        ${logoHTML}
        <span class="widget-name">${escapeHTML(displayName)}</span>
      </div>
      <div class="widget-stories">
        ${storiesHTML}
      </div>
      <div class="widget-footer">
        <a href="https://curatr.pro/feed/${feed.slug}" target="_blank" rel="noopener" class="widget-cta" style="color: ${accent}">
          ${ctaText}
        </a>
        <span class="widget-attribution">
          Powered by <a href="https://curatr.pro" target="_blank" rel="noopener">Curatr</a>
        </span>
      </div>
    `;
  }

  function getStyles(isDark, accent, width, layout = 'compact') {
    const bg = isDark ? '#1a1a1a' : '#ffffff';
    const text = isDark ? '#e5e5e5' : '#1a1a1a';
    const textMuted = isDark ? '#a0a0a0' : '#6b7280';
    const border = isDark ? '#333333' : '#e5e7eb';
    const hoverBg = isDark ? '#252525' : '#f9fafb';
    const sourceBg = isDark ? '#2a2a2a' : '#f3f4f6';

    // Handle width options
    let widthStyle = '100%';
    let maxWidthStyle = '480px';
    
    if (width === 'wide') {
      widthStyle = '100%';
      maxWidthStyle = '1000px';
    } else if (width === '100%') {
      widthStyle = '100%';
      maxWidthStyle = 'none';
    } else if (width === 'responsive' || !width) {
      widthStyle = '100%';
      maxWidthStyle = '480px';
    } else {
      widthStyle = width;
      maxWidthStyle = width;
    }

    return `
      :host {
        display: block;
        width: ${widthStyle};
        max-width: ${maxWidthStyle};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.5;
      }

      .eezee-widget {
        background: ${bg};
        border: 1px solid ${border};
        border-radius: 12px;
        padding: 16px;
        color: ${text};
      }

      .widget-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
        padding-bottom: 12px;
        border-bottom: 1px solid ${border};
      }

      .widget-logo {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        object-fit: cover;
      }

      .widget-logo-text {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 14px;
      }

      .widget-name {
        font-weight: 600;
        font-size: 15px;
      }

      .widget-stories {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .story-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px;
        margin: 0 -8px;
        border-radius: 8px;
        text-decoration: none;
        color: ${text};
        transition: background-color 0.15s ease;
      }

      .story-item:hover {
        background: ${hoverBg};
      }

      .story-bullet {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 7px;
      }

      .story-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }

      .story-title {
        font-weight: 500;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .story-source {
        font-size: 11px;
        color: ${textMuted};
        background: ${isDark ? '#2a2a2a' : '#f3f4f6'};
        padding: 2px 6px;
        border-radius: 4px;
        align-self: flex-start;
        text-decoration: none;
        transition: opacity 0.15s ease;
      }

      .story-source:hover {
        opacity: 0.8;
      }

      .widget-footer {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid ${border};
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }

      .widget-cta {
        font-weight: 500;
        font-size: 13px;
        text-decoration: none;
      }

      .widget-cta:hover {
        text-decoration: underline;
      }

      .widget-attribution {
        font-size: 11px;
        color: ${textMuted};
      }

      .widget-attribution a {
        color: ${textMuted};
        text-decoration: none;
      }

      .widget-attribution a:hover {
        text-decoration: underline;
      }

      .widget-loading, .widget-error, .widget-empty {
        text-align: center;
        padding: 20px;
        color: ${textMuted};
      }

      /* Wide layout styles */
      .widget-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
      }

      @media (max-width: 600px) {
        .widget-grid {
          grid-template-columns: 1fr;
        }
      }

      .featured-story {
        padding: 16px;
        border-right: 1px solid ${border};
        text-decoration: none;
        color: ${text};
        transition: background-color 0.15s ease;
      }

      @media (max-width: 600px) {
        .featured-story {
          border-right: none;
          border-bottom: 1px solid ${border};
        }
      }

      .featured-story:hover {
        background: ${hoverBg};
      }

      .featured-image {
        aspect-ratio: 16/9;
        border-radius: 8px;
        overflow: hidden;
        margin-bottom: 12px;
        background: ${border};
      }

      .featured-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .featured-title {
        font-size: 18px;
        font-weight: 600;
        line-height: 1.3;
        margin: 0 0 8px 0;
      }

      .stories-list {
        display: flex;
        flex-direction: column;
      }

      .story-item-compact {
        display: flex;
        gap: 12px;
        padding: 12px;
        text-decoration: none;
        color: ${text};
        border-bottom: 1px solid ${border};
        transition: background-color 0.15s ease;
      }

      .story-item-compact:last-child {
        border-bottom: none;
      }

      .story-item-compact:hover {
        background: ${hoverBg};
      }

      .story-thumb {
        width: 64px;
        height: 64px;
        border-radius: 6px;
        overflow: hidden;
        flex-shrink: 0;
        background: ${border};
      }

      .story-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .loading-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid ${border};
        border-top-color: ${accent || '#3b82f6'};
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 10px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @keyframes fresh-pulse {
        0%, 100% { 
          background: var(--fresh-color, #22c55e); 
          transform: scale(1.2);
          box-shadow: 0 0 6px var(--fresh-color, #22c55e);
        }
        50% { 
          background: var(--accent-color, #3b82f6); 
          transform: scale(1);
          box-shadow: none;
        }
      }

      .fresh-pulse {
        animation: fresh-pulse 2s ease-in-out infinite;
      }
    `;
  }

  function getLoadingHTML() {
    return `
      <div class="widget-loading">
        <div class="loading-spinner"></div>
        <p>Loading headlines...</p>
      </div>
    `;
  }

  function getErrorHTML() {
    return `
      <div class="widget-error">
        <p>Unable to load feed</p>
      </div>
    `;
  }

  // Graceful error that shows a link to the feed instead of breaking
  function getGracefulErrorHTML(feedSlug) {
    return `
      <div class="widget-error">
        <p>Headlines temporarily unavailable</p>
        <a href="https://curatr.pro/feed/${feedSlug}" target="_blank" rel="noopener" style="color: #3b82f6; font-size: 12px;">
          View feed →
        </a>
      </div>
    `;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidgets);
  } else {
    initWidgets();
  }

  // Export version for debugging
  window.curatrWidgetVersion = WIDGET_VERSION;
})();
