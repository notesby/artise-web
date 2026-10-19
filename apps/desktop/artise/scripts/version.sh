#!/usr/bin/env bash
# Copyright 2026 Artise.
# SPDX-License-Identifier: AGPL-3.0-only
#
# The Artise desktop version for a CI run, printed on stdout:
# - a release tag desktop-v1.2.3 gives 1.2.3;
# - any other run gives 0.0.1-dev.<run number>, a test build that is never published.
# Element's own package.json version is Element's release, so it is never used for Artise.
#
#     version.sh <git ref name> <run number>
set -euo pipefail

ref="${1:-}"
run="${2:-0}"

if [[ "$ref" =~ ^desktop-v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
elif [[ "$ref" == desktop-v* ]]; then
    echo "A release tag is desktop-v<major>.<minor>.<patch>, not $ref" >&2
    exit 1
else
    echo "0.0.1-dev.$run"
fi
