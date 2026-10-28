/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { app, net, session, WebContentsView, type BrowserWindow, type CustomScheme } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

import Store from "../../store.js";
import { getIconPath } from "../../icon.js";
import { getArtiseId } from "../artiseId/instance.js";
import { artiseT, textLanguage } from "../i18n/artiseT.js";
import { readArtiseSettings, updateArtiseSettings } from "../settings.js";
import { isArtise } from "../variant.js";
import { SHELL_ORIGIN } from "./render.js";
import { Shell } from "./Shell.js";
import { prepareWorkspaces } from "../workspace/openWorkspaces.js";
import { setLinkTargets } from "../links.js";
import { WorkspaceViews } from "../views/workspaceViews.js";

const SCHEME = "artise-shell";

/** The shell's scheme, registered with Element's `vector` one (Electron takes the list only once). */
export function artisePrivilegedSchemes(): CustomScheme[] {
    return isArtise() ? [{ scheme: SCHEME, privileges: { standard: true, secure: true } }] : [];
}

/**
 * The language of the shell's screens: the one the person picked in Element (kept in Element's store),
 * else Chromium's, which artise/language.ts set at start.
 */
function shellLocale(): string {
    const chosen = Store.instance?.get("locale");
    return (Array.isArray(chosen) ? chosen[0] : chosen) || app.getLocale();
}

/**
 * Starts the shell in the main window: its welcome and workspace list, or straight into the workspaces the person
 * opened last time. Element's builds get nothing.
 *
 * The shell is a view over the window with its own in-memory session, no preload and JavaScript off: it
 * can't reach Electron, and its scheme exists only in its session.
 *
 * @param window - Element's main window.
 * @returns whether the shell decides what the window shows (then Element mustn't load the web app itself).
 */
export function startArtiseShell(window: BrowserWindow): boolean {
    if (!isArtise()) return false;

    const shellSession = session.fromPartition("artise-shell");
    const view = new WebContentsView({
        webPreferences: { session: shellSession, javascript: false, sandbox: true, contextIsolation: true },
    });
    shellSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(`${SHELL_ORIGIN}/`)) event.preventDefault();
    });

    const views = new WorkspaceViews(window);
    setLinkTargets({
        signInReturn: (sessionId, url) => {
            const open = views.bySessionId(sessionId);
            if (!open) return false;
            void open.view.webContents.loadURL(url);
            views.show(views.open.indexOf(open));
            return true;
        },
    });

    let shown = false;
    const fit = (): void => {
        const { width, height } = window.getContentBounds();
        view.setBounds({ x: 0, y: 0, width, height });
    };
    window.on("resize", fit);

    const shell = new Shell({
        artiseId: getArtiseId(),
        readSettings: readArtiseSettings,
        updateSettings: (change) => void updateArtiseSettings(change),
        show: () => {
            // Element shows the window once its page is ready (and keeps it hidden when started with
            // --hidden), so give it an empty page under the shell.
            if (!views.hostWebContents.getURL()) void views.hostWebContents.loadURL("about:blank");
            // Added again when shown again, so it's on top of the workspaces' views.
            window.contentView.addChildView(view);
            fit();
            shown = true;
            void view.webContents.loadURL(`${SHELL_ORIGIN}/`);
        },
        hide: () => {
            if (shown) window.contentView.removeChildView(view);
            shown = false;
        },
        openWorkspaces: async (serverNames) => {
            const prepared = await prepareWorkspaces(serverNames, (url, init) => net.fetch(url, init));
            if (prepared.ok) {
                if (!views.hostWebContents.getURL()) void views.hostWebContents.loadURL("about:blank");
                await views.openAll(prepared.value);
            }
            return prepared;
        },
        icon: async () => {
            // icon.png sits next to the platform's own icon in resources/build/.
            return fs.readFile(path.join(path.dirname(await getIconPath()), "icon.png"));
        },
        t: (key) => artiseT(key, {}, shellLocale()),
        language: () => textLanguage(shellLocale()),
    });
    shellSession.protocol.handle(SCHEME, (request) => shell.handle(new URL(request.url)));

    void shell.start();
    return true;
}
