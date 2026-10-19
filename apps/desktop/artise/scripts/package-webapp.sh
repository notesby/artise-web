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
#
# ARTISE_DESKTOP_SENTRY_DSN, when set, becomes config.json's sentry.dsn: the desktop project on crashes.artise.co.
# It isn't kept in the repository; CI passes the DESKTOP_SENTRY_DSN secret. Without it the build sends no crash
# reports and doesn't ask about them.
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
if [ -n "${ARTISE_DESKTOP_SENTRY_DSN:-}" ]; then
    node -e '
        const fs = require("node:fs");
        const file = process.argv[1];
        const config = JSON.parse(fs.readFileSync(file, "utf8"));
        config.sentry = { ...config.sentry, dsn: process.env.ARTISE_DESKTOP_SENTRY_DSN };
        fs.writeFileSync(file, JSON.stringify(config, null, 4) + "\n");
    ' "$desktop/webapp/config.json"
    echo "Crash reports: on, once the person agrees"
else
    echo "Crash reports: off (no ARTISE_DESKTOP_SENTRY_DSN)"
fi
(cd "$desktop" && pnpm run asar-webapp)
echo "Wrote $desktop/webapp.asar"
