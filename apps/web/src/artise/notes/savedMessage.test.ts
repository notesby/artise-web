/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi } from "vitest";

import { fileSafe, saveMessageToNotes, savedMessageNote } from "./savedMessage";
import { NotesApiError, type NotesApi } from "./NotesApi";

describe("savedMessageNote", () => {
    // The same file Android writes: dated name, quoted text, who and when.
    it("writes the message as Android does", () => {
        const sentAt = new Date(2026, 9, 18, 9, 5);
        expect(savedMessageNote("Mensajes guardados", "Ana López", sentAt, "Comprar pan\ny leche")).toEqual({
            path: "Mensajes guardados/2026-10-18 0905 Ana López.md",
            content: "> Comprar pan\n> y leche\n\n— Ana López, 18/10/2026 09:05\n",
        });
    });

    it("keeps names safe for files", () => {
        expect(fileSafe("  Luis 🎉 (papá)/x  ")).toBe("Luis papáx");
        expect(fileSafe("🎉")).toBe("mensaje");
        expect(fileSafe("a".repeat(60))).toHaveLength(40);
    });
});

describe("saveMessageToNotes", () => {
    const note = { path: "Mensajes guardados/2026-10-18 0905 Ana.md", content: "> hola\n" };

    // A new note, created (base_version null).
    it("creates the note", async () => {
        const saveNote = vi.fn().mockResolvedValue({ path: note.path, version: "v", merged: false, created: true });
        expect(await saveMessageToNotes({ saveNote } as unknown as NotesApi, "!r:x", note)).toBe(note.path);
        expect(saveNote).toHaveBeenCalledWith("!r:x", note.path, note.content, null);
    });

    // Same person, same minute: the next free number.
    it("numbers the name when it's taken", async () => {
        const saveNote = vi
            .fn()
            .mockRejectedValueOnce(new NotesApiError("exists", 409))
            .mockImplementation(async (_r: string, path: string) => ({
                path,
                version: "v",
                merged: false,
                created: true,
            }));
        expect(await saveMessageToNotes({ saveNote } as unknown as NotesApi, "!r:x", note)).toBe(
            "Mensajes guardados/2026-10-18 0905 Ana (2).md",
        );
    });

    it("passes other errors on", async () => {
        const saveNote = vi.fn().mockRejectedValue(new NotesApiError("offline", 0));
        await expect(saveMessageToNotes({ saveNote } as unknown as NotesApi, "!r:x", note)).rejects.toMatchObject({
            code: "offline",
        });
        expect(saveNote).toHaveBeenCalledTimes(1);
    });
});
