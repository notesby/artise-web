/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Configuration } from "electron-builder";

import { ARTISE_ICONS, artiseBuilderConfig, storeIdentity } from "./builderConfig.js";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// The parts of Element's configuration that Artise changes or must keep, as electron-builder.ts sets them.
const element: Configuration = {
    appId: "co.artise.desktop",
    extraMetadata: { name: "artise-desktop", productName: "Artise", electron_appId: "co.artise.desktop" },
    extraResources: ["build/icon.*", "webapp.asar"],
    mac: { target: ["dmg", "zip"], icon: "build/icon.icon", hardenedRuntime: true },
    dmg: { badgeIcon: "build/icon.icon" },
    win: { target: ["squirrel", "msi"], icon: "build/icon.ico" },
    linux: { target: ["tar.gz", "deb"], icon: "icon.png" },
    deb: { recommends: ["element-io-archive-keyring"] },
    electronFuses: { runAsNode: false, onlyLoadAppFromAsar: true },
};

describe("artiseBuilderConfig", () => {
    const artise = artiseBuilderConfig(element);

    it("uses Artise's icons on every platform", () => {
        expect(artise.mac?.icon).toBe("artise/icons/icon.icon");
        expect(artise.dmg?.badgeIcon).toBe("artise/icons/icon.icon");
        expect(artise.win?.icon).toBe("artise/icons/icon.ico");
        expect(artise.linux?.icon).toBe("artise/icons/icon.png");
        // The window and tray read them from resources/build/ at run time.
        expect(artise.extraResources).toEqual([
            { from: "artise/icons", to: "build", filter: ["icon.png", "icon.ico"] },
            { from: "artise/icons/overlay", to: "build/overlay" },
            "webapp.asar",
        ]);
    });

    it("notarizes the Mac build only when it is signed", () => {
        // CI sets CSC_LINK (the Developer ID certificate) when the repository has Apple's secrets; without it
        // electron-builder would warn about missing notarization on every unsigned build.
        expect(artiseBuilderConfig(element, "", {}).mac?.notarize).toBe(false);
        expect(artiseBuilderConfig(element, "", { CSC_LINK: "base64..." }).mac?.notarize).toBe(true);
        // Element's hardened runtime and entitlements (camera, microphone) stay for the signed build.
        expect(artise.mac?.hardenedRuntime).toBe(true);
    });

    it("names Artise as the publisher and AGPL-3.0-only as the licence", () => {
        expect(artise.copyright).toContain("Artise");
        expect(artise.copyright).not.toContain("Element Creations");
        expect(artise.extraMetadata).toMatchObject({
            // With an email, or Element's support@element.io would be merged in from package.json.
            author: { name: "Artise", email: "admin@artise.co" },
            homepage: "https://artise.co",
            repository: { type: "git", url: "https://github.com/notesby/artise-web" },
            license: "AGPL-3.0-only",
            // The variant's own values stay.
            electron_appId: "co.artise.desktop",
            productName: "Artise",
        });
    });

    it("keeps Element's security settings and targets", () => {
        // Hardened runtime and fuses come from Element and must survive.
        expect(artise.mac?.hardenedRuntime).toBe(true);
        expect(artise.electronFuses).toEqual(element.electronFuses);
        expect(artise.mac?.target).toEqual(["dmg", "zip"]);
    });

    it("records the tag or commit being built, for About's source link", () => {
        expect(artiseBuilderConfig(element, "desktop-v0.1.0").extraMetadata?.artise_source_ref).toBe("desktop-v0.1.0");
    });

    it("doesn't point electron-updater at Element's GitHub releases", () => {
        expect(artise.publish).toBeNull();
    });

    it("drops Element's apt keyring from the .deb", () => {
        expect(artise.deb?.recommends).toEqual([]);
    });

    it("points at icons that exist", () => {
        // tools/artise/desktop_icons.py writes them; a missing one would fail the build late, on CI.
        const files = [
            "icon.png",
            "icon.ico",
            "icon.icon/icon.json",
            "icon.icon/Assets/artise.png",
            "overlay/1.png",
            "overlay/9plus.png",
        ];
        expect(files.filter((file) => !fs.existsSync(path.join(desktopDir, ARTISE_ICONS, file)))).toEqual([]);
    });

    it("matches the variant file's app ID and scheme", () => {
        // The sign-in callback is co.artise.desktop:/vector/webapp/, so the scheme must be exactly this.
        const variant = JSON.parse(fs.readFileSync(path.join(desktopDir, "artise/build.json"), "utf8"));
        expect(variant).toMatchObject({
            appId: "co.artise.desktop",
            productName: "Artise",
            protocols: ["co.artise.desktop"],
        });
    });

    it("builds the Store package unsigned, in Spanish first, starting at login", () => {
        expect(artise.appx).toMatchObject({
            applicationId: "Artise",
            displayName: "Artise",
            languages: ["es-MX", "en-US", "pt-BR"],
            capabilities: ["runFullTrust", "internetClient", "microphone", "webcam"],
            customExtensionsPath: "artise/appx/extensions.xml",
        });
        const extensions = fs.readFileSync(path.join(desktopDir, "artise/appx/extensions.xml"), "utf8");
        expect(extensions).toContain('<desktop:StartupTask TaskId="ArtiseStartup" Enabled="true"');
        // The executable electron-builder puts in the package: app\<productName>.exe.
        expect(extensions).toContain('Executable="app\\Artise.exe"');
    });

    it("has every Store tile", () => {
        const tiles = [
            "StoreLogo",
            "Square44x44Logo",
            "Square150x150Logo",
            "Wide310x150Logo",
            "SmallTile",
            "LargeTile",
        ];
        expect(
            tiles.filter((tile) => !fs.existsSync(path.join(desktopDir, ARTISE_ICONS, "appx", `${tile}.png`))),
        ).toEqual([]);
    });
});

describe("macOS permission texts", () => {
    const mac = artiseBuilderConfig(element).mac!;

    it("asks for the camera and microphone in Spanish, English and Portuguese", () => {
        expect(mac.extendInfo).toMatchObject({ CFBundleLocalizations: ["es", "en", "pt"] });
        expect(mac.extraResources).toEqual([
            { from: "artise/mac/en.lproj", to: "en.lproj" },
            { from: "artise/mac/es.lproj", to: "es.lproj" },
            { from: "artise/mac/pt.lproj", to: "pt.lproj" },
        ]);
        const spanish = fs.readFileSync(path.join(desktopDir, "artise/mac/es.lproj/InfoPlist.strings"), "utf8");
        expect(spanish).toContain('"NSCameraUsageDescription" = "Artise usa la cámara para las videollamadas.";');
    });

    it("has the English texts in Info.plist itself, as the fallback", () => {
        const english = fs.readFileSync(path.join(desktopDir, "artise/mac/en.lproj/InfoPlist.strings"), "utf8");
        expect(english).toContain(
            `"NSMicrophoneUsageDescription" = "${mac.extendInfo?.NSMicrophoneUsageDescription}";`,
        );
        expect(english).toContain(`"NSCameraUsageDescription" = "${mac.extendInfo?.NSCameraUsageDescription}";`);
    });
});

describe("storeIdentity", () => {
    it("takes Partner Center's values from the environment", () => {
        expect(
            storeIdentity({
                ARTISE_STORE_IDENTITY_NAME: "12345Artise.Artise",
                ARTISE_STORE_PUBLISHER: "CN=ABCD-1234",
                ARTISE_STORE_PUBLISHER_DISPLAY_NAME: "Artise",
            }),
        ).toEqual({ identityName: "12345Artise.Artise", publisher: "CN=ABCD-1234", publisherDisplayName: "Artise" });
    });

    it("builds with placeholders before the app is registered", () => {
        expect(storeIdentity({})).toEqual({
            identityName: "Artise.Desktop",
            publisher: "CN=00000000-0000-0000-0000-000000000000",
            publisherDisplayName: "Artise",
        });
    });
});
