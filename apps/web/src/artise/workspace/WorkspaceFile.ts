/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type IClientWellKnown, type MatrixClient } from "matrix-js-sdk/src/matrix";

/** The key of Artise's section in a workspace's `/.well-known/matrix/client`. */
export const WORKSPACE_WK_KEY = "co.artise.workspace";

/** Links a workspace file may give. Each one is an `https:` URL; anything else is dropped. */
export interface WorkspaceLinks {
    web?: string;
    notes_api?: string;
    invites_api?: string;
    delete_account?: string;
    help?: string;
}

/**
 * The workspace's own look, shown next to its name. In the file it is a top-level `logo` and `colors.accent`,
 * the shape the phones read and admins set with `!workspace logo` and `!workspace color`.
 */
export interface WorkspaceBranding {
    /** An `https:` URL to a square logo. */
    logo?: string;
    /** A colour as `#RRGGBB`. */
    color?: string;
}

/**
 * What Artise reads from a workspace file (`co.artise.workspace`).
 *
 * Every field is optional: workspaces are updated one at a time, so a file may lack fields
 * that another workspace already has (artise.co had no `links.help` on 2026-10-18).
 */
export interface WorkspaceFile {
    /** The workspace's name, e.g. "Artise" or "Prueba MAS". */
    name?: string;
    /** What the assistant is called, e.g. "Ari". */
    assistantName?: string;
    /** The workspace's language, e.g. "es". */
    language?: string;
    links: WorkspaceLinks;
    /** The assistant's Matrix ID, e.g. "@wikibot:mas-k8s.artise.co". */
    assistantUserId?: string;
    /** Who to write to for help, usually the workspace's admin. */
    contactUserId?: string;
    branding: WorkspaceBranding;
}

const LINK_KEYS: (keyof WorkspaceLinks)[] = ["web", "notes_api", "invites_api", "delete_account", "help"];
const MATRIX_USER_ID = /^@[^:\s]+:[^\s]+$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function asString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function asHttpsUrl(value: unknown): string | undefined {
    const text = asString(value);
    if (!text) return undefined;
    try {
        return new URL(text).protocol === "https:" ? text : undefined;
    } catch {
        return undefined;
    }
}

function asUserId(value: unknown): string | undefined {
    const text = asString(value);
    return text && MATRIX_USER_ID.test(text) ? text : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/**
 * Reads Artise's section of a workspace's client well-known file.
 *
 * Unknown fields are ignored and malformed ones are dropped one by one, so a single bad value
 * never hides the rest of the file.
 *
 * @param wellKnown - The client well-known, as the Matrix client fetched it.
 * @returns The workspace file, or `null` when the server has no Artise section (not an Artise workspace).
 */
export function parseWorkspaceFile(wellKnown: IClientWellKnown | undefined): WorkspaceFile | null {
    const section = wellKnown?.[WORKSPACE_WK_KEY];
    if (typeof section !== "object" || section === null || Array.isArray(section)) return null;
    const raw = section as Record<string, unknown>;

    const rawLinks = asObject(raw.links);
    const links: WorkspaceLinks = {};
    for (const key of LINK_KEYS) {
        const url = asHttpsUrl(rawLinks[key]);
        if (url) links[key] = url;
    }

    const branding: WorkspaceBranding = {};
    const logo = asHttpsUrl(raw.logo);
    if (logo) branding.logo = logo;
    const color = asString(asObject(raw.colors).accent);
    if (color && HEX_COLOR.test(color)) branding.color = color;

    return {
        name: asString(raw.name),
        assistantName: asString(raw.assistant_name),
        language: asString(raw.language),
        links,
        assistantUserId: asUserId(raw.assistant_user_id),
        contactUserId: asUserId(raw.contact_user_id),
        branding,
    };
}

/**
 * The signed-in workspace's file, from the well-known the client already fetched at start.
 *
 * @param client - The signed-in Matrix client.
 * @returns The workspace file, or `null` before the well-known arrives or on a non-Artise server.
 */
export function getWorkspaceFile(client: MatrixClient): WorkspaceFile | null {
    return parseWorkspaceFile(client.getClientWellKnown());
}
