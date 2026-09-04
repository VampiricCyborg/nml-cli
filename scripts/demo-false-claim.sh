#!/usr/bin/env sh
set -eu

demo_root=$(mktemp -d "${TMPDIR:-/tmp}/nml-demo.XXXXXX")
cli_path=$(CDPATH= cd -- "$(dirname -- "$0")/../dist" && pwd)/cli.js
trap 'rm -rf "$demo_root"' EXIT

printf '%s\n' '{"scripts":{"test":"node test.js"}}' > "$demo_root/package.json"
printf '%s\n' 'process.exit(1)' > "$demo_root/test.js"
git -C "$demo_root" init -q
git -C "$demo_root" config user.email demo@example.com
git -C "$demo_root" config user.name 'nml demo'
git -C "$demo_root" add .
git -C "$demo_root" commit -qm 'agent: implementation complete; tests pass'

echo '--- Before: agent-authored commit message ---'
git -C "$demo_root" log -1 --format=%B
echo '--- After: independent nml check ---'
set +e
node "$cli_path" check --cwd "$demo_root"
status=$?
set -e
[ "$status" -eq 1 ]
