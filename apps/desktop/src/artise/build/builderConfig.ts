/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import type { Configuration } from "electron-builder";

import { ARTISE_SOURCE_REPO } from "../variant.js";

/** Artise's icons, written by tools/artise/desktop_icons.py from the web's icon. */
export const ARTISE_ICONS = "artise/icons";

/**
 * The Microsoft Store package's identity, from Partner Center ("Product identity"). CI passes them from the
 * repository's variables; until the app is registered there, placeholders let the package build for checking.
 * Microsoft: "Values in the manifest are case-sensitive. Spaces and other punctuation must also match."
 */
export function storeIdentity(env: NodeJS.ProcessEnv): {
    identityName: string;
    publisher: string;
    publisherDisplayName: string;
} {
    return {
        identityName: env.ARTISE_STORE_IDENTITY_NAME || "Artise.Desktop",
        publisher: env.ARTISE_STORE_PUBLISHER || "CN=00000000-0000-0000-0000-000000000000",
        publisherDisplayName: env.ARTISE_STORE_PUBLISHER_DISPLAY_NAME || "Artise",
    };
}

/**
 * Element's electron-builder configuration turned into Artise's: Artise's icons, publisher and licence.
 * The app ID, names and the sign-in scheme come from the variant file (artise/build.json), which Element's
 * configuration already reads through VARIANT_PATH.
 *
 * Used by apps/desktop/artise/electron-builder.ts, so Element's own electron-builder.ts never changes.
 *
 * @param element - Element's configuration, built with the Artise variant.
 * @param sourceRef - the git tag or commit being built, for About's source link (the AGPL offer).
 * @param env - the environment, for the Store identity.
 */
export function artiseBuilderConfig(
    element: Configuration,
    sourceRef = "",
    env: NodeJS.ProcessEnv = process.env,
): Configuration {
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
        mac: {
            ...element.mac,
            icon: `${ARTISE_ICONS}/icon.icon`,
            // macOS asks before the camera and microphone are first used; the app's own words, in each language
            // (tools/artise/web_wording.py writes artise/mac/<lang>.lproj/InfoPlist.strings).
            extendInfo: {
                ...element.mac?.extendInfo,
                CFBundleDevelopmentRegion: "es",
                CFBundleLocalizations: ["es", "en", "pt"],
                NSCameraUsageDescription: "Artise uses the camera for video calls.",
                NSMicrophoneUsageDescription: "Artise uses the microphone for calls and voice messages.",
            },
            extraResources: ["en", "es", "pt"].map((language) => ({
                from: `artise/mac/${language}.lproj`,
                to: `${language}.lproj`,
            })),
        },
        dmg: { ...element.dmg, badgeIcon: `${ARTISE_ICONS}/icon.icon` },
        win: { ...element.win, icon: `${ARTISE_ICONS}/icon.ico` },
        linux: { ...element.linux, icon: `${ARTISE_ICONS}/icon.png` },
        // The Microsoft Store package (the appx target, built on Windows): unsigned, as the Store signs it. Its tiles
        // are artise/icons/appx/, which the CI copies to build/appx/ where electron-builder looks for them.
        appx: {
            ...storeIdentity(env),
            applicationId: "Artise",
            displayName: "Artise",
            languages: ["es-MX", "en-US", "pt-BR"],
            backgroundColor: "transparent",
            // Calls need the camera and microphone; Electron apps run with full trust.
            capabilities: ["runFullTrust", "internetClient", "microphone", "webcam"],
            customExtensionsPath: "artise/appx/extensions.xml",
            // Windows 10 1809 and later; the start-at-login extension needs 1709.
            minVersion: "10.0.17763.0",
            maxVersionTested: "10.0.26100.0",
        },
        // Element's package recommends Element's own apt keyring.
        deb: { ...element.deb, recommends: [] },
    };
}
