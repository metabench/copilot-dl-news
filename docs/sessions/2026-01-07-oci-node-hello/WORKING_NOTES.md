# Working Notes – OCI node hello world

- 2026-01-07 — Session created via CLI. Add incremental notes here.
- 2026-01-07 — Instance hello-world-node at 144.21.42.149 (private 10.0.0.110), NSG hello-world-nsg attached.
- Installed Node.js via OL9 module `nodejs:22` (`sudo dnf module enable -y nodejs:22 && sudo dnf install -y nodejs`).
- Opened firewalld for HTTP: `sudo firewall-cmd --add-service=http --permanent && sudo firewall-cmd --reload`.
- Deployed hello app to ~/app.js and started with `sudo nohup node ~/app.js > ~/app.log 2>&1 &` (PID ~42666).
- Validation: `sudo ss -tlnp | grep :80` shows node listening on 0.0.0.0:80; `curl.exe -s http://144.21.42.149/` returns `Hello from OCI Node on port 80`.
- Added NSG ingress rule for TCP 443 (HTTPS) via OCI CLI (`oci network nsg rules add --nsg-id ... --security-rules file://...`).
- Opened firewalld for HTTPS (`sudo firewall-cmd --add-service=https --permanent && sudo firewall-cmd --reload`).
- Created self-signed cert: `openssl req -x509 -newkey rsa:2048 -nodes -keyout ~/key.pem -out ~/cert.pem -days 30 -subj '/CN=144.21.42.149'`.
- Added HTTPS server ~/app-https.js (serves 200 text) and started with `sudo nohup node ~/app-https.js > ~/app-https.log 2>&1 &` (PID ~43864).
- Validation: `sudo ss -tlnp | grep :443` shows node on 0.0.0.0:443; `curl.exe -k https://144.21.42.149/` returns `Hello over HTTPS from OCI` (self-signed, expected warning in browsers).
