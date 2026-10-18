/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect } from "vitest";

import { CONFLICT_SEPARATOR, combineVersions, linkSuggestions, newNotePath, toggleTask } from "./noteEditing";

const FILES = [
    { path: "Súper.md", note: true },
    { path: "Recetas/Mole.md", note: true },
    { path: "Viajes/Mole.md", note: true },
    { path: "Recetas/Postres/Flan.md", note: true },
    { path: "attachments/foto.jpg", note: false },
];

describe("toggleTask", () => {
    // Only the box changes: one character, as the contract asks.
    it("ticks and unticks", () => {
        const text = "# Súper\n- [ ] leche\n  * [x] pan\n1. [ ] huevos";
        expect(toggleTask(text, 2)).toBe("# Súper\n- [x] leche\n  * [x] pan\n1. [ ] huevos");
        expect(toggleTask(text, 3)).toBe("# Súper\n- [ ] leche\n  * [ ] pan\n1. [ ] huevos");
        expect(toggleTask(text, 4)).toBe("# Súper\n- [ ] leche\n  * [x] pan\n1. [x] huevos");
    });

    // The line isn't a task any more (changed meanwhile): nothing to tick.
    it("gives null for a line that isn't a task", () => {
        expect(toggleTask("- leche\n", 1)).toBeNull();
        expect(toggleTask("- [ ] leche", 5)).toBeNull();
    });
});

describe("combineVersions", () => {
    it("puts mine above the line and theirs below", () => {
        expect(combineVersions("mía", "otra")).toBe(`mía${CONFLICT_SEPARATOR}otra`);
    });
});

describe("linkSuggestions", () => {
    // [[ with nothing typed: every note, alphabetical, without photos.
    it("suggests notes after [[", () => {
        const text = "Ver [[";
        const result = linkSuggestions(text, text.length, FILES);
        expect(result?.from).toBe(6);
        expect(result?.items.map((i) => i.name)).toEqual(["Flan", "Mole", "Mole", "Súper"]);
    });

    // A name used twice is inserted with its path; accents don't matter when searching.
    it("finds by name, ignoring accents, and keeps names unique", () => {
        const text = "Ver [[mo";
        expect(linkSuggestions(text, text.length, FILES)?.items).toEqual([
            { name: "Mole", path: "Recetas/Mole.md", insert: "Recetas/Mole]]" },
            { name: "Mole", path: "Viajes/Mole.md", insert: "Viajes/Mole]]" },
        ]);
        const sup = "[[super";
        expect(linkSuggestions(sup, sup.length, FILES)?.items).toEqual([
            { name: "Súper", path: "Súper.md", insert: "Súper]]" },
        ]);
    });

    // ![[ suggests files too, by their file name.
    it("suggests files after ![[", () => {
        const text = "![[fo";
        expect(linkSuggestions(text, text.length, FILES)?.items).toEqual([
            { name: "foto.jpg", path: "attachments/foto.jpg", insert: "foto.jpg]]" },
        ]);
    });

    // A closed link, a new line, a |text or #heading being typed, or no match: no suggestions.
    it.each(["[[Súper]] y", "[[Sú\nper", "[[Súper|la", "[[Súper#Pa", "sin corchetes", "[[zzz"])(
        "none for %j",
        (text) => {
            expect(linkSuggestions(text, text.length, FILES)).toBeNull();
        },
    );
});

describe("newNotePath", () => {
    const existing = new Set(FILES.map((f) => f.path));

    it("adds .md and the folder", () => {
        expect(newNotePath("Recetas", "Tamales", existing)).toEqual({ path: "Recetas/Tamales.md" });
        expect(newNotePath("", " Lista.txt ", existing)).toEqual({ path: "Lista.txt" });
    });

    // Same name in any case: taken.
    it("says when the name is taken", () => {
        expect(newNotePath("", "súper", existing)).toEqual({ problem: "exists" });
    });

    it.each(["", "  ", "a/b", ".oculta", "x".repeat(101)])("refuses %j", (name) => {
        expect(newNotePath("", name, existing)).toEqual({ problem: "invalid" });
    });
});
