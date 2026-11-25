/**
 * Curatr Embeddable Widget
 * Displays feed headlines with branding
 * 
 * Usage:
 * <div id="curatr-widget" 
 *      data-feed="your-feed-slug"
 *      data-max="5"
 *      data-theme="auto"
 *      data-accent="#3b82f6"
 *      data-content="auto"    <!-- auto | stories | events | both -->
 *      data-style="list">     <!-- list (headlines) | cards (swipeable feed-style cards; both = one mixed row) -->
 * </div>
 * <script src="https://curatr.pro/widget.js" async></script>
 */
(function() {
  'use strict';

  const API_BASE = 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1';
  const WIDGET_VERSION = '1.7.0';
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
    const showSubscribe = container.dataset.subscribe === 'true' || container.dataset.subscribe === '';
    // Email cadence readers sign up for. Embeds without data-frequency stay daily.
    const frequency = container.dataset.frequency === 'weekly' ? 'weekly' : 'daily';
    // Per-embed source controls: which publications to show, and which to feature on top
    const sourceList = sanitiseNameList(container.dataset.sources);
    const featuredList = sanitiseNameList(container.dataset.featured);
    // How many days each featured source stays in the featured strip (1-5, default 2).
    // Either one value for all, or a comma list matching data-featured order.
    const featuredDays = String(container.dataset.featuredDays || '')
      .split(',')
      .map(function (v) {
        const n = parseInt(v.trim(), 10);
        return isNaN(n) ? 2 : Math.min(5, Math.max(1, n));
      })
      .slice(0, 25)
      .join(',');
    // What to show: news, upcoming events, or both behind News | What's on tabs (auto = the feed decides)
    const content = ['stories', 'events', 'both'].indexOf(container.dataset.content) >= 0 ? container.dataset.content : 'auto';
    // Builder previews never count as impressions or clicks
    const preview = container.dataset.preview === 'true';
    // Look: headline list (default, unchanged) or a swipeable row of feed-style cards
    const style = container.dataset.style === 'cards' ? 'cards' : 'list';
    const variantKey = `${sourceList}|${featuredList}|${featuredDays}|${content}|${style}`;

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
    const cached = getCachedData(feedSlug, variantKey);
    if (cached) {
      wrapper.innerHTML = renderWidget(cached, prefersDark, accentColor, layout, customTitle, customAvatar, showSubscribe, frequency, style);
      attachClickHandlers(shadow, feedSlug, preview);
      attachCardNav(shadow);
      attachSubscribeHandler(shadow, feedSlug, cached, frequency);
    } else {
      wrapper.innerHTML = getLoadingHTML();
    }
    shadow.appendChild(wrapper);

    // Fetch fresh data
    fetchFeedData(feedSlug, maxStories, sourceList, featuredList, featuredDays, content, style)
      .then(data => {
        // Cache the successful response
        setCachedData(feedSlug, data, variantKey);
        
        wrapper.innerHTML = renderWidget(data, prefersDark, accentColor, layout, customTitle, customAvatar, showSubscribe, frequency, style);
        
        // Track impression after successful render (only if not cached initially)
        if (!cached && !preview) {
          trackEvent(feedSlug, 'impression');
        }
        
        // Attach click handlers for story tracking and the News | What's on tabs
        attachClickHandlers(shadow, feedSlug, preview);
        attachCardNav(shadow);
        attachSubscribeHandler(shadow, feedSlug, data, frequency);
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

  // Keep only safe publication-name characters from a comma separated list
  function sanitiseNameList(raw) {
    if (!raw) return '';
    return String(raw)
      .slice(0, 600)
      .split(',')
      .map(n => n.replace(/[^\w &'\u2019.\-]/g, '').trim())
      .filter(n => n.length > 0 && n.length <= 80)
      .slice(0, 25)
      .join(',');
  }

  // Cache management for graceful degradation
  function getCacheKey(feedSlug, variantKey) {
    return `curatr_widget_cache_${WIDGET_VERSION}_${feedSlug}_${variantKey || ''}`;
  }

  function getCachedData(feedSlug, variantKey) {
    try {
      const cached = localStorage.getItem(getCacheKey(feedSlug, variantKey));
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      
      // Check if cache is still valid
      if (Date.now() - timestamp > CACHE_TTL_MS) {
        localStorage.removeItem(getCacheKey(feedSlug, variantKey));
        return null;
      }
      
      return data;
    } catch (e) {
      return null;
    }
  }

  function setCachedData(feedSlug, data, variantKey) {
    try {
      localStorage.setItem(getCacheKey(feedSlug, variantKey), JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e) {
      // localStorage full or unavailable - ignore
    }
  }

  // Attach click handlers to track story and event clicks, and switch tabs
  function attachClickHandlers(shadow, feedSlug, preview) {
    if (!preview) {
      shadow.querySelectorAll('[data-story-id]').forEach(link => {
        link.addEventListener('click', () => {
          trackEvent(feedSlug, 'click', link.dataset.storyId || null);
        });
      });
      shadow.querySelectorAll('[data-event-id]').forEach(link => {
        link.addEventListener('click', () => trackEvent(feedSlug, 'click'));
      });
    }
    attachTabHandlers(shadow);
  }

  function attachTabHandlers(shadow) {
    const tabs = Array.prototype.slice.call(shadow.querySelectorAll('.widget-tab'));
    if (tabs.length === 0) return;
    const select = (tab) => {
      const key = tab.dataset.tab;
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
      });
      shadow.querySelectorAll('[data-panel]').forEach(el => {
        if (el.dataset.panel === key) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      });
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus();
        select(next);
      });
    });
  }

  // Previous / next buttons for the cards row; hidden when every card already fits
  function attachCardNav(shadow) {
    const nav = shadow.querySelector('.card-nav');
    if (!nav) return;
    const prev = nav.querySelector('.card-prev');
    const next = nav.querySelector('.card-next');
    const visibleRow = () => {
      const rows = Array.prototype.slice.call(shadow.querySelectorAll('.card-row'));
      return rows.find(r => !r.closest('[hidden]')) || null;
    };
    const update = () => {
      const row = visibleRow();
      const overflow = !!row && row.scrollWidth > row.clientWidth + 2;
      if (overflow) nav.removeAttribute('hidden'); else nav.setAttribute('hidden', '');
      if (!row) return;
      prev.disabled = row.scrollLeft <= 2;
      next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
    };
    const go = (dir) => {
      const row = visibleRow();
      if (!row) return;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      row.scrollBy({ left: dir * Math.max(200, row.clientWidth * 0.85), behavior: reduce ? 'auto' : 'smooth' });
    };
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    shadow.querySelectorAll('.card-row').forEach(row => row.addEventListener('scroll', update, { passive: true }));
    shadow.querySelectorAll('.widget-tab').forEach(tab => tab.addEventListener('click', () => setTimeout(update, 0)));
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      shadow.querySelectorAll('.card-row').forEach(row => ro.observe(row));
    }
    shadow.querySelectorAll('.card-row img').forEach(img => img.addEventListener('load', update, { once: true }));
    update();
  }

  async function fetchFeedData(feedSlug, maxStories, sourceList, featuredList, featuredDays, content, style) {
    let url = `${API_BASE}/widget-feed-data?feed=${encodeURIComponent(feedSlug)}&max=${maxStories}`;
    if (content && content !== 'auto') url += `&content=${content}`;
    if (style === 'cards') url += '&style=cards';
    if (sourceList) url += `&sources=${encodeURIComponent(sourceList)}`;
    if (featuredList) url += `&featured=${encodeURIComponent(featuredList)}`;
    if (featuredList && featuredDays) url += `&featuredDays=${encodeURIComponent(featuredDays)}`;

    const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status}`);
    }

    return response.json();
  }


  // ---- Subscribe box -------------------------------------------------
  function subscribeStorageKey(feedSlug) {
    return `curatr_widget_subscribed_${feedSlug}`;
  }

  function isAlreadySubscribed(feedSlug) {
    try {
      return localStorage.getItem(subscribeStorageKey(feedSlug)) === 'true';
    } catch (e) {
      return false;
    }
  }

  function markSubscribed(feedSlug) {
    try {
      localStorage.setItem(subscribeStorageKey(feedSlug), 'true');
    } catch (e) {
      // ignore
    }
  }

  function getSubscribeHTML(feed, accent, frequency) {
    if (isAlreadySubscribed(feed.slug)) {
      return `
        <div class="widget-subscribe">
          <p class="subscribe-done">You're subscribed to email highlights.</p>
        </div>
      `;
    }

    const label = feed.readers_rounded >= 250
      ? `Read by ${Number(feed.readers_rounded).toLocaleString('en-GB')}+ local people. Get the highlights ${frequency === 'weekly' ? 'weekly' : 'daily'}.`
      : frequency === 'weekly'
        ? 'Subscribe to the weekly briefing'
        : 'Subscribe to daily email highlights';

    return `
      <div class="widget-subscribe">
        <label class="subscribe-label" for="curatr-subscribe-email">${label}</label>
        <form class="subscribe-form" novalidate>
          <input
            id="curatr-subscribe-email"
            class="subscribe-input"
            type="email"
            name="email"
            placeholder="you@example.com"
            autocomplete="email"
            required
          />
          <button type="submit" class="subscribe-button" style="background: ${accent}">Subscribe</button>
        </form>
        <p class="subscribe-message" role="status" aria-live="polite"></p>
      </div>
    `;
  }

  function attachSubscribeHandler(shadow, feedSlug, data, frequency) {
    const notificationType = frequency === 'weekly' ? 'weekly' : 'daily';
    const root = shadow.querySelector('.widget-subscribe');
    if (!root) return;

    const form = root.querySelector('.subscribe-form');
    if (!form) return;

    const input = form.querySelector('.subscribe-input');
    const button = form.querySelector('.subscribe-button');
    const message = root.querySelector('.subscribe-message');
    const topicId = data && data.feed ? data.feed.id : null;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = (input.value || '').trim();
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

      if (!emailRegex.test(email)) {
        message.textContent = 'Please enter a valid email address.';
        message.className = 'subscribe-message error';
        return;
      }

      if (!topicId) {
        message.textContent = 'Subscriptions are unavailable right now.';
        message.className = 'subscribe-message error';
        return;
      }

      button.disabled = true;
      input.disabled = true;
      const originalLabel = button.textContent;
      button.textContent = 'Sending\u2026';
      message.textContent = '';
      message.className = 'subscribe-message';

      try {
        const response = await fetch(`${API_BASE}/secure-newsletter-signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, topicId, notificationType, source: 'widget' })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(result.error || 'Subscription failed. Please try again.');
        }

        markSubscribed(feedSlug);
        trackEvent(feedSlug, 'subscribe');
        root.innerHTML = '<p class="subscribe-done">Check your inbox to confirm your subscription.</p>';
      } catch (error) {
        button.disabled = false;
        input.disabled = false;
        button.textContent = originalLabel;
        message.textContent = error && error.message ? error.message : 'Subscription failed. Please try again.';
        message.className = 'subscribe-message error';
      }
    });
  }

  function renderWidget(data, isDark, accentOverride, layout = 'compact', customTitle = '', customAvatar = '', showSubscribe = false, frequency = 'daily', style = 'list') {
    const feed = data.feed;
    const stories = data.stories || [];
    const events = data.events || [];
    // Older cached responses have no content field: they were news-only
    const content = data.content === 'events' || data.content === 'both' ? data.content : 'stories';
    const accent = accentOverride || feed.brand_color || '#3b82f6';
    const displayName = customTitle || feed.name;

    if (content === 'stories' && stories.length === 0) {
      return `<div class="widget-empty"><p>No stories available</p></div>`;
    }
    if (content === 'events' && events.length === 0) {
      return `<div class="widget-empty"><p>No events coming up</p></div>`;
    }

    // Priority: customAvatar > icon_url > logo_url > text fallback
    const avatarUrl = customAvatar || feed.icon_url || feed.logo_url;
    const logoHTML = avatarUrl 
      ? `<img src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(displayName)}" class="widget-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="widget-logo-text" style="background: ${accent}; display: none;">${escapeHTML(displayName.charAt(0))}</span>`
      : `<span class="widget-logo-text" style="background: ${accent}">${escapeHTML(displayName.charAt(0))}</span>`;

    const wide = layout === 'wide';
    const cards = style === 'cards';
    const storiesCta = feed.stories_this_week > 0 ? `${feed.stories_this_week} stories this week \u2192` : 'View all stories \u2192';
    // Cards showing both: one mixed row in feed order (the data function sends the order)
    const mixed = cards && content === 'both' && Array.isArray(data.mix) && data.mix.length > 0;
    const tabbed = content === 'both' && !mixed;
    const firstTab = mixed ? 'mixed' : content === 'both' ? (feed.first_tab === 'events' ? 'events' : 'stories') : content;
    const panels = [];
    if (mixed) {
      const items = data.mix
        .map(m => m.kind === 'event' ? (events[m.index] && { kind: 'event', item: events[m.index] }) : (stories[m.index] && { kind: 'story', item: stories[m.index] }))
        .filter(Boolean);
      panels.push({ key: 'mixed', body: renderCardRow(items, accent, isDark), cta: 'See the full feed \u2192' });
    }
    if (!mixed && content !== 'events') {
      panels.push({
        key: 'stories',
        body: cards
          ? renderCardRow(stories.map(item => ({ kind: 'story', item })), accent, isDark)
          : wide ? renderStoriesWide(stories, accent) : renderStoriesList(stories, accent),
        cta: storiesCta,
      });
    }
    if (!mixed && content !== 'stories') {
      panels.push({
        key: 'events',
        body: cards
          ? renderCardRow(events.map(item => ({ kind: 'event', item })), accent, isDark)
          : wide ? renderEventsWide(events, accent) : renderEventsList(events, accent),
        cta: eventsCtaText(Number(feed.events_upcoming) || events.length, Number(feed.events_lookup) || 50),
      });
    }

    const tabsHTML = tabbed
      ? `<div class="widget-tabs" role="tablist" aria-label="Show">
          ${panels.map(p => `<button type="button" role="tab" class="widget-tab" data-tab="${p.key}" aria-selected="${p.key === firstTab}" tabindex="${p.key === firstTab ? 0 : -1}" style="--tab-accent: ${accent}">${p.key === 'events' ? 'What&rsquo;s on' : 'News'}</button>`).join('')}
        </div>`
      : '';
    const hiddenAttr = (key) => (key === firstTab ? '' : ' hidden');
    const panelsHTML = panels.map(p =>
      `<div class="widget-panel" data-panel="${p.key}"${tabbed ? ' role="tabpanel"' : ''}${hiddenAttr(p.key)}>${p.body}</div>`
    ).join('');
    const ctaHTML = panels.map(p =>
      `<a href="https://curatr.pro/@${encodeURIComponent(feed.slug)}" target="_blank" rel="noopener" class="widget-cta" data-panel="${p.key}" style="color: ${accent}"${hiddenAttr(p.key)}>${p.cta}</a>`
    ).join('');

    return `
      <div class="widget-header">
        ${logoHTML}
        <span class="widget-name">${escapeHTML(displayName)}</span>
        ${tabsHTML}
        ${cards ? `<span class="card-nav" hidden>
          <button type="button" class="card-btn card-prev" aria-label="Previous">&#8249;</button>
          <button type="button" class="card-btn card-next" aria-label="Next">&#8250;</button>
        </span>` : ''}
      </div>
      ${panelsHTML}
      ${showSubscribe ? getSubscribeHTML(feed, accent, frequency) : ''}
      <div class="widget-footer">
        <span class="widget-ctas">${ctaHTML}</span>
        <span class="widget-attribution">
          Powered by <a href="https://curatr.pro" target="_blank" rel="noopener">Curatr</a>
        </span>
      </div>
    `;
  }

  function eventsCtaText(count, cap) {
    if (count <= 0) return 'See what&rsquo;s on \u2192';
    if (count >= cap) return `${cap}+ events coming up \u2192`;
    return count === 1 ? '1 event coming up \u2192' : `${count} events coming up \u2192`;
  }

  // ---- Cards (feed-style tiles) ----------------------------------------
  function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function ageText(minutes) {
    if (typeof minutes !== 'number' || minutes < 0) return '';
    if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    const days = Math.floor(minutes / 1440);
    return days === 1 ? 'Yesterday' : `${days}d ago`;
  }

  function storyCardHTML(story) {
    if (!isValidUrl(story.url)) return '';
    const image = isValidUrl(story.image_url)
      ? `<img src="${escapeHTML(story.image_url)}" alt="" loading="lazy" />`
      : '';
    const meta = [story.source_name, ageText(story.age_minutes)].filter(Boolean).map(escapeHTML).join(' \u00b7 ');
    return `
      <a href="${escapeHTML(story.url)}" target="_blank" rel="noopener" class="feed-card story-card" data-story-id="${escapeHTML(story.id || '')}">
        <span class="card-media">${image}</span>
        <span class="card-body">
          ${story.trending ? '<span class="story-trending">Trending</span>' : story.most_read ? '<span class="story-trending">Most read</span>' : ''}
          <span class="card-title">${escapeHTML(story.title)}</span>
          ${meta ? `<span class="card-meta card-foot">${meta}</span>` : ''}
        </span>
      </a>
    `;
  }

  function eventCardHTML(ev, accent, isDark) {
    if (!isValidUrl(ev.url)) return '';
    const d = eventDate(ev);
    const tint = hexToRgba(accent, isDark ? 0.28 : 0.16);
    const dots = hexToRgba(accent, isDark ? 0.4 : 0.28);
    const media = isValidUrl(ev.image_url)
      ? `<img src="${escapeHTML(ev.image_url)}" alt="" loading="lazy" />`
      : `<span class="event-tint"${tint ? ` style="background-color: ${tint}; --dots: ${dots}"` : ''}></span>`;
    const when = [d && d.when, ev.start_time].filter(Boolean).map(escapeHTML).join(' \u00b7 ');
    return `
      <a href="${escapeHTML(ev.url)}" target="_blank" rel="noopener" class="feed-card event-card" data-event-id="${escapeHTML(ev.id || '')}">
        <span class="card-media">
          ${media}
          ${ev.category ? `<span class="card-pill">${escapeHTML(ev.category)}</span>` : ''}
          ${d ? `<span class="card-date" aria-hidden="true"><span class="event-month" style="color: ${accent}">${escapeHTML(d.month)}</span><span class="event-day">${d.day}</span></span>` : ''}
        </span>
        <span class="card-body${d ? ' has-date' : ''}">
          <span class="card-title card-title-event">${escapeHTML(ev.title)}</span>
          ${when ? `<span class="card-meta card-when">${when}</span>` : ''}
          ${ev.venue ? `<span class="card-meta">${escapeHTML(ev.venue)}</span>` : ''}
          ${ev.price ? `<span class="card-meta card-foot">${escapeHTML(ev.price)}</span>` : ''}
        </span>
      </a>
    `;
  }

  function renderCardRow(items, accent, isDark) {
    const html = items
      .map(({ kind, item }) => kind === 'event' ? eventCardHTML(item, accent, isDark) : storyCardHTML(item))
      .join('');
    return `<div class="card-row" tabindex="0" aria-label="Swipe for more">${html}</div>`;
  }

  // ---- Events -----------------------------------------------------------
  function eventDate(ev) {
    const parts = String(ev.start_date || '').split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.round((date - today) / 86400000);
    return {
      day: parts[2],
      month: date.toLocaleDateString('en-GB', { month: 'short' }),
      when: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : date.toLocaleDateString('en-GB', { weekday: 'short' }),
    };
  }

  function eventMeta(ev, d) {
    return [d && d.when, ev.start_time, ev.venue, ev.price].filter(Boolean).map(escapeHTML).join(' \u00b7 ');
  }

  function dateTileHTML(d, accent) {
    if (!d) return '';
    return `<span class="event-date" aria-hidden="true"><span class="event-month" style="color: ${accent}">${escapeHTML(d.month)}</span><span class="event-day">${d.day}</span></span>`;
  }

  function eventRowHTML(ev, accent) {
    if (!isValidUrl(ev.url)) return '';
    const d = eventDate(ev);
    return `
      <a href="${escapeHTML(ev.url)}" target="_blank" rel="noopener" class="event-item" data-event-id="${escapeHTML(ev.id || '')}">
        ${dateTileHTML(d, accent)}
        <div class="story-content">
          <span class="story-title">${escapeHTML(ev.title)}</span>
          <span class="event-meta">${eventMeta(ev, d)}</span>
        </div>
      </a>
    `;
  }

  function renderEventsList(events, accent) {
    return `<div class="widget-stories">${events.map(ev => eventRowHTML(ev, accent)).join('')}</div>`;
  }

  function renderEventsWide(events, accent) {
    const featured = events.find(ev => isValidUrl(ev.url));
    if (!featured) return renderEventsList(events, accent);
    const d = eventDate(featured);
    const imageHTML = isValidUrl(featured.image_url)
      ? `<div class="featured-image"><img src="${escapeHTML(featured.image_url)}" alt="" loading="lazy" /></div>`
      : '';
    return `
      <div class="widget-grid">
        <a href="${escapeHTML(featured.url)}" target="_blank" rel="noopener" class="featured-story" data-event-id="${escapeHTML(featured.id || '')}">
          ${imageHTML}
          <div class="featured-event-head">
            ${dateTileHTML(d, accent)}
            <h3 class="featured-title">${escapeHTML(featured.title)}</h3>
          </div>
          <span class="event-meta">${eventMeta(featured, d)}</span>
        </a>
        <div class="stories-list">
          ${events.filter(ev => ev !== featured).map(ev => eventRowHTML(ev, accent)).join('')}
        </div>
      </div>
    `;
  }

  // ---- Stories ----------------------------------------------------------
  function renderStoriesWide(stories, accent) {
    const featured = stories[0];
    const remaining = stories.slice(1);

    const featuredImageHTML = featured.image_url 
      ? `<div class="featured-image"><img src="${featured.image_url}" alt="" /></div>`
      : '';

    const remainingFeatured = remaining.filter(s => s.featured).length;
    const remainingHTML = remaining.map((story, index) => {
      const sourceHTML = story.source_name 
        ? `<span class="story-source">${escapeHTML(story.source_name)}</span>`
        : '';
      // Fresh stories (< 2 hours) get a pulsing bullet with green transition
      const isFresh = story.age_minutes !== undefined && story.age_minutes < 120;
      const bulletClass = isFresh ? 'story-bullet fresh-pulse' : 'story-bullet';
      const bulletStyle = isFresh 
        ? `--accent-color: ${accent}; --fresh-color: #22c55e;`
        : `background: ${accent}`;
      // Mark where the featured run ends
      const labelHTML = (remainingFeatured > 0 && index === remainingFeatured)
        ? '<div class="section-label">Latest</div>'
        : '';
      return `
        ${labelHTML}
        <a href="${story.url}" target="_blank" rel="noopener" class="story-item-compact" data-story-id="${story.id || ''}">
          <span class="${bulletClass}" style="${bulletStyle}"></span>
          <div class="story-content">
            <span class="story-title">${escapeHTML(story.title)}</span>
            ${story.trending ? '<span class="story-trending">Trending</span>' : ''}${sourceHTML}
          </div>
        </a>
      `;
    }).join('');

    const featuredSourceHTML = featured.source_name 
      ? `<span class="story-source">${escapeHTML(featured.source_name)}</span>`
      : '';

    return `
      <div class="widget-grid">
        <a href="${featured.url}" target="_blank" rel="noopener" class="featured-story" data-story-id="${featured.id || ''}">
          ${featuredImageHTML}
          <h3 class="featured-title">${escapeHTML(featured.title)}</h3>
          ${featured.trending ? '<span class="story-trending">Trending</span>' : ''}
          ${featuredSourceHTML}
        </a>
        <div class="stories-list">
          ${remainingHTML}
        </div>
      </div>
    `;
  }

  function renderStoriesList(stories, accent) {
    let leadingFeatured = 0;
    while (leadingFeatured < stories.length && stories[leadingFeatured].featured) leadingFeatured++;
    const showSectionLabels = leadingFeatured > 0 && leadingFeatured < stories.length;

    const storiesHTML = stories.map((story, index) => {
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

      let labelHTML = '';
      if (showSectionLabels && index === 0) labelHTML = `<div class="section-label">${stories[0].most_read ? 'Most read' : 'Featured'}</div>`;
      if (showSectionLabels && index === leadingFeatured) labelHTML = '<div class="section-label">Latest</div>';
      
      return `
        ${labelHTML}
        <a href="${story.url}" target="_blank" rel="noopener" class="story-item" data-story-id="${story.id || ''}">
          <span class="${bulletClass}" style="${bulletStyle}"></span>
          <div class="story-content">
            <span class="story-title">${escapeHTML(story.title)}</span>
            ${story.trending ? '<span class="story-trending">Trending</span>' : ''}${sourceHTML}
          </div>
        </a>
      `;
    }).join('');

    return `<div class="widget-stories">${storiesHTML}</div>`;
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
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      [hidden] {
        display: none !important;
      }

      .widget-tabs {
        display: inline-flex;
        flex-shrink: 0;
        padding: 2px;
        border-radius: 999px;
        background: ${sourceBg};
      }

      .widget-tab {
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        padding: 8px 12px;
        min-height: 32px;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: ${textMuted};
        cursor: pointer;
      }

      .widget-tab[aria-selected="true"] {
        background: ${bg};
        color: ${text};
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
      }

      .widget-tab:focus-visible {
        outline: 2px solid var(--tab-accent, ${accent || '#3b82f6'});
        outline-offset: 1px;
      }

      .event-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px;
        margin: 0 -8px;
        border-radius: 8px;
        text-decoration: none;
        color: ${text};
        transition: background-color 0.15s ease;
      }

      .stories-list .event-item {
        margin: 0;
        padding: 12px;
        border-radius: 0;
        border-bottom: 1px solid ${border};
      }

      .stories-list .event-item:last-child {
        border-bottom: none;
      }

      .event-item:hover {
        background: ${hoverBg};
      }

      .event-date {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        flex-shrink: 0;
        border-radius: 8px;
        background: ${sourceBg};
        line-height: 1.05;
      }

      .event-month {
        font-size: 11px;
        font-weight: 700;
      }

      .event-day {
        font-size: 18px;
        font-weight: 700;
        color: ${text};
      }

      .event-meta {
        font-size: 12px;
        color: ${textMuted};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .featured-event-head {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 6px;
      }

      .featured-event-head .featured-title {
        margin: 0;
      }

      .widget-stories {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .story-trending {
        display: inline-block;
        margin-right: 6px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.02em;
        color: ${accent};
      }
      .section-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: ${isDark ? '#9ca3af' : '#6b7280'};
        margin: 10px 0 4px;
      }

      .section-label:first-child {
        margin-top: 0;
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

      .widget-subscribe {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px solid ${border};
      }

      .subscribe-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: ${textMuted};
        margin-bottom: 6px;
      }

      .subscribe-form {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .subscribe-input {
        flex: 1 1 160px;
        min-width: 0;
        padding: 8px 10px;
        font: inherit;
        font-size: 13px;
        color: ${text};
        background: ${bg};
        border: 1px solid ${border};
        border-radius: 8px;
      }

      .subscribe-input:focus {
        outline: 2px solid ${accent || '#3b82f6'};
        outline-offset: 1px;
      }

      .subscribe-button {
        padding: 8px 14px;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        cursor: pointer;
      }

      .subscribe-button:disabled {
        opacity: 0.65;
        cursor: default;
      }

      .subscribe-message {
        margin: 6px 0 0;
        font-size: 12px;
        color: ${textMuted};
      }

      .subscribe-message.error {
        color: #dc2626;
      }

      .subscribe-done {
        margin: 0;
        font-size: 12px;
        color: ${textMuted};
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

      .widget-ctas {
        display: inline-flex;
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

      /* Cards: swipeable row of feed-style tiles */
      .card-nav {
        display: inline-flex;
        gap: 4px;
        flex-shrink: 0;
      }

      .card-btn {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: 1px solid ${border};
        background: ${bg};
        color: ${text};
        font: inherit;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 0 2px;
      }

      .card-btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      .card-btn:focus-visible, .card-row:focus-visible, .feed-card:focus-visible {
        outline: 2px solid ${accent || '#3b82f6'};
        outline-offset: 2px;
      }

      .card-row {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        scroll-padding-left: 16px;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        margin: 0 -16px;
        padding: 2px 16px 8px;
      }

      .card-row::-webkit-scrollbar {
        display: none;
      }

      .feed-card {
        flex: 0 0 ${layout === 'wide' ? 'clamp(220px, calc((100% - 36px) / 4), 280px)' : 'min(76%, 240px)'};
        scroll-snap-align: start;
        display: flex;
        flex-direction: column;
        background: ${isDark ? '#222222' : '#ffffff'};
        border: 1px solid ${border};
        border-radius: 12px;
        overflow: hidden;
        text-decoration: none;
        color: ${text};
        transition: box-shadow 0.2s ease, transform 0.2s ease;
      }

      .feed-card:hover {
        box-shadow: 0 6px 18px rgba(0, 0, 0, ${isDark ? '0.35' : '0.08'});
      }

      .card-media {
        position: relative;
        display: block;
        aspect-ratio: 4 / 3;
        background: ${sourceBg};
        flex-shrink: 0;
      }

      .card-media img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .event-tint {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(var(--dots, transparent) 1px, transparent 1.4px);
        background-size: 14px 14px;
      }

      .card-pill {
        position: absolute;
        top: 10px;
        left: 10px;
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.94);
        color: #1a1a1a;
        font-size: 11px;
        font-weight: 600;
        line-height: 1.4;
      }

      .card-date {
        position: absolute;
        left: 12px;
        bottom: -22px;
        width: 48px;
        height: 52px;
        border-radius: 10px;
        background: ${isDark ? '#222222' : '#ffffff'};
        box-shadow: 0 0 0 4px ${isDark ? '#222222' : '#ffffff'}, 0 2px 8px rgba(0, 0, 0, 0.12);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        line-height: 1.05;
      }

      .card-date .event-day {
        font-size: 20px;
      }

      .card-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
        padding: 12px 14px 14px;
        min-width: 0;
      }

      .card-body.has-date {
        padding-top: 32px;
      }

      .card-title {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.3;
        letter-spacing: -0.01em;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin-bottom: 2px;
      }

      .card-title-event {
        -webkit-line-clamp: 3;
      }

      .card-meta {
        font-size: 12px;
        color: ${textMuted};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .card-when {
        color: ${text};
        font-weight: 600;
      }

      .card-foot {
        margin-top: auto;
        padding-top: 6px;
      }

      .card-when + .card-foot, .card-meta + .card-foot {
        padding-top: 2px;
      }

      @media (prefers-reduced-motion: reduce) {
        .feed-card { transition: none; }
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
        <a href="https://curatr.pro/@${feedSlug}" target="_blank" rel="noopener" style="color: #3b82f6; font-size: 12px;">
          View feed \u2192
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
