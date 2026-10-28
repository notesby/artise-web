/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { getBuildConfig } from "../build-config.js";

/** The Artise variant's app ID and sign-in scheme (apps/desktop/artise/build.json). */
export const ARTISE_APP_ID = "co.artise.desktop";

/** Where the source code of each release lives: the AGPL offer in About points at its tag. */
export const ARTISE_SOURCE_REPO = "https://github.com/notesby/artise-web";

/**
 * Whether this is the Artise build. Element's own variants keep Element's behaviour, so Element's tests
 * and an unbranded `pnpm start` work as upstream.
 */
export function isArtise(): boolean {
    return getBuildConfig().appId === ARTISE_APP_ID;
}

/**
 * The second scheme Element registers next to its own, for its legacy `element://` links. Artise answers
 * only its own scheme, so it never takes Element's links: the Artise build gets its own scheme back, which
 * ProtocolHandler then registers and accepts once.
 *
 * @param elementLegacy - Element's legacy scheme, kept for Element's builds.
 */
export function legacyProtocol(elementLegacy: string): string {
    return isArtise() ? getBuildConfig().protocol : elementLegacy;
}

/**
 * The source code of this exact version, as the AGPL asks: the release's `desktop-v<version>` tag.
 *
 * @param version - the app's version, from `app.getVersion()`.
 */
export function sourceCodeUrl(version: string): string {
    return `${ARTISE_SOURCE_REPO}/tree/desktop-v${encodeURIComponent(version)}`;
}
