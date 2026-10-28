/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type Result } from "../artiseId/authorization.js";

/**
 * What the desktop needs to open one workspace: its homeserver, its sign-in (MAS) issuer and the desktop's
 * client there, and the parts of its workspace file (`co.artise.workspace`) the shell shows. The same fields
 * as apps/web/src/artise/workspace/WorkspaceFile.ts, which the desktop can't import.
 */
export interface WorkspaceInfo {
    serverName: string;
    homeserverUrl: string;
    /** MAS's issuer, from the homeserver's auth metadata; absent for a server without MAS. */
    issuer?: string;
    /** The desktop's static client on that MAS (`desktop_oauth`), so Element doesn't register a new one. */
    desktopClientId?: string;
    name?: string;
    language?: string;
    /** The workspace's own site, chat.<workspace>, for links Element makes to share. */
    webUrl?: string;
    logo?: string;
    color?: string;
    /** The oldest Artise desktop this workspace still works with (`min_app_version.desktop`), as `1.2.3`. */
    minDesktopVersion?: string;
}

/** The network, as Electron's `net.fetch`. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const REQUEST_TIMEOUT = 15 * 1000;

function asObject(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function asText(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * An `https:` URL without its trailing slash, or undefined.
 *
 * @param value - any value from a server's JSON.
 */
export function httpsUrl(value: unknown): string | undefined {
    const text = asText(value);
    if (!text) return undefined;
    try {
        return new URL(text).protocol === "https:" ? text.replace(/\/+$/, "") : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The desktop's MAS client from a workspace file: `desktop_oauth` as the server writes it (an ID, or an object
 * with `client_id`), or `oauth.desktop` as the plan first named it.
 *
 * @param file - the parsed `co.artise.workspace` object.
 */
export function desktopClientId(file: Record<string, unknown>): string | undefined {
    const desktop = file.desktop_oauth ?? asObject(file.oauth)?.desktop;
    const id = typeof desktop === "string" ? desktop : asObject(desktop)?.client_id;
    return typeof id === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(id) ? id : undefined;
}

/**
 * The desktop's minimum version from a `min_app_version` object (the workspace file's, or `/v1/sign-in`'s):
 * its `desktop` entry when it is a plain `major.minor.patch`.
 *
 * @param minAppVersion - the object's value, whatever the server sent.
 */
export function minDesktopVersion(minAppVersion: unknown): string | undefined {
    const version = asObject(minAppVersion)?.desktop;
    return typeof version === "string" && /^\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(version) ? version : undefined;
}

/**
 * Reads a workspace's `/.well-known/matrix/client`.
 *
 * @param serverName - the workspace's server name, e.g. `mas-k8s.artise.co`.
 * @param body - the parsed answer.
 */
export function parseWellKnown(serverName: string, body: unknown): WorkspaceInfo | undefined {
    const wellKnown = asObject(body);
    const homeserverUrl = httpsUrl(asObject(wellKnown?.["m.homeserver"])?.base_url);
    if (!wellKnown || !homeserverUrl) return undefined;
    const file = asObject(wellKnown["co.artise.workspace"]) ?? {};
    const color = asText(asObject(file.colors)?.accent);
    return {
        serverName,
        homeserverUrl,
        desktopClientId: desktopClientId(file),
        name: asText(file.name),
        language: asText(file.language),
        webUrl: httpsUrl(asObject(file.links)?.web),
        logo: httpsUrl(file.logo),
        color: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined,
        minDesktopVersion: minDesktopVersion(file.min_app_version),
    };
}

async function getJson(fetch: Fetch, url: string): Promise<Result<unknown>> {
    try {
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT),
        });
        if (response.status !== 200) return { ok: false, error: "unreachable" };
        return { ok: true, value: await response.json() };
    } catch {
        return { ok: false, error: "unreachable" };
    }
}

/**
 * Finds out how to open a workspace: its workspace file, then its homeserver's sign-in issuer.
 *
 * @param serverName - the workspace's server name, from the person's list.
 * @param fetch - the network.
 */
export async function discoverWorkspace(serverName: string, fetch: Fetch): Promise<Result<WorkspaceInfo>> {
    if (!/^[a-z0-9.-]+(:\d+)?$/.test(serverName)) return { ok: false, error: "refused" };
    const wellKnown = await getJson(fetch, `https://${serverName}/.well-known/matrix/client`);
    if (!wellKnown.ok) return wellKnown;
    const info = parseWellKnown(serverName, wellKnown.value);
    if (!info) return { ok: false, error: "unreachable" };

    const metadata = await getJson(fetch, `${info.homeserverUrl}/_matrix/client/v1/auth_metadata`);
    const issuer = metadata.ok ? httpsUrl(asObject(metadata.value)?.issuer) : undefined;
    return { ok: true, value: { ...info, issuer } };
}
