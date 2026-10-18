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

const { Default, File, Error, ChooseChat, Editing, Conflict, DeletedMeanwhile, Naming, UnsavedChanges, Merged } =
    composeStories(stories);

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

    // A note can be edited, and its tasks ticked from the page.
    it("offers to edit and ticks tasks", async () => {
        const edit = fn();
        const toggleTask = fn();
        render(<Default edit={edit} toggleTask={toggleTask} />);
        await userEvent.click(screen.getByRole("button", { name: "Editar" }));
        expect(edit).toHaveBeenCalled();
        await userEvent.click(screen.getAllByRole("checkbox", { name: "Hecho" })[1]);
        expect(toggleTask).toHaveBeenCalled();
    });

    // The editor: the text, the preview, and the [[link]] suggestions picked with the keyboard.
    it("edits with suggestions", async () => {
        const changeDraft = fn();
        const save = fn();
        render(<Editing changeDraft={changeDraft} save={save} />);
        const box = screen.getByRole("textbox", { name: "Texto de la nota" });
        expect(box).toHaveValue("- [ ] leche\n\nPara el [[Mo");
        expect(screen.getByRole("region", { name: "Vista previa" })).toBeVisible();
        expect(screen.getAllByRole("option")).toHaveLength(2);
        box.focus();
        (box as HTMLTextAreaElement).setSelectionRange(25, 25);
        await userEvent.keyboard("{ArrowDown}{Enter}");
        expect(changeDraft).toHaveBeenCalledWith("- [ ] leche\n\nPara el [[Viajes/Mole]]", 36);
        await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
        expect(save).toHaveBeenCalled();
    });

    // Ctrl+S saves from the text.
    it("saves with Ctrl+S", async () => {
        const save = fn();
        render(<Editing save={save} />);
        screen.getByRole("textbox", { name: "Texto de la nota" }).focus();
        await userEvent.keyboard("{Control>}s{/Control}");
        expect(save).toHaveBeenCalled();
    });

    // The same lines changed: both versions, and the three choices.
    it("shows both versions on a conflict", async () => {
        const keepMine = fn();
        const keepTheirs = fn();
        const combine = fn();
        render(<Conflict keepMine={keepMine} keepTheirs={keepTheirs} combine={combine} />);
        expect(screen.getByRole("region", { name: "Tu versión" }).textContent).toContain("pan dulce");
        expect(screen.getByRole("region", { name: "La otra versión" }).textContent).toContain("[x] pan");
        await userEvent.click(screen.getByRole("button", { name: "Quedarme con la mía" }));
        await userEvent.click(screen.getByRole("button", { name: "Quedarme con la otra" }));
        await userEvent.click(screen.getByRole("button", { name: "Combinar" }));
        expect([keepMine, keepTheirs, combine].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    });

    it("offers to keep a copy of a note deleted meanwhile", async () => {
        const keepCopy = fn();
        const discard = fn();
        render(<DeletedMeanwhile keepCopy={keepCopy} discard={discard} />);
        await userEvent.click(screen.getByRole("button", { name: "Conservar mi copia" }));
        await userEvent.click(screen.getByRole("button", { name: "Descartar mi cambio" }));
        expect([keepCopy.mock.calls.length, discard.mock.calls.length]).toEqual([1, 1]);
    });

    // Naming a new note: the problem with the name is tied to the field.
    it("names a new note", async () => {
        const createNote = fn();
        const changeName = fn();
        render(<Naming createNote={createNote} changeName={changeName} />);
        const field = screen.getByRole("textbox", { name: "Nombre" });
        expect(field).toHaveAttribute("aria-invalid", "true");
        expect(field).toHaveAccessibleDescription("Ya hay una nota con este nombre.");
        await userEvent.type(field, "s");
        expect(changeName).toHaveBeenCalledWith("Súpers");
        await userEvent.click(screen.getByRole("button", { name: "Crear" }));
        expect(createNote).toHaveBeenCalled();
    });

    it("asks before losing unsaved changes", async () => {
        const keepEditing = fn();
        const leaveWithoutSaving = fn();
        render(<UnsavedChanges keepEditing={keepEditing} leaveWithoutSaving={leaveWithoutSaving} />);
        expect(screen.getByRole("alertdialog")).toBeVisible();
        await userEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
        await userEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
        expect([keepEditing.mock.calls.length, leaveWithoutSaving.mock.calls.length]).toEqual([1, 1]);
    });

    it("says when other people's changes were combined in", () => {
        render(<Merged />);
        expect(
            screen.getByText("Otra persona cambió otras líneas mientras editabas. Se guardaron los dos cambios."),
        ).toBeVisible();
    });
});
