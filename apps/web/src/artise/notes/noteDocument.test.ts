/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect } from "vitest";

import { noteDocument, resolveTarget, isImagePath } from "./noteDocument";

const FILES = [
    "Súper.md",
    "Recetas/Mole.md",
    "Recetas/Postres/Flan.md",
    "Viajes/Mole.md",
    "attachments/foto.jpg",
    "attachments/factura.pdf",
    "attachments/dibujo.svg",
];

describe("resolveTarget", () => {
    // Obsidian's order: exact path, with .md, relative to the note's folder, then by name (shortest path).
    it.each([
        ["Súper", "Recetas/Mole.md", "Súper.md"],
        ["Recetas/Mole", "Súper.md", "Recetas/Mole.md"],
        ["Postres/Flan", "Recetas/Mole.md", "Recetas/Postres/Flan.md"],
        ["Flan", "Súper.md", "Recetas/Postres/Flan.md"],
        ["Mole", "Súper.md", "Recetas/Mole.md"],
        ["foto.jpg", "Súper.md", "attachments/foto.jpg"],
        ["súper", "Recetas/Mole.md", "Súper.md"],
        ["Nada", "Súper.md", null],
        ["Otro/Mole", "Súper.md", null],
    ])("%s from %s → %s", (target, from, expected) => {
        expect(resolveTarget(target, FILES, from)).toBe(expected);
    });
});

describe("isImagePath", () => {
    // SVG can carry scripts, so it's never drawn inline.
    it("draws photos but not SVG", () => {
        expect([isImagePath("a/foto.JPG"), isImagePath("x.webp"), isImagePath("d.svg"), isImagePath("f.pdf")]).toEqual([
            true,
            true,
            false,
            false,
        ]);
    });
});

describe("noteDocument", () => {
    // Headings, emphasis and line breaks as Obsidian shows them.
    it("reads headings, emphasis and line breaks", () => {
        expect(noteDocument("# Mole\n\nUn *poco* de **chile**\ny `sal`.", FILES, "Recetas/Mole.md")).toEqual([
            { type: "heading", level: 1, children: [{ type: "text", text: "Mole" }] },
            {
                type: "paragraph",
                children: [
                    { type: "text", text: "Un " },
                    { type: "emph", children: [{ type: "text", text: "poco" }] },
                    { type: "text", text: " de " },
                    { type: "strong", children: [{ type: "text", text: "chile" }] },
                    { type: "break" },
                    { type: "text", text: "y " },
                    { type: "code", text: "sal" },
                    { type: "text", text: "." },
                ],
            },
        ]);
    });

    // [[links]] with a shown text and a #heading, and one to a note that doesn't exist yet.
    it("reads [[links]]", () => {
        expect(noteDocument("Ver [[Súper|la lista]], [[Flan#Pasos]] y [[Nueva]].", FILES, "Recetas/Mole.md")).toEqual([
            {
                type: "paragraph",
                children: [
                    { type: "text", text: "Ver " },
                    { type: "noteLink", target: "Súper", path: "Súper.md", text: "la lista" },
                    { type: "text", text: ", " },
                    { type: "noteLink", target: "Flan", path: "Recetas/Postres/Flan.md", text: "Flan#Pasos" },
                    { type: "text", text: " y " },
                    { type: "noteLink", target: "Nueva", path: null, text: "Nueva" },
                    { type: "text", text: "." },
                ],
            },
        ]);
    });

    // ![[embeds]] by name and Markdown images by path; a PDF is a file, not a photo.
    it("reads embeds", () => {
        const doc = noteDocument(
            "![[foto.jpg]]\n\n![[factura.pdf]]\n\n![Playa](attachments/foto.jpg)",
            FILES,
            "Súper.md",
        );
        expect(doc).toEqual([
            {
                type: "paragraph",
                children: [
                    { type: "embed", target: "foto.jpg", path: "attachments/foto.jpg", name: "foto.jpg", image: true },
                ],
            },
            {
                type: "paragraph",
                children: [
                    {
                        type: "embed",
                        target: "factura.pdf",
                        path: "attachments/factura.pdf",
                        name: "factura.pdf",
                        image: false,
                    },
                ],
            },
            {
                type: "paragraph",
                children: [
                    {
                        type: "embed",
                        target: "attachments/foto.jpg",
                        path: "attachments/foto.jpg",
                        name: "Playa",
                        image: true,
                    },
                ],
            },
        ]);
    });

    // Tasks keep their tick and their line (to tick them); ordered lists keep their start.
    it("reads tasks and lists", () => {
        expect(noteDocument("- [ ] leche\n- [x] pan\n- huevos\n\n3. tres\n4. cuatro", FILES, "Súper.md")).toEqual([
            {
                type: "list",
                ordered: false,
                start: undefined,
                items: [
                    {
                        checked: false,
                        line: 1,
                        children: [{ type: "paragraph", children: [{ type: "text", text: "leche" }] }],
                    },
                    {
                        checked: true,
                        line: 2,
                        children: [{ type: "paragraph", children: [{ type: "text", text: "pan" }] }],
                    },
                    { children: [{ type: "paragraph", children: [{ type: "text", text: "huevos" }] }] },
                ],
            },
            {
                type: "list",
                ordered: true,
                start: 3,
                items: [
                    { children: [{ type: "paragraph", children: [{ type: "text", text: "tres" }] }] },
                    { children: [{ type: "paragraph", children: [{ type: "text", text: "cuatro" }] }] },
                ],
            },
        ]);
    });

    // Web links open outside; a Markdown link to a note is a note link (decoded, relative to the folder).
    it("reads web links and Markdown links to notes", () => {
        expect(
            noteDocument(
                "[web](https://artise.co) [flan](Postres/Flan.md) [s](S%C3%BAper.md)",
                FILES,
                "Recetas/Mole.md",
            ),
        ).toEqual([
            {
                type: "paragraph",
                children: [
                    { type: "link", href: "https://artise.co", children: [{ type: "text", text: "web" }] },
                    { type: "text", text: " " },
                    { type: "noteLink", target: "Postres/Flan.md", path: "Recetas/Postres/Flan.md", text: "flan" },
                    { type: "text", text: " " },
                    { type: "noteLink", target: "Súper.md", path: "Súper.md", text: "s" },
                ],
            },
        ]);
    });

    // Nothing in a note can run: raw HTML is text, javascript: links keep only their words,
    // and a photo on another site becomes a link instead of loading.
    it("keeps HTML as text and drops unsafe links", () => {
        const doc = noteDocument(
            "<script>alert(1)</script>\n\nHola <b>yo</b> [clic](javascript:alert(1)) ![x](https://tracker.example/p.png)",
            FILES,
            "Súper.md",
        );
        expect(doc).toEqual([
            { type: "paragraph", children: [{ type: "text", text: "<script>alert(1)</script>" }] },
            {
                type: "paragraph",
                children: [
                    { type: "text", text: "Hola <b>yo</b> clic " },
                    { type: "link", href: "https://tracker.example/p.png", children: [{ type: "text", text: "x" }] },
                ],
            },
        ]);
    });

    // A [[link]] split across commonmark's text pieces is still one link; code keeps [[ ]] as written.
    it("reads [[links]] next to brackets, but not in code", () => {
        expect(noteDocument("a [b] [[Súper]] `[[Súper]]`", FILES, "x.md")).toEqual([
            {
                type: "paragraph",
                children: [
                    { type: "text", text: "a [b] " },
                    { type: "noteLink", target: "Súper", path: "Súper.md", text: "Súper" },
                    { type: "text", text: " " },
                    { type: "code", text: "[[Súper]]" },
                ],
            },
        ]);
    });

    it("reads quotes, code blocks and rules", () => {
        expect(noteDocument("> dicho\n\n```\nlet a\n```\n\n---", FILES, "x.md")).toEqual([
            { type: "quote", children: [{ type: "paragraph", children: [{ type: "text", text: "dicho" }] }] },
            { type: "code", text: "let a" },
            { type: "rule" },
        ]);
    });
});
