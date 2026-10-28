/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The start-up check CI runs on each OS against the packaged Artise app (artise-desktop.yml): a first start opens
// Artise's own welcome, with Artise's menu, and the parts Element Desktop needs are in the package.

import fs from "node:fs";
import path from "node:path";
import { type ElectronApplication, type Page } from "@playwright/test";

import { test, expect } from "../../element-desktop-test.js";

/** The shell's page: a view over the main window, so not the fixture's first window. */
async function shellPage(app: ElectronApplication): Promise<Page> {
    const isShell = (page: Page): boolean =>
        page.url().startsWith("artise-shell://shell/") && !page.url().startsWith("artise-shell://shell/rail");
    const open = app.windows().find(isShell);
    return open ?? (await app.waitForEvent("window", { predicate: isShell }));
}

test.describe("Artise starts", () => {
    test.slow();

    // Close Artise before the fixture removes its profile folder.
    test.afterEach(async ({ app }) => {
        await app.close().catch(() => {});
    });

    test("with its welcome, never Element's", async ({ app }) => {
        const shell = await shellPage(app);
        await expect(shell.locator("h1")).toHaveText("Artise");
        // Sign-in buttons, or "try again" when Artise's server can't offer desktop sign-in: always something to do.
        await expect(shell.locator(".actions .button").first()).toBeVisible();
        expect(await app.evaluate(({ app }) => app.getName())).toBe("Artise");
        // Element Web isn't loaded until a workspace is opened.
        expect(app.windows().some((page) => page.url().startsWith("vector://"))).toBe(false);
    });

    test("with 'About Artise' in the Help menu", async ({ app }) => {
        const help = await app.evaluate(({ Menu }) =>
            Menu.getApplicationMenu()
                ?.items.at(-1)
                ?.submenu?.items.map((item) => item.label),
        );
        expect(help).toContain("About Artise");
    });

    test("with the packaged workspace config", async ({ app }) => {
        // config.json inside webapp.asar is the desktop's own (apps/desktop/artise/config.json).
        const config = await app.evaluate(async ({ session }) =>
            (await session.defaultSession.fetch("vector://vector/webapp/config.json")).json(),
        );
        expect(config).toMatchObject({ brand: "Artise", default_server_config: { "m.homeserver": {} } });
    });

    test("with encrypted message search (Seshat's native module)", async ({ app }) => {
        // The prebuilt Seshat binary for this OS and architecture made it into the package and loads.
        const loaded = await app.evaluate(({ app }) => {
            const { createRequire } = process.getBuiltinModule("node:module");
            const require = createRequire(`${app.getAppPath()}/lib/electron-main.js`);
            return typeof require("@matrix-org/seshat").Seshat === "function";
        });
        expect(loaded).toBe(true);
    });

    test("sending no crash reports before the person agrees", async ({ app, tmpDir }) => {
        // The first start asks; until then Sentry isn't even started, so it keeps no files in the profile.
        const item = await app.evaluate(({ Menu }) =>
            Menu.getApplicationMenu()
                ?.items.at(-1)
                ?.submenu?.items.find((entry) => entry.type === "checkbox"),
        );
        expect(item).toMatchObject({ label: "Share crash reports", checked: false });
        expect(fs.existsSync(path.join(tmpDir, "sentry"))).toBe(false);
    });
});
