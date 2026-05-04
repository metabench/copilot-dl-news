#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "Installing Node v20 (LTS)..."
nvm install 20
nvm use 20
nvm alias default 20

cd labs/remote-crawler-lab
echo "Reinstalling dependencies for Node 20..."
rm -rf node_modules package-lock.json
npm install

echo "Done."
node -v
