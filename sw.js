// sw.js

// Naam van de cache - VERHOOG DIT VERSIENUMMER BIJ ELKE UPDATE VAN sw.js of index.html!
// Zorg ervoor dat dit uniek is en verhoogd wordt bij elke relevante wijziging aan de 'urlsToCache'
// of aan de logica van de Service Worker zelf.
const CACHE_NAME = 'dlml-tools-cache-v5'; // <--- VERHOOGD NAAR v5. VERHOOG DIT NUMMER BIJ ELKE UPDATE!

// Bestanden die offline beschikbaar moeten zijn
// Zorg ervoor dat deze paden exact overeenkomen met de bestanden op GitHub
const urlsToCache = [
  '/Landingpage_voorbeeld/',                 // De hoofdpagina's root URL (bijv. https://yourusername.github.io/Landingpage_voorbeeld/)
  '/Landingpage_voorbeeld/index.html',       // <--- BELANGRIJK: CORRECTE BESTANDSNAAM index.html
  '/Landingpage_voorbeeld/manifest.json',    // Het manifest bestand
  '/Landingpage_voorbeeld/icon-192x192.png', // Het 192x192 PWA icoon
  '/Landingpage_voorbeeld/icon-512x512.png', // Het 512x512 PWA icoon
  '/Landingpage_voorbeeld/favicon.ico',      // Het favicon bestand
  // Voeg hier eventuele andere *essentiële* statische bestanden toe die je lokaal host
  // bijv. 'style.css', 'script.js' als die er zouden zijn.
];

// Installatie event: Cache de bestanden
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing... Cache Name:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        // Gebruik addAll, maar vang fouten op voor het geval een bestand niet kan worden gecached
        // addAll zal mislukken als een van de URLs niet bereikbaar is, wat de installatie van de SW voorkomt.
        // Dit is meestal wenselijk voor de 'app shell'.
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installatie compleet, bestanden zijn gecached in', CACHE_NAME);
        // Forceer de nieuwe service worker om direct actief te worden.
        // Dit betekent dat de nieuwe SW de controle overneemt van de oude SW zodra deze geïnstalleerd is,
        // zonder dat de gebruiker de pagina hoeft te sluiten en opnieuw te openen.
        self.skipWaiting();
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
       // self.clients.claim() zorgt ervoor dat de Service Worker controle krijgt over
       // alle bestaande en nieuwe clients (tabbladen) binnen zijn scope.
       return self.clients.claim();
    })
  );
  console.log('Service Worker: Activatie compleet voor cache', CACHE_NAME);
});

// Fetch event: Reageer op netwerkverzoeken
self.addEventListener('fetch', (event) => {
  // We reageren alleen op GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // === STRATEGIE VOOR DE HOOFDPAGINA (index.html) ===
  // Gebruik een 'Network-first, then cache' strategie voor je hoofdpagina.
  // Dit zorgt ervoor dat je altijd de nieuwste versie van de HTML probeert te krijgen,
  // maar wel een fallback hebt als je offline bent.
  // Dit is cruciaal voor snelle updates van de HTML inhoud.
  const mainPagePaths = [
    '/Landingpage_voorbeeld/',
    '/Landingpage_voorbeeld/index.html',
    '/' // Voor het geval de root direct wordt opgevraagd (hoewel /Landingpage_voorbeeld/ de primaire is)
  ];
  if (mainPagePaths.includes(requestUrl.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Als de netwerk respons geldig is, cache deze voor toekomstig gebruik
          if (networkResponse && networkResponse.status === 200) {
            // Kloon de response want streams kunnen maar één keer gelezen worden.
            // Eén voor de browser, één voor de cache.
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Netwerk mislukt (bijv. offline), probeer dan uit de cache te halen
          console.warn('Service Worker: Network failed for main page, falling back to cache.');
          return caches.match(event.request);
        })
    );
    return; // Belangrijk: stop hier met verdere verwerking van deze fetch
  }

  // === STRATEGIE VOOR ALLE ANDERE LOKALE BESTANDEN (urlsToCache) ===
  // Voor overige statische assets die we expliciet in urlsToCache hebben gezet: Cache-first.
  // Dit is efficiënt omdat de browser de cache eerst controleert.
  // Zorg ervoor dat de request URL overeenkomt met een van de gecachte URLs
  if (event.request.url.startsWith(self.location.origin) && urlsToCache.some(url => requestUrl.pathname.endsWith(url.replace('/Landingpage_voorbeeld/', '')))) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Als het in de cache zit, retourneer het direct
          if (response) {
            return response;
          }

          // Zo niet, probeer het van het netwerk te halen en cache het voor de volgende keer
          return fetch(event.request).then(
            (networkResponse) => {
              if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              return networkResponse;
            }
          );
        })
        .catch(error => {
            console.error('Service Worker: Fetch error for cached asset, likely offline:', event.request.url, error);
            // Hier kun je een offline fallback pagina/afbeelding teruggeven indien gewenst
            // return caches.match('/Landingpage_voorbeeld/offline.html');
            // Optioneel: Voor assets (niet de hoofdpagina), als netwerk en cache falen, geef null terug.
            return new Response(null, { status: 503, statusText: 'Service Unavailable' });
        })
    );
    return; // Belangrijk: stop hier met verdere verwerking van deze fetch
  }

  // === STRATEGIE VOOR EXTERNE BRONNEN (CDN's, Iframes, etc.) ===
  // Verzoeken voor externe bronnen (zoals Bootstrap, FontAwesome CDN's, Tidio,
  // en de inhoud van je iframes op fredje4711.github.io)
  // worden NIET door deze Service Worker gecached. Ze gaan direct naar het netwerk.
  // Dit is de meest gangbare en veilige aanpak voor externe content.
  event.respondWith(fetch(event.request));
});

// Eenvoudig commentaar om versie bij te houden en updates te forceren
// Version: 5