#!/usr/bin/env bash
# Print the host address a dev/prototype server should be advertised on, so the
# page is reachable from another machine on the tailnet (the user usually views
# from a different device than the one running the server).
#
# Preference: Tailscale IP (100.64.0.0/10 CGNAT range) > LAN IP > 127.0.0.1.
# Pair it with a server bound to 0.0.0.0 — binding 127.0.0.1 makes the printed
# address unreachable.
set -u

tailscale_ip() {
  local bin ip
  for bin in tailscale /Applications/Tailscale.app/Contents/MacOS/Tailscale /usr/bin/tailscale; do
    if command -v "$bin" >/dev/null 2>&1; then
      ip=$("$bin" ip -4 2>/dev/null | head -1)
      [ -n "$ip" ] && { printf '%s\n' "$ip"; return 0; }
    fi
  done
  # No CLI (or not on PATH): read the tailnet address off the interfaces.
  ip=$( { ifconfig 2>/dev/null || ip -4 addr 2>/dev/null; } \
        | grep -oE 'inet (addr:)?100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.[0-9]+\.[0-9]+' \
        | grep -oE '100\.[0-9.]+' | head -1 )
  [ -n "$ip" ] && { printf '%s\n' "$ip"; return 0; }
  return 1
}

lan_ip() {
  local ip
  ip=$(ipconfig getifaddr en0 2>/dev/null || true)
  [ -z "$ip" ] && ip=$(ipconfig getifaddr en1 2>/dev/null || true)
  if [ -z "$ip" ]; then
    ip=$( { ifconfig 2>/dev/null || ip -4 addr 2>/dev/null; } \
          | grep -oE 'inet (addr:)?(192\.168|10)\.[0-9]+\.[0-9]+' \
          | grep -oE '(192\.168|10)\.[0-9.]+' | head -1 )
  fi
  [ -n "$ip" ] && { printf '%s\n' "$ip"; return 0; }
  return 1
}

tailscale_ip || lan_ip || echo 127.0.0.1
