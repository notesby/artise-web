/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { app, dialog, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";

import { artiseT } from "./i18n/artiseT.js";
import { readArtiseSettings, updateArtiseSettings } from "./settings.js";

/** The `sentry` part of config.json: the desktop project on crashes.artise.co. */
export interface CrashReportsConfig {
    dsn?: string;
    environment?: string;
}

const MENU_ITEM_ID = "artise-crash-reports";

let config: CrashReportsConfig | undefined;
let started = false;

/** Whether crash reports are sent now. */
export function crashReportsStarted(): boolean {
    return started;
}

// Sentry is loaded only when crash reports start, so the Help menu (which shows their checkbox) doesn't
// load it, and Element's menu tests keep running without it.
async function start(): Promise<void> {
    if (started || !config?.dsn) return;
    started = true;
    const Sentry = await import("@sentry/electron/main");
    Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        release: `artise-desktop@${app.getVersion()}`,
        // As Element: we don't use Sentry's IPC, and don't want it injecting preloads.
        ipcMode: Sentry.IPCMode.Classic,
    });
}

/**
 * Starts crash reports (the main process's errors and native crashes, as minidumps) only if the person agreed,
 * and asks them once, over the first window, when they haven't been asked yet. Element Desktop instead starts
 * them whenever config.json has a DSN.
 *
 * Problem reports the person writes and sends themselves (Help → report a problem) don't depend on this.
 *
 * @param sentry - config.json's `sentry`.
 */
export async function startArtiseCrashReports(sentry: CrashReportsConfig | undefined): Promise<void> {
    config = sentry;
    if (!config?.dsn) return;
    const { crashReports } = readArtiseSettings();
    if (crashReports) await start();
    if (crashReports === undefined) {
        // The first window is the main one; ask once it's on screen, also when Artise started hidden at login.
        app.once("browser-window-created", (_event, window) => {
            window.once("show", () => void askForCrashReports(window));
        });
    }
}

/**
 * Turns crash reports on or off and remembers the choice. Off takes effect at once.
 *
 * @param on - whether to send them.
 */
export async function setCrashReports(on: boolean): Promise<void> {
    updateArtiseSettings({ crashReports: on });
    const item = Menu.getApplicationMenu()?.getMenuItemById(MENU_ITEM_ID);
    if (item) item.checked = on;
    if (on) {
        await start();
    } else if (started) {
        started = false;
        const Sentry = await import("@sentry/electron/main");
        await Sentry.close();
    }
}

/**
 * Asks whether to share crash reports, once. Closing the question counts as "not now".
 *
 * @param window - the window to show the question over.
 */
export async function askForCrashReports(window: BrowserWindow): Promise<void> {
    if (readArtiseSettings().crashReports !== undefined) return;
    const { response } = await dialog.showMessageBox(window, {
        type: "question",
        message: artiseT("artise|desktop|crash_reports|title"),
        detail: artiseT("artise|desktop|crash_reports|description"),
        buttons: [artiseT("artise|desktop|crash_reports|allow"), artiseT("artise|desktop|crash_reports|deny")],
        defaultId: 0,
        cancelId: 1,
    });
    await setCrashReports(response === 0);
}

/** "Share crash reports" for the Help menu: a checkbox showing and changing the choice. */
export function crashReportsMenuItem(): MenuItemConstructorOptions {
    return {
        id: MENU_ITEM_ID,
        type: "checkbox",
        label: artiseT("artise|desktop|crash_reports|menu"),
        checked: readArtiseSettings().crashReports === true,
        click(item): void {
            void setCrashReports(item.checked);
        },
    };
}
