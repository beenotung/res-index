#!/bin/bash
set -e
set -o pipefail
npm run build
sudo sync
sudo sysctl -w vm.drop_caches=3
node dist/server/app/pages/home.js
