/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import path from "node:path";
import { fileURLToPath } from "node:url";
import { type JsonObject } from "shared-types";

import { getBuildConfig } from "../build-config.js";
import { loadJsonFile } from "../utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The Artise variant's app ID and sign-in scheme (apps/desktop/artise/build.json). */
export const ARTISE_APP_ID = "co.artise.desktop";

/** Where the source code of each release lives: the AGPL offer in About points at its tag. */
export const ARTISE_SOURCE_REPO = "https://github.com/notesby/artise-web";

/** Where a person gets the newest Artise by hand (the "Actualiza Artise" notice, artise/updates.ts). */
export const ARTISE_DOWNLOAD_URL = `${ARTISE_SOURCE_REPO}/releases/latest`;

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
 * The git tag or commit this build was made from, which CI writes into the packaged package.json
 * (`artise_source_ref`, from src/artise/build/builderConfig.ts). Empty when running unpackaged.
 */
export function artiseSourceRef(): string {
    const packageJson = loadJsonFile(path.join(__dirname, "..", "..", "package.json")) as JsonObject;
    const ref = packageJson["artise_source_ref"];
    return typeof ref === "string" ? ref : "";
}

/**
 * The source code of this exact build, as the AGPL asks: the commit or tag it was built from, else the
 * release's `desktop-v<version>` tag.
 *
 * @param version - the app's version, from `app.getVersion()`.
 * @param sourceRef - the build's tag or commit ({@link artiseSourceRef}), when known.
 */
export function sourceCodeUrl(version: string, sourceRef = ""): string {
    return `${ARTISE_SOURCE_REPO}/tree/${encodeURIComponent(sourceRef || `desktop-v${version}`)}`;
}
