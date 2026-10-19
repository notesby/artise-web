/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type Session, type WebContents } from "electron";

/**
 * Asks the view's web app for something and waits for its answer on the view's own IPC, so two workspaces'
 * answers never cross (Element's media-auth.ts waits on the app-wide ipcMain).
 */
function ask<T>(webContents: WebContents, channel: string): Promise<T> {
    return new Promise((resolve) => {
        webContents.ipc.once(channel, (_event, value: T) => resolve(value));
        webContents.send(channel);
    });
}

/**
 * Authenticated media for one workspace's session: Element's media-auth.ts, for the view's own session and
 * web app instead of the default ones. Element Web's service worker does this on the web; the desktop's
 * `vector://` pages have none.
 *
 * @param session - the workspace's session.
 * @param webContents - the workspace's view.
 */
export function setupViewMediaAuth(session: Session, webContents: WebContents): void {
    session.webRequest.onBeforeRequest(async (request, callback) => {
        try {
            const url = new URL(request.url);
            if (
                !url.pathname.startsWith("/_matrix/media/v3/download") &&
                !url.pathname.startsWith("/_matrix/media/v3/thumbnail")
            ) {
                return callback({});
            }
            const versions = await ask<string[]>(webContents, "serverSupportedVersions");
            const accessToken = await ask<string | undefined>(webContents, "userAccessToken");
            if (versions.includes("v1.11") && accessToken) {
                url.href = url.href.replace(/\/media\/v3\/(.*)\//, "/client/v1/media/$1/");
                return callback({ redirectURL: url.toString() });
            }
            return callback({});
        } catch (e) {
            console.error(e);
            return callback({});
        }
    });

    session.webRequest.onBeforeSendHeaders(async (request, callback) => {
        try {
            const url = new URL(request.url);
            if (!url.pathname.startsWith("/_matrix/client/v1/media")) return callback({});
            const homeserver = await ask<string>(webContents, "homeserverUrl");
            if (!homeserver || url.origin !== new URL(homeserver).origin) return callback({});
            const accessToken = await ask<string | undefined>(webContents, "userAccessToken");
            return callback({ requestHeaders: { ...request.requestHeaders, Authorization: `Bearer ${accessToken}` } });
        } catch (e) {
            console.error(e);
            return callback({});
        }
    });
}
