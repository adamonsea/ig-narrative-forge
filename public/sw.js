/* Service Worker for push notifications and notification handling */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  let data = { title: 'New Update', body: 'You have new content' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body || 'New content available',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now()
    },
    actions: data.actions || [],
    requireInteraction: false,
    vibrate: [200, 100, 200]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'New Update', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  const notification = event.notification;
  const url = (notification && notification.data && notification.data.url) || '/';
  notification.close();

  event.waitUntil((async () => {
    try {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Try to focus an open tab first
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && url) {
            try {
              await client.navigate(url);
            } catch (_) {
              await self.clients.openWindow(url);
            }
          }
          return;
        }
      }
      // If no window is open, open a new one
      await self.clients.openWindow(url);
    } catch (err) {
      console.error('[SW] Error handling notification click:', err);
      await self.clients.openWindow('/');
    }
  })());
});
