#!/bin/bash
# Notify panel + Discord on unplanned server exit. Suppressed on planned restarts.
set -u

FLAG_FILE="/tmp/hytale-planned-restart"
ENV_FILE="/etc/hytale-panel/env"

if [[ -f "$FLAG_FILE" ]]; then
    rm -f "$FLAG_FILE" 2>/dev/null || true
    exit 0
fi

# Only act on actual failures (systemd sets SERVICE_RESULT)
if [[ "${SERVICE_RESULT:-}" == "success" ]]; then
    exit 0
fi

# Load env vars from panel's env file (read-only, ignore parse errors)
DISCORD_WEBHOOK=""
CRASH_NOTIFY_TOKEN=""
PANEL_PORT="3000"
if [[ -r "$ENV_FILE" ]]; then
    while IFS='=' read -r key val; do
        case "$key" in
            DISCORD_WEBHOOK)      DISCORD_WEBHOOK="$val" ;;
            CRASH_NOTIFY_TOKEN)   CRASH_NOTIFY_TOKEN="$val" ;;
            PORT)                 PANEL_PORT="$val" ;;
        esac
    done < <(grep -E '^(DISCORD_WEBHOOK|CRASH_NOTIFY_TOKEN|PORT)=' "$ENV_FILE")
fi

REASON="${SERVICE_RESULT:-unknown}"

# Notify panel (records crash-loop stats)
if [[ -n "$CRASH_NOTIFY_TOKEN" ]]; then
    curl -s --max-time 5 \
        -X POST "http://127.0.0.1:${PANEL_PORT}/api/internal/crash" \
        -H "Content-Type: application/json" \
        -H "X-Internal-Token: ${CRASH_NOTIFY_TOKEN}" \
        -d "{\"reason\":\"${REASON}\"}" \
        >/dev/null 2>&1 || true
fi

# Direct Discord notification (independent of panel availability)
if [[ -n "$DISCORD_WEBHOOK" && "$DISCORD_WEBHOOK" != "null" ]]; then
    TIMESTAMP=$(date "+%d.%m.%Y %H:%M:%S")
    curl -s --max-time 5 -X POST "$DISCORD_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "{\"embeds\":[{\"title\":\"Server Crash\",\"description\":\"Server abgestuerzt (${REASON}), wird neugestartet.\",\"color\":15158332,\"footer\":{\"text\":\"$TIMESTAMP\"}}]}" \
        >/dev/null 2>&1 || true
fi

exit 0
