// Who is logged in (step 14). The login itself is a cookie the app can't read (HttpOnly – not even
// a code-injection bug could steal it), so the app asks the server when it starts:
//   checkSession()  -> GET /api/session; until it answers, the status is 'checking'
//   useSession()    -> { status: 'checking' | 'in' | 'out', user }
//   logout()        -> ends the login on the server too, then the login page
// Old app versions kept a token in the browser's storage; the first start of this version swaps
// it for a cookie once (POST /api/session/from-token) and deletes it – nobody has to log in again.
import { useSyncExternalStore } from 'react';
import axios from 'axios';

// Not the login – only "was logged in on this device", used when the server can't be reached
// (then the pages open and show "Keine Verbindung" instead of the login page)
const HINT = 'loggedIn';
const store = {
  get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* not important */ } },
  remove: (key) => { try { localStorage.removeItem(key); } catch { /* not important */ } },
};

let state = { status: 'checking', user: null };
const listeners = new Set();
const update = (next) => {
  state = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const useSession = () => useSyncExternalStore(subscribe, () => state);

let checking = null;
export const checkSession = () => {
  checking ||= (async () => {
    const oldToken = store.get('token');
    if (oldToken) {
      try {
        await axios.post('/api/session/from-token', null, { headers: { Authorization: `Bearer ${oldToken}` } });
      } catch {
        // expired or invalid: then it's the login page, as before
      }
      store.remove('token');
    }
    try {
      const { data } = await axios.get('/api/session');
      store.set(HINT, '1');
      update({ status: 'in', user: data.user });
    } catch (err) {
      if (err.response?.status === 401) {
        store.remove(HINT);
        update({ status: 'out', user: null });
      } else {
        // no connection / maintenance: trust the hint; the pages show what's wrong
        update({ status: store.get(HINT) ? 'in' : 'out', user: null });
      }
    }
  })();
  return checking;
};

// After a successful login (the server has set the cookie)
export const loggedIn = () => store.set(HINT, '1');

// The server says the login isn't valid (any more): forget the hint, go to the login page
export const loginExpired = () => {
  store.remove(HINT);
  store.remove('token');
  if (window.location.pathname !== '/login') window.location.href = '/login';
};

export const logout = async () => {
  try {
    await axios.post('/api/logout');
  } catch {
    // without connection the cookie stays – it still ends when it runs out
  }
  store.remove(HINT);
  window.location.href = '/login';
};
