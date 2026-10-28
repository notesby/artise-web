/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type Result } from "../artiseId/authorization.js";
import { type DesktopTextKey } from "../i18n/artiseT.js";
import { type JoinLink, type Lookup } from "./joinLink.js";

/** What joining needs from the app. */
export interface JoinDeps {
    lookUp(slug: string): Promise<Lookup>;
    /** Whether the workspace is open in the window already. */
    isOpen(serverName: string): boolean;
    /** Shows an open workspace. */
    show(serverName: string): void;
    /** Shows the workspace's join page in the app; resolves when the person closes it or it's done. */
    openJoinPage(url: string): Promise<void>;
    /** Opens the workspace next to the open ones, and so its sign-in. */
    openWorkspace(serverName: string): Promise<Result<unknown>>;
    /** Tells the person why the invite can't be used, in the phones' words. */
    alert(text: DesktopTextKey): void;
}

/**
 * Joins a workspace from an invite, as the phones do (artise-ios ArtiseWorkspaces.handleURL): looks it up, shows
 * its join page (where the account is made) in the app, then opens the workspace, which goes to its sign-in. A
 * workspace already open is just shown.
 *
 * @param link - the invite.
 * @param deps - the app.
 */
export async function join(link: JoinLink, deps: JoinDeps): Promise<void> {
    const found = await deps.lookUp(link.slug);
    if (found === "not_found") return deps.alert("artise|desktop|join|expired");
    if (found === "rate_limited") return deps.alert("artise|desktop|join|rate_limited");
    if (found === "unreachable") return deps.alert("artise|desktop|join|unreachable");
    if ("suspended" in found) return deps.alert("artise|desktop|join|paused");

    const workspace = found.found;
    if (deps.isOpen(workspace.serverName)) return deps.show(workspace.serverName);
    // Before invite links, the directory had no join page: the workspace's sign-in is all there is.
    if (workspace.joinUrl) await deps.openJoinPage(`${workspace.joinUrl}/${encodeURIComponent(link.code)}`);
    const opened = await deps.openWorkspace(workspace.serverName);
    if (!opened.ok) deps.alert("artise|desktop|join|unreachable");
}
