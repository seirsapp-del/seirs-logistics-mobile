#!/usr/bin/env node
/**
 * One heavy job at a time on this laptop.
 *
 * WHY THIS EXISTS. On 4 September two Claude sessions worked this repo at the
 * same time. One started a build; the other started three Metro bundlers. The
 * machine went to 0.35 GB free of 7.92, Metro never produced a bundle, and the
 * customer app sat on its splash screen for ten minutes while both sessions
 * waited on work that could not finish. Nothing had crashed and nothing logged
 * an error, which is what made it expensive: the only symptom was slowness.
 *
 * A "heavy job" is anything that will hold hundreds of megabytes for minutes:
 *
 *   nest build            next build           expo start / Metro
 *   expo run:android      eas build            tsc across a whole app
 *
 * THE RULE. Claim before you start one. Release when it ends. If the claim is
 * refused, you are told who holds it, what they are doing and for how long,
 * and you wait rather than starting anyway. Two sessions politely waiting is
 * always faster than two sessions thrashing the same 8 GB.
 *
 *   node scripts/heavy.js claim   <who> "<what>"   # take it, or be refused
 *   node scripts/heavy.js release <who>            # give it back
 *   node scripts/heavy.js status                   # who holds it + free RAM
 *   node scripts/heavy.js wait    <who> "<what>"   # block until free, then claim
 *
 * <who> is the session's own name, so the other side knows who to ask.
 *
 * The lock lives in the OS temp directory, NOT in the repo: a lock file that
 * gets committed, stashed or wiped by a branch switch is worse than no lock.
 * Both sessions run as the same Windows user, so both resolve the same path.
 *
 * A claim older than STALE_MIN is assumed dead (a session can be killed
 * without ever releasing) and is broken automatically, with a notice, because
 * a lock nobody can clear would stop all work rather than order it.
 */
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const LOCK     = path.join(os.tmpdir(), 'seirs-heavy.lock');
const STALE_MIN = 30;
const LOW_RAM_GB = 1.5;

const freeGb  = () => os.freemem()  / 1024 ** 3;
const totalGb = () => os.totalmem() / 1024 ** 3;
const ageMin  = (iso) => (Date.now() - new Date(iso).getTime()) / 60000;

function read() {
  try { return JSON.parse(fs.readFileSync(LOCK, 'utf8')); } catch { return null; }
}

/** Clears a claim old enough that the session holding it is probably gone. */
function clearIfStale(held) {
  if (!held) return null;
  if (ageMin(held.at) <= STALE_MIN) return held;
  console.log(`  note: breaking a stale claim by ${held.who} (${Math.round(ageMin(held.at))} min old, no release)`);
  try { fs.unlinkSync(LOCK); } catch {}
  return null;
}

function describe(held) {
  return `${held.who} is running "${held.what}" (started ${Math.round(ageMin(held.at))} min ago, pid ${held.pid})`;
}

function claim(who, what) {
  const held = clearIfStale(read());
  if (held) {
    if (held.who === who) { console.log(`  you already hold it: ${held.what}`); return 0; }
    console.log(`REFUSED. ${describe(held)}`);
    console.log(`  free RAM ${freeGb().toFixed(2)} GB of ${totalGb().toFixed(2)} GB`);
    console.log(`  wait for it, or ask ${held.who} how long they need.`);
    return 1;
  }
  try {
    // 'wx' fails when the file exists, which is what makes this atomic: two
    // sessions claiming in the same instant cannot both win.
    fs.writeFileSync(
      LOCK,
      JSON.stringify({ who, what, pid: process.pid, at: new Date().toISOString() }, null, 2),
      { flag: 'wx' },
    );
  } catch {
    const now = read();
    console.log(`REFUSED (raced). ${now ? describe(now) : 'someone else claimed it first'}`);
    return 1;
  }
  const f = freeGb();
  console.log(`CLAIMED by ${who}: ${what}`);
  console.log(`  free RAM ${f.toFixed(2)} GB of ${totalGb().toFixed(2)} GB`);
  if (f < LOW_RAM_GB) {
    console.log(`  WARNING: under ${LOW_RAM_GB} GB free before you even start.`);
    console.log('  Close idle Metros first, or this job will crawl and take the machine with it.');
  }
  return 0;
}

function release(who) {
  const held = read();
  if (!held) { console.log('  nothing to release.'); return 0; }
  if (held.who !== who && !process.argv.includes('--force')) {
    console.log(`REFUSED. ${describe(held)}`);
    console.log('  pass --force only if you are certain that session is gone.');
    return 1;
  }
  try { fs.unlinkSync(LOCK); } catch {}
  console.log(`RELEASED by ${who} after ${Math.round(ageMin(held.at))} min: ${held.what}`);
  console.log(`  free RAM now ${freeGb().toFixed(2)} GB of ${totalGb().toFixed(2)} GB`);
  return 0;
}

function status() {
  const held = clearIfStale(read());
  console.log(held ? `HELD: ${describe(held)}` : 'FREE: no heavy job claimed.');
  console.log(`  free RAM ${freeGb().toFixed(2)} GB of ${totalGb().toFixed(2)} GB`);
  console.log(`  lock file ${LOCK}`);
  return 0;
}

/**
 * Block until the lock frees, then take it. Prints a line per minute so a
 * watching human can see it is waiting rather than hung.
 */
async function wait(who, what) {
  for (let i = 0; i < 60; i++) {
    const held = clearIfStale(read());
    if (!held || held.who === who) return claim(who, what);
    console.log(`  waiting (${i + 1} min): ${describe(held)}`);
    await new Promise(r => setTimeout(r, 60000));
  }
  console.log('Gave up after 60 minutes. Check whether that session is still alive.');
  return 1;
}

const [cmd, who, what] = process.argv.slice(2);
const need = (v, msg) => { if (!v) { console.log(msg); process.exit(2); } };

switch (cmd) {
  case 'claim':
    need(who, 'usage: heavy.js claim <who> "<what>"');
    need(what, 'usage: heavy.js claim <who> "<what>"');
    process.exit(claim(who, what));
  case 'release':
    need(who, 'usage: heavy.js release <who>');
    process.exit(release(who));
  case 'wait':
    need(who, 'usage: heavy.js wait <who> "<what>"');
    need(what, 'usage: heavy.js wait <who> "<what>"');
    wait(who, what).then(c => process.exit(c));
    break;
  case 'status':
    process.exit(status());
  default:
    console.log('usage: heavy.js claim|release|wait|status');
    process.exit(2);
}
