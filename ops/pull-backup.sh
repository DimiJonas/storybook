#!/bin/bash
# Fetch the server's backups to this computer. Run it whenever you like; only new files are
# transferred, so after the first time it's quick.
#
#   ./ops/pull-backup.sh
#
# It connects as "storybook-backup" – an entry in ~/.ssh/config with the backup key, which on the
# server may only READ the backups folder (ops/README.md, "Fetching the backups"). The server sends
# a "Backups pulled" notification for it. Nothing is ever deleted here: older database dumps the
# server has already removed stay on this computer, and so do all photos.
#
# The backups are encrypted (age). Afterwards the newest database dump is decrypted once with your
# secret key and checked – so you know the key and the backups fit together. The key file:
# ~/.config/storybook/backup-key.txt (or KEY_FILE=…).
set -euo pipefail

SOURCE="${SOURCE:-storybook-backup:}"   # host alias from ~/.ssh/config; the restricted key sees the backups folder as its root
LOCAL_DIR="${LOCAL_DIR:-$HOME/storybook-backups}"
KEY_FILE="${KEY_FILE:-$HOME/.config/storybook/backup-key.txt}"

mkdir -p "$LOCAL_DIR"
echo "Fetching backups from $SOURCE to $LOCAL_DIR ..."
rsync -a --info=stats1 "$SOURCE" "$LOCAL_DIR/"

echo
echo "Newest database backups here:"
ls -1 "$LOCAL_DIR/db" | sort -r | head -3
if [ -d "$LOCAL_DIR/photos" ]; then
  echo "Photos here (encrypted): $(find "$LOCAL_DIR/photos" -type f -name '*.age' | wc -l) files, $(du -sh "$LOCAL_DIR/photos" | cut -f1)"
fi

newest=$(ls -1 "$LOCAL_DIR"/db/storybook-*.dump.age 2>/dev/null | sort | tail -1 || true)
if [ -z "$newest" ]; then
  exit 0
elif [ ! -r "$KEY_FILE" ]; then
  echo "Can't check the backup: no secret key at $KEY_FILE (KEY_FILE=… for another place)."
  exit 1
elif ! command -v age > /dev/null; then
  echo "Can't check the backup: age isn't installed (sudo apt install age)."
  exit 1
fi
# 1. does it decrypt with your key? 2. can pg_restore read all of it? It turns the whole backup into
# SQL and throws that away – every table's data is read. (Not "--list": that reads only the table of
# contents and stops, and "age" then fails writing into the closed pipe – for any real-sized backup.)
# The server writes the backups with PostgreSQL 16; an older pg_restore can't read them.
if ! age -d -i "$KEY_FILE" "$newest" > /dev/null 2>&1; then
  echo "PROBLEM: $(basename "$newest") can NOT be decrypted with $KEY_FILE – is it the right key?"
  exit 1
fi
pg_restore=$(command -v /usr/lib/postgresql/16/bin/pg_restore pg_restore 2>/dev/null | head -1 || true)
if [ -z "$pg_restore" ]; then
  echo "Checked: $(basename "$newest") decrypts with your key (pg_restore isn't installed – contents not checked; sudo apt install postgresql-client-16)."
elif err=$(age -d -i "$KEY_FILE" "$newest" | "$pg_restore" -f /dev/null 2>&1 > /dev/null); then
  echo "Checked: $(basename "$newest") decrypts with your key and is a readable database backup."
else
  echo "Checked: $(basename "$newest") decrypts with your key – but pg_restore couldn't read it:"
  echo "   $(printf '%s\n' "$err" | head -1)"
  echo "   ($pg_restore is $("$pg_restore" --version 2>&1 | head -1); the backups need PostgreSQL 16 or newer:"
  echo "   sudo apt install postgresql-client-16 – or the PostgreSQL apt repository if your system has no 16)"
  exit 1
fi
