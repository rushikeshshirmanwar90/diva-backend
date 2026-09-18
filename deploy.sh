#!/usr/bin/env bash
# Deploy diva-backend on the VPS.
#
#   ./deploy.sh          pull exponentor/diva-backend:latest and (re)start it
#   ./deploy.sh --build  build the image from this checkout instead of pulling
#
# Each step that has silently broken a deploy before is checked explicitly and
# fails loudly with the fix, instead of leaving a container that says "Up" and
# answers 500.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd)." >&2
  echo "       .env is gitignored, so it is not part of the clone. Create it:" >&2
  echo "         cp .env.example .env && nano .env" >&2
  exit 1
fi

for key in DB_URL JWT_SECRET; do
  if ! grep -Eq "^${key}=.+" .env; then
    echo "ERROR: ${key} is empty or missing in .env — the API cannot start without it." >&2
    exit 1
  fi
done

if grep -Eq '^(APP_URL|CORS_ALLOWED_ORIGINS)=.*localhost' .env; then
  echo "WARNING: APP_URL / CORS_ALLOWED_ORIGINS in .env still point at localhost." >&2
  echo "         The storefront on a real domain will be blocked by CORS." >&2
fi

if [ "${1:-}" = "--build" ]; then
  docker compose up -d --build
else
  docker compose pull
  docker compose up -d
fi

echo
echo "Waiting for the health check..."
for _ in $(seq 1 15); do
  status=$(docker inspect -f '{{.State.Health.Status}}' diva-backend 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 2
done

if [ "$status" = "healthy" ]; then
  echo "diva-backend is healthy on port 4100."
  curl -s http://127.0.0.1:4100/api/v1/health; echo
else
  echo "diva-backend is '$status'. Last log lines:" >&2
  docker logs --tail 40 diva-backend >&2
  exit 1
fi
