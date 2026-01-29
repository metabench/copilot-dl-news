#!/bin/bash
cd $HOME/labs/remote-crawler-lab
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm use 20
pkill -f server.js
nohup node server.js > out.log 2>&1 < /dev/null &
PID=$!
disown $PID
echo "Server started via Node 20 (PID: $PID)."
sleep 1
cat out.log
