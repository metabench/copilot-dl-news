# Session Summary – OCI node hello world

## Accomplishments
- Deployed Node.js 22 on new OCI instance hello-world-node (144.21.42.149) and confirmed HTTP service on port 80.
- Configured firewalld to allow HTTP and started persistent-ish nohup app at ~/app.js (listening on 0.0.0.0:80).
- Added HTTPS: opened NSG + firewalld for 443, created self-signed cert, deployed ~/app-https.js, and confirmed response over HTTPS.

## Metrics / Evidence
- `curl.exe -s http://144.21.42.149/` → `Hello from OCI Node on port 80`.
- `sudo ss -tlnp | grep :80` on the VM shows node listening.
- `curl.exe -k https://144.21.42.149/` → `Hello over HTTPS from OCI`; `sudo ss -tlnp | grep :443` shows node listening.

## Decisions
- Chose Node.js stream 22 (current default) via dnf module enable.
- Used self-signed cert for internal HTTPS (CN = 144.21.42.149); will swap to trusted cert later if needed.

## Next Steps
- Optional: convert app to a systemd service for reboot persistence; consider HTTPS via OCI LB or certbot on port 443.
