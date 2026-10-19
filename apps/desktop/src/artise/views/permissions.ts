/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type Session } from "electron";

/** Where Artise's own web app runs; only it may ask for anything. Element Call is served from it too. */
const APP_ORIGIN = "vector://vector";

/**
 * What a workspace's web app may use: notifications, the camera and microphone and screen sharing for calls,
 * writing to the clipboard, and full screen for videos. Everything else is refused. Electron allows everything
 * by default.
 */
const ALLOWED = new Set(["notifications", "media", "display-capture", "clipboard-sanitized-write", "fullscreen"]);

/**
 * Whether to grant a permission.
 *
 * @param permission - Electron's permission name.
 * @param requestingUrl - the page or frame asking.
 */
export function allowPermission(permission: string, requestingUrl: string | undefined): boolean {
    if (!ALLOWED.has(permission) || !requestingUrl) return false;
    // URL.origin is "null" for the vector: scheme, so compare the text: the origin itself, or a page under it.
    return requestingUrl === APP_ORIGIN || requestingUrl.startsWith(`${APP_ORIGIN}/`);
}

/**
 * Applies {@link allowPermission} to a workspace's session, for requests and for checks.
 *
 * @param session - the workspace's session.
 */
export function setPermissionPolicy(session: Session): void {
    session.setPermissionRequestHandler((_contents, permission, callback, details) =>
        callback(allowPermission(permission, details.requestingUrl)),
    );
    session.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
        allowPermission(permission, requestingOrigin),
    );
}
