#!/usr/bin/env bash
# Runs the integration test-suite against a real MongoDB.
#  - TEST_MONGO_URI already set  -> use it
#  - docker available            -> start a throw-away mongo:7 container (random localhost port) and remove it afterwards
#  - otherwise                   -> Jest falls back to mongodb-memory-server
set -euo pipefail
cd "$(dirname "$0")/.."

export JEST_JUNIT_OUTPUT_DIR="${JEST_JUNIT_OUTPUT_DIR:-reports}"
export JEST_JUNIT_OUTPUT_NAME="${JEST_JUNIT_OUTPUT_NAME:-junit.xml}"
CID=""
cleanup() { [ -n "$CID" ] && docker rm -f "$CID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if [ -z "${TEST_MONGO_URI:-}" ] && command -v docker >/dev/null 2>&1; then
  CID="$(docker run -d --rm -p 127.0.0.1::27017 mongo:7)"
  PORT="$(docker port "$CID" 27017/tcp | head -n1 | sed 's/.*://')"
  echo "Started MongoDB container ${CID:0:12} on 127.0.0.1:${PORT}"
  for _ in $(seq 1 40); do
    if docker exec "$CID" mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; then READY=1; break; fi
    sleep 1
  done
  [ "${READY:-0}" = 1 ] || { echo "MongoDB did not become ready in time" >&2; exit 1; }
  export TEST_MONGO_URI="mongodb://127.0.0.1:${PORT}"
fi

npm run test:ci
