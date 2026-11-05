// Exponential waiting time after failed logins, so nobody can try passwords endlessly.
//
// Counted per IP address and per account (username):
//   per IP:      after 5 failed attempts 30 s wait, every further failure doubles it
//                (1 min, 2 min, 4 min, ... at most 1 hour)
//   per account: the same from 20 failed attempts (against attacks from many IP addresses)
// While a wait is running, logins are refused without even checking the password.
// A successful login resets both counters; after 24 h without failures they're forgotten.
// Counters live in memory: restarting the server resets them (fine for this app).

const RULES = {
  ip: { freeAttempts: 5 },
  account: { freeAttempts: 20 },
};
const FIRST_WAIT_MS = 30 * 1000;
const MAX_WAIT_MS = 60 * 60 * 1000;
const FORGET_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 10000; // safety limit, so random usernames can't fill up the memory

const waitAfter = (failures, freeAttempts) =>
  failures < freeAttempts ? 0 : Math.min(FIRST_WAIT_MS * 2 ** (failures - freeAttempts), MAX_WAIT_MS);

const createLoginLimiter = ({ now = Date.now } = {}) => {
  const counters = { ip: new Map(), account: new Map() };

  const keysFor = (ip, username) => ({
    ip: String(ip || 'unknown'),
    account: String(username || '').trim().toLowerCase().slice(0, 100),
  });

  const get = (kind, key) => {
    const entry = counters[kind].get(key);
    if (entry && now() - entry.lastFailure > FORGET_AFTER_MS) {
      counters[kind].delete(key);
      return undefined;
    }
    return entry;
  };

  // Seconds until the next login attempt is allowed (0 = allowed now)
  const secondsToWait = (ip, username) => {
    const keys = keysFor(ip, username);
    let waitMs = 0;
    for (const kind of Object.keys(RULES)) {
      const entry = get(kind, keys[kind]);
      if (entry) waitMs = Math.max(waitMs, entry.lockedUntil - now());
    }
    return Math.max(0, Math.ceil(waitMs / 1000));
  };

  const recordFailure = (ip, username) => {
    const keys = keysFor(ip, username);
    for (const [kind, rule] of Object.entries(RULES)) {
      const map = counters[kind];
      const entry = get(kind, keys[kind]) || { failures: 0 };
      entry.failures += 1;
      entry.lastFailure = now();
      entry.lockedUntil = now() + waitAfter(entry.failures, rule.freeAttempts);
      map.delete(keys[kind]); // re-insert, so the Map stays ordered by last failure
      map.set(keys[kind], entry);
      if (map.size > MAX_ENTRIES) map.delete(map.keys().next().value); // drop the oldest
    }
    return secondsToWait(ip, username);
  };

  // Failed attempts in a row for this account (0 if none, or forgotten after 24 h)
  const accountFailures = (username) => get('account', keysFor(null, username).account)?.failures ?? 0;

  const recordSuccess = (ip, username) => {
    const keys = keysFor(ip, username);
    counters.ip.delete(keys.ip);
    counters.account.delete(keys.account);
  };

  return { secondsToWait, recordFailure, recordSuccess, accountFailures };
};

// From this many failed attempts in a row an account has to wait (the notification is sent then)
const ACCOUNT_LOCK_AFTER = RULES.account.freeAttempts;

module.exports = { createLoginLimiter, ACCOUNT_LOCK_AFTER };
