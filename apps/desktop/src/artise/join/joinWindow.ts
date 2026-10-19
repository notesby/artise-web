/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { BrowserWindow, shell } from "electron";

/**
 * Where a join window's page may go: the join page's own site and join.artise.co. Anything else opens in the
 * person's browser; the desktop's own links (the page's "Abrir en la computadora") just finish the join.
 *
 * @param target - where the page wants to go.
 * @param joinPage - the join page.
 */
export function joinNavigation(target: string, joinPage: string): "stay" | "external" | "done" | "block" {
    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return "block";
    }
    if (url.protocol === "co.artise.desktop:") return "done";
    if (url.protocol !== "https:") return "block";
    if (url.origin === new URL(joinPage).origin || url.origin === "https://join.artise.co") return "stay";
    return "external";
}

/**
 * Shows a workspace's join page in a small window of its own, as the phones show it in an in-app browser. The page
 * is the workspace's (remote), so it gets nothing of Electron: sandboxed, no preload, an in-memory session that
 * permits nothing.
 *
 * @param parent - Artise's window.
 * @param joinPage - `<join_url>/<code>`.
 * @returns when the window is closed, by the person or because the page finished.
 */
export function openJoinWindow(parent: BrowserWindow, joinPage: string): Promise<void> {
    const window = new BrowserWindow({
        parent,
        width: 480,
        height: 760,
        autoHideMenuBar: true,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: "artise-join" },
    });
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    const go = (event: { preventDefault(): void }, target: string): void => {
        const where = joinNavigation(target, joinPage);
        if (where === "stay") return;
        event.preventDefault();
        if (where === "external") void shell.openExternal(target);
        if (where === "done") window.close();
    };
    window.webContents.on("will-navigate", go);
    window.webContents.on("will-redirect", go);
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (joinNavigation(url, joinPage) === "external") void shell.openExternal(url);
        return { action: "deny" };
    });
    void window.loadURL(joinPage);
    return new Promise((resolve) => window.once("closed", () => resolve()));
}
