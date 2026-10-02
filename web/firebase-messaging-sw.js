importScripts(
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js'
);

importScripts(
  'https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: 'AIzaSyBmOSeFATXjM-frpSy5b_2peQCC4yX1_nA',
  authDomain: 'fesync-app-2026.firebaseapp.com',
  projectId: 'fesync-app-2026',
  storageBucket: 'fesync-app-2026.firebasestorage.app',
  messagingSenderId: '336914296469',
  appId: '1:336914296469:web:ea3a8b35f66a6e99cf759c',
});

const messaging = firebase.messaging();

function crearUrlNotificacion(data) {
  const params = new URLSearchParams();

  params.set(
    'fesyncNotification',
    '1'
  );

  Object.entries(data || {}).forEach(
    ([key, value]) => {
      if (
        value !== null &&
        value !== undefined
      ) {
        params.set(
          key,
          String(value)
        );
      }
    }
  );

  return `/?${params.toString()}`;
}

messaging.onBackgroundMessage(
  (payload) => {
    console.log(
      '[firebase-messaging-sw.js] Mensaje background:',
      payload
    );

    const notification =
      payload.notification || {};

    const data =
      payload.data || {};

    const title =
      notification.title || 'FeSync';

    const options = {
      body:
        notification.body ||
        'Tienes una nueva notificación.',
      icon:
        '/icons/Icon-192.png',
      badge:
        '/icons/Icon-192.png',
      data: {
        ...data,
        url:
          crearUrlNotificacion(data),
      },
    };

    return self.registration
      .showNotification(
        title,
        options
      );
  }
);

self.addEventListener(
  'notificationclick',
  (event) => {
    event.notification.close();

    const targetUrl =
      event.notification.data?.url ||
      '/';

    event.waitUntil(
      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then(
          async (clientList) => {
            for (
              const client
              of clientList
            ) {
              if (
                'focus' in client &&
                client.url.startsWith(
                  self.location.origin
                )
              ) {
                if (
                  'navigate' in client
                ) {
                  await client.navigate(
                    targetUrl
                  );
                }

                return client.focus();
              }
            }

            if (
              clients.openWindow
            ) {
              return clients.openWindow(
                targetUrl
              );
            }

            return undefined;
          }
        )
    );
  }
);