// Talking to the server: `api.get('/api/books')` etc.
// The login is a cookie the browser sends by itself (step 14, see session.js). If the server says
// the login is no longer valid (401/403), the login page opens.
// (The login page itself uses plain axios, so a wrong password doesn't trigger this.)
import axios from 'axios';
import { API_URL } from './config';
import { loginExpired } from './session';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401 || status === 403) loginExpired();
    return Promise.reject(error);
  }
);

// The server answered "503": the storybook is in maintenance mode (see project_maintenance_commands.txt)
export const isMaintenance = (error) => error?.response?.status === 503;
// No answer, or the server side failed (502/503/504...): show "Keine Verbindung"/maintenance notice
export const isServerUnreachable = (error) => !error?.response || error.response.status >= 500;

// The storybook used last on this device (opened directly next time)
const LAST_STORYBOOK = 'lastStorybook';
export const lastStorybook = () => {
  try {
    return Number(localStorage.getItem(LAST_STORYBOOK)) || null;
  } catch {
    return null;
  }
};
export const rememberStorybook = (id) => {
  try {
    localStorage.setItem(LAST_STORYBOOK, String(id));
  } catch {
    // not important if this can't be saved
  }
};

// Is a form open – add/edit a memory, the Kapitel or the tags page? (Reloading the page or the memories
// would lose what's being typed.)
export const isOnForm = (pathname = window.location.pathname) => /\/(add|edit\/[^/]+|kapitel|tags|orte)\/?$/.test(pathname);
