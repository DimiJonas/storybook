# Operations: backups, database migrations, security

Commands marked **server** run on the server as `appuser` (the admin user), **local** on your
computer. The backend itself runs as its own user, `storybook` – see "The backend's user".

The server itself – its hardening, the nightly security check, notifications, the lockdown, nginx's
server-wide part – is its own repository: **[dk-srv](https://github.com/DimiJonas/dk-srv)**. This
file is about the storybook; where it meets dk-srv, it says so.

## Deploying an update (normal case)

```sh
# server
cd /srv/storybook && git pull
cd server && npm ci
sudo storybook-run migrate      # only does something if there are new migrations
sudo systemctl restart storybook
cd ../client && npm ci && ./update_nginx.sh
```

If `ops/root/` changed (the service, the nginx configs, the maintenance page, `storybook-mode`,
`storybook-run`, `app.conf`, `logrotate.conf` – `git pull` lists the changed files):
`sudo dk-app-update storybook` (see "What root runs: ops/root"). It pulls its own root-owned copy,
shows what changed and asks.

## What's only on the server (never in the repository)

The repository is the same for everyone; everything that belongs to one server stays on it:

| File | What |
|---|---|
| `/srv/storybook/server/.env` | database password, secret, `NODE_ENV=production` (owned by `storybook`, `600` – only the backend reads it; you: `sudo nano`) |
| `/etc/storybook/site.conf` | `DOMAIN` (the storybook's address) and `CERT_NAME` (the certificate's folder) – written by `ops/root/install.sh` (asked once), read by the backend, the nginx configs and `storybook-mode` |
| `/etc/storybook/backup.conf` | `AGE_RECIPIENT` – the **public** key the backups are encrypted to (the secret one is only on your computer); `644`, the backup runs as appuser and must read it |
| `/etc/storybook/uploads/` | the photos (owned by `storybook`: the backend writes them) |
| `/etc/storybook/clientbuild/`, `maintenance/` | the built app and the "kurze Pause" page that nginx serves |
| `/var/lib/storybook/mode` | the maintenance mode's reason and time, while it's on |
| `/etc/dk-srv/apps.d/storybook.conf` | how dk-srv knows the storybook (from `ops/root/app.conf`) |
| `/etc/dk-srv/notify.conf` | the ntfy topic for phone notifications (secret; dk-srv's, group `dk-notify` – the backend and the backup read it too) |
| `/var/log/storybook/` | the backend's output (`backend.log`, `backend-error.log`) |

The repository's nginx configs (`ops/root/nginx/`) are templates with `storybook.example.com`; the
commands files read the address from `site.conf` where they need it.

After a migration, update the snapshot **local** (`cd server && npm run migrate && npm run db:schema`)
and commit `schema.sql`. Don't run `npm run db:schema` on the server – `schema.sql` comes from git
there. If `git pull` on the server complains about a changed `schema.sql`, throw that change away
with `git checkout -- schema.sql` and pull again.

---

## Backups

**What:** every night `ops/backup.sh` writes a database dump to `~/backups/storybook/db/` and an
encrypted copy of every new original photo to `~/backups/storybook/photos/`. It keeps the last 7 daily
dumps and the first dump of each month for 12 months. Photos are never removed from the backup,
even if they are deleted in the app.

**Encrypted (step 15):** with [age](https://age-encryption.org) to a public key – the secret key
exists only on your computer (and in your password manager). On the server the backups can't be
read, not even by root, and a copy that gets lost is useless to others. **Without the secret key
the backups are lost too** – keep its copy in the password manager.

**Restore test (step 15):** with the first backup of each month the new dump is restored into the
separate database `storybook_restoretest`, every table's row count is compared with the live
database, every photo is checked for its copy, and the test database is emptied again. Result: a
notification ("Restore test passed" / "FAILED") and `~/backups/storybook/restore-test.log`; the
weekly report shows the last one. By hand: `FORCE_RESTORE_TEST=1 /srv/storybook/ops/backup.sh`.

### One-time setup (server)

1. Let the backup read the database password from `~/.pgpass` (same password as `DB_PASSWORD` in
   `server/.env`; `*` = every database, so the restore test can log in too):
   ```sh
   echo 'localhost:5432:*:webapp:YOUR_DB_PASSWORD' > ~/.pgpass
   chmod 600 ~/.pgpass
   ```
2. The key pair (**local**, once) and the public key on the server:
   ```sh
   # local
   sudo apt install age
   mkdir -p ~/.config/storybook && age-keygen -o ~/.config/storybook/backup-key.txt   # prints "Public key: age1…"
   chmod 600 ~/.config/storybook/backup-key.txt
   # copy the whole file's contents into your password manager now
   # server
   sudo apt install age
   echo "AGE_RECIPIENT=age1…" | sudo tee /etc/storybook/backup.conf
   sudo chmod 644 /etc/storybook/backup.conf          # the backup runs as appuser (umask 027 made it 640)
   sudo dk-aide-check expect /etc/storybook/backup.conf          # changed on purpose (file integrity check)
   ```
   Without a readable key the backup stops with a "Backup failed" notification – it never quietly
   makes unencrypted copies (also not when encrypted ones exist and the key is gone).
3. The restore-test database: `sudo /opt/dk-srv/hardening/install-hardening.sh postgres` (dk-srv
   creates the databases named in `ops/root/app.conf`, `DATABASES`).
4. Run it once by hand and check the output (the first encrypted run also encrypts the older backups
   and removes the unencrypted copies):
   ```sh
   FORCE_RESTORE_TEST=1 /srv/storybook/ops/backup.sh
   ```
5. Run it every night at 03:15: as `appuser`, `crontab -e` and add this line:
   ```
   15 3 * * * /srv/storybook/ops/backup.sh >> /home/appuser/backups/storybook/backup.log 2>&1
   ```
   (Alternatively in `/etc/crontab` – there every line needs the user between the time and the
   command: `15 3 * * * appuser /srv/storybook/ops/backup.sh >> ...`. Without it, cron
   takes the script path as the user name and never runs it.)
6. Next day: `tail ~/backups/storybook/backup.log` should end with `backup done (encrypted)`.

### Fetching the backups to your computer (local)

```sh
~/storybook/ops/pull-backup.sh
```
Copies everything new to `~/storybook-backups/` and then checks that the newest dump decrypts with
your key. The first run copies all photos, later runs only new files.

It logs in with **its own SSH key that may only read the backups folder** (nothing else – no
shell, no writing) and the server sends a "Backups pulled" notification for it. Set up once:
```sh
# local: the key (no passphrase if you want to run it unattended; with one, ssh-agent asks once)
ssh-keygen -t ed25519 -f ~/.ssh/storybook_backup -C "storybook backup pull"
cat >> ~/.ssh/config <<'CONF'
Host storybook-backup
    HostName SERVER
    User appuser
    IdentityFile ~/.ssh/storybook_backup
    IdentitiesOnly yes
CONF
cat ~/.ssh/storybook_backup.pub          # copy this line
# server: one line in ~/.ssh/authorized_keys – the key may only run rrsync, read-only, in the backups folder
echo 'restrict,command="/usr/bin/rrsync -ro /home/appuser/backups/storybook" PASTE-THE-KEY-LINE-HERE' >> ~/.ssh/authorized_keys
```
Your normal login needs the same `IdentitiesOnly yes` (dk-srv's `setup-commands.txt`, step 1: the
alias `dk`). Without it, `ssh appuser@SERVER` offers every key the laptop's SSH agent holds – also
this backup key, which the server then takes: you'd land in the read-only backup copy, where every
path starts in the backups folder.
(`SERVER` = the server's address, as you type it after `ssh`.)

### Restoring

**First decrypt** (on your computer, with the secret key) – the newest backup, or the one of a day:
```sh
~/storybook/ops/decrypt-backup.sh ~/storybook-backups ~/storybook-restore              # newest
~/storybook/ops/decrypt-backup.sh ~/storybook-backups ~/storybook-restore 2026-10-01   # that day
```
That gives `~/storybook-restore/storybook-<date>.dump` and `~/storybook-restore/uploads/` (all
photos). To restore on the server, copy them there first (e.g. `rsync -a ~/storybook-restore/ SERVER:storybook-restore/`)
and delete the unencrypted folders afterwards. The commands below use `~/storybook-restore/…`.

`--no-owner --no-privileges`: everything restored belongs to `webapp`, the user doing the restore
(permissions from the original database aren't needed and can't all be restored by `webapp`).

On your computer, use the Postgres 16 tools explicitly: `/usr/lib/postgresql/16/bin/pg_restore`
instead of `pg_restore`. Ubuntu's `pg_restore` command otherwise picks the newest installed version
(18) for network connections, which sends a setting a version-16 database doesn't know
(`transaction_timeout` – harmless, but an error message).

Database (into a new, empty database – here `storybook_restore`, to look at it first):
```sh
sudo -u postgres createdb -O webapp storybook_restore
pg_restore -U webapp -h localhost -d storybook_restore --no-owner --no-privileges ~/storybook-restore/storybook-2026-10-22.dump
```
To really replace the live database:
```sh
sudo storybook-mode maintenance --reason "restoring the database"
sudo -u postgres dropdb storybook
sudo -u postgres createdb -O webapp storybook
pg_restore -U webapp -h localhost -d storybook --no-owner --no-privileges ~/storybook-restore/storybook-2026-10-22.dump
sudo storybook-mode normal
```

Only one storybook (e.g. `book_2`), leaving the others as they are – first remove and recreate its
empty schema, because `pg_restore -n` restores the tables but not the schema itself:
```sh
sudo storybook-mode maintenance --reason "restoring the database"
psql -U webapp -h localhost -d storybook -c 'DROP SCHEMA book_2 CASCADE' -c 'CREATE SCHEMA book_2'
pg_restore -U webapp -h localhost -d storybook --no-owner --no-privileges -n book_2 ~/storybook-restore/storybook-2026-10-22.dump
sudo storybook-mode normal
```

Photos (one folder per storybook): copy them back and recreate the small versions:
```sh
sudo rsync -a --chown=storybook:storybook ~/storybook-restore/uploads/ /etc/storybook/uploads/
sudo storybook-run photos:thumbnails     # recreates the small versions
```

---

## Database migrations

Changes to the database structure are numbered files:
- `server/migrations/` – **shared** ones, run once per database (users, …)
- `server/migrations/book/` – **per storybook**, run in every storybook's schema (`book_1`, `book_2`, …).
  They don't name the schema (`CREATE TABLE x`, not `book_1.x`); the migrate command runs them inside
  each storybook. Tables that belong to a storybook (memories, photos, …) go here.

`npm run migrate` (on the server: `sudo storybook-run migrate`) applies the ones a database or
storybook doesn't have yet (remembered in the table
`schema_migrations` of `public` and of each storybook), each completely or not at all – first the
shared ones, then every storybook. `schema.sql` is the readable snapshot of the current structure
(all schemas); `npm run db:schema` regenerates it.

```sh
# local (laptop), in server/
npm run migrate -- --list      # show applied / pending
npm run migrate                # apply pending ones
npm run db:schema              # update schema.sql, then commit it
# server
sudo storybook-run migrate --list
sudo storybook-run migrate
```

New migration: add the next number, e.g. `server/migrations/book/001_something.sql`. Never change a
migration that was already applied somewhere – add a new one instead.

**Creating a new, empty database:** create it with the `webapp` user as owner, then
`npm run migrate` creates all tables (starting with `000_baseline.sql`; migration `003` creates the
first storybook `book_1`). Restoring a backup is the other way (with data).

### One-time setup (server, and local if needed)

(If restoring a backup ever shows *permission denied to change default privileges*: an old setting
from the first setup. Remove it once with
`sudo -u postgres psql -d storybook -c "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM webapp; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM webapp;"`
– it's not needed since `webapp` owns the tables.)


The `webapp` user needs to own the tables to change them. If they were created by `postgres`
(e.g. when the database was restored with `psql -U postgres`), `npm run migrate` says
*"isn't allowed to create or change tables"*. Check who owns them:
```sh
sudo -u postgres psql -d storybook -c '\dt'
```
If the owner is `postgres`, hand them over (once):
```sh
sudo -u postgres psql -d storybook -c "ALTER TABLE chapters OWNER TO webapp; ALTER TABLE images OWNER TO webapp; ALTER TABLE important_dates OWNER TO webapp; ALTER TABLE users OWNER TO webapp; GRANT ALL ON SCHEMA public TO webapp;"
```
(The ID counters of the tables move along automatically.)

---

## Storybooks

Every storybook has its own schema in the database (`book_1`, `book_2`, … with its own memories,
photos list, …) and its own photo folder (`/etc/storybook/uploads/book_1/` with `thumb/` and
`medium/`). The users are shared, and every user sees every storybook. The app finds storybooks by
themselves.

```sh
# server
sudo storybook-run storybook:create "Familie"     # new, empty storybook (appears in the app right away)
```
**Renaming:** in the app's menu (⋮ → "Storybook umbenennen"). **Deleting** a storybook isn't
possible in the app; by hand: `psql -U webapp -h localhost -d storybook -c 'DROP SCHEMA book_2 CASCADE'`
and delete its photo folder (backups first!).

---

## Logs and log rotation

| Log | Where (server) | Rotation |
|---|---|---|
| Backend (`storybook.service`) | `/var/log/storybook/backend.log`, `backend-error.log` | daily, and when a file passes 20 MB; 14 kept |
| Nightly backup | `~/backups/storybook/backup.log` | monthly; 12 kept |
| dk-srv's checks, sudo | `/var/log/dk-srv/*.log`, `/var/log/sudo.log` | dk-srv's |
| nginx | `/var/log/nginx/access.log`, `error.log` | Ubuntu's: daily; 14 kept |

The storybook's logs are rotated by `ops/root/logrotate.conf`, installed by `dk-app-update` as
`/etc/dk-srv/logrotate.d/storybook`; dk-srv runs the rotation **every hour** (its own state file,
not Ubuntu's once-a-day run), so a log that suddenly grows is cut off within the hour. Old copies
are `<name>.1`, then `<name>.2.gz`, `<name>.3.gz`, … (newest first; `zless` reads the `.gz` ones).
The backend's logs are copied and emptied in place, so systemd keeps writing without a restart; they're
kept for 14 days only because they contain IP addresses and the usernames of failed logins. The
work in appuser's folders is done as appuser (`su` in the file), not as root.

```sh
# server: what the rotation would do now (changes nothing)
sudo logrotate --debug --state /var/lib/dk-srv/logrotate.status /etc/dk-srv/logrotate.conf
```

---

## Security

- **Login waiting time** (in the backend, `server/src/loginLimiter.js`): per IP address 5 failed
  attempts, then 30 s, doubling with each further failure up to 1 h; per account the same from 20
  failures. A restart of the backend resets the counters.
- **nginx** passes the visitor's IP to the backend (`X-Forwarded-For`) and limits `/api/login` to
  10 requests per minute per IP. Without the `X-Forwarded-For` line, all visitors would look like
  `127.0.0.1` to the backend and share one counter.
- **nginx security headers** (`ops/root/nginx/storybook.conf`): HTTPS only (HSTS), a
  Content-Security-Policy (the browser only runs scripts/styles from our own files – see
  `client/README.md` before adding anything from other websites), no frames, no microphone/location,
  nginx version hidden.
- **Login cookie** (step 14): a login is a cookie the browser keeps (`__Host-sb_session`,
  HttpOnly – scripts can't read it, so even a code-injection bug couldn't steal it; Secure;
  SameSite=Strict – other websites can't use it). The database (table `sessions`) only stores a
  hash of it, so a backup contains no usable logins. "Angemeldet bleiben" = 30 days, renewed
  while the app is used; otherwise until the browser closes, at most 24 h. Logout ends the login
  on the server too. Requests that change something must come from the app's own address
  (Origin check). Running logins: `sudo storybook-run sessions`.
- **Photos only for logged-in visitors** (step 14): before serving a photo, nginx asks the backend
  (`auth_request` → `/api/auth/photo`); without a valid login cookie the answer is 401. Photos are
  kept only on the device itself (`Cache-Control: private`, 30 days). Ubuntu's nginx has the
  module built in (`nginx -V 2>&1 | grep -o http_auth_request_module` prints it).
- The backend only listens on `127.0.0.1` and refuses to start without a `JWT_SECRET` of at least
  32 characters in `server/.env` (since step 14 only used for login tokens from before the switch
  to cookies, which run out within 24 h – the server makes no new ones).
- Requests (other than photo uploads) may be at most 1 MB; wrong input gets a clear 400 answer.
- Only photos can be uploaded (checked by file name *and* content); they get random names.
- **Photo positions** (step 11): when a photo is uploaded, its GPS position is turned into its town
  and then removed from the file (exiftool must be installed: `exiftool -ver`). Photos from before
  step 11: once `sudo storybook-run photos:places` (try `--dry-run` first). The
  backup copy of a photo gets the changed file with the next backup run.
- **Map pictures** come through nginx (`/tiles/`, kept in `/var/cache/nginx/storybook-tiles`, at
  most 2 GB): only for pages of this site (Referer), no cookies or login are passed on to
  OpenStreetMap, and nothing with `?...` (that would get around the cache).

**Checking the headers** after a deploy (should list `strict-transport-security`,
`content-security-policy`, …):
```sh
curl -sI https://$(. /etc/storybook/site.conf; echo $DOMAIN) | grep -iE 'strict|content-security|x-frame|permissions|server'
```
Or online: https://securityheaders.com and https://www.ssllabs.com/ssltest/ (enter the address).

If something in the app stops working right after a header change, check the browser's developer
console for "Content Security Policy" messages – they name what was blocked. Quick way back:
put a `#` in front of the `add_header Content-Security-Policy` line in
`/etc/nginx/sites-available/storybook`, then `sudo nginx -t && sudo systemctl reload nginx`
(the next `dk-app-update storybook` puts the repository's version back).

### Emergency: end logins (e.g. a phone was lost or stolen)

Every login is listed on the server and can be ended there (step 14). Ended logins stop working
within half a minute (the backend remembers checked logins that long) – the app then shows the
login page, photos aren't shown any more.
```sh
# server
sudo storybook-run sessions                  # the running logins: who, which device, since, last used
sudo storybook-run sessions --end anna       # end all of anna's logins (every device)
sudo storybook-run sessions --end-all        # end everyone's logins (everyone logs in again)
```
If a password may be known to someone else, set a new one – that ends that person's logins too:
`sudo storybook-run user:password <name>` (asks for it hidden; `--lock` locks the login instead). Users
are never deleted – the database refuses it while they have memories.

### Maintenance mode (and dk-srv's lockdown)

Both survive reboots; each step is checked, and your phone gets a notification.
- **maintenance mode** – the storybook's own: the backend is stopped and nginx answers every
  address (app, `/api`, photos) with a "kurze Pause" page and status 503 – for problems in the
  storybook's libraries or Node.js, or planned work. The phone app shows the same message.
  `sudo storybook-mode maintenance | normal | status` (`ops/root/storybook-mode`; `--reason "…"`;
  `normal` refuses while critical npm problems are still there, `--force` switches anyway and
  accepts them as false alarms). dk-srv's nightly check switches it on by itself for a critical
  problem in the libraries (once `MODE=auto` is set in `/etc/dk-srv/dk-srv.conf`).
- **lockdown** – the server's: nginx is switched off completely and ports 80/443 are closed – only
  SSH stays reachable. For a severe problem in nginx/OpenSSL themselves that has no fix yet.
  `sudo dk-mode lockdown | normal | status`; it stops and starts the backend through
  `storybook-mode stop | start`.

The same steps by hand: `project_maintenance_commands.txt` (maintenance mode) and dk-srv's
`maintenance-commands.txt` (lockdown).

### Checklist (once, and after changes to the server)

None of these commands show secrets. Expected result after the `#`:
```sh
stat -c '%A %U:%G %n' /etc/storybook/uploads /etc/storybook/uploads/book_1
                                    # drwxr-xr-x storybook:storybook (NOT drwxrwxrwx)
sudo stat -c '%a %U' /srv/storybook/server/.env               # 600 storybook
sudo grep -c '^DB_USER=webapp$' /srv/storybook/server/.env    # 1 (the app doesn't use the postgres superuser)
systemctl show -p User --value storybook                      # storybook (not root, not appuser)
sudo ss -tlnp                       # 5432 (postgres) and 3001 (node) only on 127.0.0.1
sudo dk-mode status                 # the server normal, the storybook normal
```
The server's own checks (SSH, firewall, updates, fail2ban, the hardening) are dk-srv's
(`sudo bash -c '. /usr/local/lib/dk-srv/security-lib.sh; hardening_drift'` prints nothing when
everything is in place).

Fixes, if a check shows something else:
- **Photo folder writable by everyone**: the backend (`storybook`) writes, nginx only reads:
  ```sh
  sudo chown -R storybook:storybook /etc/storybook/uploads
  sudo find /etc/storybook/uploads -type d -exec chmod 755 {} +
  sudo find /etc/storybook/uploads -type f -exec chmod 644 {} +
  ```
- **`.env` readable by others:** `sudo dk-app-update storybook` puts it right (`600`, owned by `storybook`)
- **Node.js updates:** Ubuntu's automatic updates only include Ubuntu's own packages, not Node from
  NodeSource. Include it (only updates within Node 24):
  ```sh
  echo 'Unattended-Upgrade::Origins-Pattern { "site=deb.nodesource.com"; };' | sudo tee /etc/apt/apt.conf.d/52unattended-upgrades-nodesource
  sudo unattended-upgrade --dry-run --debug 2>&1 | grep -i 'allowed origins'   # should mention deb.nodesource.com
  ```
  A new Node version is only used after `sudo systemctl restart storybook` (or a reboot). dk-srv's nightly
  check also installs Node's security releases by itself and restarts the backend.
- **Unexpected files in the photo folder** (should print nothing – only photos belong there):
  ```sh
  find /etc/storybook/uploads -type f -not -iregex '.*\.\(jpe?g\|png\|webp\|gif\|heic\|heif\|avif\)'
  ```
- **Laptop:** the backup copy in `~/storybook-backups/` contains all photos and the password hashes –
  the laptop's disk should be encrypted (Ubuntu: chosen at installation).

---

## What root runs: ops/root

Everything of the storybook that runs as root is in **one folder, `ops/root/`** – and nothing else
in the repository is (details: [`ops/root/README.md`](root/README.md)):

| File | Installed as |
|---|---|
| `storybook.service` | `/etc/systemd/system/storybook.service` – the backend, as its own user, in a sandbox |
| `storybook-run` | `/usr/local/sbin/storybook-run` – the admin scripts as the backend's user |
| `nginx/storybook.conf` | `/etc/nginx/sites-available/storybook` – the site (template, address filled in) |
| `nginx/storybook-maintenance.conf` | `…/storybook-maintenance` – maintenance mode |
| `maintenance/index.html` | `/etc/storybook/maintenance/` – the "kurze Pause" page |
| `storybook-mode` | `/usr/local/sbin/storybook-mode` |
| `app.conf` | `/etc/dk-srv/apps.d/storybook.conf` – how dk-srv knows the storybook |
| `logrotate.conf` | `/etc/dk-srv/logrotate.d/storybook` |

dk-srv installs it: **`sudo dk-app-update storybook`** (the first time with the repository's
address). It keeps a **root-owned copy of just this folder** (`/opt/dk-apps/storybook`, a sparse
git clone – the rest of the repository isn't even downloaded), shows the new commits and what
changed in `ops/root/`, asks, and runs `ops/root/install.sh` from there. So root never runs files
from `/srv/storybook`.

`install.sh` asks once for the storybook's address and certificate folder (stored in
`/etc/storybook/site.conf`, never in the repository), fills in the nginx templates, checks them
with `nginx -t` and reloads nginx – if nginx doesn't accept them, the old ones are put back. Which
of the two configs is switched on (maintenance mode) isn't changed. It also creates the backend's
user and sets the rights below, each time (it puts them right if they changed).

---

## The backend's user

The backend runs as **`storybook`**, a system user of its own – not as `appuser`, who logs in by
SSH and has sudo. If someone found a hole in the backend or one of its libraries, they would get
only `storybook`:

| | `appuser` (you, the admin) | `storybook` (the backend) |
|---|---|---|
| SSH login, sudo | yes | no – no password, no shell (`nologin`), no home folder |
| the code, `/srv/storybook` (git clone) | owns it: `git pull`, `npm ci`, builds | reads only, through its group |
| `server/.env` (secrets) | with sudo (`sudo nano …`) | reads (`600`, its own) |
| the photos, `/etc/storybook/uploads` | reads (for the backups) | writes |
| the ntfy topic | reads (group `dk-notify`) | reads (group `dk-notify`) |
| runs | deploys, the nightly backup, the admin scripts through `sudo storybook-run` | the backend (`storybook.service`) |

The code is in `/srv/storybook`, not in appuser's home: home folders are `750` (CIS), so the
backend's user couldn't even read it there – and the service hides `/home` from it completely.
It reads the code through its **group**: every folder in `/srv/storybook` belongs to the group
`storybook` and has the **setgid bit** (`2750`), so whatever appuser creates later (`git pull`,
`npm ci`) belongs to that group too. appuser's umask is `027` (CIS): new files are `640`, folders
`750` – readable for the group, not for others. `ops/root/install.sh` puts it right if it changed.

**The sandbox** (`ops/root/storybook.service`): for the backend the whole file system is read-only
except the photo folder; `/home` and `/root` don't exist for it; it gets its own empty `/tmp` and
`/dev`; it can't gain rights (no setuid, no capabilities, no new namespaces), can't touch the kernel,
the clock or other processes, and may only use the network kinds and system calls a normal service
needs. Measured with `systemd-analyze security storybook`: **1.4** ("OK", 0 = locked down, 10 =
unprotected) – the same backend without the sandbox is 9.0 ("UNSAFE"). What's still open, on
purpose: the network (database, map search, notifications), writable-and-executable memory (Node.js
compiles JavaScript at run time), photos readable for others (nginx serves them).

The **admin scripts** (`server/scripts/`, `npm run …` on your laptop) run on the server as the
backend's user, so they can read `.env` and write photos:
```sh
sudo storybook-run                        # lists them (the "scripts" of server/package.json)
sudo storybook-run sessions --end anna    # the same arguments as npm run …, without the "--"
```
They run outside the service's sandbox (as `storybook`, without sudo rights).

```sh
# server: is it running, as whom, since when; its sandbox score
systemctl status storybook
systemctl show -p User -p MainPID -p ActiveEnterTimestamp storybook
systemd-analyze security storybook | tail -1
```
dk-srv's nightly check reports if the service ever runs as another user, if `storybook` can log in
or is in an admin group, or if the sandbox is switched off.

If you edit the live nginx file by hand instead: the `limit_req_zone ...` line at the very top
(above `server {`) belongs to it. Without it, `nginx -t` fails with *zero size shared memory zone
"storybook_login"*.

---

## The server (dk-srv)

What the storybook gets from [dk-srv](https://github.com/DimiJonas/dk-srv), through its
`apps.d` file:

- **Hardening** by the CIS Benchmarks for Ubuntu, nginx and PostgreSQL – measured 100 % of the rules
  that apply (dk-srv's `SECURITY.md`; every mechanism explained in its `HARDENING.md`). For the
  storybook: its databases (`storybook`, `storybook_restoretest`) only for `webapp`, pgAudit for
  structure and role changes (not for memories), `/etc/storybook` watched by auditd and AIDE (an
  unexplained change there is an urgent notification; `update_nginx.sh` tells AIDE about a deploy).
- **The nightly security check** (05:10): `npm audit --omit=dev` in `server/` and `client/`
  (critical → maintenance mode), Node.js security releases (installed, backend restarted), Ubuntu's
  known problems; each problem once.
- **Notifications** to the phone (ntfy): SSH logins, bans, findings, file changes – and from the
  storybook itself: an app account with 20 failed logins (the backend), a failed backup, the
  monthly restore test (`ops/backup.sh`). They read the topic from dk-srv's `/etc/dk-srv/notify.conf`
  (`root:dk-notify`, `640`), and send nothing secret: no passwords, no login names.
- **The weekly report** (Monday): per app its mode, wrong and blocked logins (from nginx's log),
  backups x/7 and encrypted, the last restore test, npm problems, the certificate.
- **fail2ban**: scanners and IPs that keep hitting the login's rate limit are banned (with a
  notification); banned yourself? `sudo fail2ban-client set nginx-limit-req unbanip YOUR.IP`.
