/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { render, screen } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { fn } from "storybook/test";
import { describe, it, expect } from "vitest";

import * as stories from "./ArtiseNotesView.stories";

const { Default, File, Error, ChooseChat } = composeStories(stories);

describe("ArtiseNotesView", () => {
    // Familia's notes: the list, the open note, and who can read them.
    it("shows the list and the open note", () => {
        const { container } = render(<Default />);
        expect(container).toMatchSnapshot();
        expect(screen.getByRole("navigation", { name: "Archivos" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Mole" })).toHaveAttribute("aria-current", "page");
        expect(screen.getByRole("heading", { name: "Mole de la abuela" })).toBeVisible();
        expect(screen.getByText(/Ari puede leer las notas/)).toBeVisible();
    });

    // Folders open and close; notes are picked.
    it("tells the view model what was pressed in the list", async () => {
        const select = fn();
        const toggleFolder = fn();
        render(<Default select={select} toggleFolder={toggleFolder} />);
        const postres = screen.getByRole("button", { name: "Postres" });
        expect(postres).toHaveAttribute("aria-expanded", "false");
        await userEvent.click(postres);
        expect(toggleFolder).toHaveBeenCalledWith("Recetas/Postres");
        await userEvent.click(screen.getByRole("button", { name: "Súper" }));
        expect(select).toHaveBeenCalledWith("Súper.md");
    });

    // A PDF: open in a new tab or download.
    it("offers to open or download a file", async () => {
        const openFile = fn();
        const download = fn();
        render(<File openFile={openFile} download={download} />);
        await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
        expect(openFile).toHaveBeenCalledWith("attachments/factura.pdf");
        await userEvent.click(screen.getByRole("button", { name: "Descargar" }));
        expect(download).toHaveBeenCalledWith("attachments/factura.pdf");
    });

    it("says what went wrong and retries", async () => {
        const retry = fn();
        render(<Error retry={retry} />);
        expect(screen.getByRole("alert")).toHaveTextContent(
            "Esto necesita conexión. Inténtalo cuando tengas internet.",
        );
        await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
        expect(retry).toHaveBeenCalled();
    });

    it("lists the chats when none is picked", async () => {
        const chooseChat = fn();
        render(<ChooseChat chooseChat={chooseChat} />);
        await userEvent.click(screen.getByRole("button", { name: "Casa" }));
        expect(chooseChat).toHaveBeenCalledWith("!casa:artise.co");
    });

    it("goes back", async () => {
        const back = fn();
        render(<Default back={back} />);
        await userEvent.click(screen.getByRole("button", { name: "Volver al chat" }));
        expect(back).toHaveBeenCalled();
    });
});
