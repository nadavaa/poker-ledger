// Minimal service worker: enough to install to the home screen and survive a
// dead moment of wifi. Deliberately not a caching layer for game data —
// buy-ins and settlements must never be served stale.

const SHELL = 'ledger-shell-v1'
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL]))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only page navigations. Everything else — API calls above all — goes
  // straight to the network so nobody ever reads a cached pot total.
  if (request.mode !== 'navigate') return

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((r) => r ?? Response.error())
    )
  )
})
