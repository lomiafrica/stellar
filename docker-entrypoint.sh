#!/bin/sh
set -eu
dir="${STELLAR_DATA_DIR:-/app/data}"
mkdir -p "$dir"
chown lab:lab "$dir"
exec su-exec lab node dist/main.js
