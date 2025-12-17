
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

cleanupOutdatedCaches()

// Precache resources
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
clientsClaim()

// Push Notification Handler
self.addEventListener('push', (event) => {
    let data;
    try {
        data = event.data.json();
    } catch (e) {
        data = { title: 'Bazzeye Notification', body: event.data.text() };
    }

    const title = data.title || 'Bazzeye';
    const options = {
        body: data.body || 'New notification',
        icon: '/pwa-192x192.png', // Ensure this exists or use default
        badge: '/pwa-192x192.png',
        data: data.url || '/'
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data)
    );
});
