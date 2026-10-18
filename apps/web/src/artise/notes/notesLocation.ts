/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

/** The page's name in the address: `#/notes?room=…&path=…`. */
export const NOTES_SCREEN = "notes";

export interface NotesLocation {
    roomId: string | null;
    path: string | null;
}

/**
 * Reads the chat and file from an address's hash.
 *
 * @param hash - `window.location.hash`, e.g. `#/notes?room=%21abc%3Aartise.co&path=S%C3%BAper.md`.
 */
export function readNotesLocation(hash: string): NotesLocation {
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    return { roomId: params.get("room") || null, path: params.get("path") || null };
}

/** The hash for a chat's notes, and a file in them. */
export function notesHash(roomId: string | null, path: string | null = null): string {
    const params = new URLSearchParams();
    if (roomId) params.set("room", roomId);
    if (path) params.set("path", path);
    const query = params.toString();
    return `#/${NOTES_SCREEN}${query ? `?${query}` : ""}`;
}
