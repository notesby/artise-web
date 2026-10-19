/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type WebContents } from "electron";

import { type ConfigOptions, getConfig } from "../../config.js";
import { type Result } from "../artiseId/authorization.js";
import { updateArtiseSettings } from "../settings.js";
import { type Fetch, type WorkspaceInfo, discoverWorkspace } from "./discovery.js";
import { workspaceConfig } from "./workspaceConfig.js";

/** The workspaces open in the window, the one shown first. One view per workspace comes with D3-1. */
let open: WorkspaceInfo[] = [];

/** The workspaces open now. */
export function openWorkspaces(): readonly WorkspaceInfo[] {
    return open;
}

/**
 * Finds out how to open the chosen workspaces and makes them the open ones. Fails, opening nothing, if the first
 * one can't be reached; the others are left out when they can't.
 *
 * @param serverNames - the chosen workspaces, the one to show first at the front.
 * @param fetch - the network.
 */
export async function prepareWorkspaces(serverNames: string[], fetch: Fetch): Promise<Result<WorkspaceInfo[]>> {
    const found = await Promise.all(serverNames.map((serverName) => discoverWorkspace(serverName, fetch)));
    const first = found[0];
    if (!first) return { ok: false, error: "refused" };
    if (!first.ok) return first;
    open = found.flatMap((result) => (result.ok ? [result.value] : []));
    // The language Artise starts in next time (artise/language.ts) is the first workspace's.
    if (first.value.language) updateArtiseSettings({ workspaceLanguage: first.value.language });
    return { ok: true, value: open };
}

/**
 * The config.json for the web app in a window: the shown workspace's, once one is open. Undefined before that,
 * and in Element's own builds, for Element's packaged config.
 *
 * @param _sender - the web contents asking. Unused until D3-1 gives each workspace its own view.
 */
export function configFor(_sender: WebContents | undefined): ConfigOptions | undefined {
    return open[0] ? workspaceConfig(getConfig(), open[0]) : undefined;
}
