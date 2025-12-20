/**
 * eeZee News Embeddable Widget
 * Displays feed headlines with branding
 * 
 * Usage:
 * <div id="eezee-widget" 
 *      data-feed="your-feed-slug"
 *      data-max="5"
 *      data-theme="auto"
 *      data-accent="#3b82f6">
 * </div>
 * <script src="https://eezeenews.lovable.app/widget.js" async></script>
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
    const width = container.dataset.width || '100%';

    if (!feedSlug) {
      console.error('eeZee Widget: Missing data-feed attribute');
      return;
    }

    // Create Shadow DOM for style isolation
    const shadow = container.attachShadow({ mode: 'open' });

    // Detect theme preference
    const prefersDark = theme === 'dark' || 
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    // Inject styles
    const styles = document.createElement('style');
    styles.textContent = getStyles(prefersDark, accentColor, width);
    shadow.appendChild(styles);

    // Create widget container
    const wrapper = document.createElement('div');
    wrapper.className = 'eezee-widget';
    wrapper.innerHTML = getLoadingHTML();
    shadow.appendChild(wrapper);

    // Fetch data and render
    fetchFeedData(feedSlug, maxStories)
      .then(data => {
        wrapper.innerHTML = renderWidget(data, prefersDark, accentColor);
      })
      .catch(error => {
        console.error('eeZee Widget Error:', error);
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

  function renderWidget(data, isDark, accentOverride) {
    const { feed, stories } = data;
    const accent = accentOverride || feed.brand_color || '#3b82f6';

    if (!stories || stories.length === 0) {
      return `
        <div class="widget-empty">
          <p>No stories available</p>
        </div>
      `;
    }

    const logoHTML = feed.logo_url 
      ? `<img src="${feed.logo_url}" alt="${feed.name}" class="widget-logo" />`
      : `<span class="widget-logo-text" style="background: ${accent}">${feed.name.charAt(0)}</span>`;

    const storiesHTML = stories.map(story => `
      <a href="${story.url}" target="_blank" rel="noopener" class="story-item">
        <span class="story-bullet" style="background: ${accent}"></span>
        <span class="story-title">${escapeHTML(story.title)}</span>
      </a>
    `).join('');

    return `
      <div class="widget-header">
        ${logoHTML}
        <span class="widget-name">${escapeHTML(feed.name)}</span>
      </div>
      <div class="widget-stories">
        ${storiesHTML}
      </div>
      <div class="widget-footer">
        <a href="https://eezeenews.lovable.app/feed/${feed.slug}" target="_blank" rel="noopener" class="widget-cta" style="color: ${accent}">
          View all stories →
        </a>
        <span class="widget-attribution">
          Powered by <a href="https://eezeenews.lovable.app" target="_blank" rel="noopener">eeZee News</a>
        </span>
      </div>
    `;
  }

  function getStyles(isDark, accent, width) {
    const bg = isDark ? '#1a1a1a' : '#ffffff';
    const text = isDark ? '#e5e5e5' : '#1a1a1a';
    const textMuted = isDark ? '#a0a0a0' : '#6b7280';
    const border = isDark ? '#333333' : '#e5e7eb';
    const hoverBg = isDark ? '#252525' : '#f9fafb';

    return `
      :host {
        display: block;
        width: ${width};
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

      .story-title {
        flex: 1;
        font-weight: 500;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
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
  window.eezeeWidgetVersion = WIDGET_VERSION;
})();
