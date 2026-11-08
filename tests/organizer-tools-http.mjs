import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = process.env.TEST_ORIGIN ?? "http://127.0.0.1:3013";
const base = "/api/organizer/events/20000000-0000-4000-8000-000000000001";
const request = (path, options = {}) =>
  fetch(origin + path, { redirect: "manual", ...options });
async function login(role) {
  const r = await request("/api/auth/login", {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams(role ? { demoRole: role } : {}),
  });
  assert.equal(r.status, 303);
  return r.headers.get("set-cookie").split(";")[0];
}
assert.equal((await request(base + "/tools")).status, 401);
assert.equal((await request(base + "/reports")).status, 401);
for (const role of [undefined, "staff"]) {
  const cookie = await login(role);
  for (const path of ["/tools", "/reports"])
    assert.equal(
      (await request(base + path, { headers: { cookie } })).status,
      403,
    );
}
const cookie = await login("organizer");
assert.equal(
  (await request(base + "/tools", { headers: { cookie } })).status,
  409,
);
assert.equal(
  (await request(base + "/reports?from=2030-02-30", { headers: { cookie } }))
    .status,
  400,
);
const send = (body, source = origin) =>
  request(base + "/tools", {
    method: "POST",
    headers: { cookie, origin: source, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
for (const body of [
  { action: "duplicate", key: randomUUID(), startsAt: "2031-01-01T00:00:00Z" },
  {
    action: "announce",
    key: randomUUID(),
    title: "Info event",
    message: "Pintu masuk lewat lobi barat.",
  },
  {
    action: "attendees",
    reason: "Perbaikan nama peserta",
    rows: [
      { id: randomUUID(), revision: 0, name: "Peserta", email: "", notes: "" },
    ],
  },
]) {
  assert.equal((await send(body, "https://untrusted.example")).status, 403);
  assert.equal((await send(body)).status, 409);
}
assert.equal(
  (await send({ action: "attendees", rows: [], reason: "x" })).status,
  400,
);
const page = await request("/organizer?from=2030-01-01&to=2030-01-02", {
  headers: { cookie },
});
assert.equal(page.status, 200);
assert.match(await page.text(), /Dari tanggal pemesanan/);
assert.equal(
  (
    await request("/api/organizer/export?from=2030-02-30", {
      headers: { cookie },
    })
  ).status,
  400,
);
console.log(
  "PASS: organizer tools and reports reject guests, other roles, cross-origin writes, malformed data; demo explicitly refuses remote-only mutations.",
);
