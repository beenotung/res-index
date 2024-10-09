#!/bin/bash
set -e
set -o pipefail

npm run build
NODE_ENV=export node dist/server/app/pages/home.js
