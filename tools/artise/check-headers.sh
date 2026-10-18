#!/usr/bin/env bash
# Copyright 2026 Artise.
# SPDX-License-Identifier: AGPL-3.0-only
#
# Every file Artise adds starts with Artise's copyright and the AGPL licence line, as on iOS
# (Artise/Scripts/check-headers.sh). Run from the repository root.
set -euo pipefail

dirs=(apps/web/src/artise packages/shared-components/src/artise apps/desktop/src/artise tools/artise)
missing=0
for dir in "${dirs[@]}"; do
    [ -d "$dir" ] || continue
    while IFS= read -r -d '' file; do
        head=$(head -n 6 "$file")
        if ! grep -q "Copyright 2026 Artise\." <<<"$head" || ! grep -q "SPDX-License-Identifier: AGPL-3.0-only" <<<"$head"; then
            echo "Missing Artise header: $file"
            missing=1
        fi
    done < <(find "$dir" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.cts' -o -name '*.css' -o -name '*.py' -o -name '*.sh' \) -print0)
done
if [ "$missing" -ne 0 ]; then
    echo "Add the header from ARTISE.md to the files above."
    exit 1
fi
echo "Artise headers: OK"
