/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type NotesApi, NotesApiError } from "./NotesApi";

const pad = (n: number): string => String(n).padStart(2, "0");

/** Folder and file names keep letters, numbers, spaces and dashes, as on Android (`fileSafe`). */
export function fileSafe(name: string): string {
    const safe = [...name]
        .filter((c) => /[\p{L}\p{N} -]/u.test(c))
        .join("")
        .replace(/ +/g, " ")
        .trim()
        .slice(0, 40)
        .trim();
    return safe || "mensaje";
}

/**
 * A message as a note, the way Android writes it (`DefaultMessageNoteSaver`):
 * `<folder>/<yyyy-MM-dd HHmm> <sender>.md`, the text quoted, then `— <sender>, <dd/MM/yyyy HH:mm>`.
 *
 * @param folder - "Mensajes guardados", in the person's language.
 * @param sentAt - When the message was sent, shown in this computer's time zone.
 */
export function savedMessageNote(
    folder: string,
    senderName: string,
    sentAt: Date,
    text: string,
): { path: string; content: string } {
    const y = sentAt.getFullYear();
    const mo = pad(sentAt.getMonth() + 1);
    const d = pad(sentAt.getDate());
    const h = pad(sentAt.getHours());
    const mi = pad(sentAt.getMinutes());
    const path = `${folder}/${y}-${mo}-${d} ${h}${mi} ${fileSafe(senderName)}.md`;
    const quoted = text
        .split(/\r?\n/)
        .map((line) => `> ${line}`)
        .join("\n");
    return { path, content: `${quoted}\n\n— ${senderName}, ${d}/${mo}/${y} ${h}:${mi}\n` };
}

/** `a/b.md` → `a/b (2).md`. */
function numbered(path: string, n: number): string {
    return path.replace(/\.md$/, ` (${n}).md`);
}

/**
 * Saves a message as a new note. When the name is taken (two messages from the same person in the same minute),
 * it tries `… (2).md`, `… (3).md`, up to 9.
 *
 * @returns The new note's path.
 */
export async function saveMessageToNotes(
    api: NotesApi,
    roomId: string,
    note: { path: string; content: string },
): Promise<string> {
    for (let n = 1; n <= 9; n++) {
        const path = n === 1 ? note.path : numbered(note.path, n);
        try {
            const saved = await api.saveNote(roomId, path, note.content, null);
            return saved.path;
        } catch (e) {
            if (!(e instanceof NotesApiError && e.code === "exists") || n === 9) throw e;
        }
    }
    throw new NotesApiError("exists", 409);
}
