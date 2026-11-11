#!/bin/bash
# Installs the storybook's root parts – run as root by dk-srv (https://github.com/DimiJonas/dk-srv):
#
#   sudo dk-app-update storybook                 (the first time with the repository's address)
#
# dk-app-update keeps a root-owned copy of just this folder (/opt/dk-apps/storybook/ops/root) and
# runs this script from there – so nothing root runs can be changed by the app's own user. It:
#   1. asks for the storybook's address once and keeps it in /etc/storybook/site.conf
#      (DOMAIN, CERT_NAME – never in the repository; also read by the backend)
#   2. fills in the nginx templates (nginx/storybook.conf, nginx/storybook-maintenance.conf) and
#      installs them as /etc/nginx/sites-available/storybook and …/storybook-maintenance, plus the
#      "kurze Pause" page (/etc/storybook/maintenance/) – checked with nginx -t, everything put back
#      if nginx doesn't accept it; which of the two is switched on (maintenance mode) isn't changed
#   3. the backend's own user "storybook" (no password, no shell, no home – a system user), the
#      rights of what it reads and writes (server/.env: only it; the photos: it writes), its log
#      folder /var/log/storybook, and its service /etc/systemd/system/storybook.service (started,
#      unless maintenance mode or dk-srv's lockdown is on)
#   4. the commands: /usr/local/sbin/storybook-mode, /usr/local/sbin/storybook-run (root-owned)
#   5. tells dk-srv about the storybook: /etc/dk-srv/apps.d/storybook.conf (app.conf filled in) –
#      the nightly check, the weekly report, the file integrity check and the hardening use it
#   6. the storybook's log rotation: /etc/dk-srv/logrotate.d/storybook (logrotate.conf)
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run by dk-srv: sudo dk-app-update storybook" >&2; exit 1; fi
HERE=$(cd "$(dirname "$0")" && pwd)
: "${DK_LIB:=/usr/local/lib/dk-srv}"
[ -r "$DK_LIB/nginx-lib.sh" ] || { echo "dk-srv isn't installed (sudo /opt/dk-srv/install.sh)" >&2; exit 1; }
# shellcheck source=/dev/null
. "$DK_LIB/security-lib.sh"
# shellcheck source=/dev/null
. "$DK_LIB/nginx-lib.sh"
: "${SB_ETC:=/etc/storybook}"
: "${LETSENCRYPT_DIR:=/etc/letsencrypt}"
: "${APP_USER:=storybook}"          # the backend's own user
: "${RUNTIME_DIR:=/srv/storybook}"     # the code (a git clone of the deploy user)
: "${UPLOADS:=$SB_ETC/uploads}"
DEPLOY_USER=$ADMIN_USER                # who deploys: owns the code, runs the backups (dk-srv.conf)
DEPLOY_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
[ -n "$DEPLOY_HOME" ] || { echo "User $DEPLOY_USER (ADMIN_USER in $DK_ETC/dk-srv.conf) doesn't exist." >&2; exit 1; }
[ -f "$RUNTIME_DIR/server/package.json" ] || { echo "The code isn't in $RUNTIME_DIR (project_setup_commands.txt: git clone … $RUNTIME_DIR)." >&2; exit 1; }
PLACEHOLDER=storybook.example.com
SITE_CONF="$SB_ETC/site.conf"

# --- 1. the storybook's address (/etc/storybook/site.conf) ------------------------------------------
value_of() { [ -r "$SITE_CONF" ] && sed -nE "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*['\"]?([A-Za-z0-9.-]*)['\"]?[[:space:]]*(#.*)?$/\1/p" "$SITE_CONF" | tail -1; }
valid_domain() { [[ $1 =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] && [ "$1" != "$PLACEHOLDER" ]; }
domain=$(value_of DOMAIN || true)
cert=$(value_of CERT_NAME || true)
if ! valid_domain "${domain:-}" || ! [[ ${cert:-} =~ ^[A-Za-z0-9._-]+$ ]]; then
  if [ ! -t 0 ]; then echo "$SITE_CONF is missing or incomplete – run this in a terminal once." >&2; exit 1; fi
  guess_cert=$(ls "$LETSENCRYPT_DIR/live" 2>/dev/null | grep -v README | head -1 || true)
  echo "== The storybook's address (stored in $SITE_CONF, never in the repository)"
  while ! valid_domain "${domain:-}"; do
    read -rp "   Domain, e.g. storybook.your-domain.de: " domain
    domain=$(printf '%s' "$domain" | tr 'A-Z' 'a-z')
  done
  echo "   The certificate's folder: sudo certbot certificates shows \"Certificate Path: $LETSENCRYPT_DIR/live/<folder>/fullchain.pem\""
  while ! [[ ${cert:-} =~ ^[A-Za-z0-9._-]+$ ]]; do
    read -rp "   Certificate folder${guess_cert:+ [$guess_cert]}: " cert
    cert=${cert:-$guess_cert}
  done
  install -d -o root -g root -m 755 "$SB_ETC"
  { [ -e "$SITE_CONF" ] && grep -vE '^[[:space:]]*(DOMAIN|CERT_NAME)[[:space:]]*=' "$SITE_CONF"
    printf '%s\n' "DOMAIN=$domain" "CERT_NAME=$cert"; } > "$SITE_CONF.new" || true
  [ -s "$SITE_CONF.new" ] || printf '%s\n' "# The storybook's address on this server (ops/root/install.sh). Read by the nginx configs," \
    "# the backend (origin check; sudo systemctl restart storybook after a change) and the security scripts." "DOMAIN=$domain" "CERT_NAME=$cert" > "$SITE_CONF.new"
  install -o root -g root -m 644 "$SITE_CONF.new" "$SITE_CONF"; rm -f "$SITE_CONF.new"
  echo "   written: $SITE_CONF"
fi
[ -e "$LETSENCRYPT_DIR/live/$cert/fullchain.pem" ] || echo "   WARNING: $LETSENCRYPT_DIR/live/$cert/fullchain.pem doesn't exist – check CERT_NAME in $SITE_CONF (sudo certbot certificates)"

# --- 2. nginx: the templates filled in, the maintenance page ----------------------------------------
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
render() {   # (comment lines stay as they are – they explain the template)
  sed -e "/^[[:space:]]*#/!{s#/live/$PLACEHOLDER/#/live/$cert/#g; s#$PLACEHOLDER#$domain#g;}" "$1" > "$2"
  if grep -v '^[[:space:]]*#' "$2" | grep -q "example\.com"; then echo "Still a placeholder in $2 – stopped." >&2; exit 1; fi
}
render "$HERE/nginx/storybook.conf" "$work/storybook"
render "$HERE/nginx/storybook-maintenance.conf" "$work/storybook-maintenance"
plan_file "$NGINX_AVAILABLE/storybook" "$work/storybook"
plan_file "$NGINX_AVAILABLE/storybook-maintenance" "$work/storybook-maintenance"
# switched on: the normal config, unless maintenance mode is on (the link points there)
[ -L "$NGINX_ENABLED/storybook" ] || plan_link storybook
install -d -o root -g root -m 755 "$SB_ETC/maintenance"
install -o root -g root -m 644 "$HERE/maintenance/index.html" "$SB_ETC/maintenance/index.html"
# the map tiles' cache (nginx creates storybook-tiles inside; Ubuntu's nginx has no /var/cache/nginx)
install -d -m 755 /var/cache/nginx
nginx_apply

# --- 3. the backend's user, its files, its service ------------------------------------------------------
if ! getent passwd "$APP_USER" > /dev/null; then
  useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin \
    --comment "Storybook backend" "$APP_USER"
  echo "== new system user $APP_USER (no password, no shell, no home)"
fi
# the ntfy topic (/etc/dk-srv/notify.conf) is readable for the group dk-notify – the backend sends
# notifications too (e.g. an account locked after many failed logins)
group=dk-notify
if getent group "$group" > /dev/null && ! id -nG "$APP_USER" | tr ' ' '\n' | grep -qx "$group"; then
  usermod -aG "$group" "$APP_USER"; echo "== $APP_USER added to the group $group (the ntfy topic)"
fi
# the code: the deploy user's; the backend reads it through its group – it can't change it, others
# can't read it. The deploy user's umask is 027 (CIS): what it creates is 640/750, without rights for
# "others". So every folder gets the group of the backend's user and the setgid bit: whatever
# git pull and npm ci create later belongs to that group too, and is readable for the backend.
[ "$(stat -c %U "$RUNTIME_DIR")" = "$DEPLOY_USER" ] || echo "   WARNING: $RUNTIME_DIR should belong to $DEPLOY_USER (sudo chown -R $DEPLOY_USER: $RUNTIME_DIR)"
if [ -n "$(find "$RUNTIME_DIR" ! -path "$RUNTIME_DIR/server/.env" \( ! -group "$APP_USER" -o \( -type d ! -perm -2050 \) -o ! -perm -g+r \) -print -quit)" ]; then
  chgrp -R "$APP_USER" "$RUNTIME_DIR"
  find "$RUNTIME_DIR" -type d -exec chmod g+rxs {} +
  find "$RUNTIME_DIR" -type f ! -path "$RUNTIME_DIR/server/.env" -exec chmod g+r {} +
  echo "== $RUNTIME_DIR readable for $APP_USER (its group, setgid folders)"
fi
chmod o-rwx "$RUNTIME_DIR"
# server/.env (database password, secrets): only the backend's user
env_file="$RUNTIME_DIR/server/.env"
if [ -f "$env_file" ]; then
  [ "$(stat -c '%U:%G %a' "$env_file")" = "$APP_USER:$APP_USER 600" ] || { chown "$APP_USER:$APP_USER" "$env_file"; chmod 600 "$env_file"; echo "== $env_file: only $APP_USER may read it"; }
else
  echo "   WARNING: $env_file is missing – the backend can't start without it (project_setup_commands.txt)"
fi
# the photos: the backend writes them (folders 755, files 644 – nginx reads them)
install -d -m 755 "$UPLOADS"
if [ -n "$(find "$UPLOADS" ! -user "$APP_USER" -print -quit)" ]; then
  chown -R "$APP_USER:$APP_USER" "$UPLOADS"; echo "== $UPLOADS belongs to $APP_USER"
fi
install -d -o root -g adm -m 750 /var/log/storybook
# (systemd creates its log files readable for everyone; CIS 6.1: at most 640)
for f in /var/log/storybook/backend.log /var/log/storybook/backend-error.log; do
  [ -e "$f" ] || install -o root -g adm -m 640 /dev/null "$f"
  [ "$(stat -c '%a %G' "$f")" = "640 adm" ] || { chgrp adm "$f"; chmod 640 "$f"; }
done
# the service (template filled in)
sed -e "s#@RUNTIME_DIR@#$RUNTIME_DIR#g" "$HERE/storybook.service" > "$work/storybook.service"
unit=/etc/systemd/system/storybook.service
if ! cmp -s "$work/storybook.service" "$unit"; then
  install -o root -g root -m 644 "$work/storybook.service" "$unit"
  systemctl daemon-reload
  systemctl try-restart storybook.service   # (only if it's running)
  echo "== $unit installed"
fi
# running – unless it's stopped on purpose (maintenance mode, dk-srv's lockdown)
if [ "$(readlink "$NGINX_ENABLED/storybook")" = "$NGINX_AVAILABLE/storybook-maintenance" ]; then
  echo "   (maintenance mode is on: the backend stays stopped – sudo storybook-mode normal)"
elif [ "$(server_mode)" = lockdown ]; then
  echo "   (the server is in lockdown: the backend stays stopped – sudo dk-mode normal)"
elif ! systemctl is-enabled --quiet storybook.service || ! systemctl is-active --quiet storybook.service; then
  systemctl enable --now --quiet storybook.service && echo "== storybook.service started (and starts after a reboot)"
fi

# --- 4. the commands ------------------------------------------------------------------------------------
install -o root -g root -m 755 "$HERE/storybook-mode" /usr/local/sbin/storybook-mode
install -o root -g root -m 755 "$HERE/storybook-run" /usr/local/sbin/storybook-run
echo "== /usr/local/sbin/storybook-mode and storybook-run installed"

# --- 5. the storybook in dk-srv's list of apps ---------------------------------------------------------
sed -e "s#@DEPLOY_USER@#$DEPLOY_USER#g" -e "s#@DEPLOY_HOME@#$DEPLOY_HOME#g" -e "s#@DOMAIN@#$domain#g" "$HERE/app.conf" > "$work/app.conf"
install -d -o root -g root -m 755 "$DK_ETC/apps.d"
install -o root -g root -m 644 "$work/app.conf" "$DK_ETC/apps.d/storybook.conf"
echo "== $DK_ETC/apps.d/storybook.conf written"

# --- 6. log rotation ------------------------------------------------------------------------------------
install -d -o root -g root -m 755 "$DK_ETC/logrotate.d"
sed -e "s#@DEPLOY_USER@#$DEPLOY_USER#g" -e "s#@DEPLOY_HOME@#$DEPLOY_HOME#g" "$HERE/logrotate.conf" > "$work/logrotate"
install -o root -g root -m 644 "$work/logrotate" "$DK_ETC/logrotate.d/storybook"
echo "== $DK_ETC/logrotate.d/storybook written"

# (for the file integrity check: changed on purpose)
[ -d "$DK_STATE" ] && printf '%s\n' "$SB_ETC/maintenance" "$SITE_CONF" /usr/local/sbin/storybook-mode \
  /usr/local/sbin/storybook-run "$unit" /var/log/storybook "$DK_ETC/apps.d" "$DK_ETC/logrotate.d" \
  /etc/passwd /etc/group /etc/shadow /etc/gshadow >> "$DK_STATE/aide-expected"
echo "== the storybook's root parts are installed"
