#!/bin/bash
# Trigger world save via FIFO
FIFO="/run/hytale/cmd.fifo"
if [[ -p "$FIFO" ]]; then
    printf "%s\n" "world save --all --confirm" > "$FIFO"
fi
