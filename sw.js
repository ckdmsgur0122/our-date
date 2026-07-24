const CACHE_NAME = "our-date-shell-v2";

const SHELL_FILES = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-v2-192.png",
  "/icons/icon-v2-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // HTML 이동은 network-first
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put("/", copy);
          });

          return response;
        })
        .catch(() => caches.match("/"))
    );

    return;
  }

  // manifest와 아이콘만 캐시
  if (
    url.origin === self.location.origin &&
    (
      url.pathname === "/manifest.webmanifest" ||
      url.pathname.startsWith("/icons/")
    )
  ) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});
