/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What electron-main.ts calls, through its "// Artise:" hooks (listed in ARTISE.md).

export { isArtise } from "./variant.js";
export { startArtiseCrashReports } from "./crashReports.js";
export { applyArtiseLanguage } from "./language.js";
