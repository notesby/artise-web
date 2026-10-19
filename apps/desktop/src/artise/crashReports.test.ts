/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";
import EventEmitter from "node:events";
import * as Sentry from "@sentry/electron/main";
import { app, dialog, type BrowserWindow, type MenuItem } from "electron";

import { readArtiseSettings, updateArtiseSettings } from "./settings.js";

vi.mock("@sentry/electron/main", () => ({
    init: vi.fn(),
    close: vi.fn().mockResolvedValue(true),
    IPCMode: { Classic: 1 },
}));
vi.mock("electron", async () => {
    const { default: EventEmitter } = await import("node:events");
    const emitter = new EventEmitter();
    return {
        app: Object.assign(emitter, { getVersion: (): string => "0.1.0" }),
        dialog: { showMessageBox: vi.fn() },
        Menu: { getApplicationMenu: (): null => null },
    };
});
vi.mock("./settings.js", () => ({ readArtiseSettings: vi.fn(), updateArtiseSettings: vi.fn() }));
vi.mock("counterpart", () => ({ default: { getLocale: (): string => "es" } }));

const SENTRY = { dsn: "https://key@crashes.artise.co/4", environment: "desktop" };

async function freshModule(): Promise<typeof import("./crashReports.js")> {
    vi.resetModules();
    return import("./crashReports.js");
}

describe("crash reports", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (app as unknown as EventEmitter).removeAllListeners();
    });

    it("send nothing before the person is asked", async () => {
        // First start: no answer yet, so Sentry isn't started, whatever config.json says.
        vi.mocked(readArtiseSettings).mockReturnValue({});
        const { startArtiseCrashReports, crashReportsStarted } = await freshModule();
        await startArtiseCrashReports(SENTRY);
        expect(Sentry.init).not.toHaveBeenCalled();
        expect(crashReportsStarted()).toBe(false);
    });

    it("send nothing when the person said no", async () => {
        vi.mocked(readArtiseSettings).mockReturnValue({ crashReports: false });
        const { startArtiseCrashReports } = await freshModule();
        await startArtiseCrashReports(SENTRY);
        expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("start when the person agreed, with the desktop's project and version", async () => {
        vi.mocked(readArtiseSettings).mockReturnValue({ crashReports: true });
        const { startArtiseCrashReports } = await freshModule();
        await startArtiseCrashReports(SENTRY);
        expect(Sentry.init).toHaveBeenCalledWith(
            expect.objectContaining({ dsn: SENTRY.dsn, environment: "desktop", release: "artise-desktop@0.1.0" }),
        );
    });

    it("start nothing without a DSN", async () => {
        vi.mocked(readArtiseSettings).mockReturnValue({ crashReports: true });
        const { startArtiseCrashReports } = await freshModule();
        await startArtiseCrashReports(undefined);
        expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("ask once, over the first window when it shows", async () => {
        vi.mocked(readArtiseSettings).mockReturnValue({});
        vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
        const { startArtiseCrashReports } = await freshModule();
        await startArtiseCrashReports(SENTRY);

        const window = new EventEmitter() as unknown as BrowserWindow;
        app.emit("browser-window-created", {}, window);
        (window as unknown as EventEmitter).emit("show");
        await vi.waitFor(() => expect(Sentry.init).toHaveBeenCalled());
        expect(updateArtiseSettings).toHaveBeenCalledWith({ crashReports: true });

        expect(dialog.showMessageBox).toHaveBeenCalledWith(
            window,
            expect.objectContaining({
                message: "Ayúdanos a mejorar Artise",
                detail: expect.stringContaining("Nunca enviamos tus mensajes"),
                buttons: ["Compartir informes de fallos", "Ahora no"],
                cancelId: 1,
            }),
        );
    });

    it("treat closing the question as 'not now'", async () => {
        vi.mocked(readArtiseSettings).mockReturnValue({});
        vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });
        const { askForCrashReports } = await freshModule();
        await askForCrashReports({} as BrowserWindow);
        expect(updateArtiseSettings).toHaveBeenCalledWith({ crashReports: false });
        expect(Sentry.init).not.toHaveBeenCalled();
    });

    it("don't ask again once answered", async () => {
        vi.mocked(readArtiseSettings).mockReturnValue({ crashReports: false });
        const { askForCrashReports } = await freshModule();
        await askForCrashReports({} as BrowserWindow);
        expect(dialog.showMessageBox).not.toHaveBeenCalled();
    });

    it("stop at once when turned off in the Help menu", async () => {
        vi.mocked(readArtiseSettings).mockReturnValue({ crashReports: true });
        const { startArtiseCrashReports, crashReportsMenuItem, crashReportsStarted } = await freshModule();
        await startArtiseCrashReports(SENTRY);

        const item = crashReportsMenuItem();
        expect(item).toMatchObject({ type: "checkbox", checked: true, label: "Compartir informes de fallos" });
        item.click!({ checked: false } as MenuItem, undefined, {} as Electron.KeyboardEvent);

        await vi.waitFor(() => expect(Sentry.close).toHaveBeenCalled());
        expect(updateArtiseSettings).toHaveBeenCalledWith({ crashReports: false });
        expect(crashReportsStarted()).toBe(false);
    });
});
