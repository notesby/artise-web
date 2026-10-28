/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type Fetch } from "../workspace/discovery.js";

/** An invite to a workspace: the same two parts as the phones' `https://join.artise.co/<slug>/<code>`. */
export interface JoinLink {
    slug: string;
    code: string;
}

/**
 * Reads the desktop's invite link, `co.artise.desktop://join?workspace=<slug>&code=<code>`, which the join page's
 * "Abrir en la computadora" opens (family-wiki bot/joinpage.py `desktop_link`). The same checks as the server's.
 *
 * @param link - a link that opened the app.
 */
export function parseJoinLink(link: string): JoinLink | undefined {
    let url: URL;
    try {
        url = new URL(link);
    } catch {
        return undefined;
    }
    if (url.protocol !== "co.artise.desktop:" || url.host !== "join") return undefined;
    const slug = url.searchParams.get("workspace") ?? "";
    const code = url.searchParams.get("code") ?? "";
    if (!/^[a-z0-9-]{1,63}$/.test(slug) || !/^[A-Za-z0-9_-]{6,64}$/.test(code)) return undefined;
    return { slug, code };
}

/** A workspace as Artise's directory describes it (`GET https://api.artise.co/v1/workspaces/<slug>`). */
export interface DirectoryEntry {
    slug: string;
    name: string;
    serverName: string;
    /** The join page invites open: `<joinUrl>/<code>`. */
    joinUrl?: string;
}

/** The directory's answer, as the phones read it (artise-ios WorkspaceDirectory.swift). */
export type Lookup =
    | { found: DirectoryEntry }
    /** Paused by Artise: nobody joins or signs in until its admin sorts it out. */
    | { suspended: DirectoryEntry }
    /** Unknown, being set up or closed. */
    | "not_found"
    /** Too many lookups (30 a minute). */
    | "rate_limited"
    | "unreachable";

export const DIRECTORY_URL = "https://api.artise.co/v1/workspaces";

/**
 * Looks an invite's workspace up in Artise's directory.
 *
 * @param slug - the invite's workspace.
 * @param fetch - the network.
 */
export async function lookUpWorkspace(slug: string, fetch: Fetch): Promise<Lookup> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTORY_URL}/${encodeURIComponent(slug)}`, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(15_000),
        });
    } catch {
        return "unreachable";
    }
    if (response.status === 404) return "not_found";
    if (response.status === 429) return "rate_limited";
    if (response.status !== 200) return "unreachable";
    const body = (await response.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    const serverName = typeof body?.server_name === "string" ? body.server_name.trim().toLowerCase() : "";
    if (!/^[a-z0-9.-]+(:\d+)?$/.test(serverName)) return "unreachable";
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : slug;
    const joinUrl =
        typeof body?.join_url === "string" && body.join_url.startsWith("https://")
            ? body.join_url.replace(/\/+$/, "")
            : undefined;
    const entry: DirectoryEntry = { slug, name, serverName, joinUrl };
    // Only "active" opens: a status the app doesn't know yet is treated like a pause.
    return body?.status === "active" ? { found: entry } : { suspended: entry };
}
