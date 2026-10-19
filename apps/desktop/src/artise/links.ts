/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { getArtiseId } from "./artiseId/instance.js";
import { type JoinLink, parseJoinLink } from "./join/joinLink.js";

/** Element Desktop's marker in a sign-in state, before the ID of the app instance that started it. */
const SSOID_MARKER = ":element-desktop-ssoid:";

/** Where links that opened the app go, beyond Artise ID's. */
interface LinkTargets {
    /** Loads a workspace's sign-in return in its view; false when no open workspace has that ID. */
    signInReturn(sessionId: string, url: string): boolean;
    /** Joins a workspace from an invite. */
    join(link: JoinLink): void;
}

let targets: LinkTargets | undefined;
/** Invites that opened the app before the shell was ready (a cold start from the join page). */
let pendingJoins: JoinLink[] = [];

/**
 * Sets where workspaces' sign-in returns and invites go, and hands over invites that came before.
 *
 * @param value - the shell and the open workspaces' views.
 */
export function setLinkTargets(value: LinkTargets): void {
    targets = value;
    const waiting = pendingJoins;
    pendingJoins = [];
    waiting.forEach((link) => value.join(link));
}

/**
 * The `element-desktop-ssoid` in a sign-in return's state, in its query or its fragment (MAS may answer with
 * either), as Element's ProtocolHandler reads it.
 *
 * @param link - the return link.
 */
export function signInSessionId(link: URL): string | undefined {
    const fromFragment = link.hash.includes("=") ? new URLSearchParams(link.hash.slice(1).split("?")[0]) : undefined;
    const state = (fromFragment ?? link.searchParams).get("state") ?? link.searchParams.get("state");
    return state?.split(SSOID_MARKER)[1] || undefined;
}

/** Brings Artise to the front: back from the browser (macOS doesn't do it for its open-url links). */
function reveal(): void {
    const window = global.mainWindow;
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
}

/**
 * Takes the links Artise handles itself, before Element loads them into its window (the protocol.ts hook):
 * - Artise ID's sign-in returns go to the shell;
 * - a workspace's sign-in return goes to that workspace's own view, whichever one is shown;
 * - an invite (`co.artise.desktop://join?…`) joins its workspace (artise/join).
 *
 * @param link - the link, from the OS.
 * @returns whether Artise took it; then Element does nothing more with it.
 */
export function artiseHandlesLink(link: string): boolean {
    if (getArtiseId().handleReturn(link)) {
        reveal();
        return true;
    }
    const invite = parseJoinLink(link);
    if (invite) {
        if (targets) targets.join(invite);
        else pendingJoins.push(invite);
        reveal();
        return true;
    }
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return false;
    }
    const sessionId = signInSessionId(url);
    if (!sessionId?.startsWith("artise-") || !targets) return false;
    const target = new URL("vector://vector/webapp/");
    target.search = url.search;
    target.hash = url.hash;
    if (!targets.signInReturn(sessionId, target.href)) return false;
    reveal();
    return true;
}
