# Event editor, local demo stage

Organizer > Tambah event supports title, description, category, organizer, location, start/end in WIB, ticket sales window, Regular/Front prices and quotas, participant rules, illustration theme, and cover upload. Drafts stay out of the public catalog. Publish/unpublish is explicit. Archive is only available after the event ends and active holds expire.

Cover uploads accept decoded JPEG/PNG/WebP up to 5 MB, minimum 400 x 250 pixels, maximum 24 million pixels. Sharp rotates, strips metadata and normalizes to WebP. Draft covers require assignment. Published covers are public through the controlled cover endpoint.

The local catalog and normalized covers persist under `.data/`, excluded from version control. The demo organizer is a stable shared local persona; session cookies remain random, opaque and expire in eight hours. Bookings and tickets remain in memory and reset on server restart. The file catalog is single-process demo storage, not production distributed storage.

Published events immediately participate in discovery, details, seats, reservations, simulated payments and ticket issuance. Tickets snapshot event details. Pending holds and sold tickets prevent schedule/location changes. Quotas cannot drop below occupied seats. New prices do not change existing booking or ticket prices. No hard deletion of events.

Supabase event creation/editing and Storage integration are not implemented in this stage. Those mutations explicitly return unavailable outside demo mode. Existing Supabase monitoring and booking remain separate. Venue geometry remains the fixed two-section, 48-seat plan.

QA: 17 unit/database tests pass. Isolated HTTP flow passes attendee/organizer boundaries, assignment, private drafts and covers, actual upload, publish, live detail, custom-event booking/payment/ticket, schedule lock, and unpublish. `tests/catalog-http.mjs` targets port 3002; run a separate server with `SUMMAPASS_DATA_DIR` set to an isolated directory. Do not run fixture tests against the user preview. CSV formula fixtures remain in isolated unit tests. Browser UI verification is recorded separately.
