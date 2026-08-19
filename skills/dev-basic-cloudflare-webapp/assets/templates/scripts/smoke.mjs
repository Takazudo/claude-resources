#!/usr/bin/env node
// Post-deploy smoke test: the only check that proves the custom domain is
// really attached and serving. `wrangler deploy --dry-run` validates config and
// unit tests never touch the edge — neither makes a request to the live host.
//
// Exits 0 with a ::notice:: while the domain does not resolve yet, so a repo is
// never red merely because Cloudflare is not wired up. Set SMOKE_REQUIRE_LIVE=1
// once the domain is confirmed live: from then on a host that stops resolving
// is an outage and must go red.

const URL_TO_CHECK = process.env.SMOKE_URL ?? "https://__PROJECT_NAME__.__DOMAIN__/";
const REQUIRE_LIVE = process.env.SMOKE_REQUIRE_LIVE === "1";

// Substrings that must appear in the served HTML. Add real markers — a status
// check alone passes on a page that rendered without its data.
const EXPECTED = [];

const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

const skip = (msg) => {
  if (REQUIRE_LIVE) fail(`${msg} (SMOKE_REQUIRE_LIVE is set — treating as failure)`);
  console.log(`::notice::${msg}`);
  process.exit(0);
};

let res;
try {
  res = await fetch(URL_TO_CHECK, { redirect: "follow" });
} catch (err) {
  skip(`${URL_TO_CHECK} is not reachable yet: ${err.message}`);
}

if (!res.ok) fail(`${URL_TO_CHECK} returned ${res.status} ${res.statusText}`);

const html = await res.text();
const missing = EXPECTED.filter((marker) => !html.includes(marker));
if (missing.length > 0) {
  fail(`${URL_TO_CHECK} responded ${res.status} but is missing: ${missing.join(", ")}`);
}

console.log(`Smoke test passed: ${URL_TO_CHECK} -> ${res.status}`);
