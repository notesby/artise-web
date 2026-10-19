/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import { app, dialog, shell, type MenuItemConstructorOptions } from "electron";

import { isArtise } from "./variant.js";
import { artiseHelpMenuItems, showAbout } from "./about.js";

vi.mock("electron", () => ({
    app: { getVersion: vi.fn().mockReturnValue("0.1.0"), setAboutPanelOptions: vi.fn() },
    dialog: { showMessageBox: vi.fn() },
    shell: { openExternal: vi.fn() },
}));

vi.mock("./variant.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./variant.js")>()),
    isArtise: vi.fn(),
    artiseSourceRef: (): string => "",
}));

vi.mock("counterpart", () => ({ default: { getLocale: (): string => "es" } }));

describe("About Artise", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.mainWindow = null;
    });

    it("adds nothing to Element's own builds", () => {
        vi.mocked(isArtise).mockReturnValue(false);
        expect(artiseHelpMenuItems()).toEqual([]);
        expect(app.setAboutPanelOptions).not.toHaveBeenCalled();
    });

    it("adds 'Acerca de Artise' to the Help menu, in the app's language", () => {
        vi.mocked(isArtise).mockReturnValue(true);
        const items = artiseHelpMenuItems();
        expect(items.map((item: MenuItemConstructorOptions) => item.label ?? item.type)).toEqual([
            "separator",
            "Acerca de Artise",
        ]);
    });

    it("fills macOS's About panel with the licence and the source link", () => {
        vi.mocked(isArtise).mockReturnValue(true);
        artiseHelpMenuItems();
        expect(app.setAboutPanelOptions).toHaveBeenCalledWith(
            expect.objectContaining({
                applicationName: "Artise",
                applicationVersion: "0.1.0",
                copyright: expect.stringContaining("GNU Affero General Public License"),
                credits: "https://github.com/notesby/artise-web/tree/desktop-v0.1.0",
            }),
        );
    });

    it("shows the version and licence, and opens the source code when asked", async () => {
        // The person presses "Código fuente": the tag of this version opens in the browser.
        vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
        await showAbout();
        expect(dialog.showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                message: "Artise Versión 0.1.0",
                detail: expect.stringContaining("software libre"),
                buttons: ["Código fuente", "Cerrar"],
                cancelId: 1,
            }),
        );
        expect(shell.openExternal).toHaveBeenCalledWith("https://github.com/notesby/artise-web/tree/desktop-v0.1.0");
    });

    it("opens nothing when closed", async () => {
        vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });
        await showAbout();
        expect(shell.openExternal).not.toHaveBeenCalled();
    });
});
