/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { ARTISE_API } from "../artiseId/signInInfo";
import { asHexColor, asHttpsUrl } from "./WorkspaceFile";

/** How long to wait for the list before going on without it. */
const TIMEOUT_MS = 6000;

/** One of the person's workspaces, as `GET /v1/workspaces` lists it. */
export interface WorkspaceEntry {
    /** The workspace's name, e.g. "Prueba MAS". */
    name: string;
    /** Its Matrix server name, e.g. "mas-k8s.artise.co". */
    serverName: string;
    /** Its web app, e.g. "https://chat.mas-k8s.artise.co". */
    webUrl: string;
    /** An `https:` URL to its logo. */
    logo?: string;
    /** Its accent colour as `#RRGGBB`. */
    color?: string;
}

function asText(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function parseEntry(value: unknown): WorkspaceEntry | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;
    const name = asText(raw.name);
    const serverName = asText(raw.server_name);
    const webUrl = asHttpsUrl(raw.web_url);
    if (!name || !serverName || !webUrl) return null;
    return { name, serverName, webUrl, logo: asHttpsUrl(raw.logo), color: asHexColor(raw.color) };
}

/**
 * The signed-in person's Artise workspaces, from Artise's API (S-W1).
 *
 * The web holds no Artise ID token, so it proves who it is with a Matrix OpenID token from its own server; the
 * API checks it with that server and answers only that person's workspaces. Workspaces appear once the person's
 * Artise ID is linked in each.
 *
 * @param client - The signed-in Matrix client.
 * @param fetchFn - `fetch`, replaceable in tests.
 * @returns The workspaces (always including this one when the API works), or `null` when the API is down, slow,
 *   refuses the token or answers something unreadable. Entries missing a name, server name or https web address
 *   are left out.
 */
export async function fetchWorkspaces(
    client: MatrixClient,
    fetchFn: typeof fetch = fetch,
): Promise<WorkspaceEntry[] | null> {
    try {
        const token = await client.getOpenIdToken();
        const serverName = token.matrix_server_name || client.getDomain();
        if (!serverName) return null;
        const url = `${ARTISE_API}/v1/workspaces?server_name=${encodeURIComponent(serverName)}`;
        const response = await fetchFn(url, {
            headers: { Authorization: `Bearer ${token.access_token}` },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
            logger.warn(`Artise: /v1/workspaces answered ${response.status}`);
            return null;
        }
        const body: unknown = await response.json();
        const list = typeof body === "object" && body !== null ? (body as Record<string, unknown>).workspaces : null;
        if (!Array.isArray(list)) return null;
        return list.map(parseEntry).filter((entry): entry is WorkspaceEntry => entry !== null);
    } catch (e) {
        logger.warn("Artise: couldn't read /v1/workspaces", e);
        return null;
    }
}
