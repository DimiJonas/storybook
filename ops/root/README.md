# ops/root – what root runs for the storybook

Everything in this folder is run or installed **as root** on the server – and nothing else in the
repository is. The server's own tooling, [dk-srv](https://github.com/DimiJonas/dk-srv), keeps a
**root-owned copy of just this folder** (a sparse git clone in `/opt/dk-apps/storybook`) and runs
`install.sh` from there:

```sh
sudo dk-app-update storybook https://github.com/DimiJonas/storybook   # the first time
sudo dk-app-update storybook                                          # after a deploy that changed ops/root/
```

It shows what changed in this folder since the last time and asks before installing. The code the
backend runs (`/srv/storybook`, a git clone of the admin user) is never run by root – so a hole in
the app could at most reach the backend's own user, never what root runs.

| File | Installed as | What |
|---|---|---|
| `install.sh` | – | asks for the address once (`/etc/storybook/site.conf`), creates the backend's user, installs the rest |
| `storybook.service` | `/etc/systemd/system/storybook.service` | the backend: as the user `storybook`, in a sandbox (template, folder filled in) |
| `storybook-run` | `/usr/local/sbin/storybook-run` | the backend's admin scripts as its user: `sudo storybook-run sessions` … |
| `storybook-mode` | `/usr/local/sbin/storybook-mode` | `status`, `maintenance`, `normal`, and `stop`/`start` for dk-srv's lockdown |
| `nginx/storybook.conf` | `/etc/nginx/sites-available/storybook` | the site (template, address filled in) |
| `nginx/storybook-maintenance.conf` | `…/storybook-maintenance` | maintenance mode: every address gets the pause page (503) |
| `maintenance/index.html` | `/etc/storybook/maintenance/` | the "kurze Pause" page |
| `app.conf` | `/etc/dk-srv/apps.d/storybook.conf` | how dk-srv knows the app: user, service, code, npm audit, address, backups, databases, AIDE |
| `logrotate.conf` | `/etc/dk-srv/logrotate.d/storybook` | the backend's and the backup's logs |

What `install.sh` also sets each time (and puts right if it changed):
- the user **`storybook`**: a system user without password, shell or home folder, in the group
  `dk-notify` (it may read the ntfy topic – the backend sends notifications too)
- `/srv/storybook`: group `storybook`, setgid folders (`2750`), files group-readable – the backend
  reads the code through its group; what appuser creates later inherits the group; others get nothing
- `/srv/storybook/server/.env`: owned by `storybook`, `600` – only the backend reads the secrets
- `/etc/storybook/uploads`: owned by `storybook` (it writes the photos; folders `755`, files `644`,
  so nginx can serve them)
- `/var/log/storybook/`: `root:adm`, `750`, the files `640` – systemd writes the backend's output there
- the service is started (and starts after a reboot) – unless maintenance mode or dk-srv's
  lockdown is on
