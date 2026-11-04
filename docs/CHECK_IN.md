# Check-in stage

Staff can select an assigned event, scan QR using a camera or enter a ticket reference/token manually, preview the participant and seat, then explicitly confirm entry. A successful preview never consumes a ticket. Changing event or credential clears the previous result. The camera stops after decoding, on event changes and on unmount; pending permission requests are invalidated safely.

Demo staff is an explicitly selected persona, separate from attendee and organizer. Its assignment is the same three original demo events. New custom-event staff assignment management remains pending. Server routes validate session, STAFF role, event scope, request origin and payload. No token or encryption material appears in scanner responses. Invalid/wrong-event responses reveal no attendee details.

Migration 005 adds check_ins with a unique ticket primary key, event/staff/time audit fields and scoped RLS. The validate_check_in RPC authenticates auth.uid(), verifies STAFF assignment, checks paid confirmed allocation and active ticket, locks event then ticket, and inserts once. Repeated confirmations return ALREADY_USED. Raw tokens are SHA-256 hashed on the server before RPC. Direct client inserts/updates/deletes are not granted. Supabase service-role keys are not required by staff. Apply migration 005 after migrations 001-004.

Outcomes: VALID, CHECKED_IN, ALREADY_USED, INVALID, WRONG_EVENT, UNPAID, CANCELLED_OR_REFUNDED. No ticket exists before payment, so a nonexistent unpaid booking returns INVALID rather than exposing booking information. Attendance status is visible to the ticket owner and aggregated for assigned organizers. Demo records remain ephemeral; Supabase check-ins persist in PostgreSQL.

Automated coverage includes demo simultaneous confirmations (one success), PostgreSQL migration/RLS, role and event isolation, unpaid/revoked tickets, preview versus confirmation, duplicate entry, staff/time storage and owner status. PostgreSQL tests use PGlite, not remote Supabase multi-session concurrency. Camera device scanning, physical printed QR, permission denial on real hardware and remote Supabase are not yet verified. Camera decoding uses the already installed jsQR dependency, now a runtime dependency.

Quota UX: fixed geometry still limits each category to 1-24 seats. Form fields expose min/max and localized browser validation; server messages identify Front/Regular instead of returning duplicate English Zod messages. Larger events need configurable venue geometry, a separate pending stage.

QA executed: all 20 tests passed; check-in-http.mjs passed against isolated production preview. Browser staff login and invalid-reference result passed with no warning/error logs captured. At 390px the document did not overflow horizontally. No camera permission was requested during browser QA.
