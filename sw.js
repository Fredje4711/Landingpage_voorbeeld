// sw.js

// Naam van de cache - VERHOOG DIT VERSIENUMMER BIJ ELKE UPDATE VAN sw.js of index_.html!
const CACHE_NAME = 'dlml-tools-cache-v3'; // <--- VERSIE VERHOOGD NAAR v3

// Bestanden die offline beschikbaar moeten zijn
// Zorg ervoor dat deze paden exact overeenkomen met de bestanden op GitHub
const urlsToCache = [
  '/Landingpage_voorbeeld/',                 // De hoofdpagina zelf (index)
  '/Landingpage_voorbeeld/index_.html',      // Hernoemd bestand expliciet (index_ was gebruikt in eerdere vraag) - PAS AAN INDIEN NODIG
  '/Landingpage_voorbeeld/manifest.json',    // Het manifest bestand
  '/Landingpage_voorbeeld/icon-192x192.png', // Het 192x192 PWA icoon
  '/Landingpage_voorbeeld/icon-512x512.png', // Het 512x512 PWA icoon
  '/Landingpage_voorbeeld/favicon.ico',      // Het favicon bestand
  // Voeg hier eventuele andere *essentiële* statische bestanden toe
];

// Installatie event: Cache de bestanden
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing... Cache Name:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installatie compleet, bestanden zijn gecached in', CACHE_NAME);
        // Forceer de nieuwe service worker om direct actief te worden
        self.skipWaiting(); // <-- GEACTIVEERD
      })
      .catch((error) => {
        console.error('Service Worker: Caching failed for cache', CACHE_NAME, error);
        console.error('Controleer of alle bestanden in urlsToCache bestaan op de opgegeven paden op GitHub!');
      })
  );
});

// Activate event: Ruim oude caches op
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating... Current Cache:', CACHE_NAME);
  const cacheWhitelist = [CACHE_NAME]; // Alleen de huidige cache behouden
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Als een cache-naam niet in de whitelist staat, verwijder die oude cache
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    // Zorg dat de SW de pagina's direct controleert na activatie
    .then(() => {
       console.log('Service Worker: Claiming clients now...');
       return self.clients.claim() // <-- GEACTIVEERD
    })
  );
  console.log('Service Worker: Activatie compleet voor cache', CACHE_NAME);
});

// Fetch event: Reageer op netwerkverzoeken (Cache first strategy voor gecachte items)
self.addEventListener('fetch', (event) => {
  // We reageren alleen op GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Strategie: Cache first for items in urlsToCache, Network first for others?
  // Of simpelweg: probeer cache, dan netwerk.

  // Alleen reageren op verzoeken binnen de scope van de PWA (jouw domein)
  if (!event.request.url.startsWith(self.location.origin)) {
     // Laat externe verzoeken (Bootstrap, Tidio, FontAwesome, iframes) direct naar het netwerk gaan
     return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Gevonden in cache
        if (response) {
          // Optioneel: Achtergrond update check (Stale-While-Revalidate idee)
          // fetch(event.request).then(networkResponse => {
          //   if (networkResponse && networkResponse.ok) {
          //     caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
          //   }
          // });
          return response;
        }

        // Niet in cache -> Netwerk
        // console.log('Service Worker: Not in cache, fetching from network:', event.request.url); // Kan veel logs geven
        return fetch(event.request).then(
          (networkResponse) => {
            // Controleer of we een geldig antwoord hebben
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Kloon het antwoord om het te kunnen cachen en terug te geven
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                 // Alleen cachen als het een van de vooraf gedefinieerde URLs is? Of alles?
                 // Voor nu: cache het als het van het netwerk komt en OK is.
                 // console.log('Service Worker: Caching new resource:', event.request.url); // Kan veel logs geven
                 cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
            console.error('Service Worker: Fetch error, likely offline:', event.request.url, error);
            // Hier kun je een offline fallback pagina teruggeven indien gewenst en gecached
            // return caches.match('/Landingpage_voorbeeld/offline.html');
            throw error;
        });
      })
  );
});

// Eenvoudig commentaar om versie bij te houden en updates te forceren
// Version: 3