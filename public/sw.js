/* Service Worker for push notifications and notification handling */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(self.clients.claim());
});

// Handle push notifications with topic branding
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  let data = { 
    title: 'New Update', 
    body: 'You have new content',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    url: '/',
    topic: '',
    color: '#000000'
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      // Handle nested notification structure
      if (payload.notification) {
        data = { ...data, ...payload.notification };
      } else {
        data = { ...data, ...payload };
      }
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body || 'New content available',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.topic || 'general', // Group notifications by topic
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
      topic: data.topic || '',
      color: data.color || '#000000'
    },
    actions: data.actions || [
      { action: 'open', title: 'Read Now' },
      { action: 'close', title: 'Dismiss' }
    ],
    requireInteraction: false,
    vibrate: [200, 100, 200],
    // Apply topic color if available
    ...(data.color && { color: data.color })
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'New Update', options)
  );
});

// Handle notification clicks with action support
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked', event.action);
  const notification = event.notification;
  const url = (notification && notification.data && notification.data.url) || '/';
  
  // Handle action buttons
  if (event.action === 'close') {
    notification.close();
    return;
  }
  
  // Default action (open) or clicking the notification body
  notification.close();

  event.waitUntil((async () => {
    try {
      const clientList = await self.clients.matchAll({ 
        type: 'window', 
        includeUncontrolled: true 
      });
      
      // Try to focus an existing tab with the same origin first
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client && url) {
            try {
              await client.navigate(url);
            } catch (navError) {
              console.error('[SW] Navigation failed, opening new window:', navError);
              await self.clients.openWindow(url);
            }
          }
          return;
        }
      }
      
      // If no matching window is open, open a new one
      await self.clients.openWindow(url);
    } catch (err) {
      console.error('[SW] Error handling notification click:', err);
      // Fallback to home page
      await self.clients.openWindow('/');
    }
  })());
});
