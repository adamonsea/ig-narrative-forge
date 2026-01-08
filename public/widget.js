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
  const WIDGET_VERSION = '1.0.0';

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
    wrapper.innerHTML = getLoadingHTML();
    shadow.appendChild(wrapper);

    // Fetch data and render
    fetchFeedData(feedSlug, maxStories)
      .then(data => {
        wrapper.innerHTML = renderWidget(data, prefersDark, accentColor, layout);
      })
      .catch(error => {
        console.error('Curatr Widget Error:', error);
        wrapper.innerHTML = getErrorHTML();
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

  function renderWidget(data, isDark, accentOverride, layout = 'compact') {
    const { feed, stories } = data;
    const accent = accentOverride || feed.brand_color || '#3b82f6';

    if (!stories || stories.length === 0) {
      return `
        <div class="widget-empty">
          <p>No stories available</p>
        </div>
      `;
    }

    // Prefer icon_url (favicon) for circular avatar, fallback to logo_url
    const avatarUrl = feed.icon_url || feed.logo_url;
    const logoHTML = avatarUrl 
      ? `<img src="${avatarUrl}" alt="${feed.name}" class="widget-logo" />`
      : `<span class="widget-logo-text" style="background: ${accent}">${feed.name.charAt(0)}</span>`;

    // Wide layout with featured story + list
    if (layout === 'wide' && stories.length > 0) {
      const featured = stories[0];
      const remaining = stories.slice(1);

      const featuredImageHTML = featured.image_url 
        ? `<div class="featured-image"><img src="${featured.image_url}" alt="" /></div>`
        : '';

      const remainingHTML = remaining.map(story => {
        const thumbHTML = story.image_url 
          ? `<div class="story-thumb"><img src="${story.image_url}" alt="" /></div>`
          : '';
        const sourceHTML = story.source_name 
          ? `<span class="story-source">${escapeHTML(story.source_name)}</span>`
          : '';
        return `
          <a href="${story.url}" target="_blank" rel="noopener" class="story-item-compact">
            ${thumbHTML}
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

      return `
        <div class="widget-header">
          ${logoHTML}
          <span class="widget-name">${escapeHTML(feed.name)}</span>
        </div>
        <div class="widget-grid">
          <a href="${featured.url}" target="_blank" rel="noopener" class="featured-story">
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
            View all stories →
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
      
      return `
        <a href="${story.url}" target="_blank" rel="noopener" class="story-item">
          <span class="story-bullet" style="background: ${accent}"></span>
          <div class="story-content">
            <span class="story-title">${escapeHTML(story.title)}</span>
            ${sourceHTML}
          </div>
        </a>
      `;
    }).join('');

    return `
      <div class="widget-header">
        ${logoHTML}
        <span class="widget-name">${escapeHTML(feed.name)}</span>
      </div>
      <div class="widget-stories">
        ${storiesHTML}
      </div>
      <div class="widget-footer">
        <a href="https://curatr.pro/feed/${feed.slug}" target="_blank" rel="noopener" class="widget-cta" style="color: ${accent}">
          View all stories →
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
