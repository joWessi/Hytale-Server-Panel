#!/bin/bash
# Crash notification: send Discord alert on unplanned server exit

FLAG_FILE="/tmp/hytale-planned-restart"
WEBHOOK_URL=$(cat /etc/hytale-panel/env 2>/dev/null | grep DISCORD_WEBHOOK | cut -d= -f2-)

# Skip notification if this was a planned restart
if [[ -f "$FLAG_FILE" ]]; then
    rm -f "$FLAG_FILE" 2>/dev/null || true
    exit 0
fi

# Only notify on actual crashes
EXIT_STATUS="$SERVICE_RESULT"
if [[ "$EXIT_STATUS" != "success" && -n "$WEBHOOK_URL" && "$WEBHOOK_URL" != "null" ]]; then
    TIMESTAMP=$(date "+%d.%m.%Y %H:%M:%S")
    curl -s -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -d "{\"embeds\":[{\"title\":\"Server Crash\",\"description\":\"Server ist abgestuerzt und wird neugestartet.\",\"color\":15158332,\"footer\":{\"text\":\"$TIMESTAMP\"}}]}" \
        >/dev/null 2>&1
fi
