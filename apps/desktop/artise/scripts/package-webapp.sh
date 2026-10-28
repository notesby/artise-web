#!/usr/bin/env bash
# Copyright 2026 Artise.
# SPDX-License-Identifier: AGPL-3.0-only
#
# Makes apps/desktop/webapp.asar from this commit's apps/web, with the desktop's config.json, so the desktop
# app always runs the same Artise code as chat.<workspace>. It replaces Element's fetch-package.ts, which
# downloads Element's own signed release.
#
#     apps/desktop/artise/scripts/package-webapp.sh             # builds apps/web first
#     apps/desktop/artise/scripts/package-webapp.sh --no-build  # uses an apps/web/webapp already built
#
# A local build without minifying (needs less memory): CI_PACKAGE=1 apps/desktop/artise/scripts/package-webapp.sh
set -euo pipefail

desktop="$(cd "$(dirname "$0")/../.." && pwd)"
web="$desktop/../web"

if [ "${1:-}" != "--no-build" ]; then
    (cd "$web" && pnpm build)
fi
if [ ! -f "$web/webapp/index.html" ]; then
    echo "No web build in $web/webapp: run without --no-build" >&2
    exit 1
fi

# A copy, not a symlink, so the config below doesn't change the web build.
rm -rf "$desktop/webapp"
cp -R "$web/webapp" "$desktop/webapp"
cp "$desktop/artise/config.json" "$desktop/webapp/config.json"
(cd "$desktop" && pnpm run asar-webapp)
echo "Wrote $desktop/webapp.asar"
