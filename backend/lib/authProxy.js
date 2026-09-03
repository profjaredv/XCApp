// Reverse-proxies Neon Auth (Better Auth) so its session cookie is set on
// this app's own domain instead of Neon's own
// <endpoint>.neonauth.<region>.aws.neon.tech host.
//
// Why this exists: the frontend used to call VITE_NEON_AUTH_URL directly
// from the browser (see web/src/lib/auth.ts) — a genuinely different
// domain from wherever the app itself is hosted. Sign-in worked (the POST
// to Neon Auth succeeded), but the session cookie it depends on is set by
// that other domain in response to a fetch(), not a top-level navigation.
// Safari's Intelligent Tracking Prevention blocks exactly that — storing a
// cookie from a cross-site request with no navigation — regardless of
// SameSite/Secure attributes. Chrome doesn't enforce this (yet), which is
// why sign-in "worked everywhere except Safari/iPadOS."
//
// Mounting this at NEON_AUTH_UPSTREAM_URL's local equivalent (see
// server.js) and pointing VITE_NEON_AUTH_URL at that local path instead
// makes every Neon Auth request same-origin, so the cookie is first-party
// and Safari has nothing to block.
const NEON_AUTH_UPSTREAM_URL = process.env.NEON_AUTH_UPSTREAM_URL;

// Headers that describe this one hop, not the request/response itself —
// forwarding them verbatim would either be meaningless on the new hop
// (Host) or wrong once the body has passed through fetch/Express again
// (Content-Length, Content-Encoding).
//
// The x-forwarded-*/forwarded/via family is the important one here, not
// just hygiene: Railway's own edge sits in front of this server and stamps
// the INCOMING request with X-Forwarded-Host: <this app's domain> (plus
// -Proto, -For, etc). Neon Auth's own server is itself proxy-aware and
// reads X-Forwarded-Host to figure out its own "real" hostname — so
// forwarding that header through unchanged made Neon Auth think THIS
// app's domain was ITS hostname and reject the request with
// INVALID_HOSTNAME. Those headers describe how the browser reached us;
// they must never leak into the separate request we make to Neon.
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'forwarded',
  'via',
  'x-real-ip',
]);
const FORWARDED_HEADER_PREFIX = 'x-forwarded-';
const STRIP_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'content-encoding',
  'content-length',
  'connection',
  'transfer-encoding',
]);

/** The upstream URL to forward one proxied request to, given the path Express saw after the mount point (e.g. "/sign-in/email" or "/get-session?x=1"). */
function buildUpstreamUrl(upstreamBase, subPath) {
  if (!upstreamBase) return null;
  const base = upstreamBase.replace(/\/+$/, '');
  const suffix = subPath.startsWith('/') ? subPath : `/${subPath}`;
  return `${base}${suffix}`;
}

/** Node's Headers, minus the hop-by-hop ones, as a plain object Express's req.headers already mostly is. */
function filterRequestHeaders(rawHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    const lower = key.toLowerCase();
    if (value == null || STRIP_REQUEST_HEADERS.has(lower) || lower.startsWith(FORWARDED_HEADER_PREFIX)) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  return headers;
}

/**
 * A cookie Neon Auth set for its own host, rewritten to work as a
 * same-origin cookie on whatever host is running this proxy.
 *
 * - Domain= is dropped entirely: an absent Domain defaults to "the host
 *   that actually sent this response," which after proxying is us. Leaving
 *   Neon's own Domain= in place would set a cookie our own pages can never
 *   read back.
 * - SameSite=None (needed only because the old direct call was cross-site)
 *   downgrades to Lax now that it isn't — Lax still survives the
 *   top-level-navigation flows (magic link, OAuth callback) that Strict
 *   would break, with less exposure than None.
 */
function rewriteSetCookie(cookie) {
  return cookie
    .replace(/;\s*Domain=[^;]*/i, '')
    .replace(/;\s*SameSite=None/i, '; SameSite=Lax');
}

// Express handler. Mount with express.raw({ type: () => true }) — matching
// every content type, not just application/json — ahead of the global
// express.json() parser (same reason as the Stripe webhook route) so the
// body reaches Neon Auth byte-for-byte, with no JSON round trip.
async function authProxyHandler(req, res) {
  if (!NEON_AUTH_UPSTREAM_URL) {
    res.status(500).json({ message: 'Auth proxy is not configured on this server.' });
    return;
  }

  const upstreamUrl = buildUpstreamUrl(NEON_AUTH_UPSTREAM_URL, req.url);
  const headers = filterRequestHeaders(req.headers);
  const hasBody = Buffer.isBuffer(req.body) && req.body.length > 0;

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
    });
  } catch (err) {
    console.error('Auth proxy: upstream request failed:', err.message);
    res.status(502).json({ message: 'Auth service is unreachable right now.' });
    return;
  }

  res.status(upstreamRes.status);

  const setCookies = typeof upstreamRes.headers.getSetCookie === 'function' ? upstreamRes.headers.getSetCookie() : [];
  for (const cookie of setCookies) {
    res.append('Set-Cookie', rewriteSetCookie(cookie));
  }

  upstreamRes.headers.forEach((value, key) => {
    if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });

  // Redirects (magic-link / callback flows) point at Neon's own upstream
  // host by default — send the browser back through this same proxy
  // instead, or it lands on a cross-site hop again for that one request.
  const location = upstreamRes.headers.get('location');
  if (location && location.startsWith(NEON_AUTH_UPSTREAM_URL.replace(/\/+$/, ''))) {
    res.setHeader('location', location.slice(NEON_AUTH_UPSTREAM_URL.replace(/\/+$/, '').length) || '/');
  }

  const body = Buffer.from(await upstreamRes.arrayBuffer());
  res.send(body);
}

module.exports = { authProxyHandler, buildUpstreamUrl, filterRequestHeaders, rewriteSetCookie };
