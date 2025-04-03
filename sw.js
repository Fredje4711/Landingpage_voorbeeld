// Naam van de cache (verander 'v1' als je grote updates doet, bijv. 'v2')
const CACHE_NAME = 'dlml-tools-cache-v2'; // <--- BIJGEWERKTE VERSIE

// Bestanden die offline beschikbaar moeten zijn
// Aangepast voor de GitHub Pages structuur (/Landingpage_voorbeeld/)
const urlsToCache = [
  '/Landingpage_voorbeeld/',                 // De hoofdpagina zelf (index)
  '/Landingpage_voorbeeld/index.html',       // Het HTML-bestand expliciet
  '/Landingpage_voorbeeld/manifest.json',    // Het manifest bestand
  '/Landingpage_voorbeeld/icon-192x192.png', // Het 192x192 PWA icoon
  '/Landingpage_voorbeeld/icon-512x512.png', // Het 512x512 PWA icoon
  '/Landingpage_voorbeeld/favicon.ico',      // Het favicon bestand

  // VOEG HIER TOE: Alle andere afbeeldingen (.png, .jpg, etc.) die je eventueel
  // direct in je index.html gebruikt (dus niet binnen iframes) en die je offline wilt zien.
  // Bijvoorbeeld: '/Landingpage_voorbeeld/images/mijn-logo.png'
  //
  // VOEG HIER TOE: Eventuele andere favicon-bestanden van RealFaviconGenerator als je die hebt geüpload
  // en ook offline wilt hebben. Controleer de bestandsnamen!
  // Bijvoorbeeld:
  // '/Landingpage_voorbeeld/apple-touch-icon.png',
  // '/Landingpage_voorbeeld/favicon-32x32.png',
  // '/Landingpage_voorbeeld/favicon-16x16.png',
  // '/Landingpage_voorbeeld/site.webmanifest', // Als RFG dit ook genereerde
];

// Installatie event: Cache de bestanden
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing... Cache Name:', CACHE_NAME); // Log de cache naam
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching app shell');
        // addAll kan falen als ook maar één bestand niet gevonden wordt!
        // Controleer of alle paden in urlsToCache correct zijn en de bestanden bestaan.
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Installatie compleet, bestanden zijn gecached in', CACHE_NAME);
        // Optioneel: forceer de nieuwe service worker om direct actief te worden
        // Dit kan handig zijn, maar kan soms onverwacht gedrag veroorzaken als de gebruiker de pagina nog open heeft.
        // self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Caching failed for cache', CACHE_NAME, error);
        console.error('Controleer of alle bestanden in urlsToCache bestaan op de opgegeven paden op GitHub!');
      })
  );
});

// Activate event: Ruim oude caches op (belangrijk bij versie-updates)
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating... Current Cache:', CACHE_NAME);
  const cacheWhitelist = [CACHE_NAME]; // Alleen de huidige cache (met de juiste versie) behouden
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
    // Optioneel: Zorg dat de SW de pagina's direct controleert na activatie
    // Gebruik dit samen met skipWaiting() in 'install' als je wilt dat de nieuwe SW onmiddellijk controle neemt.
    // .then(() => self.clients.claim())
  );
  console.log('Service Worker: Activatie compleet voor cache', CACHE_NAME);
});

// Fetch event: Reageer op netwerkverzoeken (Cache first strategy)
self.addEventListener('fetch', (event) => {
  // We reageren alleen op GET requests (niet POST, etc.)
  if (event.request.method !== 'GET') {
    // Laat de browser het standaard afhandelen
    return;
  }

  // We proberen alleen verzoeken te cachen die naar dezelfde origin gaan (jouw site)
  // Dit voorkomt problemen met externe bronnen zoals Tidio, Bootstrap CDN, etc.
  // We maken een uitzondering voor de iframes, maar die cachen we hier niet actief.
  if (!event.request.url.startsWith(self.location.origin)) {
     // console.log('Service Worker: Skipping fetch for external URL:', event.request.url); // Deze log kan veel ruis geven, eventueel uitcommentariëren
     // Laat de browser het standaard afhandelen (ga direct naar netwerk)
     return;
  }


  // console.log('Service Worker: Fetching', event.request.url); // Deze log kan ook veel ruis geven
  event.respondWith(
    // 1. Probeer het antwoord uit de cache te halen (uit de ACTIEVE cache)
    caches.match(event.request)
      .then((response) => {
        // 2. Als het in de cache zit, geef dat terug
        if (response) {
          // console.log('Service Worker: Found in cache', event.request.url); // Ruis
          return response;
        }

        // 3. Als het niet in de cache zit, haal het van het netwerk
        // console.log('Service Worker: Not found in cache, fetching from network', event.request.url); // Ruis
        // Belangrijk: Kloon de request, want een request stream kan maar één keer gebruikt worden.
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(
          (networkResponse) => {
            // 4. Controleer of we een geldig antwoord hebben ontvangen (status 200 OK)
            //    We cachen alleen 'basic' types (van dezelfde origin) om fouten te voorkomen.
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              // console.log('Service Worker: Not caching non-basic or error response from network', event.request.url, networkResponse.status); // Ruis
              return networkResponse; // Geef het (mogelijk foute) antwoord toch door aan de browser
            }

            // console.log('Service Worker: Fetched from network', event.request.url); // Ruis
            // 5. Belangrijk: Kloon het antwoord. Een response stream kan ook maar één keer gelezen worden.
            //    We moeten één kloon in de cache stoppen en de andere originele teruggeven aan de browser.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                // console.log('Service Worker: Putting in cache', event.request.url); // Ruis
                // Voeg het netwerkantwoord toe aan de cache voor de volgende keer
                cache.put(event.request, responseToCache);
              });

            // 6. Geef het originele netwerkantwoord terug aan de browser
            return networkResponse;
          }
        ).catch(error => {
            // Dit gebeurt meestal als er helemaal geen netwerkverbinding is.
            console.error('Service Worker: Fetch error, likely network offline.', event.request.url, error);
            // Optioneel: Geef een standaard offline pagina terug als fallback
            // Als je een 'offline.html' pagina zou maken en cachen:
            // return caches.match('/Landingpage_voorbeeld/offline.html');

            // Voor nu geven we de fout gewoon door, wat resulteert in de standaard browser foutmelding (bijv. "Geen internetverbinding").
            // Dit is vaak duidelijk genoeg voor de gebruiker.
            throw error; // Gooi de error opnieuw zodat de browser het merkt
        });
      })
  );
});