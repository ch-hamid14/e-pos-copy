'use strict';

/**
 * Optional reference transport.
 *
 * The package is transport-agnostic: a client is given any object exposing
 * `handshake`, `push`, and `pull`. This helper implements that contract over
 * HTTP using the host's `fetch`, assuming the remote app mounted the authority
 * handlers at `${baseUrl}/handshake`, `/push`, and `/pull`. Auth headers can be
 * supplied via `headers` (static object or a function returning one).
 */
function fetchTransport(baseUrl, { fetch: fetchImpl, headers } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (!doFetch) throw new Error('fetchTransport: no fetch implementation available');
  const root = baseUrl.replace(/\/$/, '');

  async function resolveHeaders() {
    const h = typeof headers === 'function' ? await headers() : headers;
    return { 'content-type': 'application/json', ...(h || {}) };
  }

  async function call(path, body) {
    const res = await doFetch(`${root}${path}`, {
      method: 'POST',
      headers: await resolveHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`sync transport ${path} failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  return {
    handshake: (req) => call('/handshake', req),
    push: (req) => call('/push', req),
    pull: (req) => call('/pull', req),
  };
}

module.exports = { fetchTransport };
