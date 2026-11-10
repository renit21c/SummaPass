# SummaPass PWA

Manifest: `/manifest.webmanifest`. App icons follow the existing ticket favicon and include 192px, 512px, maskable 512px, and Apple 180px PNGs. Regenerate from the SVG with `node scripts/generate-pwa-icons.mjs`.

The install button appears in the footer when the browser offers installation. On iOS it shows Safari Add to Home Screen instructions. Standalone launches use `/` and keep the existing authentication and role checks.

The service worker registers only in production, so local development does not leave an offline worker interfering with hot reload. It stores only the static offline page and application icons. It does not cache API calls, RSC responses, authenticated pages, tickets, seat availability, payments, or staff/organizer reports. Full-page offline navigation shows the public offline page. Booking and check-in remain online-only.

## Verification

1. Run `npm run build`, then `npm run start` after stopping the development server.
2. Open localhost, or deploy over HTTPS. Check DevTools Application for the manifest, icons, and service worker.
3. Use the browser install action, or the footer install button when offered. Check standalone launch and home-screen icon.
4. After the worker controls the page, switch DevTools Network to Offline and reload. The public offline message should appear.
5. Confirm Cache Storage contains only the five public offline assets and no account, API, ticket, or transaction data. Restore Online before continuing.

Installation depends on the browser and platform. PWA support does not add push notifications or offline check-in.
