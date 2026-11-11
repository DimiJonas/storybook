# Security of the storybook

How the storybook is secured, **measured against published guides** – what is done, what doesn't
apply, and which risks are accepted on purpose (with the reason).

The **server** it runs on (Ubuntu, nginx's server-wide part, PostgreSQL, the firewall, SSH, the
nightly checks) is its own repository, [dk-srv](https://github.com/DimiJonas/dk-srv) – its
[SECURITY.md](https://github.com/DimiJonas/dk-srv/blob/main/SECURITY.md) has the CIS scorecard:
**72.2 %** before the hardening, **92.7 %** of all rules after it, **100 %** of the rules that apply
(13 risks accepted on purpose, each with its reason), and its
[HARDENING.md](https://github.com/DimiJonas/dk-srv/blob/main/HARDENING.md) explains every mechanism.

| Layer | Guide | How it's checked |
|---|---|---|
| The app | [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) (Level 1, plus the Level 2 login and session parts); [OWASP Top 10 (2025)](https://owasp.org/Top10/) as an overview | Code review |
| Its nginx site | [CIS NGINX Benchmark](https://www.cisecurity.org/benchmark/nginx) (Level 1 Webserver) – the site's own part; TLS as the server's | `nginx -T`, SSL Labs, securityheaders.com |
| The server | CIS Ubuntu 24.04 Level 1 Server, CIS NGINX, CIS PostgreSQL 16 | dk-srv |

Status marks: ✅ done · ➖ doesn't apply here · ⚠️ accepted risk (reason below) · 🔜 planned

## What's protected, against whom

The storybook holds **private photos and texts** of a few people, and their logins. Expected
attackers: **internet-wide scanners and bots** (every public server, every day), **password
guessing**, **known vulnerabilities** in its npm packages or Node.js, a **stolen or lost device**
(phone, laptop), and – less likely – someone **targeting** it. Not in scope: attackers with access
to the hosting company's infrastructure.

Principles: nothing reachable without a login except the login itself; every layer assumes the one
in front of it can fail; nothing secret or server-specific in the repository (no domain, no
topic, no keys); anything unusual sends a notification to the phone.

---

## 1. The app (OWASP ASVS 5.0)

| ASVS chapter | What's done | |
|---|---|---|
| Encoding and Sanitization | React escapes all output; SQL only with parameters; no HTML from users | ✅ |
| Validation and Business Logic | Every input checked on the server (types, lengths, dates); requests ≤ 1 MB | ✅ |
| Web Frontend Security | Strict CSP, framing forbidden, cookies `SameSite=Strict`, **Origin check** on every changing request | ✅ |
| API and Web Service | JSON only, generic error answers, `Cache-Control: no-store` for API answers | ✅ |
| File Handling | Only images (extension **and** content checked), random names, ≤ 50 MB, GPS position removed, served only to logged-in visitors and only as images | ✅ |
| Authentication | Passwords ≥ 12 characters, bcrypt; increasing wait time after failed logins (per IP and per account), account notification after 20 failures; nginx rate limit; fail2ban | ✅ |
| Authentication: second factor | Level 2 expects multi-factor login | 🔜 A8 |
| Session Management | Random 256-bit session key in a cookie (`__Host-`, HttpOnly, Secure, SameSite=Strict); only its SHA-256 hash in the database; logout ends it on the server; 24 h, or 30 days with "Angemeldet bleiben" (renewed while used); all sessions of a user end with a new password; command to end all sessions | ✅ |
| Authorization | Logged in = may read and edit the storybooks (a private app for people who trust each other); perspectives only by their author; photos checked per request | ✅ |
| Self-contained Tokens, OAuth/OIDC, WebRTC | Not used | ➖ |
| Cryptography | Only standard libraries (Node `crypto`, bcrypt, SCRAM, TLS); no own crypto | ✅ |
| Secure Communication | HTTPS only (HSTS), TLS 1.2/1.3; the backend only on `127.0.0.1` | ✅ |
| Configuration | Secrets only in `server/.env` (`600`, readable only by the backend's own user) and on the server (`/etc/storybook/`, `/etc/dk-srv/`), never in the repository; dependencies checked nightly (`npm audit`), Dependabot on GitHub | ✅ |
| Data Protection | Photos without GPS, private caching, encrypted backups, map tiles through this server (OpenStreetMap doesn't see who looks where) | ✅ |
| Secure Coding and Architecture | Small, documented code; every change described in the roadmap; the backend runs as **its own user, in a sandbox** (section 2) | ✅ |
| Security Logging and Error Handling | Failed/blocked logins and refused requests logged with IP; no stack traces in answers; the backend refuses to start with missing secrets or address | ✅ |

### OWASP Top 10 (2025) at a glance

| Risk | Covered by |
|---|---|
| A01 Broken Access Control | Login on every API route and every photo (nginx `auth_request`); Origin check; SameSite cookies |
| A02 Security Misconfiguration | The server by CIS for Ubuntu, nginx, PostgreSQL (dk-srv), drift check every night; this site's nginx config below |
| A03 Software Supply Chain Failures | Lockfiles, `npm ci`, nightly `npm audit` (critical → maintenance mode), Dependabot, Ubuntu Pro updates |
| A04 Cryptographic Failures | TLS 1.2/1.3 AEAD only, HSTS, bcrypt, SCRAM, hashed session keys, encrypted backups |
| A05 Injection | Parameterised SQL, React output escaping, strict CSP |
| A06 Insecure Design | Threat model above; least privilege in every layer (the backend's own user and sandbox); restricted backup key |
| A07 Authentication Failures | Wait times, lockout notification, rate limits, fail2ban, strong session cookies – 2FA planned (A8) |
| A08 Software or Data Integrity Failures | AIDE, auditd (dk-srv); root runs only a root-owned copy of `ops/root/`; monthly restore test |
| A09 Logging & Alerting Failures | Phone notifications for logins, bans, lockouts, integrity changes, failed backups, security findings; weekly report |
| A10 Mishandling of Exceptional Conditions | Generic error answers; refuses to start without proper configuration; failed checks notify |

## 2. The backend's user and sandbox

If someone found a hole in the backend or one of its libraries, they would get what the backend's
process may do – so it may do little ([`ops/README.md`](../ops/README.md), "The backend's user"):

| What | |
|---|---|
| Runs as `storybook`, a system user of its own: no password, no shell, no home folder, not in `sudo` – not as the admin user, who logs in and has sudo | ✅ |
| Can't change its own code: `/srv/storybook` belongs to the admin user; root runs nothing from it (`ops/root/` comes from a root-owned copy) | ✅ |
| Only it reads `server/.env`; it writes only the photo folder | ✅ |
| systemd sandbox ([`ops/root/storybook.service`](../ops/root/storybook.service)): file system read-only except the photos, no `/home`, own `/tmp` and `/dev`, no new privileges or capabilities, kernel/clock/other processes off limits, only the needed network kinds and system calls | ✅ |
| Measured: `systemd-analyze security storybook` **1.4 "OK"** (0 = locked down, 10 = unprotected; on the server, 2026-11-11) – the same backend without the sandbox: 9.0 "UNSAFE" | ✅ |
| Checked every night (dk-srv): runs as its own user, that user can't log in and isn't an admin, the sandbox is on | ✅ |
| Network: it may still reach anything (database, map search, notifications) – a per-service address filter would need the map search's changing addresses | ⚠️ accepted |

## 3. Its nginx site (CIS NGINX Benchmark)

[`ops/root/nginx/storybook.conf`](../ops/root/nginx/storybook.conf) and the maintenance config,
installed by `ops/root/install.sh` through dk-srv's `dk-app-update` (checked with `nginx -t`, put
back if it fails). Everything for all sites (default-deny, versions hidden, timeouts, connection
limits, TLS 1.2/1.3 with AEAD ciphers, HSTS) is dk-srv's.

| Recommendation | What's done | |
|---|---|---|
| Methods | GET, HEAD, POST, PUT, DELETE, OPTIONS – what the app uses | ✅ |
| Hidden files | `.git`, `.env`, … never served | ✅ |
| Request limits | Body ≤ 1 MB (photo uploads 50 MB, one location); rate limits for login (10/min), API (20/s) and map tiles | ✅ |
| Logging | Access and error logs; IPs that keep hitting the rate limits are banned by fail2ban | ✅ |
| Security headers | Content-Security-Policy without inline scripts/styles, `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`, `Cross-Origin-Opener-Policy`, HSTS | ✅ |
| Photos | Served only after the backend confirmed the login (`auth_request`); only image types; `Cache-Control: private` | ✅ |
| Maintenance mode | Every address (app, API, photos) answers 503 with a static page; the backend is stopped | ✅ |

## 4. Backups

| What | |
|---|---|
| Nightly database dump and copy of every original photo; 7 daily + 12 monthly dumps | ✅ |
| **Encrypted** on the server ([age](https://age-encryption.org), X25519): the secret key is only on the owner's computer and in a password manager – the server can't read its own backups. Never quietly unencrypted: without a readable key the backup stops with a notification | ✅ |
| Fetched to a second machine with a **key that can only read the backups** (`rrsync -ro`), with its own notification | ✅ |
| **Monthly restore test**: the dump is restored into a separate database, every table's row count compared with the live one, every photo checked for its copy; result as a notification | ✅ |

## 5. Notifications (from the storybook)

An app account with 20 failed logins in a row (someone guessing a password) · a failed backup ·
the monthly restore test · maintenance mode on/off. The server's own (SSH logins, bans, security
findings, file changes, the weekly report) are dk-srv's. Messages contain no passwords, secrets or
login names.

---

## Accepted risks and known gaps

The server's (A1–A7, A9–A13: partitions, bootloader password, auditd on a full disk, …) are in
dk-srv's [SECURITY.md](https://github.com/DimiJonas/dk-srv/blob/main/SECURITY.md#accepted-risks-and-known-gaps).
The storybook's own:

| | Risk | Why it's accepted |
|---|---|---|
| A8 | No second factor for the app login | Planned as its own step (codes from an authenticator app). Until then: long passwords, wait times, notifications on lockouts |

## Reporting a problem

If you find a security problem in the code, please use GitHub's private vulnerability reporting
for this repository, or open an issue without details and ask for a private contact – thank you.
