/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The start-up check CI runs on each OS against the packaged Artise app (artise-desktop.yml): it opens as
// Artise, on its workspace, with Artise's menu, and the native parts Element Desktop needs work.

import fs from "node:fs";
import path from "node:path";

import { test, expect } from "../../element-desktop-test.js";

declare global {
    interface ElectronPlatform {
        getEventIndexingManager(): { supportsEventIndexing(): Promise<boolean> } | undefined;
        createPickleKey(userId: string, deviceId: string): Promise<string | null>;
    }

    interface Window {
        mxPlatformPeg: { get(): ElectronPlatform };
    }
}

test.describe("Artise starts", () => {
    test.slow();

    test.beforeEach(async ({ page }) => {
        await page.locator("#matrixchat").waitFor();
        await page.locator(".mx_Welcome").waitFor();
    });

    test("as Artise, with Artise's logo", async ({ page, app }) => {
        // The window, the app and the welcome view all say Artise, never Element.
        await expect(page).toHaveTitle("Artise");
        expect(await app.evaluate(({ app }) => app.getName())).toBe("Artise");
        await expect(page.locator(".mx_Welcome")).toContainText("Artise");
        await expect(page.locator(".mx_Welcome img[src*='vector-icons/512']")).toBeVisible();
    });

    test("with 'About Artise' in the Help menu", async ({ app }) => {
        const help = await app.evaluate(({ Menu }) =>
            Menu.getApplicationMenu()
                ?.items.at(-1)
                ?.submenu?.items.map((item) => item.label),
        );
        expect(help).toContain("About Artise");
    });

    test("with the packaged workspace", async ({ page }) => {
        // config.json inside webapp.asar is the desktop's own (apps/desktop/artise/config.json).
        const config = await page.evaluate(() => fetch("config.json").then((response) => response.json()));
        expect(config).toMatchObject({ brand: "Artise", default_server_config: { "m.homeserver": {} } });
    });

    test("with encrypted message search (Seshat's native module)", async ({ page }) => {
        // The prebuilt Seshat binary for this OS and architecture made it into the package.
        await expect(
            page.evaluate(() => window.mxPlatformPeg.get().getEventIndexingManager()?.supportsEventIndexing()),
        ).resolves.toBeTruthy();
    });

    test("sending no crash reports before the person agrees", async ({ app, tmpDir }) => {
        // The first start asks; until then Sentry isn't even started, so it keeps no files in the profile.
        const help = await app.evaluate(({ Menu }) =>
            Menu.getApplicationMenu()
                ?.items.at(-1)
                ?.submenu?.items.find((item) => item.type === "checkbox"),
        );
        expect(help).toMatchObject({ label: "Share crash reports", checked: false });
        expect(fs.existsSync(path.join(tmpDir, "sentry"))).toBe(false);
    });

    test("with the OS key store for encryption keys", async ({ page }) => {
        // safeStorage (Keychain / DPAPI) holds each session's pickle key.
        await expect(
            page.evaluate(() => window.mxPlatformPeg.get().createPickleKey("@ana:artise.co", "ABCDEF")),
        ).resolves.not.toBeNull();
    });
});
