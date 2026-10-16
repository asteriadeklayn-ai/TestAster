#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js topilmadi: https://nodejs.org"; read -p "Enter..."; exit 1; }
[ -d node_modules ] || npm install
(sleep 3; (open http://localhost:3000 || xdg-open http://localhost:3000) >/dev/null 2>&1) &
node server/index.js
