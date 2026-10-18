/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect } from "vitest";

import { notesHash, readNotesLocation } from "./notesLocation";

describe("notes location", () => {
    // Room ids and paths with accents and slashes survive the round trip.
    it("writes and reads the chat and file", () => {
        const hash = notesHash("!abc:artise.co", "Recetas/Súper.md");
        expect(hash).toBe("#/notes?room=%21abc%3Aartise.co&path=Recetas%2FS%C3%BAper.md");
        expect(readNotesLocation(hash)).toEqual({ roomId: "!abc:artise.co", path: "Recetas/Súper.md" });
    });

    it("reads an address without a chat", () => {
        expect(notesHash(null)).toBe("#/notes");
        expect(readNotesLocation("#/notes")).toEqual({ roomId: null, path: null });
    });
});
