#!/bin/bash
# Get current player count from server logs
# Caches result for 30 seconds

CACHE_FILE="/tmp/hytale-players-cache"
CACHE_TTL=30
LOG_FILE="/home/hytale/server/logs/console.log"

# Check cache
if [[ -f "$CACHE_FILE" ]]; then
    AGE=$(( $(date +%s) - $(stat -c %Y "$CACHE_FILE" 2>/dev/null || echo 0) ))
    if (( AGE < CACHE_TTL )); then
        cat "$CACHE_FILE"
        exit 0
    fi
fi

# Parse player count from recent log output
COUNT=0
if [[ -f "$LOG_FILE" ]]; then
    # Look for "world (N)" pattern in recent lines, strip ANSI codes
    LAST_LINE=$(tail -100 "$LOG_FILE" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g' | grep -oP 'world \(\K[0-9]+' | tail -1)
    if [[ -n "$LAST_LINE" ]]; then
        COUNT="$LAST_LINE"
    fi
fi

echo "$COUNT" > "$CACHE_FILE"
echo "$COUNT"
