#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use node
cd labs/remote-crawler-lab
echo "Removing node_modules..."
rm -rf node_modules package-lock.json
echo "Installing..."
npm install
echo "Install complete."
