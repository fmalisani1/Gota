const CACHE_NAME = 'gota-shell-v1'
const APP_SCOPE = self.registration.scope
const APP_SHELL = [
  new URL('./', APP_SCOPE).toString(),
  new URL('./index.html', APP_SCOPE).toString(),
  new URL('./manifest.webmanifest', APP_SCOPE).toString(),
  new URL('./favicon.svg', APP_SCOPE).toString(),
  new URL('./icon-192.png', APP_SCOPE).toString(),
  new URL('./icon-512.png', APP_SCOPE).toString(),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_SCOPE, copy))
          return response
        })
        .catch(() =>
          caches
            .match(APP_SCOPE)
            .then((response) => response || caches.match(new URL('./index.html', APP_SCOPE).toString())),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
        }
        return response
      })
    }),
  )
})
