/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { fn } from "storybook/test";

import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArtiseNotesView } from "./ArtiseNotesView";
import { useMockedViewModel } from "../../core/viewmodel";
import { withViewDocs } from "../../../.storybook/withViewDocs";
import { MOLE } from "../ArtiseNoteView/ArtiseNoteView.stories";
import { type ArtiseNotesViewActions, type ArtiseNotesViewSnapshot } from "./types";

type ArtiseNotesProps = ArtiseNotesViewSnapshot & ArtiseNotesViewActions;

const ACTIONS: (keyof ArtiseNotesViewActions)[] = [
    "back",
    "retry",
    "chooseChat",
    "select",
    "toggleFolder",
    "openLink",
    "openEmbed",
    "download",
    "openFile",
    "edit",
    "changeDraft",
    "save",
    "cancelEdit",
    "toggleTask",
    "newNote",
    "changeName",
    "createNote",
    "cancelNaming",
    "keepMine",
    "keepTheirs",
    "combine",
    "keepCopy",
    "discard",
    "keepEditing",
    "leaveWithoutSaving",
    "dismissNotice",
];

const ArtiseNotesViewWrapperImpl = (props: ArtiseNotesProps): JSX.Element => {
    const snapshot = { ...props } as Partial<ArtiseNotesProps>;
    const actions = {} as Record<string, unknown>;
    for (const key of ACTIONS) {
        actions[key] = props[key];
        delete snapshot[key];
    }
    const vm = useMockedViewModel(snapshot as ArtiseNotesViewSnapshot, actions as unknown as ArtiseNotesViewActions);
    return <ArtiseNotesView vm={vm} />;
};
const ArtiseNotesViewWrapper = withViewDocs(ArtiseNotesViewWrapperImpl, ArtiseNotesView);

const MINE = "- [ ] leche\n- [ ] pan dulce";
const THEIRS = "- [ ] leche\n- [x] pan";

const meta = {
    title: "Artise/ArtiseNotesView",
    component: ArtiseNotesViewWrapper,
    tags: ["autodocs"],
    args: {
        title: "Notas",
        chatName: "Familia",
        state: "ready",
        items: [
            { path: "Recetas", name: "Recetas", depth: 0, kind: "folder", expanded: true },
            { path: "Recetas/Postres", name: "Postres", depth: 1, kind: "folder", expanded: false },
            { path: "Recetas/Mole.md", name: "Mole", depth: 1, kind: "note" },
            { path: "attachments", name: "attachments", depth: 0, kind: "folder", expanded: false },
            { path: "Súper.md", name: "Súper", depth: 0, kind: "note" },
        ],
        selectedPath: "Recetas/Mole.md",
        content: { kind: "note", path: "Recetas/Mole.md", title: "Mole", document: MOLE },
        privacyText:
            "Ari puede leer las notas de este chat, así que se guardan en el servidor de Artise, sin el cifrado de extremo a extremo de tus mensajes.",
        labels: {
            back: "Volver al chat",
            retry: "Reintentar",
            tree: "Archivos",
            task: "Hecho",
            download: "Descargar",
            open: "Abrir",
            chooseChat: "Elige un chat para ver sus notas.",
            edit: "Editar",
            save: "Guardar",
            cancel: "Cancelar",
            editor: "Texto de la nota",
            preview: "Vista previa",
            suggestions: "Notas y archivos",
            newNote: "Nueva nota",
            name: "Nombre",
            create: "Crear",
            mine: "Tu versión",
            theirs: "La otra versión",
            keepMine: "Quedarme con la mía",
            keepTheirs: "Quedarme con la otra",
            combine: "Combinar",
            keepCopy: "Conservar mi copia",
            discard: "Descartar mi cambio",
            keepEditing: "Seguir editando",
            leave: "Salir sin guardar",
        },
        ...(Object.fromEntries(ACTIONS.map((key) => [key, fn()])) as unknown as ArtiseNotesViewActions),
    },
} satisfies Meta<typeof ArtiseNotesViewWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Familia's notes with "Mole" open. */
export const Default: Story = {};

/** A PDF picked in the list: open it in a new tab or download it. */
export const File: Story = {
    args: {
        selectedPath: "attachments/factura.pdf",
        content: {
            kind: "file",
            path: "attachments/factura.pdf",
            title: "factura.pdf",
            text: "Ábrelo en una pestaña nueva o descárgalo.",
            canOpen: true,
        },
    },
};

/** The list couldn't load. */
export const Error: Story = {
    args: { state: "error", errorText: "Esto necesita conexión. Inténtalo cuando tengas internet." },
};

/** Opened without a chat: the chats with notes. */
export const ChooseChat: Story = {
    args: {
        chatName: "",
        chats: [
            { id: "!familia:artise.co", name: "Familia" },
            { id: "!casa:artise.co", name: "Casa" },
        ],
    },
};

/** Editing "Súper", typing a [[link]]: the notes it could be, and the preview. */
export const Editing: Story = {
    args: {
        selectedPath: "Súper.md",
        editor: {
            path: "Súper.md",
            title: "Súper",
            draft: "- [ ] leche\n\nPara el [[Mo",
            preview: [
                {
                    type: "list",
                    ordered: false,
                    items: [
                        {
                            checked: false,
                            children: [{ type: "paragraph", children: [{ type: "text", text: "leche" }] }],
                        },
                    ],
                },
                { type: "paragraph", children: [{ type: "text", text: "Para el [[Mo" }] },
            ],
            dirty: true,
            saving: false,
            suggestions: {
                from: 23,
                items: [
                    { name: "Mole", path: "Recetas/Mole.md", insert: "Recetas/Mole]]" },
                    { name: "Mole", path: "Viajes/Mole.md", insert: "Viajes/Mole]]" },
                ],
            },
        },
    },
};

/** Someone else changed the same lines: both versions, and what to keep. */
export const Conflict: Story = {
    args: {
        selectedPath: "Súper.md",
        choice: {
            kind: "conflict",
            text: "Otra persona cambió las mismas líneas mientras editabas.",
            mine: MINE,
            theirs: THEIRS,
        },
    },
};

/** Someone deleted the note while it was being edited. */
export const DeletedMeanwhile: Story = {
    args: {
        selectedPath: "Súper.md",
        choice: { kind: "deleted", text: "Otra persona borró esta nota mientras la editabas.", mine: MINE },
    },
};

/** Naming a new note, with a name that's taken. */
export const Naming: Story = {
    args: { naming: { name: "Súper", error: "Ya hay una nota con este nombre.", saving: false } },
};

/** Leaving with unsaved changes. */
export const UnsavedChanges: Story = {
    args: {
        selectedPath: "Súper.md",
        confirmLeave: { text: "Tienes cambios sin guardar. ¿Salir sin guardarlos?" },
        editor: {
            path: "Súper.md",
            title: "Súper",
            draft: MINE,
            preview: [],
            dirty: true,
            saving: false,
        },
    },
};

/** Saved, and other people's changes on other lines were combined in. */
export const Merged: Story = {
    args: { notice: "Otra persona cambió otras líneas mientras editabas. Se guardaron los dos cambios." },
};
