/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { app, dialog, net, session, WebContentsView, type BrowserWindow, type CustomScheme } from "electron";
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
import { join } from "../join/joinFlow.js";
import { lookUpWorkspace } from "../join/joinLink.js";
import { openJoinWindow } from "../join/joinWindow.js";
import { WorkspaceViews } from "../views/workspaceViews.js";
import { Rail } from "../rail/rail.js";
import * as tray from "../../tray.js";
import { AutoLaunch } from "../../auto-launch.js";
import { cleanUpWorkspace, removeClosedWorkspaces } from "../views/cleanup.js";

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

    // The workspace rail: script-free like the shell, on the same scheme and session.
    const railView = new WebContentsView({
        webPreferences: { session: shellSession, javascript: false, sandbox: true, contextIsolation: true },
    });
    railView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    railView.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(`${SHELL_ORIGIN}/rail`)) event.preventDefault();
    });
    let buildDir: string | undefined;
    void getIconPath().then((iconPath) => (buildDir = path.dirname(iconPath)));
    const views = new WorkspaceViews(window, {
        rail: railView,
        buildDir: () => buildDir,
        refreshTray: () => tray.initApplicationMenu(),
        cleanUp: (context, user) => cleanUpWorkspace(context, user),
        closed: (left) => void shell.closed(left),
    });
    const rail = new Rail({
        items: () => views.railItems(),
        logoUrl: (index) => views.open[index]?.info.logo,
        show: (index) => views.show(index),
        fetch: (url) => net.fetch(url),
        unreadLabel: (count) => artiseT("artise|desktop|rail|unread", { count }, shellLocale()),
        add: () => void shell.addWorkspaces(),
        addLabel: () => artiseT("artise|desktop|workspaces|add_title", {}, shellLocale()),
        language: () => textLanguage(shellLocale()),
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
        openServerNames: () => views.open.map((open) => open.info.serverName),
        openWorkspaces: async (serverNames) => {
            const prepared = await prepareWorkspaces(serverNames, (url, init) => net.fetch(url, init));
            if (prepared.ok) {
                if (!views.hostWebContents.getURL()) void views.hostWebContents.loadURL("about:blank");
                await views.openAll(prepared.value);
                startAtLoginOnce();
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
    // Set once the shell has started, so an invite that opened Artise (queued until then) isn't covered by the
    // welcome or the first workspaces opening.
    const linkTargets: Parameters<typeof setLinkTargets>[0] = {
        signInReturn: (sessionId, url) => {
            const open = views.bySessionId(sessionId);
            if (!open) return false;
            void open.view.webContents.loadURL(url);
            views.show(views.open.indexOf(open));
            return true;
        },
        join: (link) =>
            void join(link, {
                lookUp: (slug) => lookUpWorkspace(slug, (url, init) => net.fetch(url, init)),
                isOpen: (serverName) => views.open.some((open) => open.info.serverName === serverName),
                show: (serverName) => {
                    views.show(views.open.findIndex((open) => open.info.serverName === serverName));
                    shell.hideIfAdding();
                },
                openJoinPage: (url) => openJoinWindow(window, url),
                openWorkspace: (serverName) => shell.openWorkspace(serverName),
                alert: (key) =>
                    void dialog.showMessageBox(window, { type: "info", message: artiseT(key, {}, shellLocale()) }),
            }),
    };
    shellSession.protocol.handle(SCHEME, async (request) => {
        const url = new URL(request.url);
        return (await rail.handle(url)) ?? shell.handle(url);
    });
    // The rail loads its (still empty) page now; it joins the window when a workspace opens.
    void railView.webContents.loadURL(`${SHELL_ORIGIN}/rail`);

    // Workspaces signed out of last time leave folders Electron couldn't remove while it was running.
    void removeClosedWorkspaces(app.getPath("userData"), readArtiseSettings().openWorkspaces ?? [])
        .catch((e: unknown) => console.warn("Couldn't remove closed workspaces' folders", e))
        .then(async () => {
            await shell.start();
            setLinkTargets(linkTargets);
        });
    return true;
}

/**
 * Turns "start at login, hidden" on the first time workspaces open, as the phones keep running: the desktop has no
 * push service, so messages arrive only while Artise runs. Once; the person can turn it off in Settings. Not on
 * Linux, which Artise doesn't ship for, nor in the Microsoft Store build.
 */
function startAtLoginOnce(): void {
    // The Store build starts at login through its manifest (artise/appx/extensions.xml) instead.
    if (process.platform === "linux" || process.windowsStore || readArtiseSettings().startAtLoginSet) return;
    updateArtiseSettings({ startAtLoginSet: true });
    AutoLaunch.instance.setState("minimised").catch((e: unknown) => console.warn("Couldn't turn on start at login", e));
}
