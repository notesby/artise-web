/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { type WebContents } from "electron";

/** One workspace's web app: its view's web contents, and where its own files go. */
export interface ViewContext {
    /** A short stable key for the workspace, from its server name: its storage partition and folder. */
    key: string;
    serverName: string;
    webContents: WebContents;
    /** The workspace's own folder in the profile, for Seshat's index. */
    userDataDir: string;
    /** Seshat's IPC handler for this workspace: its own module instance, so its own index. */
    seshat?: (...args: unknown[]) => unknown;
}

const running = new AsyncLocalStorage<ViewContext>();
const byWebContentsId = new Map<number, ViewContext>();

/**
 * The key of a workspace: 16 hex characters of the SHA-256 of its server name. Stable across starts, safe in
 * a folder or partition name, and doesn't show the server name in the profile.
 *
 * @param serverName - the workspace's server name.
 */
export function workspaceKey(serverName: string): string {
    return createHash("sha256").update(serverName).digest("hex").slice(0, 16);
}

/**
 * Makes a view known, so IPC from it is routed to its workspace.
 *
 * @param context - the view's context.
 */
export function registerView(context: ViewContext): void {
    byWebContentsId.set(context.webContents.id, context);
}

/**
 * Forgets a view, when its workspace is closed or the view is gone.
 *
 * @param webContentsId - the view's web contents' ID.
 */
export function unregisterView(webContentsId: number): void {
    byWebContentsId.delete(webContentsId);
}

/**
 * The workspace view a message came from, if it's one.
 *
 * @param sender - the sender of an IPC message.
 */
export function viewFor(sender: WebContents | undefined): ViewContext | undefined {
    return sender ? byWebContentsId.get(sender.id) : undefined;
}

/**
 * Runs Element's code on behalf of one workspace view: while it runs, including after its awaits,
 * {@link currentView} is that view.
 *
 * @param context - the view.
 * @param run - Element's code.
 */
export function runInView<T>(context: ViewContext, run: () => T): T {
    return running.run(context, run);
}

/** The view Element's code is running for, inside {@link runInView}. */
export function currentView(): ViewContext | undefined {
    return running.getStore();
}

/** The folder for the files of the workspace Element's code is running for; undefined outside one (seshat.ts hook). */
export function artiseUserDataDir(): string | undefined {
    return running.getStore()?.userDataDir;
}
