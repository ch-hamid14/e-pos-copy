'use strict';

/**
 * End-to-end test against the real testing databases.
 *
 *   authority  -> remote DB
 *   clientA    -> local DB 2
 *   clientB    -> local DB 3
 *
 * Transport is in-process (calls the authority handlers directly) so the test
 * focuses on the sync engine, not the network. Covers: bootstrap of
 * pre-existing data, basic push/pull, multi-client fan-out, echo guard,
 * idempotent re-push, LWW conflict + loser convergence + conflict logging,
 * soft-delete propagation, and FK ordering.
 */

const path = require('path');
const knex = require('knex');
const { createClient, createAuthority } = require('..');

// Load DB URLs from .env (see .env.example). Node 22 has a built-in loader.
try {
  process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch {
  // .env is optional if the vars are already present in the environment
}

const URLS = {
  authority: process.env.test_remote_db,
  clientA: process.env.test_local_db_1,
  clientB: process.env.test_local_db_2,
};

for (const [role, url] of Object.entries(URLS)) {
  if (!url) {
    console.error(
      `Missing DB URL for "${role}". Set test_remote_db, test_local_db_1, test_local_db_2 in .env (see .env.example).`
    );
    process.exit(2);
  }
}

const mk = (url) => knex({ client: 'pg', connection: url, pool: { min: 0, max: 5 } });

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra ? ' :: ' + JSON.stringify(extra) : ''}`);
  }
}
const section = (t) => console.log(`\n=== ${t} ===`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** In-process transport bound to an authority instance. */
function localTransport(authority) {
  return {
    handshake: (r) => authority.handleHandshake(r),
    push: (r) => authority.handlePush(r),
    pull: (r) => authority.handlePull(r),
  };
}

/** Drops everything the engine + test create, for a repeatable run. */
async function reset(db) {
  await db.raw('DROP TABLE IF EXISTS posts CASCADE');
  await db.raw('DROP TABLE IF EXISTS users CASCADE');
  for (const t of ['sync_applied', 'sync_conflict', 'sync_state', 'sync_queue', 'sync_config', 'sync_clock']) {
    await db.raw(`DROP TABLE IF EXISTS ${t} CASCADE`);
  }
  await db.raw('DROP FUNCTION IF EXISTS sync_capture() CASCADE');
  await db.raw('DROP FUNCTION IF EXISTS sync_hlc() CASCADE');
  await db.raw('DROP FUNCTION IF EXISTS sync_hlc_update(text) CASCADE');
  await db.raw('DROP FUNCTION IF EXISTS sync_node_id() CASCADE');
}

/** Creates the app tables (uuid PK, FK, soft-delete-ready). */
async function createAppTables(db) {
  await db.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await db.raw(`
    CREATE TABLE users (
      id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text
    )`);
  await db.raw(`
    CREATE TABLE posts (
      id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES users(id),
      title   text
    )`);
}

const countLive = (db, t) => db(t).whereNull('deleted_at').count('* as c').first().then((r) => Number(r.c));
const countAll = (db, t) => db(t).count('* as c').first().then((r) => Number(r.c));
const row = (db, t, id) => db(t).where('id', id).first();

async function main() {
  const authDb = mk(URLS.authority);
  const aDb = mk(URLS.clientA);
  const bDb = mk(URLS.clientB);

  try {
    section('Connectivity');
    for (const [name, db] of [['authority', authDb], ['clientA', aDb], ['clientB', bDb]]) {
      const r = await db.raw('select 1 as ok');
      check(`connect ${name}`, r.rows[0].ok === 1);
    }

    section('Reset all databases');
    await Promise.all([reset(authDb), reset(aDb), reset(bDb)]);
    check('reset complete', true);

    // --- Pre-integration data lives ONLY on the remote (Q2 scenario) ---
    section('Seed pre-existing data on remote (before integration)');
    await createAppTables(authDb);
    await createAppTables(aDb);
    await createAppTables(bDb);
    const legacyUserId = (await authDb('users').insert({ name: 'legacy-user' }).returning('id'))[0].id;
    await authDb('posts').insert({ user_id: legacyUserId, title: 'legacy-post' });
    check('remote seeded with 1 user + 1 post', (await countAll(authDb, 'users')) === 1 && (await countAll(authDb, 'posts')) === 1);

    // --- Setup engine on all three ---
    section('Setup (adds metadata cols, triggers; existing rows get sentinel hlc)');
    const authority = createAuthority({ db: authDb, config: { tables: ['users', 'posts'] } });
    const clientA = createClient({ db: aDb, transport: localTransport(authority), config: { tables: ['users', 'posts'] } });
    const clientB = createClient({ db: bDb, transport: localTransport(authority), config: { tables: ['users', 'posts'] } });
    await authority.setup();
    await clientA.setup();
    await clientB.setup();
    const qBeforeBootstrap = Number((await authDb('sync_queue').count('* as c').first()).c);
    check('no changes captured for pre-existing rows yet', qBeforeBootstrap === 0, { qBeforeBootstrap });

    section('EDGE: pull before bootstrap returns nothing (pre-existing data invisible)');
    await clientA.sync();
    check('clientA still empty before bootstrap', (await countLive(aDb, 'users')) === 0 && (await countLive(aDb, 'posts')) === 0);

    section('Bootstrap remote, then clientA pulls pre-existing data');
    const bootRes = await authority.bootstrap();
    check('bootstrap enqueued 1 user + 1 post', bootRes.users === 1 && bootRes.posts === 1, bootRes);
    await clientA.sync();
    check('clientA received legacy user', (await row(aDb, 'users', legacyUserId))?.name === 'legacy-user');
    check('clientA received legacy post (FK ok)', (await countLive(aDb, 'posts')) === 1);
    check('bootstrap is idempotent', Object.values(await authority.bootstrap()).every((n) => n === 0));

    section('EDGE: clientA does not re-push pulled rows (echo guard)');
    const aQueueAfterPull = Number((await aDb('sync_queue').count('* as c').first()).c);
    check('clientA local queue empty after pull', aQueueAfterPull === 0, { aQueueAfterPull });

    // --- Normal push from clientA ---
    section('clientA inserts new data and pushes');
    const userId = (await aDb('users').insert({ name: 'alice' }).returning('id'))[0].id;
    const postId = (await aDb('posts').insert({ user_id: userId, title: 'hello' }).returning('id'))[0].id;
    const pushRes = await clientA.push();
    check('clientA pushed 2 changes', pushRes.pushed === 2, pushRes);
    check('remote has alice', (await row(authDb, 'users', userId))?.name === 'alice');
    check('remote has post', (await row(authDb, 'posts', postId))?.title === 'hello');
    check('remote tagged origin = clientA', (await row(authDb, 'users', userId))?.origin_client_id != null);

    section('EDGE: idempotent re-push (reset cursor, push again -> dedupe, no dupes)');
    await aDb('sync_state').update({ last_pushed_sno: 0 });
    const beforeUsers = Number((await authDb('users').count('* as c').first()).c);
    await clientA.push();
    const afterUsers = Number((await authDb('users').count('* as c').first()).c);
    check('no duplicate rows after re-push', beforeUsers === afterUsers, { beforeUsers, afterUsers });

    // --- Multi-client fan-out ---
    section('clientB pulls -> sees alice + legacy (multi-client fan-out)');
    await clientB.sync();
    check('clientB has alice', (await row(bDb, 'users', userId))?.name === 'alice');
    check('clientB has legacy user', (await row(bDb, 'users', legacyUserId))?.name === 'legacy-user');
    check('clientB queue empty (no echo)', Number((await bDb('sync_queue').count('* as c').first()).c) === 0);

    // --- LWW conflict ---
    section('LWW: concurrent edits to same row, older loser converges + conflict logged');
    await aDb('users').where('id', userId).update({ name: 'alice-A' }); // earlier
    await sleep(50);
    await bDb('users').where('id', userId).update({ name: 'alice-B' }); // later -> higher hlc
    const conflictsBefore = Number((await authDb('sync_conflict').count('* as c').first()).c);
    await clientB.push(); // winner applied first
    const aPush = await clientA.push(); // older -> should lose
    const conflictsAfter = Number((await authDb('sync_conflict').count('* as c').first()).c);
    check('remote kept later write (alice-B)', (await row(authDb, 'users', userId))?.name === 'alice-B');
    check('conflict was logged on authority', conflictsAfter === conflictsBefore + 1, { conflictsBefore, conflictsAfter });
    check('clientA push reported a conflict', (aPush.conflicts || []).length === 1, aPush.conflicts);
    check('clientA converged to winner (alice-B)', (await row(aDb, 'users', userId))?.name === 'alice-B');
    await clientB.sync();
    await clientA.sync();
    check('all three converged on alice-B',
      (await row(authDb, 'users', userId))?.name === 'alice-B' &&
      (await row(aDb, 'users', userId))?.name === 'alice-B' &&
      (await row(bDb, 'users', userId))?.name === 'alice-B');

    // --- Soft delete ---
    section('Soft delete propagation');
    await aDb('posts').where('id', postId).update({ deleted_at: aDb.fn.now() });
    await clientA.sync();
    await clientB.sync();
    check('remote post soft-deleted', (await row(authDb, 'posts', postId))?.deleted_at != null);
    check('clientB post soft-deleted', (await row(bDb, 'posts', postId))?.deleted_at != null);

    // --- FK ordering within a single batch ---
    section('FK ordering: parent + child pushed together apply in order');
    const u2 = (await aDb('users').insert({ name: 'bob' }).returning('id'))[0].id;
    const p2 = (await aDb('posts').insert({ user_id: u2, title: 'bobpost' }).returning('id'))[0].id;
    await clientA.sync();
    await clientB.sync();
    check('child applied on B without FK error', (await row(bDb, 'posts', p2))?.user_id === u2);

    section('Final convergence snapshot');
    const counts = async (db) => ({ users: await countLive(db, 'users'), posts: await countLive(db, 'posts') });
    const [ca, cb, cr] = [await counts(aDb), await counts(bDb), await counts(authDb)];
    console.log('  authority:', cr, '| clientA:', ca, '| clientB:', cb);
    check('row counts converged across all nodes',
      JSON.stringify(ca) === JSON.stringify(cb) && JSON.stringify(cb) === JSON.stringify(cr), { ca, cb, cr });
  } finally {
    await Promise.all([authDb.destroy(), aDb.destroy(), bDb.destroy()]);
  }

  console.log(`\n==== RESULT: ${passed} passed, ${failed} failed ====`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('\nFATAL', e);
  process.exit(2);
});
