#!/bin/bash
# Send a command to the Hytale server via FIFO
FIFO="/run/hytale/cmd.fifo"
CMD="$1"
if [[ -p "$FIFO" && -n "$CMD" ]]; then
    printf "%s\n" "$CMD" > "$FIFO"
fi
