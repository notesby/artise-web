/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Configuration } from "electron-builder";

import { ARTISE_ICONS, artiseBuilderConfig } from "./builderConfig.js";

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
});
