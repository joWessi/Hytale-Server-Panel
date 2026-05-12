#!/bin/bash
# Hytale server installer / updater wrapper.
# Called by the panel via sudo; runs the actual downloader as the hytale user.
#
# Emits JSON Lines on stdout so the panel can stream progress + parse events.
# Errors go to stderr (also captured by the panel).
#
# Usage:
#   hytale-setup.sh check                # print latest available version
#   hytale-setup.sh install [patchline]  # download + extract into SERVER_DIR
#
# Events emitted (all JSON):
#   {"type":"info","msg":"..."}
#   {"type":"oauth","url":"...","code":"..."}
#   {"type":"version","version":"..."}
#   {"type":"download","stage":"start|done","path":"..."}
#   {"type":"extract","stage":"start|done"}
#   {"type":"done","installedVersion":"..."}
#   {"type":"error","msg":"..."}

set -u

DOWNLOADER=/usr/local/bin/hytale-downloader
HYTALE_HOME=/home/hytale
SERVER_DIR="$HYTALE_HOME/server"
ASSETS_DIR="$HYTALE_HOME/HytaleAssets"
CREDS_FILE="$HYTALE_HOME/.hytale-credentials.json"
VERSION_FILE="$HYTALE_HOME/.hytale-installed-version"
DOWNLOAD_ZIP="$HYTALE_HOME/.hytale-game.zip"
ACTION="${1:-}"
PATCHLINE="${2:-release}"

emit() { printf '%s\n' "$1"; }
emit_kv() { printf '{"type":"%s","msg":"%s"}\n' "$1" "${2//\"/\\\"}"; }
die()  { emit_kv error "$1"; exit 1; }

[[ -x "$DOWNLOADER" ]] || die "hytale-downloader nicht installiert"
id hytale &>/dev/null || die "hytale user existiert nicht"

# Make sure the hytale user owns its home (some setups leave it root-owned).
chown hytale:hytale "$HYTALE_HOME" 2>/dev/null || true

run_dl() {
    # Args after this are forwarded to the downloader. Stream stdout line by
    # line, translating the device-code prompt into a structured JSON event.
    # Hytale CLI as of 2026.01 emits something like:
    #   Please visit the following URL to authenticate:
    #   https://oauth.accounts.hytale.com/oauth2/device/verify?user_code=abc12345
    #   Or visit the following URL and enter the code:
    #   https://oauth.accounts.hytale.com/oauth2/device/verify
    #   Authorization code: abc12345
    local oauth_url="" oauth_code=""
    sudo -u hytale -H \
        "$DOWNLOADER" \
        -credentials-path "$CREDS_FILE" \
        -skip-update-check \
        "$@" 2>&1 | while IFS= read -r line; do
            # 1) URL with embedded user_code= — capture both at once, prefer this
            if [[ "$line" =~ (https?://[^[:space:]]*\?user_code=([A-Za-z0-9_-]+)) ]]; then
                oauth_url="${BASH_REMATCH[1]}"
                oauth_code="${BASH_REMATCH[2]}"
                printf '{"type":"oauth","url":"%s","code":"%s"}\n' "$oauth_url" "$oauth_code"
                emit_kv info "$line"
                continue
            fi
            # 2) "Authorization code: XXXX" (fallback if we missed the URL form)
            if [[ "$line" =~ [Cc]ode:?[[:space:]]+([A-Za-z0-9_-]{4,16}) ]]; then
                oauth_code="${BASH_REMATCH[1]}"
                if [[ -z "$oauth_url" && -n "${last_bare_url:-}" ]]; then
                    oauth_url="$last_bare_url"
                fi
                if [[ -n "$oauth_url" ]]; then
                    printf '{"type":"oauth","url":"%s","code":"%s"}\n' "$oauth_url" "$oauth_code"
                fi
                emit_kv info "$line"
                continue
            fi
            # 3) Plain URL line — remember as fallback URL
            if [[ "$line" =~ (https?://[^[:space:]]+) ]]; then
                last_bare_url="${BASH_REMATCH[1]}"
            fi
            emit_kv info "$line"
        done
    return "${PIPESTATUS[0]}"
}

case "$ACTION" in
    check)
        emit_kv info "Prüfe verfügbare Version (patchline: $PATCHLINE)..."
        OUT=$(sudo -u hytale -H "$DOWNLOADER" \
            -credentials-path "$CREDS_FILE" -skip-update-check \
            -patchline "$PATCHLINE" -print-version 2>&1) || die "Version-Check fehlgeschlagen: $OUT"
        VERSION=$(printf '%s' "$OUT" | grep -oE '[0-9a-zA-Z._+-]+' | tail -1)
        printf '{"type":"version","version":"%s"}\n' "$VERSION"
        ;;

    install)
        # ── Disk-space sanity check ─────────────────────────────────
        # Peak usage: outer game.zip (~3.5GB) + extracted Server.jar + Assets.zip
        # (~3.5GB) + extracted HytaleAssets (~3.4GB). Require 10GB safety margin.
        MIN_FREE_KB=$((10 * 1024 * 1024))
        FREE_KB=$(df -P "$HYTALE_HOME" | awk 'NR==2 {print $4}')
        if (( FREE_KB < MIN_FREE_KB )); then
            FREE_GB=$(( FREE_KB / 1024 / 1024 ))
            die "Nicht genug Speicherplatz: ${FREE_GB} GB frei, mindestens 10 GB benötigt (Hytale-Download ~3.5 GB, Assets entpackt ~3.4 GB)."
        fi
        command -v bsdtar >/dev/null \
            || die "bsdtar nicht gefunden (apt install -y libarchive-tools)"

        emit_kv info "Starte Download (patchline: $PATCHLINE)..."
        mkdir -p "$SERVER_DIR/logs" "$SERVER_DIR/universe" "$SERVER_DIR/mods" "$ASSETS_DIR"
        chown -R hytale:hytale "$HYTALE_HOME"

        rm -f "$DOWNLOAD_ZIP"
        printf '{"type":"download","stage":"start"}\n'
        run_dl -patchline "$PATCHLINE" -download-path "$DOWNLOAD_ZIP" \
            || die "Download fehlgeschlagen"
        [[ -s "$DOWNLOAD_ZIP" ]] || die "Download-ZIP fehlt oder ist leer"
        printf '{"type":"download","stage":"done","path":"%s"}\n' "$DOWNLOAD_ZIP"

        VERSION=$(sudo -u hytale -H "$DOWNLOADER" \
            -credentials-path "$CREDS_FILE" -skip-update-check \
            -patchline "$PATCHLINE" -print-version 2>&1 | grep -oE '[0-9a-zA-Z._+-]+' | tail -1)

        # ── Extract outer ZIP ──────────────────────────────────────
        # Layout as of 2026.01:
        #   Server/HytaleServer.jar (+ Licenses/)
        #   Assets.zip   (stripped zip, no EOCDR — bsdtar handles it, `unzip` doesn't)
        #   start.sh / start.bat (we ignore these)
        printf '{"type":"extract","stage":"start"}\n'
        emit_kv info "Entpacke Outer-Container..."
        TMP_EXTRACT=$(sudo -u hytale mktemp -d "$HYTALE_HOME/.hytale-extract.XXXXXX")
        sudo -u hytale bsdtar -xf "$DOWNLOAD_ZIP" -C "$TMP_EXTRACT" \
            || die "Outer-ZIP entpacken fehlgeschlagen"

        # Free outer zip space immediately
        rm -f "$DOWNLOAD_ZIP"

        # Move HytaleServer.jar
        JAR=$(find "$TMP_EXTRACT" -maxdepth 3 -name 'HytaleServer.jar' -print -quit)
        [[ -n "$JAR" ]] || die "HytaleServer.jar im Download nicht gefunden"
        sudo -u hytale cp -f "$JAR" "$SERVER_DIR/HytaleServer.jar"

        # ── Extract inner Assets.zip ───────────────────────────────
        # The inner zip lacks a central directory, so unzip/jar/python-zipfile
        # all fail with "End of central directory not found". bsdtar (libarchive)
        # parses local file headers sequentially and copes.
        ASSETS_ZIP=$(find "$TMP_EXTRACT" -maxdepth 3 -name 'Assets.zip' -print -quit)
        if [[ -n "$ASSETS_ZIP" ]]; then
            emit_kv info "Entpacke Assets (~3.4 GB, kann mehrere Minuten dauern)..."
            sudo -u hytale rm -rf "$ASSETS_DIR"
            sudo -u hytale mkdir -p "$ASSETS_DIR"
            sudo -u hytale bsdtar -xf "$ASSETS_ZIP" -C "$ASSETS_DIR" \
                || emit_kv info "Assets-Extract gab Warnungen aus (kann bei Hytales gestripptem ZIP-Format vorkommen)"
            rm -f "$ASSETS_ZIP"
        else
            emit_kv info "Keine Assets.zip im Download — überspringe Asset-Extract"
        fi

        # Clean extract tmp
        rm -rf "$TMP_EXTRACT"
        chown -R hytale:hytale "$HYTALE_HOME"

        [[ -n "$VERSION" ]] && printf '%s\n' "$VERSION" > "$VERSION_FILE" && chown hytale:hytale "$VERSION_FILE"

        printf '{"type":"extract","stage":"done"}\n'
        printf '{"type":"done","installedVersion":"%s"}\n' "${VERSION:-unknown}"
        ;;

    version)
        # Local: what's installed
        if [[ -f "$VERSION_FILE" ]]; then
            VERSION=$(<"$VERSION_FILE")
        else
            VERSION=""
        fi
        printf '{"type":"version","version":"%s","installed":%s}\n' \
            "$VERSION" "$([[ -n "$VERSION" ]] && echo true || echo false)"
        ;;

    auth-clear)
        rm -f "$CREDS_FILE"
        emit_kv info "Credentials gelöscht"
        ;;

    *)
        die "Unbekannte Aktion: $ACTION (erwartet: check|install|version|auth-clear)"
        ;;
esac
