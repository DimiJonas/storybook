// Push notifications to your phone through ntfy (step 13) – the backend's own messages (e.g. an
// account locked after many failed logins). The server's scripts (dk-srv) use dk-notify; both read
// the topic from the same file, /etc/dk-srv/notify.conf (NTFY_TOPIC=…, optional NTFY_SERVER=…),
// written by dk-srv's install.sh (before dk-srv: /etc/storybook/notify.conf, still read if the new
// one isn't there). Another file can be given with NOTIFY_CONF (tests).
// Without that file (e.g. on the laptop) nothing is sent – the message only goes to the log.
// Sending never throws and never makes a request wait for ntfy.

const fs = require('fs');

const confPath = () => {
  if (process.env.NOTIFY_CONF) return process.env.NOTIFY_CONF;
  return fs.existsSync('/etc/dk-srv/notify.conf') ? '/etc/dk-srv/notify.conf' : '/etc/storybook/notify.conf';
};
const PRIORITIES = { min: 1, low: 2, default: 3, high: 4, urgent: 5 };

// read every time (it's rare), so a changed topic works without a restart
const readConf = () => {
  try {
    const values = {};
    for (const line of fs.readFileSync(confPath(), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*['"]?([^'"#\s]*)['"]?\s*(#.*)?$/);
      if (m) values[m[1]] = m[2];
    }
    return values;
  } catch {
    return null;
  }
};

const notify = async (title, message, { priority = 'default', tags = [] } = {}) => {
  const conf = readConf();
  const topic = conf?.NTFY_TOPIC ?? '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
    console.log(`Notification not sent (no topic in ${confPath()}): ${title} – ${message}`);
    return false;
  }
  const server = (conf.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, '');
  try {
    const res = await fetch(`${server}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, title, message, priority: PRIORITIES[priority] ?? 3, tags }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch (err) {
    console.error(`Notification not sent (${title}): ${err.message}`);
    return false;
  }
};

module.exports = { notify };
