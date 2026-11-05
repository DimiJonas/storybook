#!/bin/bash
# Decrypt a backup for restoring (ops/README.md, "Restoring"):
#
#   ./ops/decrypt-backup.sh <backup folder> <target folder> [<date>]
#   e.g. ./ops/decrypt-backup.sh ~/storybook-backups ~/storybook-restore
#        ./ops/decrypt-backup.sh ~/storybook-backups ~/storybook-restore 2026-10-01
#
# Writes into the target folder (which must not exist yet):
#   storybook-<date>.dump   the database dump of that day (default: the newest)
#   uploads/<book_n>/…      all photos, as they were (for /etc/storybook/uploads/)
# Uses the secret key ~/.config/storybook/backup-key.txt (or KEY_FILE=…). The target holds the
# unencrypted data – delete it when you're done.
set -euo pipefail
[ $# -ge 2 ] || { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 2; }
SRC=${1%/} DEST=${2%/} DAY=${3:-}
KEY_FILE="${KEY_FILE:-$HOME/.config/storybook/backup-key.txt}"
[ -r "$KEY_FILE" ] || { echo "No secret key at $KEY_FILE (KEY_FILE=…)." >&2; exit 1; }
[ -e "$DEST" ] && { echo "$DEST exists already – choose a new folder." >&2; exit 1; }
umask 077
mkdir -p "$DEST/uploads"

if [ -n "$DAY" ]; then dump="$SRC/db/storybook-$DAY.dump.age"
else dump=$(ls -1 "$SRC"/db/storybook-*.dump.age 2>/dev/null | sort | tail -1 || true); fi
[ -n "$dump" ] && [ -e "$dump" ] || { echo "No encrypted dump found${DAY:+ for $DAY} in $SRC/db" >&2; exit 1; }
out="$DEST/$(basename "$dump" .age)"
age -d -i "$KEY_FILE" -o "$out" "$dump"
echo "database: $out"

n=0
while IFS= read -r -d '' f; do
  rel=${f#"$SRC/photos/"}; target="$DEST/uploads/${rel%.age}"
  mkdir -p "$(dirname "$target")"
  age -d -i "$KEY_FILE" -o "$target" "$f"; n=$((n + 1))
done < <(find "$SRC/photos" -type f -name '*.age' -print0 2>/dev/null)
echo "photos: $n -> $DEST/uploads/"
