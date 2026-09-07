#!/usr/bin/env bash
# Upload every variable in .env to the linked Vercel project.
#
# .env is gitignored and untracked, so Vercel's build never sees it. Anything
# missing there makes its integration's config accessor return null, and the
# route answers 503 ("… is not configured") instead of working. This pushes
# the whole file so the deployment matches local.
#
# Run `vercel link` first. Re-running is safe: an existing value is removed
# and re-added rather than erroring on a duplicate.
set -euo pipefail

cd "$(dirname "$0")"

TARGETS=${TARGETS:-"production preview"}

if [ ! -f .env ]; then
  echo "error: .env not found" >&2
  exit 1
fi

while IFS= read -r line || [ -n "$line" ]; do
  # Skip blanks and comments.
  case "$line" in ''|\#*) continue ;; esac
  # Only KEY=value lines.
  case "$line" in *=*) ;; *) continue ;; esac

  key=${line%%=*}
  value=${line#*=}
  # Strip a trailing CR, since this file is edited on Windows.
  value=${value%$'\r'}
  # Trim surrounding quotes if present.
  value=${value%\"}; value=${value#\"}
  value=${value%\'}; value=${value#\'}

  if [ -z "$value" ]; then
    echo "skip  $key (empty)"
    continue
  fi

  for target in $TARGETS; do
    vercel env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | vercel env add "$key" "$target" >/dev/null 2>&1
  done
  echo "set   $key -> $TARGETS"
done < .env

echo
echo "Done. Env changes do NOT apply to existing deployments — redeploy now:"
echo "  vercel --prod"
