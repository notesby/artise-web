/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { session } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

import Store from "../../store.js";
import { type ViewContext, workspaceKey } from "./context.js";
import { partitionFor } from "./workspaceView.js";

/** The prefix of a workspace's partition folder in the profile (Electron's `Partitions/<name>`). */
const PARTITION_PREFIX = "workspace-";

/**
 * The secrets Element keeps for a Matrix user's session on this computer: its pickle key (ipc.ts) and its
 * message-search passphrase (seshat.ts).
 *
 * @param userId - the Matrix user.
 * @param deviceId - the session's device.
 */
export function secretsOf(userId: string, deviceId: string): string[] {
    return [`${userId}|${deviceId}`, `seshat|${userId}|${deviceId}`];
}

/**
 * Removes what a closed workspace left on this computer: everything in its partition (IndexedDB with its Matrix
 * session, caches, cookies), its message-search index and its secrets. Element's own sign-out removes most of
 * it; this makes sure of all of it.
 *
 * @param context - the closed workspace's view.
 * @param user - its Matrix user and device, if its web app named them.
 */
export async function cleanUpWorkspace(
    context: ViewContext,
    user: { userId: string; deviceId: string } | undefined,
): Promise<void> {
    const workspaceSession = session.fromPartition(partitionFor(context.key));
    await workspaceSession.clearStorageData();
    await workspaceSession.clearCache();
    await fs.rm(context.userDataDir, { recursive: true, force: true });
    if (user) {
        for (const secret of secretsOf(user.userId, user.deviceId)) {
            await Store.instance
                ?.deleteSecret(secret)
                .catch((e: unknown) => console.warn("Couldn't remove a secret", e));
        }
    }
}

/**
 * Removes the folders of workspaces that aren't open any more: what a sign-out couldn't delete while its session
 * was still loaded (Electron keeps a partition's folder while the app runs). Runs at start, before any workspace's
 * session is used.
 *
 * @param userData - the profile folder.
 * @param open - the server names of the workspaces to keep.
 */
export async function removeClosedWorkspaces(userData: string, open: readonly string[]): Promise<string[]> {
    const keep = new Set(open.map(workspaceKey));
    const removed: string[] = [];
    const sweep = async (folder: string, prefix: string): Promise<void> => {
        const entries = await fs.readdir(folder).catch((): string[] => []);
        for (const entry of entries) {
            if (!entry.startsWith(prefix) || keep.has(entry.slice(prefix.length))) continue;
            await fs.rm(path.join(folder, entry), { recursive: true, force: true });
            removed.push(path.join(path.basename(folder), entry));
        }
    };
    await sweep(path.join(userData, "Partitions"), PARTITION_PREFIX);
    await sweep(path.join(userData, "workspaces"), "");
    return removed;
}
