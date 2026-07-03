'use strict';

/**
 * Hybrid Logical Clock (HLC).
 *
 * The clock is maintained inside Postgres so that DB triggers can stamp every
 * write with a monotonic, wall-clock-readable, lexicographically sortable value.
 * An hlc is stored as the text `<physical_ms>-<counter>` where both parts are
 * zero padded to a fixed width, so plain string comparison equals logical
 * comparison.
 *
 * `compareHlc` is the JS-side comparator used by Last-Write-Wins.
 */

const PHYSICAL_WIDTH = 15; // ms epoch, padded (good for ~5138 AD)
const COUNTER_WIDTH = 6;

/** Lexicographic comparison works because both segments are fixed width. */
function compareHlc(a, b) {
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : 1;
}

/** Returns whichever hlc is greater (helper for clock alignment). */
function maxHlc(a, b) {
  return compareHlc(a, b) >= 0 ? a : b;
}

/**
 * DDL for the in-database clock. Installed by lib/schema.js on both roles.
 * - sync_clock: single row holding the last (physical, counter).
 * - sync_hlc(): mint a new hlc for a local write.
 * - sync_hlc_update(text): advance the local clock past an incoming hlc
 *   (called when applying remote changes so future local writes sort after).
 */
const CLOCK_DDL = `
CREATE TABLE IF NOT EXISTS sync_clock (
  only_one boolean PRIMARY KEY DEFAULT true CHECK (only_one),
  physical bigint NOT NULL DEFAULT 0,
  counter  integer NOT NULL DEFAULT 0
);
INSERT INTO sync_clock (only_one, physical, counter)
  VALUES (true, 0, 0)
  ON CONFLICT (only_one) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_hlc() RETURNS text AS $$
DECLARE
  pt bigint;
  lp bigint;
  lc integer;
BEGIN
  pt := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  SELECT physical, counter INTO lp, lc FROM sync_clock WHERE only_one LIMIT 1 FOR UPDATE;
  IF pt > lp THEN
    lp := pt;
    lc := 0;
  ELSE
    lc := lc + 1;
  END IF;
  UPDATE sync_clock SET physical = lp, counter = lc WHERE only_one;
  RETURN lpad(lp::text, ${PHYSICAL_WIDTH}, '0') || '-' || lpad(lc::text, ${COUNTER_WIDTH}, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_hlc_update(incoming text) RETURNS void AS $$
DECLARE
  pt bigint;
  lp bigint;
  lc integer;
  ip bigint;
  ic integer;
  np bigint;
  nc integer;
BEGIN
  IF incoming IS NULL THEN RETURN; END IF;
  ip := split_part(incoming, '-', 1)::bigint;
  ic := split_part(incoming, '-', 2)::integer;
  pt := (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
  SELECT physical, counter INTO lp, lc FROM sync_clock WHERE only_one LIMIT 1 FOR UPDATE;
  np := GREATEST(lp, ip, pt);
  IF np = lp AND np = ip THEN
    nc := GREATEST(lc, ic) + 1;
  ELSIF np = lp THEN
    nc := lc + 1;
  ELSIF np = ip THEN
    nc := ic + 1;
  ELSE
    nc := 0;
  END IF;
  UPDATE sync_clock SET physical = np, counter = nc WHERE only_one;
END;
$$ LANGUAGE plpgsql;
`;

module.exports = { compareHlc, maxHlc, CLOCK_DDL, PHYSICAL_WIDTH, COUNTER_WIDTH };
