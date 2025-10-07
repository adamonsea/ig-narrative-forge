/* Service Worker for notification click handling */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const url = (notification && notification.data && notification.data.url) || '/';
  notification.close();

  event.waitUntil((async () => {
    try {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Try to focus an open tab first
      for (const client of clientList) {
        // Only interact with same-origin clients
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && url) {
            try {
              await client.navigate(url);
            } catch (_) {
              // Fallback to opening a new window if navigate fails
              await self.clients.openWindow(url);
            }
          }
          return;
        }
      }
      // If no window is open, open a new one
      await self.clients.openWindow(url);
    } catch (err) {
      // As a last resort, open root
      await self.clients.openWindow('/');
    }
  })());
});
