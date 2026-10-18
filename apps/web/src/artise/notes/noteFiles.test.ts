/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect } from "vitest";

import {
    folderContents,
    freeAttachmentPath,
    movedPath,
    moveTargets,
    newFolderPath,
    pathAfterFolderMove,
    renamedPath,
} from "./noteFiles";

const PATHS = [
    "Súper.md",
    "Recetas/Mole.md",
    "Recetas/Postres/Flan.md",
    "attachments/foto.jpg",
    "attachments/foto (2).jpg",
];
const FOLDERS = ["Recetas", "Recetas/Postres", "attachments", "Viajes"];

describe("renamedPath", () => {
    // A note renamed without .md keeps it; a file keeps its extension; folders take the name as typed.
    it.each([
        ["Recetas/Mole.md", "Mole poblano", false, "Recetas/Mole poblano.md"],
        ["Recetas/Mole.md", "Mole.txt", false, "Recetas/Mole.txt"],
        ["attachments/foto.jpg", "playa", false, "attachments/playa.jpg"],
        ["Recetas/Postres", "Dulces", true, "Recetas/Dulces"],
        ["Súper.md", "súper", false, "súper.md"],
    ])("%s → %s", (path, name, isFolder, expected) => {
        expect(renamedPath(path, name, isFolder, [...PATHS, ...FOLDERS])).toEqual({ path: expected });
    });

    it("says when the name is taken or can't be used", () => {
        expect(renamedPath("Viajes", "recetas", true, FOLDERS)).toEqual({ problem: "exists" });
        expect(renamedPath("Recetas/Mole.md", "Postres", true, [...PATHS, ...FOLDERS])).toEqual({ problem: "exists" });
        expect(renamedPath("Súper.md", "a/b", false, PATHS)).toEqual({ problem: "invalid" });
        expect(renamedPath("Súper.md", ".oculta", false, PATHS)).toEqual({ problem: "invalid" });
    });
});

describe("moving", () => {
    it("keeps the name", () => {
        expect(movedPath("Recetas/Mole.md", "")).toBe("Mole.md");
        expect(movedPath("Súper.md", "Viajes")).toBe("Viajes/Súper.md");
    });

    // A folder can't go inside itself; where it is now is marked.
    it("lists where a folder can go", () => {
        expect(moveTargets("Recetas", true, FOLDERS)).toEqual([
            { path: "", here: true },
            { path: "attachments", here: false },
            { path: "Viajes", here: false },
        ]);
        expect(moveTargets("Recetas/Mole.md", false, FOLDERS).find((t) => t.here)?.path).toBe("Recetas");
    });

    it("moves paths inside a moved folder", () => {
        expect(pathAfterFolderMove("Recetas/Postres/Flan.md", "Recetas", "Cocina/Recetas")).toBe(
            "Cocina/Recetas/Postres/Flan.md",
        );
        expect(pathAfterFolderMove("Recetas2/x.md", "Recetas", "Cocina")).toBe("Recetas2/x.md");
    });
});

describe("newFolderPath", () => {
    it("makes folders inside others with /", () => {
        expect(newFolderPath(" Cocina / Postres ", FOLDERS)).toEqual({ path: "Cocina/Postres" });
    });

    it.each(["", "a//b", ".trash", "a/../b", "x".repeat(101)])("refuses %j", (name) => {
        expect(newFolderPath(name, FOLDERS)).toEqual({ problem: "invalid" });
    });

    it("says when it's taken", () => {
        expect(newFolderPath("recetas", FOLDERS)).toEqual({ problem: "exists" });
    });
});

describe("freeAttachmentPath", () => {
    // A taken name gets the next number, as the phones do.
    it("picks a free name in attachments/", () => {
        expect(freeAttachmentPath("factura.pdf", PATHS)).toBe("attachments/factura.pdf");
        expect(freeAttachmentPath("foto.jpg", PATHS)).toBe("attachments/foto (3).jpg");
        expect(freeAttachmentPath("../.secreto", PATHS)).toBe("attachments/secreto");
    });
});

describe("folderContents", () => {
    it("counts notes, files and subfolders inside", () => {
        const files = PATHS.map((path) => ({ path, note: path.endsWith(".md") }));
        expect(folderContents("Recetas", files, FOLDERS)).toEqual({ notes: 2, files: 0, folders: 1 });
        expect(folderContents("attachments", files, FOLDERS)).toEqual({ notes: 0, files: 2, folders: 0 });
    });
});
