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
    # Install critical deps for shared (isomorphic/jsgui.js relies on these)
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
fi

# 3. Restart Server
echo "Restarting docs-viewer..."
cd "$APPS_DIR/docs-viewer"
export DOCS_PATH="$HOME/$APPS_DIR/docs-viewer/docs"
export PLUGINS_PATH="$HOME/$APPS_DIR/docs-viewer/plugins"
pkill -f 'node server.js' || true
nohup node server.js --docs "$DOCS_PATH" --host 0.0.0.0 --plugins "$PLUGINS_PATH" > out.log 2>&1 &
PID=$!
disown
echo "Server started with PID $PID"
echo "DOCS_PATH=$DOCS_PATH"
echo "PLUGINS_PATH=$PLUGINS_PATH"

# 4. Verify Startup
sleep 2
if ps -p $PID > /dev/null; then
   echo "✅ Process $PID is running."
   echo "--- LOG TAIL ---"
   tail -n 20 out.log
   echo "----------------"
else
   echo "❌ Process $PID died!"
   echo "--- LOG TAIL ---"
   cat out.log
   echo "----------------"
   exit 1
fi
