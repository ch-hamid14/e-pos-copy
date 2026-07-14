'use strict';

/**
 * @madix/sync
 *
 * A pluggable, transport-agnostic offline -> remote Postgres sync library.
 * Applications import it directly; no standalone server is shipped.
 *
 *   - createClient   : embed in the offline app (push/pull against an authority)
 *   - createAuthority: embed in the remote app (LWW authority + change log)
 *   - fetchTransport : optional HTTP reference transport for the client
 *
 * Lower-level building blocks are exposed under `lib` for advanced use.
 */

const { createClient } = require('./client');
const { createAuthority } = require('./server');
const { fetchTransport } = require('./lib/transport');

module.exports = {
  createClient,
  createAuthority,
  fetchTransport,
  lib: {
    clock: require('./lib/clock'),
    order: require('./lib/order'),
    schema: require('./lib/schema'),
    conflict: require('./lib/conflict'),
    payload: require('./lib/payload'),
  },
};
