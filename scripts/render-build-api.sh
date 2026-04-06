#!/usr/bin/env sh
# Verbose API stack build for Render (Linux/sh). Fails loudly if outputs are missing.
set -e
echo "==> render-build-api: npm install"
npm install
echo "==> render-build-api: packages/domain"
npm run build -w packages/domain
echo "==> render-build-api: packages/shared"
npm run build -w packages/shared
echo "==> render-build-api: apps/api"
npm run build -w apps/api
if [ ! -f apps/api/dist/server.js ]; then
  echo "RENDER_BUILD_ERROR: apps/api/dist/server.js missing after build"
  exit 1
fi
echo "RENDER_BUILD_OK: apps/api/dist/server.js exists"
