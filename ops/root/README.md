# ops/root – what root runs for the storybook

Everything in this folder is run or installed **as root** on the server – and nothing else in the
repository is. The server's own tooling, [dk-srv](https://github.com/DimiJonas/dk-srv), keeps a
**root-owned copy of just this folder** (a sparse git clone in `/opt/dk-apps/storybook`) and runs
`install.sh` from there:

```sh
sudo dk-app-update storybook https://github.com/DimiJonas/storybook   # the first time
sudo dk-app-update storybook                                          # after a deploy that changed ops/root/
```

It shows what changed in this folder since the last time and asks before installing. The app's
own copy (`~/storybook`, owned by the user the backend runs as) is only used to run the app – so a
hole in the app could change that copy, but never what root runs.

| File | Installed as | What |
|---|---|---|
| `install.sh` | – | asks for the address once (`/etc/storybook/site.conf`), installs the rest |
| `nginx/storybook.conf` | `/etc/nginx/sites-available/storybook` | the site (template, address filled in) |
| `nginx/storybook-maintenance.conf` | `…/storybook-maintenance` | maintenance mode: every address gets the pause page (503) |
| `maintenance/index.html` | `/etc/storybook/maintenance/` | the "kurze Pause" page |
| `storybook-mode` | `/usr/local/sbin/storybook-mode` | `status`, `maintenance`, `normal`, and `stop`/`start` for dk-srv's lockdown |
| `app.conf` | `/etc/dk-srv/apps.d/storybook.conf` | how dk-srv knows the app: user, folders, npm audit, address, backups, databases, AIDE |
| `logrotate.conf` | `/etc/dk-srv/logrotate.d/storybook` | the backend's and the backup's logs |
