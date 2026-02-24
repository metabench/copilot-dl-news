#!/bin/bash
# Remote Deployment Helper Script

# 1. Load Node environment (NVM)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Try to switch to Node 20
nvm use 20 || echo "WARNING: nvm use 20 failed, using $(node -v)"

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 2. Extract Tarballs & Install Deps
APPS_DIR="apps"
mkdir -p "$APPS_DIR"

if [ -f "deploy_shared.tar.gz" ]; then
    echo "Deploying shared..."
    mkdir -p "$APPS_DIR/shared"
    tar -xzf deploy_shared.tar.gz -C "$APPS_DIR/shared"
    rm deploy_shared.tar.gz

    echo "Installing shared dependencies..."
    cd "$APPS_DIR/shared"
    npm install jsgui3-html jsgui3-client jsgui3-server lang-tools --production --no-audit
    cd ../..
fi

if [ -f "deploy_docs-viewer.tar.gz" ]; then
    echo "Deploying docs-viewer..."
    mkdir -p "$APPS_DIR/docs-viewer"
    tar -xzf deploy_docs-viewer.tar.gz -C "$APPS_DIR/docs-viewer"
    rm deploy_docs-viewer.tar.gz

    echo "Installing docs-viewer dependencies..."
    cd "$APPS_DIR/docs-viewer"
    npm install --production --no-audit
    cd ../..

    # Restart docs-viewer
    echo "Restarting docs-viewer..."
    cd "$APPS_DIR/docs-viewer"
    export DOCS_PATH="$HOME/$APPS_DIR/docs-viewer/docs"
    export PLUGINS_PATH="$HOME/$APPS_DIR/docs-viewer/plugins"
    pkill -f 'node server.js' || true
    nohup node server.js --docs "$DOCS_PATH" --host 0.0.0.0 --plugins "$PLUGINS_PATH" > out.log 2>&1 &
    disown
    echo "docs-viewer started with PID $!"
    cd ../..
fi

if [ -f "deploy_remote-crawler-v2.tar.gz" ]; then
    echo "Deploying remote-crawler-v2..."
    mkdir -p "$APPS_DIR/remote-crawler-v2"
    tar -xzf deploy_remote-crawler-v2.tar.gz -C "$APPS_DIR/remote-crawler-v2"
    rm deploy_remote-crawler-v2.tar.gz

    echo "Installing remote-crawler-v2 dependencies..."
    cd "$APPS_DIR/remote-crawler-v2"
    npm install --production --no-audit
    cd ../..

    echo "Restarting crawl-server-v4..."
    pm2 restart crawl-server-v4 || echo "crawl-server-v4 not running via pm2"

    # Health check
    sleep 3
    if pm2 show crawl-server-v4 | grep -q "online"; then
        echo "✅ crawl-server-v4 is online"
    else
        echo "⚠️ crawl-server-v4 may not have started correctly"
        pm2 logs crawl-server-v4 --lines 10 --nostream || true
    fi
fi

echo "✅ Remote deployment complete."
