/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// Two workspaces open side by side, each in its own view and storage (D3-1), on the rail (D3-2). There's no
// Artise ID account in CI, so the test stands in for Artise ID inside the app and lists two real workspaces. Their
// web apps are kept offline, so nothing is registered on their sign-in servers and no browser opens.

import { type ElectronApplication, type Page } from "@playwright/test";

import { test, expect } from "../../element-desktop-test.js";

declare global {
    interface ElectronPlatform {
        getConfig(): Promise<{ default_server_config: { "m.homeserver": { server_name: string } } }>;
        createPickleKey(userId: string, deviceId: string): Promise<string | null>;
        getPickleKey(userId: string, deviceId: string): Promise<string | null>;
    }

    interface Window {
        mxPlatformPeg: { get(): ElectronPlatform };
        electron: { send(channel: string, ...args: unknown[]): void };
    }
}

const WORKSPACES = [
    { name: "Prueba MAS", serverName: "mas-k8s.artise.co" },
    { name: "Artise", serverName: "artise.co" },
];

async function openTwoWorkspaces(app: ElectronApplication): Promise<Page[]> {
    const isShell = (page: Page): boolean =>
        page.url().startsWith("artise-shell://shell/") && !page.url().startsWith("artise-shell://shell/rail");
    const shell = app.windows().find(isShell) ?? (await app.waitForEvent("window", { predicate: isShell }));
    await app.evaluate(async ({ app, session, shell }, workspaces) => {
        // The app's own modules, as the app loaded them.
        const require = process
            .getBuiltinModule("node:module")
            .createRequire(`${app.getAppPath()}/lib/electron-main.js`);
        const lib = "./artise/"; // the packaged app's lib/artise/, not a file in this repository
        // oxlint-disable-next-line import/no-dynamic-require -- the app's own files, not this repository's
        const artiseId = require(`${lib}artiseId/instance.js`).getArtiseId();
        // oxlint-disable-next-line import/no-dynamic-require -- as above
        const { workspaceKey } = require(`${lib}views/context.js`);
        artiseId.isSignedIn = async (): Promise<boolean> => true;
        artiseId.workspaces = async (): Promise<object> => ({ ok: true, value: workspaces });
        // The workspaces' web apps stay offline (a proxy that answers nothing), so they never reach their
        // sign-in servers, and nothing opens in a browser.
        await Promise.all(
            workspaces.map(({ serverName }) =>
                session
                    .fromPartition(`persist:workspace-${workspaceKey(serverName)}`)
                    .setProxy({ proxyRules: "http://127.0.0.1:9" }),
            ),
        );
        shell.openExternal = async (): Promise<void> => {};
    }, WORKSPACES);

    // The shell's action redirects back to its page, which Playwright reports as an aborted navigation.
    await shell.goto("artise-shell://shell/workspaces").catch(() => {});
    await shell.locator("button[type=submit]").click();
    await expect
        .poll(() => app.windows().filter((page) => page.url().startsWith("vector://")).length, { timeout: 60_000 })
        .toBe(2);
    const views = app.windows().filter((page) => page.url().startsWith("vector://"));
    for (const view of views) await view.waitForFunction(() => !!window.mxPlatformPeg?.get());
    return views;
}

/** The rail's page, whichever load of it is current. */
async function railPage(app: ElectronApplication): Promise<Page> {
    const isRail = (page: Page): boolean => page.url().startsWith("artise-shell://shell/rail");
    return app.windows().find(isRail) ?? (await app.waitForEvent("window", { predicate: isRail }));
}

const serverOf = (view: Page): Promise<string> =>
    view.evaluate(
        async () => (await window.mxPlatformPeg.get().getConfig()).default_server_config["m.homeserver"].server_name,
    );

test.describe("Two workspaces", () => {
    test.slow();

    // Close Artise before the fixture removes its profile folder.
    test.afterEach(async ({ app }) => {
        await app.close().catch(() => {});
    });

    test("each run in their own view, with their own config and storage", async ({ app }) => {
        const views = await openTwoWorkspaces(app);
        expect((await Promise.all(views.map(serverOf))).sort()).toEqual(["artise.co", "mas-k8s.artise.co"]);

        await views[0].evaluate(() => localStorage.setItem("artise-test", "only-here"));
        expect(await views[1].evaluate(() => localStorage.getItem("artise-test"))).toBeNull();
    });

    test("can't reach each other's keys", async ({ app }) => {
        const [view, other] = await openTwoWorkspaces(app);
        const own = await serverOf(view);
        const theirs = await serverOf(other);
        expect(
            await view.evaluate((server) => window.mxPlatformPeg.get().createPickleKey(`@ana:${server}`, "DEV"), own),
        ).toEqual(expect.any(String));
        await expect(
            view.evaluate((server) => window.mxPlatformPeg.get().getPickleKey(`@ana:${server}`, "DEV"), theirs),
        ).rejects.toThrow("Not this workspace's user");
    });

    test("show on the rail, with each one's unread count", async ({ app }) => {
        const views = await openTwoWorkspaces(app);
        const rail = await railPage(app);
        await expect(rail.locator("a.item")).toHaveCount(2);
        await expect(rail.locator("a.item.shown")).toHaveAttribute("href", /i=0$/);

        // Each web app reports its own count; the rail shows each, the badge their total.
        await views[0].evaluate(() => window.electron.send("setBadgeCount", 2));
        await views[1].evaluate(() => window.electron.send("setBadgeCount", 5));
        // Each workspace's rail item has its own count, whatever order the views were listed in. The rail draws
        // itself again on each change, so a read can meet a page being replaced: read again.
        const nameOf = async (view: Page): Promise<string> =>
            (await serverOf(view)) === "artise.co" ? "Artise" : "Prueba MAS";
        const expected = [`${await nameOf(views[0])}. Unread: 2`, `${await nameOf(views[1])}. Unread: 5`].sort();
        const labels = async (): Promise<string[]> =>
            (await railPage(app))
                .locator("a.item:not(.add)")
                .evaluateAll((items) => items.map((item) => item.getAttribute("aria-label") ?? "").sort())
                .catch((): string[] => []);
        await expect.poll(labels).toEqual(expected);
        if (process.platform === "darwin") {
            await expect.poll(() => app.evaluate(({ app }) => app.badgeCount)).toBe(7);
        }

        await expect(async () => (await railPage(app)).locator("a.item").nth(1).click({ timeout: 2000 })).toPass();
        await expect
            .poll(async () =>
                (await railPage(app))
                    .locator("a.item.shown")
                    .getAttribute("href")
                    .catch((): null => null),
            )
            .toMatch(/i=1$/);
    });

    test("switch with Ctrl/⌘+2 and keep both running", async ({ app }) => {
        await openTwoWorkspaces(app);
        const visible = (): Promise<boolean[]> =>
            app.evaluate(({ BrowserWindow }) =>
                BrowserWindow.getAllWindows()[0]
                    .contentView.children.filter((child) =>
                        (child as Electron.WebContentsView).webContents.getURL().startsWith("vector://"),
                    )
                    .map((child) => child.getVisible()),
            );
        expect(await visible()).toEqual([true, false]);
        await app.evaluate(({ BrowserWindow }) => {
            const shown = BrowserWindow.getAllWindows()[0].contentView.children.find(
                (child) =>
                    child.getVisible() &&
                    (child as Electron.WebContentsView).webContents.getURL().startsWith("vector://"),
            );
            const modifier = process.platform === "darwin" ? "meta" : "control";
            (shown as Electron.WebContentsView).webContents.sendInputEvent({
                type: "keyDown",
                keyCode: "2",
                modifiers: [modifier],
            });
        });
        await expect.poll(visible).toEqual([false, true]);
    });
});
