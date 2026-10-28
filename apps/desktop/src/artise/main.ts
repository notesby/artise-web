/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What electron-main.ts calls through its "// Artise:" hooks (listed in ARTISE.md). Hooks in Element's smaller
// files import just the module they need (artise/links.ts, artise/views/context.ts), so Element's tests of those
// files don't load the whole shell.

export { isArtise } from "./variant.js";
export { startArtiseCrashReports } from "./crashReports.js";
export { applyArtiseLanguage } from "./language.js";
export { artiseUpdateBaseUrl } from "./updates.js";
export { artisePrivilegedSchemes, startArtiseShell } from "./shell/shellView.js";
