/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// What Element's files call through their "// Artise:" hooks (listed in ARTISE.md).

export { isArtise } from "./variant.js";
export { startArtiseCrashReports } from "./crashReports.js";
export { applyArtiseLanguage } from "./language.js";
export { artiseHandlesLink } from "./artiseId/instance.js";
export { artisePrivilegedSchemes, startArtiseShell } from "./shell/shellView.js";
export { configFor } from "./workspace/openWorkspaces.js";
