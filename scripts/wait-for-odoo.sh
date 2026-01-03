#!/usr/bin/env bash
# Wait for Odoo to be ready for XML-RPC connections
# Usage: ./scripts/wait-for-odoo.sh [host] [port] [timeout]

set -e

HOST="${1:-localhost}"
PORT="${2:-8069}"
TIMEOUT="${3:-120}"

echo "Waiting for Odoo at $HOST:$PORT (timeout: ${TIMEOUT}s)..."

start_time=$(date +%s)
while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))

  if [ $elapsed -ge $TIMEOUT ]; then
    echo "Timeout waiting for Odoo after ${TIMEOUT}s"
    exit 1
  fi

  # Try to connect to the XML-RPC common endpoint
  # This endpoint is available without authentication
  if curl -sf "http://$HOST:$PORT/xmlrpc/2/common" \
    -H "Content-Type: text/xml" \
    -d '<?xml version="1.0"?><methodCall><methodName>version</methodName></methodCall>' \
    > /dev/null 2>&1; then
    echo "Odoo is ready! (took ${elapsed}s)"
    exit 0
  fi

  echo "Odoo not ready yet... (${elapsed}s elapsed)"
  sleep 5
done
