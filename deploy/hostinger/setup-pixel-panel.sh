#!/usr/bin/env bash
# Run only on the Hostinger VPS as root. Do not paste passwords into chat/commands.
set -euo pipefail
[[ "$(id -u)" == 0 ]] || { echo "Run as root"; exit 2; }
ENV_FILE=/etc/bitc/bitc.env
[[ -f "$ENV_FILE" && "$(stat -c '%a' "$ENV_FILE")" == 600 ]] || {
  echo "Private env file is missing or is not chmod 600"; exit 2;
}
umask 077
read -r -s -p "Choose PIXEL PANEL password (14+ characters): " password
echo
[[ "${#password}" -ge 14 ]] || { echo "Use at least 14 characters"; exit 2; }
read -r -s -p "Repeat password: " confirmation
echo
[[ "$password" == "$confirmation" ]] || { echo "Passwords did not match"; exit 2; }
unset confirmation
# Password never enters process argv, Docker config, GitHub, command history or stdout.
hash="$(printf '%s' "$password" | docker run --rm -i node:22-alpine node -e '
  const fs=require("node:fs"), crypto=require("node:crypto");
  const pass=fs.readFileSync(0,"utf8");
  const salt=crypto.randomBytes(16);
  process.stdout.write(salt.toString("hex")+":"+crypto.scryptSync(pass,salt,64).toString("hex"));
')"
unset password
[[ "$hash" =~ ^[a-f0-9]{32}:[a-f0-9]{128}$ ]] || { echo "Could not generate password hash"; exit 2; }
temp="$(mktemp /etc/bitc/.bitc.env.XXXXXXXX)"
trap 'rm -f "$temp"' EXIT
grep -v '^BITC_PIXELS_ADMIN_PASSWORD_HASH=' "$ENV_FILE" > "$temp" || true
printf 'BITC_PIXELS_ADMIN_PASSWORD_HASH=%s\n' "$hash" >> "$temp"
chown root:root "$temp"
chmod 600 "$temp"
mv "$temp" "$ENV_FILE"
install -d -o 1000 -g 1000 -m 700 /opt/bitc/pixels
echo "Pixel panel administrator password configured. No password was printed."
echo "Rebuild only the BITC API to load the new private password hash."
