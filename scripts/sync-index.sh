set -e
npm run build
node dist/server/app/pages/dataset.js
