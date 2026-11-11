#!/bin/bash
# Nightly backup of the storybook: database dump + photos, encrypted.
#
# Runs on the server via cron (see ops/README.md, "Backups"). Creates:
#   ~/backups/storybook/db/storybook-YYYY-MM-DD.dump.age   database (pg_dump custom format), encrypted
#   ~/backups/storybook/photos/<book_n>/<name>.age         every original photo, encrypted
#
# Encryption (age): to the public key in /etc/storybook/backup.conf (AGE_RECIPIENT=age1…). The
# matching secret key is only on your computer (and in your password manager) – on the server the
# backups can't be read, not even by root; a copy that leaves the server is useless to others.
# Without AGE_RECIPIENT (no backup.conf) it works as before, unencrypted (db/*.dump, uploads/). The
# first encrypted run also encrypts what's there from before and removes the unencrypted copies.
# It stops with an error (and a notification) instead of quietly going unencrypted when
# backup.conf is there but can't be read, has no usable key, or when encrypted backups exist but no
# key is configured any more.
#
# Keeps the daily dumps of the last 7 days, plus the first dump of every month for 12 months.
# Photos are only ever added, never removed – a photo deleted in the app stays here.
# The small photo versions (thumb/, medium/) are skipped; server/scripts/create-thumbnails.js
# recreates them.
#
# Restore test: with the first backup of each month (or FORCE_RESTORE_TEST=1) the new dump is
# restored into the separate database storybook_restoretest, every table's row count is compared
# with the live database, every photo is checked for its encrypted copy, and the test database is
# emptied again. Result: a notification and ~/backups/storybook/restore-test.log.
#
# The database password is read from ~/.pgpass (see ops/README.md). If anything fails, a
# notification goes to your phone (dk-notify from dk-srv; skipped where it isn't installed).
set -euo pipefail
umask 077   # the backups contain password hashes: readable only by this user

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/storybook}"
UPLOADS_DIR="${UPLOADS_DIR:-/etc/storybook/uploads}"
BACKUP_CONF="${BACKUP_CONF:-/etc/storybook/backup.conf}"
DB_NAME="${DB_NAME:-storybook}"
DB_TEST="${DB_TEST:-storybook_restoretest}"
DB_USER="${DB_USER:-webapp}"
DB_HOST="${DB_HOST:-localhost}"
KEEP_DAYS="${KEEP_DAYS:-7}"
KEEP_MONTHS="${KEEP_MONTHS:-12}"
TODAY="${TODAY:-$(date +%F)}"   # can be overridden for testing
NOTIFY="${NOTIFY_BIN:-/usr/local/sbin/dk-notify}"

log() { echo "$(date '+%F %T') $*"; }
notify() { [ -x "$NOTIFY" ] && "$NOTIFY" "$@" || true; }
DUMP=""
FAIL_REASON=""   # set before a deliberate stop: becomes the notification's text
fail() { FAIL_REASON=$1; log "$1"; exit 1; }

finish() {
  status=$?
  [ -n "$DUMP" ] && rm -f "$DUMP.tmp" "$DUMP.age.tmp"   # don't leave half-written files behind
  if [ "$status" -ne 0 ]; then
    log "backup FAILED (exit code $status)"
    notify "Backup failed" "${FAIL_REASON:-The nightly backup stopped with an error (exit code $status).} See: tail -20 ~/backups/storybook/backup.log" high warning
  fi
  return 0
}
trap finish EXIT

# the public key to encrypt to (env or /etc/storybook/backup.conf)
if [ -z "${AGE_RECIPIENT:-}" ] && [ -e "$BACKUP_CONF" ]; then
  [ -r "$BACKUP_CONF" ] || fail "Can't read $BACKUP_CONF, so the backup can't be encrypted – not made. Fix: sudo chmod 644 $BACKUP_CONF (it holds only the public key), then run /srv/storybook/ops/backup.sh."
  AGE_RECIPIENT=$(sed -nE 's/^[[:space:]]*AGE_RECIPIENT[[:space:]]*=[[:space:]]*(age1[0-9a-z]+).*/\1/p' "$BACKUP_CONF" | tail -1)
  [ -n "$AGE_RECIPIENT" ] || fail "$BACKUP_CONF has no AGE_RECIPIENT=age1… line – backup not made (it would be unencrypted)."
fi
encrypt=no
if [ -n "${AGE_RECIPIENT:-}" ]; then
  command -v age > /dev/null || fail "age isn't installed (sudo apt install age) – backup not made."
  encrypt=yes
elif compgen -G "$BACKUP_DIR/db/*.age" > /dev/null || [ -d "$BACKUP_DIR/photos" ]; then
  # encryption was set up once: never fall back to unencrypted copies without being told
  fail "There are encrypted backups, but no key to encrypt to ($BACKUP_CONF missing?) – backup not made. Put the public key back (ops/README.md, Backups)."
fi
seal() { age -r "$AGE_RECIPIENT" -o "$2.tmp" "$1" && mv "$2.tmp" "$2"; }   # seal PLAIN ENCRYPTED

mkdir -p "$BACKUP_DIR/db"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -U "$DB_USER" -h "$DB_HOST" --no-password)
export PGOPTIONS="-c client_min_messages=warning"   # no "drop cascades to …" lists in the log

# --- 1. database: to a temporary file first, so a failed dump never replaces a good one ----------
DUMP="$BACKUP_DIR/db/storybook-$TODAY.dump"
pg_dump -U "$DB_USER" -h "$DB_HOST" --no-password -Fc -f "$DUMP.tmp" "$DB_NAME"
pg_restore --list "$DUMP.tmp" > /dev/null   # quick check that the dump is readable

# --- 2. once a month: restore it for real and compare -------------------------------------------
STATE_TEST="$BACKUP_DIR/restore-test.log"
month=$(echo "$TODAY" | cut -c1-7)
test_due=no
if [ "${FORCE_RESTORE_TEST:-0}" = 1 ] || ! grep -q "^$month" "$STATE_TEST" 2>/dev/null; then test_due=yes; fi
# row count of every table: "schema.table count" lines
row_counts() {
  "${PSQL[@]}" -d "$1" -tA -F ' ' -c "
    SELECT format('%I.%I', n.nspname, c.relname),
           (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    ORDER BY 1"
}
# the test database emptied (its schemas dropped; public recreated)
empty_test_db() {
  local schemas
  schemas=$("${PSQL[@]}" -d "$DB_TEST" -tA -c "SELECT string_agg(quote_ident(nspname), ', ') FROM pg_namespace WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'public') AND nspname NOT LIKE 'pg_%'")
  [ -n "$schemas" ] && "${PSQL[@]}" -d "$DB_TEST" -c "DROP SCHEMA $schemas CASCADE"
  "${PSQL[@]}" -d "$DB_TEST" -c "DROP SCHEMA IF EXISTS public CASCADE" -c "CREATE SCHEMA public"
}
test_result=""
if [ "$test_due" = yes ]; then
  log "restore test: restoring into $DB_TEST …"
  # the password for the test database: like the one for the storybook's (same user)
  if [ -f "$HOME/.pgpass" ] && ! grep -qE "^[^:]*:[^:]*:($DB_TEST|\*):$DB_USER:" "$HOME/.pgpass"; then
    sed -nE "s/^([^:]*:[^:]*):$DB_NAME:$DB_USER:(.*)$/\1:$DB_TEST:$DB_USER:\2/p" "$HOME/.pgpass" | head -1 >> "$HOME/.pgpass"
  fi
  if ! "${PSQL[@]}" -d "$DB_TEST" -c 'SELECT 1' > /dev/null 2>&1; then
    test_result="FAILED: the database $DB_TEST can't be reached (dk-srv creates it: sudo /opt/dk-srv/hardening/install-hardening.sh postgres)"
  else
    empty_test_db
    # (without extensions: those need an administrator and aren't data)
    pg_restore --list "$DUMP.tmp" | grep -v ' EXTENSION ' > "$DUMP.list"
    if ! pg_restore -U "$DB_USER" -h "$DB_HOST" --no-password -d "$DB_TEST" --no-owner --no-privileges --exit-on-error -L "$DUMP.list" "$DUMP.tmp" 2> "$DUMP.restore-errors"; then
      test_result="FAILED: pg_restore: $(head -2 "$DUMP.restore-errors" | tr '\n' ' ')"
    else
      row_counts "$DB_NAME" > "$DUMP.live"
      row_counts "$DB_TEST" > "$DUMP.restored"
      tables=$(wc -l < "$DUMP.live"); rows=$(awk '{ s += $2 } END { print s + 0 }' "$DUMP.live")
      if diff -q "$DUMP.live" "$DUMP.restored" > /dev/null; then
        test_result="ok: $tables tables, $rows rows, all the same as live"
      else
        test_result="FAILED: differences: $(diff "$DUMP.live" "$DUMP.restored" | grep '^[<>]' | head -4 | tr '\n' ' ')"
      fi
    fi
    empty_test_db
  fi
  rm -f "$DUMP.list" "$DUMP.restore-errors" "$DUMP.live" "$DUMP.restored"
fi

# --- 3. keep the dump (encrypted, or as it is) ----------------------------------------------------
if [ "$encrypt" = yes ]; then
  seal "$DUMP.tmp" "$DUMP.age"; rm -f "$DUMP.tmp"
  log "database: $(du -h "$DUMP.age" | cut -f1) -> $DUMP.age (encrypted)"
else
  mv "$DUMP.tmp" "$DUMP"
  log "database: $(du -h "$DUMP" | cut -f1) -> $DUMP (NOT encrypted – no AGE_RECIPIENT in $BACKUP_CONF)"
fi

# --- 4. photos: new originals (nothing is removed) ------------------------------------------------
if [ "$encrypt" = yes ]; then
  mkdir -p "$BACKUP_DIR/photos"
  new=0
  # from the photo folder, and – once – what's in the old unencrypted copy (photos deleted in the
  # app may only be there)
  for src_root in "$UPLOADS_DIR" "$BACKUP_DIR/uploads"; do
    [ -d "$src_root" ] || continue
    while IFS= read -r -d '' f; do
      rel=${f#"$src_root"/}
      target="$BACKUP_DIR/photos/$rel.age"
      [ -e "$target" ] && continue
      mkdir -p "$(dirname "$target")"
      seal "$f" "$target"; new=$((new + 1))
    done < <(find "$src_root" -type f ! -path '*/thumb/*' ! -path '*/medium/*' -print0)
  done
  log "photos: $new new encrypted, $(find "$BACKUP_DIR/photos" -type f -name '*.age' | wc -l) in total ($(du -sh "$BACKUP_DIR/photos" | cut -f1))"
  # the old unencrypted copies are now all encrypted – remove them
  if [ -d "$BACKUP_DIR/uploads" ]; then
    rm -rf "$BACKUP_DIR/uploads"; log "removed the old unencrypted photo copy ($BACKUP_DIR/uploads)"
  fi
  for f in "$BACKUP_DIR"/db/storybook-*.dump; do
    [ -e "$f" ] || continue
    seal "$f" "$f.age" && touch -r "$f" "$f.age" && rm -f "$f" && log "encrypted the older dump $(basename "$f")"
  done
else
  mkdir -p "$BACKUP_DIR/uploads"
  rsync -a --exclude 'thumb/' --exclude 'medium/' "$UPLOADS_DIR/" "$BACKUP_DIR/uploads/"
  log "photos: $(find "$BACKUP_DIR/uploads" -type f | wc -l) files, $(du -sh "$BACKUP_DIR/uploads" | cut -f1) (NOT encrypted)"
fi

# the restore test also checks the photos: every original has its copy in the backup
if [ "$test_due" = yes ] && [[ $test_result == ok* ]]; then
  missing=0 originals=0
  copies="$BACKUP_DIR/photos"; ext=".age"
  [ "$encrypt" = yes ] || { copies="$BACKUP_DIR/uploads"; ext=""; }
  while IFS= read -r -d '' f; do
    originals=$((originals + 1)); rel=${f#"$UPLOADS_DIR"/}
    [ -s "$copies/$rel$ext" ] || missing=$((missing + 1))
  done < <(find "$UPLOADS_DIR" -type f ! -path '*/thumb/*' ! -path '*/medium/*' -print0 2>/dev/null)
  if [ "$missing" -eq 0 ]; then test_result+="; photos: all $originals have their copy"
  else test_result="FAILED: $missing of $originals photos have no copy in the backup"; fi
fi
if [ "$test_due" = yes ]; then
  echo "$TODAY $test_result" >> "$STATE_TEST"
  log "restore test: $test_result"
  if [[ $test_result == ok* ]]; then
    notify "Restore test passed" "The backup of $TODAY was restored into a test database: $test_result." low white_check_mark
  else
    notify "Restore test FAILED" "The monthly restore test of the backup failed – $test_result. See: tail -30 ~/backups/storybook/backup.log" high warning
  fi
fi

# --- 5. remove old dumps: keep the last KEEP_DAYS days, and the first dump of each month for
#        KEEP_MONTHS months -------------------------------------------------------------------------
today_s=$(date -d "$TODAY" +%s)
seen_months=" "
for f in $(ls "$BACKUP_DIR"/db/storybook-*.dump "$BACKUP_DIR"/db/storybook-*.dump.age 2>/dev/null | sort); do
  day=$(basename "$f" | sed -E 's/^storybook-([0-9-]{10}).*/\1/')
  month=$(echo "$day" | cut -c1-7)
  age_days=$(( (today_s - $(date -d "$day" +%s)) / 86400 ))
  first_of_month=no
  case "$seen_months" in
    *" $month "*) ;;
    *) first_of_month=yes; seen_months="$seen_months$month " ;;
  esac
  if [ "$age_days" -lt "$KEEP_DAYS" ]; then
    continue
  elif [ "$first_of_month" = yes ] && [ "$age_days" -le $(( KEEP_MONTHS * 31 )) ]; then
    continue
  fi
  rm -f "$f"
  log "removed old dump $(basename "$f")"
done

log "backup done$([ "$encrypt" = yes ] && echo " (encrypted)")"
