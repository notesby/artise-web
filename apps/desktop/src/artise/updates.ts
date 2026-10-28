/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    app,
    autoUpdater,
    dialog,
    ipcMain,
    Menu,
    shell,
    type BrowserWindow,
    type MenuItemConstructorOptions,
} from "electron";

import { artiseT } from "./i18n/artiseT.js";
import { readArtiseSettings, updateArtiseSettings } from "./settings.js";
import { ARTISE_DOWNLOAD_URL, isArtise } from "./variant.js";
import { type WorkspaceInfo } from "./workspace/discovery.js";

/** The two channels: stable for everyone, beta for the family testers who asked for test versions. */
export type UpdateChannel = "stable" | "beta";

const MENU_ITEM_ID = "artise-beta-updates";

/** The feeds' base from config.json, once the updater started with it; undefined where Artise doesn't update itself. */
let feedsBase: string | undefined;
let warned = false;

/**
 * The channel the person chose: test versions when they asked for them in the Help menu, else the stable ones.
 *
 * @param settings - Artise's settings.
 */
function updateChannel(settings = readArtiseSettings()): UpdateChannel {
    return settings.betaUpdates ? "beta" : "stable";
}

/**
 * Where Element's updater looks for this channel's releases: `<base>/<channel>/`, and the updater adds
 * `macos/releases.json` (src/updater.ts).
 *
 * @param base - config.json's `update_base_url`.
 * @param channel - the channel.
 */
export function channelUrl(base: string, channel: UpdateChannel): string {
    return `${base.replace(/\/+$/, "")}/${channel}/`;
}

/**
 * The base URL Element's updater starts with, from electron-main.ts: the chosen channel's feed, only where
 * Artise updates itself. That's macOS alone: Windows is updated by the Microsoft Store, and there's no Linux
 * build. Element's own builds keep their `update_base_url` as it is.
 *
 * @param configured - config.json's `update_base_url`.
 * @param platform - the OS, `process.platform`.
 * @param settings - Artise's settings.
 */
export function artiseUpdateBaseUrl(
    configured: string | undefined,
    platform: NodeJS.Platform = process.platform,
    settings: () => { betaUpdates?: boolean } = readArtiseSettings,
): string | undefined {
    if (!isArtise()) return configured;
    if (!configured || platform !== "darwin") return undefined;
    feedsBase = configured;
    return channelUrl(configured, updateChannel(settings()));
}

/**
 * Switches between test versions and stable ones, keeps the choice, and looks for an update on the new channel
 * at once (the updater's own poll goes on from there, on the new feed).
 *
 * @param on - whether to get test versions.
 */
export function setBetaUpdates(on: boolean): void {
    updateArtiseSettings({ betaUpdates: on });
    const item = Menu.getApplicationMenu()?.getMenuItemById(MENU_ITEM_ID);
    if (item) item.checked = on;
    if (!feedsBase) return;
    autoUpdater.setFeedURL({
        url: `${channelUrl(feedsBase, on ? "beta" : "stable")}macos/releases.json`,
        serverType: "json",
    });
    ipcMain.emit("check_updates");
}

/**
 * "Get test versions" for the Help menu: a checkbox showing and changing the choice. Only where Artise updates
 * itself (macOS); the Store build and a build without feeds get no item.
 *
 * @param platform - the OS, `process.platform`.
 */
export function betaUpdatesMenuItem(platform: NodeJS.Platform = process.platform): MenuItemConstructorOptions[] {
    if (platform !== "darwin") return [];
    return [
        {
            id: MENU_ITEM_ID,
            type: "checkbox",
            label: artiseT("artise|desktop|updates|beta_menu"),
            checked: readArtiseSettings().betaUpdates === true,
            click(item): void {
                setBetaUpdates(item.checked);
            },
        },
    ];
}

/**
 * Whether `current` is older than `minimum`, both `major.minor.patch`. A test build (`0.0.1-dev.<run>`) is never
 * outdated: it's whatever was just built.
 *
 * @param current - the app's version, `app.getVersion()`.
 * @param minimum - the oldest version a server still works with.
 */
export function isOutdated(current: string, minimum: string): boolean {
    if (current.includes("-")) return false;
    const parts = (version: string): number[] => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
    const [a, b] = [parts(current), parts(minimum)];
    for (let i = 0; i < 3; i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
    }
    return false;
}

/**
 * The workspace (or Artise ID) asking for the newest version this build doesn't reach, if any.
 *
 * @param current - the app's version.
 * @param workspaces - the workspaces being opened.
 * @param signIn - `/v1/sign-in`'s minimum, when known.
 */
export function newestRequired(
    current: string,
    workspaces: Pick<WorkspaceInfo, "name" | "serverName" | "minDesktopVersion">[],
    signIn?: { minDesktopVersion?: string },
): { name: string; version: string } | undefined {
    const asks = workspaces
        .filter((workspace) => workspace.minDesktopVersion)
        .map((workspace) => ({
            name: workspace.name ?? workspace.serverName,
            version: workspace.minDesktopVersion ?? "",
        }));
    if (signIn?.minDesktopVersion) asks.push({ name: "Artise ID", version: signIn.minDesktopVersion });
    const needed = asks.filter((ask) => isOutdated(current, ask.version));
    return needed.sort((x, y) => (isOutdated(x.version, y.version) ? 1 : -1))[0];
}

/**
 * Tells the person, once per start, that a workspace needs a newer Artise than this one, with a way to get it:
 * "Buscar la actualización" where Artise updates itself (it looks right away), else "Descargar" (the download
 * page in the browser). The workspaces still open: the notice is the phones' "Actualiza Artise", not a lock.
 *
 * @param window - the window to show it over.
 * @param workspaces - the workspaces being opened.
 * @param signIn - `/v1/sign-in`'s minimum, when known.
 * @param current - the app's version.
 */
export async function warnIfOutdated(
    window: BrowserWindow,
    workspaces: Pick<WorkspaceInfo, "name" | "serverName" | "minDesktopVersion">[],
    signIn?: { minDesktopVersion?: string },
    current = app.getVersion(),
): Promise<void> {
    if (warned) return;
    const required = newestRequired(current, workspaces, signIn);
    if (!required) return;
    warned = true;
    const canUpdate = feedsBase !== undefined;
    const { response } = await dialog.showMessageBox(window, {
        type: "warning",
        message: artiseT("artise|desktop|updates|outdated_title"),
        detail: artiseT("artise|desktop|updates|outdated_detail", {
            workspace: required.name,
            version: required.version,
            current,
        }),
        buttons: [
            artiseT(canUpdate ? "artise|desktop|updates|check" : "artise|desktop|updates|download"),
            artiseT("artise|desktop|updates|later"),
        ],
        defaultId: 0,
        cancelId: 1,
    });
    if (response !== 0) return;
    if (canUpdate) ipcMain.emit("check_updates");
    else await shell.openExternal(ARTISE_DOWNLOAD_URL);
}

/** For tests: forget the feeds base and the notice shown. */
export function resetUpdatesForTests(): void {
    feedsBase = undefined;
    warned = false;
}
