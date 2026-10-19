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

if [[ "$ref" =~ ^desktop-v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    # The Microsoft Store turns 1.2.3 into 1.2.3.0, and wants each part 0-65535 and the first not 0.
    for part in "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"; do
        if [ "$part" -gt 65535 ]; then
            echo "Each part of a release version is 0-65535 for the Microsoft Store, not $ref" >&2
            exit 1
        fi
    done
    if [ "${BASH_REMATCH[1]}" -eq 0 ]; then
        echo "A release version starts at 1 for the Microsoft Store (desktop-v1.0.0), not $ref" >&2
        exit 1
    fi
    echo "${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}"
elif [[ "$ref" == desktop-v* ]]; then
    echo "A release tag is desktop-v<major>.<minor>.<patch>, not $ref" >&2
    exit 1
else
    echo "0.0.1-dev.$run"
fi
