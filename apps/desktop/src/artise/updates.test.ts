/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import { autoUpdater, dialog, ipcMain, shell, type BrowserWindow } from "electron";

import { readArtiseSettings, updateArtiseSettings } from "./settings.js";
import { isArtise } from "./variant.js";
import {
    artiseUpdateBaseUrl,
    betaUpdatesMenuItem,
    channelUrl,
    isOutdated,
    newestRequired,
    resetUpdatesForTests,
    setBetaUpdates,
    warnIfOutdated,
} from "./updates.js";

vi.mock("electron", () => ({
    app: { getVersion: (): string => "1.2.0" },
    autoUpdater: { setFeedURL: vi.fn() },
    dialog: { showMessageBox: vi.fn() },
    ipcMain: { emit: vi.fn() },
    Menu: { getApplicationMenu: (): null => null },
    shell: { openExternal: vi.fn() },
}));
vi.mock("./settings.js", () => ({ readArtiseSettings: vi.fn(), updateArtiseSettings: vi.fn() }));
vi.mock("./variant.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./variant.js")>()),
    isArtise: vi.fn(),
}));
vi.mock("counterpart", () => ({ default: { getLocale: (): string => "es" } }));

const FEEDS = "https://raw.githubusercontent.com/notesby/artise-web/desktop-feeds";
const window = {} as BrowserWindow;

describe("update channels", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetUpdatesForTests();
        vi.mocked(isArtise).mockReturnValue(true);
        vi.mocked(readArtiseSettings).mockReturnValue({});
    });

    it("start Element's updater on the stable feed on macOS", () => {
        // Element adds macos/releases.json to this base (src/updater.ts).
        expect(artiseUpdateBaseUrl(FEEDS, "darwin")).toBe(`${FEEDS}/stable/`);
        expect(channelUrl(`${FEEDS}/`, "beta")).toBe(`${FEEDS}/beta/`);
    });

    it("use the beta feed when the person asked for test versions", () => {
        vi.mocked(readArtiseSettings).mockReturnValue({ betaUpdates: true });
        expect(artiseUpdateBaseUrl(FEEDS, "darwin")).toBe(`${FEEDS}/beta/`);
    });

    it("never start the updater on Windows (the Store updates it) or Linux", () => {
        expect(artiseUpdateBaseUrl(FEEDS, "win32")).toBeUndefined();
        expect(artiseUpdateBaseUrl(FEEDS, "linux")).toBeUndefined();
        expect(betaUpdatesMenuItem("win32")).toEqual([]);
    });

    it("do nothing without feeds in config.json", () => {
        expect(artiseUpdateBaseUrl(undefined, "darwin")).toBeUndefined();
    });

    it("leave Element's own builds as upstream", () => {
        vi.mocked(isArtise).mockReturnValue(false);
        expect(artiseUpdateBaseUrl("https://packages.element.io/desktop/update/", "win32")).toBe(
            "https://packages.element.io/desktop/update/",
        );
    });

    it("switch feeds and look for an update at once when the choice changes", () => {
        artiseUpdateBaseUrl(FEEDS, "darwin");
        const [item] = betaUpdatesMenuItem("darwin");
        expect(item?.label).toBe("Recibir versiones de prueba");
        expect(item?.checked).toBe(false);
        setBetaUpdates(true);
        expect(updateArtiseSettings).toHaveBeenCalledWith({ betaUpdates: true });
        expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
            url: `${FEEDS}/beta/macos/releases.json`,
            serverType: "json",
        });
        expect(ipcMain.emit).toHaveBeenCalledWith("check_updates");
        setBetaUpdates(false);
        expect(autoUpdater.setFeedURL).toHaveBeenLastCalledWith({
            url: `${FEEDS}/stable/macos/releases.json`,
            serverType: "json",
        });
    });

    it("only keep the choice when the updater never started (a Store or test build)", () => {
        setBetaUpdates(true);
        expect(updateArtiseSettings).toHaveBeenCalledWith({ betaUpdates: true });
        expect(autoUpdater.setFeedURL).not.toHaveBeenCalled();
        expect(ipcMain.emit).not.toHaveBeenCalled();
    });
});

describe("the minimum version", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetUpdatesForTests();
        vi.mocked(isArtise).mockReturnValue(true);
        vi.mocked(readArtiseSettings).mockReturnValue({});
    });

    it("compares major.minor.patch", () => {
        expect(isOutdated("1.2.0", "1.2.1")).toBe(true);
        expect(isOutdated("1.2.0", "1.10.0")).toBe(true);
        expect(isOutdated("1.2.0", "1.2.0")).toBe(false);
        expect(isOutdated("2.0.0", "1.9.9")).toBe(false);
        // A test build is whatever was just built, never outdated.
        expect(isOutdated("0.0.1-dev.57", "1.0.0")).toBe(false);
    });

    it("names the workspace asking for the newest version this build doesn't reach", () => {
        const required = newestRequired(
            "1.2.0",
            [
                { serverName: "a.artise.co", name: "A", minDesktopVersion: "1.3.0" },
                { serverName: "b.artise.co", minDesktopVersion: "1.5.0" },
                { serverName: "c.artise.co", name: "C", minDesktopVersion: "1.0.0" },
                { serverName: "d.artise.co", name: "D" },
            ],
            { minDesktopVersion: "1.4.0" },
        );
        expect(required).toEqual({ name: "b.artise.co", version: "1.5.0" });
        expect(newestRequired("1.5.0", [{ serverName: "a.artise.co", minDesktopVersion: "1.3.0" }])).toBeUndefined();
    });

    it("shows nothing when every server is happy with this version", async () => {
        await warnIfOutdated(window, [{ serverName: "a.artise.co", minDesktopVersion: "1.0.0" }]);
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it("says which workspace needs what, and looks for the update where Artise updates itself", async () => {
        artiseUpdateBaseUrl(FEEDS, "darwin");
        vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
        await warnIfOutdated(window, [{ serverName: "fam.artise.co", name: "Familia", minDesktopVersion: "1.3.0" }]);
        expect(dialog.showMessageBox).toHaveBeenCalledWith(
            window,
            expect.objectContaining({
                message: "Actualiza Artise",
                detail: "Familia necesita Artise 1.3.0 o más reciente. Tienes la 1.2.0.",
                buttons: ["Buscar la actualización", "Ahora no"],
            }),
        );
        expect(ipcMain.emit).toHaveBeenCalledWith("check_updates");
        expect(shell.openExternal).not.toHaveBeenCalled();
    });

    it("offers the download page where it doesn't (Windows), and only once per start", async () => {
        vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
        const workspaces = [{ serverName: "fam.artise.co", name: "Familia", minDesktopVersion: "1.3.0" }];
        await warnIfOutdated(window, workspaces);
        expect(dialog.showMessageBox).toHaveBeenCalledWith(
            window,
            expect.objectContaining({ buttons: ["Descargarla", "Ahora no"] }),
        );
        expect(shell.openExternal).toHaveBeenCalledWith("https://github.com/notesby/artise-web/releases/latest");
        await warnIfOutdated(window, workspaces);
        expect(dialog.showMessageBox).toHaveBeenCalledTimes(1);
    });

    it("does nothing more when the person says not now", async () => {
        vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });
        await warnIfOutdated(window, [{ serverName: "fam.artise.co", minDesktopVersion: "9.0.0" }]);
        expect(shell.openExternal).not.toHaveBeenCalled();
        expect(ipcMain.emit).not.toHaveBeenCalled();
    });
});
