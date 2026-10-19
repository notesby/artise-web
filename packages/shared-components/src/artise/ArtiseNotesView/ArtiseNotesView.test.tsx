/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { render, screen, within } from "@test-utils";
import { composeStories } from "@storybook/react-vite";
import React from "react";
import userEvent from "@testing-library/user-event";
import { fn } from "storybook/test";
import { describe, it, expect } from "vitest";

import * as stories from "./ArtiseNotesView.stories";

const {
    Default,
    File,
    Error,
    ChooseChat,
    Editing,
    Conflict,
    DeletedMeanwhile,
    Naming,
    UnsavedChanges,
    Merged,
    Moving,
    DeletingPhoto,
    NewFolder,
    Renaming,
    Uploading,
    WithBacklinks,
    History,
    OldVersion,
    Searching,
    NothingFound,
} = composeStories(stories);

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

    // Each row has its menu: rename, move, delete.
    it("offers rename, move and delete on a row", async () => {
        const rename = fn();
        const move = fn();
        const remove = fn();
        render(<Default rename={rename} move={move} remove={remove} />);
        await userEvent.click(screen.getByRole("button", { name: "Más acciones: Súper" }));
        await userEvent.click(screen.getByRole("menuitem", { name: "Cambiar nombre" }));
        expect(rename).toHaveBeenCalledWith("Súper.md");
        await userEvent.click(screen.getByRole("button", { name: "Más acciones: Recetas" }));
        await userEvent.click(screen.getByRole("menuitem", { name: "Mover" }));
        expect(move).toHaveBeenCalledWith("Recetas");
        await userEvent.click(screen.getByRole("button", { name: "Más acciones: Mole" }));
        await userEvent.click(screen.getByRole("menuitem", { name: "Borrar" }));
        expect(remove).toHaveBeenCalledWith("Recetas/Mole.md");
    });

    // Moving: where it is now can't be picked; another folder can.
    it("picks a folder to move to", async () => {
        const confirmAction = fn();
        render(<Moving confirmAction={confirmAction} />);
        expect(screen.getByRole("button", { name: /Recetas Está aquí ahora/ })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "Notas (nivel principal)" }));
        expect(confirmAction).toHaveBeenCalledWith("");
    });

    it("confirms a delete", async () => {
        const confirmAction = fn();
        render(<DeletingPhoto confirmAction={confirmAction} />);
        expect(screen.getByRole("alertdialog", { name: "¿Borrar “foto.jpg”?" }).textContent).toContain(
            "Se muestra o enlaza en: Mole.",
        );
        await userEvent.click(screen.getByRole("button", { name: "Borrar" }));
        expect(confirmAction).toHaveBeenCalled();
    });

    it("names a new folder", async () => {
        const confirmAction = fn();
        render(<NewFolder confirmAction={confirmAction} />);
        expect(screen.getByRole("textbox", { name: "Nombre de la carpeta" })).toHaveValue("Cocina/Postres");
        await userEvent.click(screen.getByRole("button", { name: "Crear" }));
        expect(confirmAction).toHaveBeenCalled();
    });

    it("ties a rename's problem to its field", () => {
        render(<Renaming />);
        expect(screen.getByRole("textbox", { name: "Cambiar nombre" })).toHaveAccessibleDescription(
            "Ya hay una nota o un archivo con ese nombre ahí.",
        );
    });

    // Files picked with "Agregar archivo" go to the view model; in the editor, they go into the note.
    it("uploads files from the list and the editor", async () => {
        const upload = fn();
        const attach = fn();
        const file = new window.File(["x"], "foto.jpg", { type: "image/jpeg" });
        const { unmount } = render(<Default upload={upload} />);
        await userEvent.upload(screen.getByTestId("artise-notes-file-input"), file);
        expect(upload).toHaveBeenCalledWith([file]);
        unmount();
        render(<Editing attach={attach} />);
        // The list's picker comes first, then the editor's.
        await userEvent.upload(screen.getAllByTestId("artise-notes-file-input")[1], file);
        expect(attach).toHaveBeenCalledWith([file]);
    });

    it("says while an upload runs", () => {
        render(<Uploading />);
        expect(screen.getByRole("status")).toHaveTextContent("Subiendo “foto.jpg”…");
    });

    // "Enlazada desde": each note that links here opens it.
    it("lists the notes that link here", async () => {
        const select = fn();
        render(<WithBacklinks select={select} />);
        const region = screen.getByRole("region", { name: "Enlazada desde" });
        expect(region.textContent).toContain("Para el [[Mole]] faltan chiles.");
        await userEvent.click(within(region).getByRole("button", { name: /^Flan/ }));
        expect(select).toHaveBeenCalledWith("Recetas/Postres/Flan.md");
    });

    // History: open it from the note, pick a version, restore it, or go back.
    it("shows the history and opens a version", async () => {
        const openHistory = fn();
        const { unmount } = render(<Default openHistory={openHistory} />);
        await userEvent.click(screen.getByRole("button", { name: "Historial" }));
        expect(openHistory).toHaveBeenCalled();
        unmount();
        const viewVersion = fn();
        const closeHistory = fn();
        render(<History viewVersion={viewVersion} closeHistory={closeHistory} />);
        await userEvent.click(screen.getByRole("button", { name: /^Ari · 17 oct 2026/ }));
        expect(viewVersion).toHaveBeenCalledWith("93b2");
        await userEvent.click(screen.getByRole("button", { name: "Volver a la nota" }));
        expect(closeHistory).toHaveBeenCalled();
    });

    it("restores an old version", async () => {
        const restoreVersion = fn();
        render(<OldVersion restoreVersion={restoreVersion} />);
        expect(screen.getByText("La nota como estaba el 17 oct 2026, 20:11, por Ari.")).toBeVisible();
        await userEvent.click(screen.getByRole("button", { name: "Restaurar esta versión" }));
        expect(restoreVersion).toHaveBeenCalled();
    });

    // Search: typing goes to the view model; results replace the list and open notes.
    it("searches", async () => {
        const changeSearch = fn();
        const { unmount } = render(<Default changeSearch={changeSearch} />);
        await userEvent.type(screen.getByRole("searchbox", { name: "Buscar en las notas" }), "c");
        expect(changeSearch).toHaveBeenCalledWith("c");
        unmount();
        const select = fn();
        const clearSearch = fn();
        render(<Searching select={select} clearSearch={clearSearch} />);
        expect(screen.queryByRole("button", { name: "Súper" })).toBeNull();
        await userEvent.click(screen.getByRole("button", { name: /^Mole/ }));
        expect(select).toHaveBeenCalledWith("Recetas/Mole.md");
        await userEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));
        expect(clearSearch).toHaveBeenCalled();
    });

    it("says when nothing was found", () => {
        render(<NothingFound />);
        expect(screen.getByRole("status")).toHaveTextContent("No se encontró nada para “zzz”.");
    });
});
