#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use node
cd labs/remote-crawler-lab
echo "Rebuilding modules in $(pwd)..."
npm rebuild
echo "Rebuild complete."
