#!/bin/bash
# Hytale Server start script
# Tuned for 8GB RAM VPS (4 cores)

SERVER_DIR="/home/hytale/server"
ASSETS_DIR="/home/hytale/HytaleAssets"
FIFO="/run/hytale/cmd.fifo"
LOG_FILE="$SERVER_DIR/logs/console.log"

# Ensure directories exist
mkdir -p "$SERVER_DIR/logs"
mkdir -p "$(dirname "$FIFO")"

# Create FIFO if it doesn't exist
if [[ ! -p "$FIFO" ]]; then
    mkfifo "$FIFO"
    chmod 660 "$FIFO"
    chown hytale:hytale "$FIFO"
fi

# Apply panel whitelist (panel is source of truth)
PANEL_WL="/opt/hytale-panel/data/whitelist.json"
if [[ -f "$PANEL_WL" ]]; then
    cp "$PANEL_WL" "$SERVER_DIR/whitelist.json"
    chown hytale:hytale "$SERVER_DIR/whitelist.json"
fi

cd "$SERVER_DIR" || exit 1

# JVM flags optimized for Hytale on 8GB RAM VPS
# ZGC: sub-millisecond GC pauses, ideal for game servers (Java 25+)
JAVA_ARGS=(
    -Xmx5G
    -Xms4G
    -XX:MaxMetaspaceSize=384M
    -XX:+UseZGC
    -XX:+ZGenerational
    -XX:SoftMaxHeapSize=4G
    -XX:+AlwaysPreTouch
    -XX:+ParallelRefProcEnabled
    -XX:+UseTransparentHugePages
    -Djava.net.preferIPv4Stack=true
)

# Start server with FIFO input
exec java "${JAVA_ARGS[@]}" \
    -jar HytaleServer.jar \
    --assets "$ASSETS_DIR" \
    < <(tail -f "$FIFO" 2>/dev/null) \
    >> "$LOG_FILE" 2>&1
