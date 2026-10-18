/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { fn } from "storybook/test";
import { describe, it, vi, expect } from "vitest";

import * as stories from "./ArtiseNoteView.stories";
import { ArtiseNoteView } from "./ArtiseNoteView";

const { Default } = composeStories(stories);

describe("ArtiseNoteView", () => {
    // The note's parts as elements: heading, list, tasks, quote, code.
    it("draws a note", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
        expect(screen.getByRole("heading", { level: 1, name: "Mole de la abuela" })).toBeVisible();
        expect(
            screen.getAllByRole("checkbox", { name: "Hecho" }).map((box) => (box as HTMLInputElement).checked),
        ).toEqual([true, false]);
    });

    // A [[link]] says which note it points to; one to a missing note gives null.
    it("opens links and embedded files", async () => {
        const onOpenLink = fn();
        const onOpenEmbed = fn();
        render(<Default onOpenLink={onOpenLink} onOpenEmbed={onOpenEmbed} />);
        await userEvent.click(screen.getByRole("button", { name: "la lista del súper" }));
        expect(onOpenLink).toHaveBeenCalledWith("Súper.md", "Súper");
        await userEvent.click(screen.getByRole("button", { name: "Flan" }));
        expect(onOpenLink).toHaveBeenCalledWith(null, "Flan");
        await userEvent.click(screen.getByRole("button", { name: "factura.pdf" }));
        expect(onOpenEmbed).toHaveBeenCalledWith("attachments/factura.pdf");
    });

    // Text that looks like HTML is shown as text, never as elements.
    it("shows HTML as text", () => {
        const { container } = render(
            <ArtiseNoteView
                document={[{ type: "paragraph", children: [{ type: "text", text: "<img src=x onerror=alert(1)>" }] }]}
                onOpenLink={vi.fn()}
                onOpenEmbed={vi.fn()}
                taskLabel="Hecho"
            />,
        );
        expect(container.querySelector("img")).toBeNull();
        expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
    });

    // Photos draw once their address is ready; until then their name holds the place.
    it("draws photos once they're ready", () => {
        const photo = {
            type: "embed" as const,
            target: "foto.jpg",
            path: "attachments/foto.jpg",
            name: "foto.jpg",
            image: true,
        };
        const { rerender } = render(
            <ArtiseNoteView
                document={[{ type: "paragraph", children: [photo] }]}
                onOpenLink={vi.fn()}
                onOpenEmbed={vi.fn()}
                taskLabel="Hecho"
            />,
        );
        expect(screen.queryByRole("img")).toBeNull();
        expect(screen.getByText("foto.jpg")).toBeVisible();
        rerender(
            <ArtiseNoteView
                document={[{ type: "paragraph", children: [{ ...photo, src: "blob:https://chat.artise.co/1" }] }]}
                onOpenLink={vi.fn()}
                onOpenEmbed={vi.fn()}
                taskLabel="Hecho"
            />,
        );
        expect(screen.getByRole("img", { name: "foto.jpg" })).toHaveAttribute("src", "blob:https://chat.artise.co/1");
    });
});
