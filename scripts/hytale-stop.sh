#!/bin/bash
# Graceful Hytale server shutdown with countdown

FIFO="/run/hytale/cmd.fifo"

send_cmd() {
    if [[ -p "$FIFO" ]]; then
        printf "%s\n" "$1" > "$FIFO"
    fi
}

# Countdown warning
send_cmd "say Server wird in 5 Sekunden heruntergefahren..."
sleep 2
send_cmd "say 3..."
sleep 1
send_cmd "say 2..."
sleep 1
send_cmd "say 1..."
sleep 1

# Save and stop
send_cmd "world save --all --confirm"
sleep 3
send_cmd "stop"

# Wait for graceful shutdown
sleep 5
