/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type Result } from "../artiseId/authorization.js";
import { updateArtiseSettings } from "../settings.js";
import { type Fetch, type WorkspaceInfo, discoverWorkspace } from "./discovery.js";

/**
 * Finds out how to open the chosen workspaces. Fails if the first one can't be reached; the others are left
 * out when they can't.
 *
 * @param serverNames - the chosen workspaces, the one to show first at the front.
 * @param fetch - the network.
 */
export async function prepareWorkspaces(serverNames: string[], fetch: Fetch): Promise<Result<WorkspaceInfo[]>> {
    const found = await Promise.all(serverNames.map((serverName) => discoverWorkspace(serverName, fetch)));
    const first = found[0];
    if (!first) return { ok: false, error: "refused" };
    if (!first.ok) return first;
    // The language Artise starts in next time (artise/language.ts) is the first workspace's.
    if (first.value.language) updateArtiseSettings({ workspaceLanguage: first.value.language });
    return { ok: true, value: found.flatMap((result) => (result.ok ? [result.value] : [])) };
}
