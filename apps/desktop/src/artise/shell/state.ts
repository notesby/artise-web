/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ArtiseIdError } from "../artiseId/authorization.js";
import { type ArtiseIdProvider } from "../artiseId/signInConfig.js";

/** A workspace on the list, ticked to be opened or not. */
export interface ListedWorkspace {
    serverName: string;
    name: string;
    selected: boolean;
}

/** What the shell's screen shows. */
export type ShellState =
    | { screen: "loading" }
    /** "Continuar con …": the providers Artise ID opens directly, and why the last attempt failed. */
    | { screen: "welcome"; providers: ArtiseIdProvider[]; error?: ArtiseIdError }
    /** Sign-in is open in the person's browser. */
    | { screen: "waiting" }
    /** The workspace list: to open at first, or ("adding") to add to the open ones from the rail's "+". */
    | { screen: "workspaces"; workspaces: ListedWorkspace[] | "loading"; error?: ArtiseIdError; adding?: boolean };

/** The order of the provider buttons, as on the phones (Apple first, App Store guideline 4.8). */
export const PROVIDER_ORDER: readonly ArtiseIdProvider[] = ["apple", "google", "microsoft"];

/**
 * The providers to offer, in the phones' order.
 *
 * @param listed - the providers /v1/sign-in lists.
 */
export function offeredProviders(listed: Partial<Record<ArtiseIdProvider, string>>): ArtiseIdProvider[] {
    return PROVIDER_ORDER.filter((provider) => listed[provider]);
}

/**
 * The workspace list, every one ticked: the desktop opens them all unless the person unticks some.
 *
 * @param workspaces - the person's workspaces, from Artise ID.
 * @param opened - the server names opened before, if any; then only those are ticked.
 */
export function listWorkspaces(
    workspaces: ReadonlyArray<{ serverName: string; name: string }>,
    opened: readonly string[] = [],
): ListedWorkspace[] {
    const known = new Set(workspaces.map((workspace) => workspace.serverName));
    const keepPrevious = opened.some((serverName) => known.has(serverName));
    return workspaces.map(({ serverName, name }) => ({
        serverName,
        name,
        selected: keepPrevious ? opened.includes(serverName) : true,
    }));
}
