#!/bin/bash
#
# Hytale Panel v4 - Install Script for Ubuntu 24.04.3 LTS
#
# One-liner install from GitHub:
#   curl -sSL https://raw.githubusercontent.com/joWessi/Hytale-Server-Panel/main/install.sh | sudo bash
#
# Or clone and run:
#   git clone https://github.com/j0w3ss/hytale-panel.git
#   cd hytale-panel && sudo ./install.sh
#
set -e

REPO_URL="https://github.com/joWessi/Hytale-Server-Panel.git"
PANEL_DIR="/opt/hytale-panel"
ENV_DIR="/etc/hytale-panel"
REPO_CLONE_DIR="/tmp/hytale-panel-install"

echo "============================================"
echo "  Hytale Panel v4 - Installation"
echo "  Target: Ubuntu 24.04 LTS"
echo "============================================"
echo ""

# ── Pre-checks ──────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo "FEHLER: Bitte als root ausfuehren (sudo ./install.sh)"
    exit 1
fi

if ! grep -q "Ubuntu 24" /etc/os-release 2>/dev/null; then
    echo "WARNUNG: Dieses Script ist fuer Ubuntu 24.04 optimiert!"
    read -p "Trotzdem fortfahren? (j/n) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Jj]$ ]] && exit 1
fi

# ── Determine source directory ──────────────────────────
# If we're running from within the repo, use that.
# Otherwise, clone from GitHub first.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/src/server.js" ]; then
    echo "Installiere aus lokalem Verzeichnis: $SCRIPT_DIR"
    SOURCE_DIR="$SCRIPT_DIR"
else
    echo "Klone Repository von GitHub..."
    apt install -y -qq git 2>/dev/null
    rm -rf "$REPO_CLONE_DIR"
    git clone --depth 1 "$REPO_URL" "$REPO_CLONE_DIR"
    SOURCE_DIR="$REPO_CLONE_DIR"
    echo "Repository geklont nach $REPO_CLONE_DIR"
fi

echo ""

# ── Domain abfragen ─────────────────────────────────────
read -p "Panel-Domain (z.B. panel.dirt.haus): " PANEL_DOMAIN
if [ -z "$PANEL_DOMAIN" ]; then
    echo "FEHLER: Domain ist erforderlich."
    exit 1
fi

# ── Discord Webhook (optional) ──────────────────────────
read -p "Discord Webhook URL (leer fuer keinen): " DISCORD_WEBHOOK

echo ""
echo "[1/12] APT Repositories einrichten..."
# Adoptium Temurin (Java 25)
wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public | \
    gpg --dearmor -o /usr/share/keyrings/adoptium.gpg 2>/dev/null || true
echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb noble main" \
    > /etc/apt/sources.list.d/adoptium.list

# NodeSource (Node.js 22 LTS)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1

echo "[2/12] Pakete installieren..."
apt update -qq
apt install -y -qq temurin-25-jdk nodejs nginx certbot python3-certbot-nginx ufw jq unzip git

echo "[3/12] System-Benutzer anlegen..."
# Gameserver user
id hytale &>/dev/null || useradd -m -s /bin/bash hytale

# Panel user (system account, no login, member of hytale group)
id hytale-panel &>/dev/null || useradd -r -s /usr/sbin/nologin -G hytale hytale-panel

echo "[4/12] Sudoers fuer Panel-User..."
cat > /etc/sudoers.d/hytale-panel << 'SUDOERS'
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl start hytale-server
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl stop hytale-server
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl restart hytale-server
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl is-active hytale-server
hytale-panel ALL=(root) NOPASSWD: /usr/bin/systemctl is-active --quiet hytale-server
SUDOERS
chmod 440 /etc/sudoers.d/hytale-panel

echo "[5/12] JWT Secret generieren..."
mkdir -p "$ENV_DIR"
# Preserve existing env file on update (don't overwrite secrets)
if [ -f "$ENV_DIR/env" ]; then
    echo "  Vorhandene /etc/hytale-panel/env bleibt erhalten."
else
    JWT_SECRET=$(openssl rand -base64 48)
    cat > "$ENV_DIR/env" << ENV
JWT_SECRET=${JWT_SECRET}
PORT=3000
BIND_HOST=127.0.0.1
NODE_ENV=production
SERVER_DIR=/home/hytale/server
ASSETS_DIR=/home/hytale/HytaleAssets
DISCORD_WEBHOOK=${DISCORD_WEBHOOK}
ENV
    chmod 600 "$ENV_DIR/env"
    chown hytale-panel:hytale-panel "$ENV_DIR/env"
fi

echo "[6/12] Verzeichnisse erstellen..."
mkdir -p "$PANEL_DIR"/{data,public}
mkdir -p /home/hytale/server/{logs,mods,universe}

echo "[7/12] Panel-Dateien installieren..."
# Backend
rm -rf "$PANEL_DIR/src"
cp -r "$SOURCE_DIR/src" "$PANEL_DIR/"
cp "$SOURCE_DIR/package.json" "$PANEL_DIR/"

# Frontend
cp -r "$SOURCE_DIR/public/"* "$PANEL_DIR/public/"

chown -R hytale-panel:hytale-panel "$PANEL_DIR"
# Data dir must be writable, rest can be read-only
chmod 750 "$PANEL_DIR"
chmod 700 "$PANEL_DIR/data"

echo "[8/12] NPM Dependencies installieren..."
cd "$PANEL_DIR"
sudo -u hytale-panel npm install --omit=dev --silent 2>/dev/null

echo "[9/12] Scripts installieren..."
cp "$SOURCE_DIR/scripts/hytale-server.sh" /usr/local/bin/
cp "$SOURCE_DIR/scripts/hytale-stop.sh" /usr/local/bin/
cp "$SOURCE_DIR/scripts/hytale-crash-notify.sh" /usr/local/bin/
chmod +x /usr/local/bin/hytale-*.sh

cp "$SOURCE_DIR/scripts/send_cmd.sh" /home/hytale/server/
cp "$SOURCE_DIR/scripts/send_save.sh" /home/hytale/server/
cp "$SOURCE_DIR/scripts/get_players.sh" /home/hytale/server/
chmod +x /home/hytale/server/*.sh
chown -R hytale:hytale /home/hytale/

echo "[10/12] Systemd Services installieren..."
cp "$SOURCE_DIR/systemd/hytale-panel.service" /etc/systemd/system/
cp "$SOURCE_DIR/systemd/hytale-server.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable hytale-panel hytale-server

echo "[11/12] Nginx konfigurieren..."
sed "s/PANEL_DOMAIN/${PANEL_DOMAIN}/g" "$SOURCE_DIR/nginx/panel.conf" \
    > "/etc/nginx/sites-available/${PANEL_DOMAIN}"
ln -sf "/etc/nginx/sites-available/${PANEL_DOMAIN}" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
nginx -t && systemctl reload nginx

echo "[12/12] Firewall konfigurieren..."
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'SSH' >/dev/null
ufw allow 80/tcp comment 'HTTP' >/dev/null
ufw allow 443/tcp comment 'HTTPS' >/dev/null
ufw allow 5520/udp comment 'Hytale Server (QUIC)' >/dev/null
ufw --force enable >/dev/null

# System tuning for JVM
echo "madvise" > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || true
cat > /etc/sysctl.d/99-hytale.conf << SYSCTL
net.core.rmem_max=26214400
net.core.wmem_max=26214400
SYSCTL
sysctl -p /etc/sysctl.d/99-hytale.conf >/dev/null 2>&1 || true

# Cleanup cloned repo if we used it
if [ "$SOURCE_DIR" = "$REPO_CLONE_DIR" ]; then
    rm -rf "$REPO_CLONE_DIR"
fi

echo ""
echo "============================================"
echo "  Installation abgeschlossen!"
echo "============================================"
echo ""
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
echo "3. Optional: Weltdaten wiederherstellen:"
echo "   - /home/hytale/server/universe/"
echo ""
echo "4. Panel starten:"
echo "   systemctl start hytale-panel"
echo ""
echo "5. Server starten (oder ueber Panel):"
echo "   systemctl start hytale-server"
echo ""
echo "Panel:  https://${PANEL_DOMAIN}"
echo "Server: play.dirt.haus:5520"
echo ""
echo "Default Login: admin / admin"
echo "WICHTIG: Passwort sofort aendern!"
echo ""
echo "UPDATE: Um das Panel spaeter zu aktualisieren:"
echo "   curl -sSL https://raw.githubusercontent.com/joWessi/Hytale-Server-Panel/main/install.sh | sudo bash"
echo ""
