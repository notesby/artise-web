/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type BrowserWindow, type IpcMain, type IpcMainEvent, type WebContents } from "electron";

import { currentView, runInView, type ViewContext, viewFor } from "./context.js";

/** The secrets Element keeps per Matrix user; a view may only touch its own workspace's users. */
const PER_USER_CALLS = new Set(["getPickleKey", "createPickleKey", "destroyPickleKey"]);

/**
 * Element's per-window media-auth replies: Artise's own per-view media auth listens for them on the view
 * (artise/views/mediaAuth.ts), so they mustn't reach Element's, which serves only its default session.
 */
const VIEW_ONLY_CHANNELS = new Set(["userAccessToken", "homeserverUrl", "serverSupportedVersions"]);

/**
 * Whether a Matrix user ID belongs to a workspace.
 *
 * @param userId - e.g. `@ana:artise.co`.
 * @param serverName - the workspace's server name.
 */
export function isWorkspaceUser(userId: unknown, serverName: string): boolean {
    return typeof userId === "string" && userId.startsWith("@") && userId.endsWith(`:${serverName}`);
}

/**
 * What to do with an IPC message from a workspace view before Element's handlers see it.
 *
 * @param view - the view it came from.
 * @param channel - the channel.
 * @param payload - the message's first argument.
 * @returns "element" to run Element's handlers for the view, "seshat" for the view's own Seshat, "badge" for its
 *     unread count (added to the others' before Element shows it), "drop" to ignore it, or "refuse" for a call
 *     about another workspace's user.
 */
export function routeFor(
    view: ViewContext,
    channel: string,
    payload: unknown,
): "element" | "seshat" | "badge" | "drop" | "refuse" {
    if (VIEW_ONLY_CHANNELS.has(channel)) return "drop";
    if (channel === "setBadgeCount") return "badge";
    const call = payload as { name?: string; args?: unknown[] } | undefined;
    if (channel === "ipcCall" && call?.name && PER_USER_CALLS.has(call.name)) {
        return isWorkspaceUser(call.args?.[0], view.serverName) ? "element" : "refuse";
    }
    if (channel === "seshat") {
        if (call?.name === "initEventIndex" && !isWorkspaceUser(call.args?.[0], view.serverName)) return "refuse";
        return view.seshat ? "seshat" : "drop";
    }
    return "element";
}

/** What the views manager does with what routing sees. */
export interface RoutingHooks {
    /** The shown workspace's view, if any. */
    shown(): ViewContext | undefined;
    /**
     * Takes a view's `setBadgeCount` arguments and gives the ones for Element's badge code: every workspace's
     * count added up.
     */
    badge(view: ViewContext, args: unknown[]): unknown[];
    /** A view's web app asked to be brought to the front: a click on one of its notifications. */
    focus(view: ViewContext): void;
    /** A view's web app cleared its storage: its last step when it signs out. */
    signedOut(view: ViewContext): void;
    /** A view's web app named its Matrix user and device (its pickle-key calls), for the cleanup at sign-out. */
    sawUser(view: ViewContext, userId: string, deviceId: string): void;
}

/**
 * Lets Element's single-window main process serve one view per workspace, without changing its handlers.
 *
 * - `window.webContents` is the view Element is running for (inside an IPC message from it), else the shown
 *   workspace's view, else the window's own. Element's handlers reply with `global.mainWindow.webContents.send`
 *   and use its session (spell check, "clear storage"), so they reach the right workspace.
 * - IPC from a view runs Element's handlers inside that view's context ({@link runInView}), after
 *   {@link routeFor}'s checks; Seshat goes to the view's own instance.
 *
 * @param window - Element's main window.
 * @param ipcMain - Electron's ipcMain.
 * @param hooks - what the views manager does with what routing sees.
 * @returns the window's own web contents, for the code that means that one.
 */
export function installRouting(window: BrowserWindow, ipcMain: IpcMain, hooks: RoutingHooks): WebContents {
    const own = window.webContents;
    Object.defineProperty(window, "webContents", {
        configurable: true,
        get: (): WebContents => currentView()?.webContents ?? hooks.shown()?.webContents ?? own,
    });

    const emit = ipcMain.emit.bind(ipcMain);
    ipcMain.emit = (channel: string | symbol, event?: IpcMainEvent, ...args: unknown[]): boolean => {
        const view = typeof channel === "string" ? viewFor(event?.sender) : undefined;
        if (!view || typeof channel !== "string") return emit(channel, event, ...args);
        switch (routeFor(view, channel, args[0])) {
            case "drop":
                return true;
            case "refuse": {
                const id = (args[0] as { id?: unknown } | undefined)?.id;
                const reply = channel === "seshat" ? "seshatReply" : "ipcReply";
                console.warn(`Refused ${channel} from ${view.serverName}: about another workspace's user`);
                view.webContents.send(reply, { id, error: { message: "Not this workspace's user" } });
                return true;
            }
            case "badge":
                return emit(channel, event, ...hooks.badge(view, args));
            case "seshat":
                runInView(view, () => view.seshat?.(event, ...args));
                return true;
            case "element": {
                const call = channel === "ipcCall" ? (args[0] as { name?: string; args?: unknown[] }) : undefined;
                if (call?.name === "focusWindow") hooks.focus(view);
                const [userId, deviceId] = call?.args ?? [];
                if (call?.name && PER_USER_CALLS.has(call.name) && typeof deviceId === "string") {
                    hooks.sawUser(view, userId as string, deviceId);
                }
                if (call?.name === "clearStorage") {
                    // Element's handlers are async; the workspace may be closed only once they've answered.
                    const handlers = ipcMain.listeners(channel) as ((...params: unknown[]) => unknown)[];
                    void Promise.allSettled(
                        handlers.map((handler) => runInView(view, () => handler(event, ...args))),
                    ).then(() => hooks.signedOut(view));
                    return handlers.length > 0;
                }
                return runInView(view, () => emit(channel, event, ...args));
            }
        }
    };
    return own;
}
