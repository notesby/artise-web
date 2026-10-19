/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import type { Configuration } from "electron-builder";

import { ARTISE_SOURCE_REPO } from "../variant.js";

/** Artise's icons, written by tools/artise/desktop_icons.py from the web's icon. */
export const ARTISE_ICONS = "artise/icons";

/**
 * Element's electron-builder configuration turned into Artise's: Artise's icons, publisher and licence.
 * The app ID, names and the sign-in scheme come from the variant file (artise/build.json), which Element's
 * configuration already reads through VARIANT_PATH.
 *
 * Used by apps/desktop/artise/electron-builder.ts, so Element's own electron-builder.ts never changes.
 *
 * @param element - Element's configuration, built with the Artise variant.
 * @param sourceRef - the git tag or commit being built, for About's source link (the AGPL offer).
 */
export function artiseBuilderConfig(element: Configuration, sourceRef = ""): Configuration {
    return {
        ...element,
        // macOS shows it in About and Finder's info; Element's default would read "Copyright © Element".
        copyright: "Copyright © 2026 Artise. AGPL-3.0-only. Based on Element.",
        // extraMetadata is merged into Element's package.json field by field, so every Element value a person
        // or a package manager could see is replaced, the author's email included.
        extraMetadata: {
            ...element.extraMetadata,
            author: { name: "Artise", email: "admin@artise.co" },
            homepage: "https://artise.co",
            repository: { type: "git", url: ARTISE_SOURCE_REPO },
            license: "AGPL-3.0-only",
            artise_source_ref: sourceRef,
        },
        // Element's updater reads update_base_url (src/updater.ts); without this electron-builder also writes an
        // app-update.yml pointing at Element's GitHub releases.
        publish: null,
        // The window and tray icons are read at run time from resources/build/ (src/icon.ts).
        extraResources: [
            { from: ARTISE_ICONS, to: "build", filter: ["icon.png", "icon.ico"] },
            // Windows' taskbar badge with every workspace's unread count added up (src/artise/views/unread.ts).
            { from: `${ARTISE_ICONS}/overlay`, to: "build/overlay" },
            "webapp.asar",
        ],
        mac: { ...element.mac, icon: `${ARTISE_ICONS}/icon.icon` },
        dmg: { ...element.dmg, badgeIcon: `${ARTISE_ICONS}/icon.icon` },
        win: { ...element.win, icon: `${ARTISE_ICONS}/icon.ico` },
        linux: { ...element.linux, icon: `${ARTISE_ICONS}/icon.png` },
        // Element's package recommends Element's own apt keyring.
        deb: { ...element.deb, recommends: [] },
    };
}
