#!/usr/bin/env bash
# kill_port.sh – kill any process listening on a TCP port (default 8080)
# Usage: ./kill_port.sh [port]
# If no port is supplied, 8080 is used.

set -euo pipefail

PORT="${1:-8080}"

# Find PIDs listening on the given port (TCP) and kill them.
# The inner sudo is needed to see processes owned by other users.
PIDS=$(sudo lsof -t -iTCP:"$PORT" -sTCP:LISTEN || true)

if [[ -z "$PIDS" ]]; then
  echo "No process listening on port $PORT"
  exit 0
fi

# Kill each PID with SIGKILL (forceful) – you can change to SIGTERM if preferred.
for pid in $PIDS; do
  echo "Killing PID $pid listening on port $PORT"
  sudo kill -9 "$pid"
done

echo "All processes on port $PORT have been terminated."
