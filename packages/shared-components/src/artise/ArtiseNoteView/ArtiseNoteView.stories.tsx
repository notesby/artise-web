/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtiseNoteView } from "./ArtiseNoteView";
import { type ArtiseNoteDocument } from "./types";

/** "Mole" as Familia's notes have it: heading, list with tasks, links and a photo. */
export const MOLE: ArtiseNoteDocument = [
    { type: "heading", level: 1, children: [{ type: "text", text: "Mole de la abuela" }] },
    {
        type: "paragraph",
        children: [
            { type: "text", text: "Para " },
            { type: "strong", children: [{ type: "text", text: "8 personas" }] },
            { type: "text", text: ". Las compras están en " },
            { type: "noteLink", target: "Súper", path: "Súper.md", text: "la lista del súper" },
            { type: "text", text: "; el postre, en " },
            { type: "noteLink", target: "Flan", path: null, text: "Flan" },
            { type: "text", text: "." },
        ],
    },
    {
        type: "list",
        ordered: false,
        items: [
            {
                checked: true,
                line: 5,
                children: [{ type: "paragraph", children: [{ type: "text", text: "Chiles mulatos" }] }],
            },
            {
                checked: false,
                line: 6,
                children: [{ type: "paragraph", children: [{ type: "text", text: "Chocolate" }] }],
            },
        ],
    },
    { type: "quote", children: [{ type: "paragraph", children: [{ type: "text", text: "Sin prisa: tres horas." }] }] },
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
    { type: "code", text: "1 kg de chile\n200 g de chocolate" },
];

const meta = {
    title: "Artise/ArtiseNoteView",
    component: ArtiseNoteView,
    tags: ["autodocs"],
    args: { document: MOLE, onOpenLink: fn(), onOpenEmbed: fn(), taskLabel: "Hecho" },
} satisfies Meta<typeof ArtiseNoteView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
