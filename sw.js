const CACHE_NAME = "our-date-shell-v1";

const SHELL_FILES = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];


self.addEventListener(
  "install",
  event => {

    event.waitUntil(
      caches
        .open(
          CACHE_NAME
        )
        .then(
          cache =>
            cache.addAll(
              SHELL_FILES
            )
        )
    );


    self.skipWaiting();

  }
);


self.addEventListener(
  "activate",
  event => {

    event.waitUntil(
      caches
        .keys()
        .then(
          keys =>
            Promise.all(
              keys
                .filter(
                  key =>
                    key !==
                    CACHE_NAME
                )
                .map(
                  key =>
                    caches.delete(
                      key
                    )
                )
            )
        )
    );


    self.clients.claim();

  }
);


self.addEventListener(
  "fetch",
  event => {

    const request =
      event.request;


    if (
      request.method !==
      "GET"
    ) {

      return;

    }


    const url =
      new URL(
        request.url
      );


    /*
      HTML 이동은 network-first.
      새 배포가 있으면 항상 최신 index.html을 우선 사용하고,
      네트워크가 완전히 끊겼을 때만 마지막 앱 셸을 사용한다.
    */
    if (
      request.mode ===
      "navigate"
    ) {

      event.respondWith(
        fetch(
          request
        )
        .then(
          response => {

            const copy =
              response.clone();


            caches
              .open(
                CACHE_NAME
              )
              .then(
                cache =>
                  cache.put(
                    "/",
                    copy
                  )
              );


            return response;

          }
        )
        .catch(
          () =>
            caches.match(
              "/"
            )
        )
      );


      return;

    }


    /*
      PWA 자체 정적 파일만 캐시.
      Supabase/Kakao/CDN 요청은 건드리지 않아서
      기존 서버 동작과 업데이트 흐름을 방해하지 않는다.
    */
    if (
      url.origin ===
      self.location.origin
      &&
      (
        url.pathname ===
        "/manifest.webmanifest"
        ||
        url.pathname.startsWith(
          "/icons/"
        )
      )
    ) {

      event.respondWith(
        caches
          .match(
            request
          )
          .then(
            cached =>
              cached
              ||
              fetch(
                request
              )
          )
      );

    }

  }
);
