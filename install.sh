#!/bin/bash
#
# Hytale Panel - Install / Update script for Ubuntu 24.04 LTS
#
# One-liner install or update from GitHub:
#   curl -sSL https://raw.githubusercontent.com/joWessi/Hytale-Server-Panel/main/install.sh | sudo bash
#
# Or from local clone:
#   git clone https://github.com/joWessi/Hytale-Server-Panel.git
#   cd Hytale-Server-Panel && sudo ./install.sh
#
set -euo pipefail

REPO_URL="https://github.com/joWessi/Hytale-Server-Panel.git"
PANEL_DIR="/opt/hytale-panel"
ENV_DIR="/etc/hytale-panel"
REPO_CLONE_DIR="/tmp/hytale-panel-install"

echo "============================================"
echo "  Hytale Panel - Installation"
echo "  Target: Ubuntu 24.04 LTS"
echo "============================================"

# ── Pre-checks ──────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo "FEHLER: Bitte als root ausführen (sudo ./install.sh)"
    exit 1
fi

if ! grep -q "Ubuntu 24" /etc/os-release 2>/dev/null; then
    echo "WARNUNG: Dieses Script ist für Ubuntu 24.04 optimiert!"
    read -p "Trotzdem fortfahren? (j/n) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Jj]$ ]] && exit 1
fi

# ── Determine source directory ──────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/src/server.js" ]; then
    echo "Installiere aus lokalem Verzeichnis: $SCRIPT_DIR"
    SOURCE_DIR="$SCRIPT_DIR"
else
    echo "Klone Repository von GitHub..."
    command -v git >/dev/null || apt install -y -qq git
    rm -rf "$REPO_CLONE_DIR"
    git clone --depth 1 "$REPO_URL" "$REPO_CLONE_DIR"
    SOURCE_DIR="$REPO_CLONE_DIR"
fi

PKG_VERSION=$(grep '"version"' "$SOURCE_DIR/package.json" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')

IS_UPDATE=false
[ -f "$ENV_DIR/env" ] && IS_UPDATE=true

if $IS_UPDATE; then
    echo "Update auf v${PKG_VERSION} (bestehende /etc/hytale-panel/env bleibt erhalten)"
else
    echo "Neuinstallation v${PKG_VERSION}"
    read -p "Panel-Domain (z.B. panel.dirt.haus): " PANEL_DOMAIN
    [ -z "$PANEL_DOMAIN" ] && { echo "FEHLER: Domain ist erforderlich."; exit 1; }
    read -p "Discord Webhook URL (leer für keinen): " DISCORD_WEBHOOK
fi
echo ""

echo "[1/11] APT Repositories einrichten..."
# Adoptium Temurin (Java 25)
if [ ! -f /usr/share/keyrings/adoptium.gpg ]; then
    wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
        | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg
    echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb noble main" \
        > /etc/apt/sources.list.d/adoptium.list
fi
# NodeSource (Node.js 22 LTS)
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 22 ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
fi

echo "[2/11] Pakete installieren..."
apt update -qq
apt install -y -qq temurin-25-jdk nodejs nginx certbot python3-certbot-nginx ufw jq unzip git

echo "[3/11] System-Benutzer anlegen..."
id hytale &>/dev/null || useradd -m -s /bin/bash hytale
id hytale-panel &>/dev/null || useradd -r -s /usr/sbin/nologin -G hytale hytale-panel

echo "[4/11] Sudoers für Panel-User..."
cat > /etc/sudoers.d/hytale-panel << 'SUDOERS'
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl start hytale-server
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl stop hytale-server
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl restart hytale-server
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl is-active hytale-server
SUDOERS
chmod 440 /etc/sudoers.d/hytale-panel

echo "[5/11] Secrets / Env-Datei..."
mkdir -p "$ENV_DIR"
if $IS_UPDATE; then
    # Ensure CRASH_NOTIFY_TOKEN exists in existing env (added in v5)
    if ! grep -q '^CRASH_NOTIFY_TOKEN=' "$ENV_DIR/env"; then
        CRASH_NOTIFY_TOKEN=$(openssl rand -hex 32)
        echo "CRASH_NOTIFY_TOKEN=${CRASH_NOTIFY_TOKEN}" >> "$ENV_DIR/env"
        echo "  CRASH_NOTIFY_TOKEN ergänzt."
    fi
else
    JWT_SECRET=$(openssl rand -base64 48)
    CRASH_NOTIFY_TOKEN=$(openssl rand -hex 32)
    cat > "$ENV_DIR/env" << ENV
JWT_SECRET=${JWT_SECRET}
CRASH_NOTIFY_TOKEN=${CRASH_NOTIFY_TOKEN}
PORT=3000
BIND_HOST=127.0.0.1
NODE_ENV=production
SERVER_DIR=/home/hytale/server
ASSETS_DIR=/home/hytale/HytaleAssets
DISCORD_WEBHOOK=${DISCORD_WEBHOOK:-}
ENV
fi
chmod 600 "$ENV_DIR/env"
chown hytale-panel:hytale-panel "$ENV_DIR/env"

echo "[6/11] Verzeichnisse erstellen..."
mkdir -p "$PANEL_DIR"/{data,data/backups,data/metrics,public}
mkdir -p /home/hytale/server/{logs,mods,universe}

echo "[7/11] Panel-Dateien installieren..."
rm -rf "$PANEL_DIR/src"
cp -r "$SOURCE_DIR/src" "$PANEL_DIR/"
cp "$SOURCE_DIR/package.json" "$PANEL_DIR/"

rm -rf "$PANEL_DIR/public"/*
cp -r "$SOURCE_DIR/public/"* "$PANEL_DIR/public/"

# Preserve data dir on update
chown -R hytale-panel:hytale-panel "$PANEL_DIR"
chmod 750 "$PANEL_DIR"
chmod 700 "$PANEL_DIR/data"

echo "[8/11] NPM Dependencies installieren..."
cd "$PANEL_DIR"
# hytale-panel has no $HOME (nologin user); without HOME=/tmp npm silently fails.
sudo -u hytale-panel HOME=/tmp npm install --omit=dev --silent

echo "[9/11] Scripts installieren..."
cp "$SOURCE_DIR/scripts/hytale-server.sh" /usr/local/bin/
cp "$SOURCE_DIR/scripts/hytale-stop.sh" /usr/local/bin/
cp "$SOURCE_DIR/scripts/hytale-crash-notify.sh" /usr/local/bin/
chmod 755 /usr/local/bin/hytale-*.sh

cp "$SOURCE_DIR/scripts/send_cmd.sh" /home/hytale/server/
cp "$SOURCE_DIR/scripts/send_save.sh" /home/hytale/server/
cp "$SOURCE_DIR/scripts/get_players.sh" /home/hytale/server/
chmod 755 /home/hytale/server/*.sh
chown -R hytale:hytale /home/hytale/

echo "[10/11] Systemd Services..."
cp "$SOURCE_DIR/systemd/hytale-panel.service" /etc/systemd/system/
cp "$SOURCE_DIR/systemd/hytale-server.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable hytale-panel hytale-server >/dev/null 2>&1

if $IS_UPDATE; then
    echo "    Panel wird neugestartet..."
    systemctl restart hytale-panel
fi

echo "[11/11] Nginx + Firewall..."
if ! $IS_UPDATE; then
    # WebSocket upgrade map (must live in http{} context)
    cp "$SOURCE_DIR/nginx/upgrade.conf" /etc/nginx/conf.d/upgrade.conf
    sed "s/PANEL_DOMAIN/${PANEL_DOMAIN}/g" "$SOURCE_DIR/nginx/panel.conf" \
        > "/etc/nginx/sites-available/${PANEL_DOMAIN}"
    ln -sf "/etc/nginx/sites-available/${PANEL_DOMAIN}" /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    nginx -t && systemctl reload nginx

    ufw default deny incoming >/dev/null
    ufw default allow outgoing >/dev/null
    ufw allow 22/tcp comment 'SSH' >/dev/null
    ufw allow 80/tcp comment 'HTTP' >/dev/null
    ufw allow 443/tcp comment 'HTTPS' >/dev/null
    ufw allow 5520/udp comment 'Hytale Server (QUIC)' >/dev/null
    ufw --force enable >/dev/null

    # System tuning for JVM / QUIC
    echo "madvise" > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || true
    cat > /etc/sysctl.d/99-hytale.conf << SYSCTL
net.core.rmem_max=26214400
net.core.wmem_max=26214400
SYSCTL
    sysctl -p /etc/sysctl.d/99-hytale.conf >/dev/null 2>&1 || true
fi

# Cleanup cloned repo if used
[ "$SOURCE_DIR" = "$REPO_CLONE_DIR" ] && rm -rf "$REPO_CLONE_DIR"

echo ""
echo "============================================"
if $IS_UPDATE; then
    echo "  Update auf v${PKG_VERSION} abgeschlossen!"
else
    echo "  Installation v${PKG_VERSION} abgeschlossen!"
fi
echo "============================================"
echo ""

if ! $IS_UPDATE; then
    echo "NAECHSTE SCHRITTE:"
    echo ""
    echo "1. SSL-Zertifikat holen (DNS muss auf Server zeigen!):"
    echo "   certbot --nginx -d ${PANEL_DOMAIN}"
    echo ""
    echo "2. Hytale Server-Dateien bereitstellen:"
    echo "   - /home/hytale/server/HytaleServer.jar"
    echo "   - /home/hytale/HytaleAssets/"
    echo "   - /home/hytale/server/auth.enc (oder /auth login im Server)"
    echo ""
    echo "3. Panel starten:"
    echo "   systemctl start hytale-panel"
    echo ""
    echo "Panel:        https://${PANEL_DOMAIN}"
    echo "Default Login: admin / admin  (muss beim ersten Login geändert werden)"
    echo ""
fi

echo "UPDATE (künftig):"
echo "   curl -sSL https://raw.githubusercontent.com/joWessi/Hytale-Server-Panel/main/install.sh | sudo bash"
echo ""
