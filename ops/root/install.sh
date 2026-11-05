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
#   3. installs the mode command: /usr/local/sbin/storybook-mode (root-owned)
#   4. tells dk-srv about the storybook: /etc/dk-srv/apps.d/storybook.conf (app.conf filled in) –
#      the nightly check, the weekly report, the file integrity check and the hardening use it
#   5. the storybook's log rotation: /etc/dk-srv/logrotate.d/storybook (logrotate.conf)
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
: "${APP_USER:=appuser}"   # the user the backend runs as (until it gets its own account)
APP_HOME=$(getent passwd "$APP_USER" | cut -d: -f6)
[ -n "$APP_HOME" ] || { echo "User $APP_USER doesn't exist." >&2; exit 1; }
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
    "# the backend (origin check; pm2 restart backend after a change) and the security scripts." "DOMAIN=$domain" "CERT_NAME=$cert" > "$SITE_CONF.new"
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

# --- 3. the mode command ------------------------------------------------------------------------------
install -o root -g root -m 755 "$HERE/storybook-mode" /usr/local/sbin/storybook-mode
echo "== /usr/local/sbin/storybook-mode installed"

# --- 4. the storybook in dk-srv's list of apps ---------------------------------------------------------
sed -e "s#@APP_USER@#$APP_USER#g" -e "s#@APP_HOME@#$APP_HOME#g" -e "s#@DOMAIN@#$domain#g" "$HERE/app.conf" > "$work/app.conf"
install -d -o root -g root -m 755 "$DK_ETC/apps.d"
install -o root -g root -m 644 "$work/app.conf" "$DK_ETC/apps.d/storybook.conf"
echo "== $DK_ETC/apps.d/storybook.conf written"

# --- 5. log rotation ------------------------------------------------------------------------------------
install -d -o root -g root -m 755 "$DK_ETC/logrotate.d"
sed -e "s#@APP_USER@#$APP_USER#g" -e "s#@APP_HOME@#$APP_HOME#g" "$HERE/logrotate.conf" > "$work/logrotate"
install -o root -g root -m 644 "$work/logrotate" "$DK_ETC/logrotate.d/storybook"
echo "== $DK_ETC/logrotate.d/storybook written"

# (for the file integrity check: changed on purpose)
[ -d "$DK_STATE" ] && printf '%s\n' "$SB_ETC/maintenance" "$SITE_CONF" /usr/local/sbin/storybook-mode \
  "$DK_ETC/apps.d" "$DK_ETC/logrotate.d" >> "$DK_STATE/aide-expected"
echo "== the storybook's root parts are installed"
