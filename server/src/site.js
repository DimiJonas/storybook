// The storybook's own address, e.g. https://storybook.example.com – used for the origin check of
// requests that change something, CORS, and the User-Agent sent to OpenStreetMap's place search.
//
// Where it comes from (the first that's there):
//   1. APP_URL in server/.env (or the environment)            – optional
//   2. on the server (NODE_ENV=production): DOMAIN=… in /etc/storybook/site.conf, written by
//      ops/root/install.sh (run by dk-srv's dk-app-update) – the same file the nginx config and
//      the security scripts use, so the address is set in one place on the server and never in
//      the repository
//      (another file can be given with SITE_CONF – tests)
//   3. in development: http://localhost:3000 (the Vite dev server)
// In production without 1. or 2. the backend refuses to start (index.js).

const fs = require('fs');

const DEV_URL = 'http://localhost:3000';
const confPath = () => process.env.SITE_CONF || '/etc/storybook/site.conf';

// "https://Storybook.Example.com/" -> "https://storybook.example.com"; null if it isn't an address
const origin = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
};

// DOMAIN=… from site.conf (null without the file or a usable line)
const domainFromConf = () => {
  let text;
  try {
    text = fs.readFileSync(confPath(), 'utf8');
  } catch {
    return null;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*DOMAIN\s*=\s*['"]?([A-Za-z0-9.-]+)['"]?\s*(#.*)?$/);
    if (m) return m[1].toLowerCase();
  }
  return null;
};

let cached;
// The address without a trailing slash, or null (production without a setting)
const appUrl = () => {
  if (cached !== undefined) return cached;
  if (process.env.APP_URL) {
    cached = origin(process.env.APP_URL);
  } else if (process.env.NODE_ENV === 'production') {
    const domain = domainFromConf();
    cached = domain ? origin(`https://${domain}`) : null;
  } else {
    cached = DEV_URL;
  }
  return cached;
};

module.exports = { appUrl, confPath };
