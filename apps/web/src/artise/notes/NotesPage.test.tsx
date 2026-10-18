/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import fetchMock from "@fetch-mock/vitest";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { stubClient, mkStubRoom } from "test-utils";

import MatrixClientContext from "../../contexts/MatrixClientContext";
import { NotesPage } from "./NotesPage";
import { NotesHeaderButton, resetChatsWithNotes } from "./NotesHeaderButton";
import { notesHash } from "./notesLocation";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const BASE = "https://chat.mas-k8s.artise.co/api/notes/v1";
const ROOM = "!familia:mas-k8s.artise.co";
const ROOM_PATH = `${BASE}/chats/%21familia%3Amas-k8s.artise.co`;
const V = "1".padStart(40, "0");

// Element's real client stub with an Artise workspace file whose notes live at mas-k8s.
function artiseClient(): MatrixClient {
    const client = stubClient();
    client.getClientWellKnown = vi.fn().mockReturnValue({
        "co.artise.workspace": { name: "Prueba MAS", assistant_name: "Ari", links: { notes_api: BASE } },
    });
    client.getOpenIdToken = vi.fn().mockResolvedValue({
        access_token: "openid",
        token_type: "Bearer",
        matrix_server_name: "mas-k8s.artise.co",
        expires_in: 3600,
    });
    return client;
}

describe("Notes on the web", () => {
    let client: MatrixClient;

    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    beforeEach(() => {
        client = artiseClient();
        resetChatsWithNotes();
        fetchMock.get(
            `${ROOM_PATH}/tree`,
            {
                tree: "t1",
                files: [
                    { path: "Súper.md", version: V, size: 20, modified: 0, note: true },
                    { path: "Recetas/Mole.md", version: V, size: 20, modified: 0, note: true },
                ],
                folders: ["Recetas"],
            },
            { name: "tree" },
        );
        fetchMock.get(
            `begin:${ROOM_PATH}/note?path=S%C3%BAper.md`,
            { path: "Súper.md", version: V, content: "# Súper\n\n- [ ] leche\n\nVer [[Mole]]." },
            { name: "super" },
        );
        fetchMock.get(
            `begin:${ROOM_PATH}/note?path=Recetas%2FMole.md`,
            { path: "Recetas/Mole.md", version: V, content: "# Mole" },
            { name: "mole" },
        );
        fetchMock.get(`${BASE}/chats`, { chats: [{ id: ROOM, name: "Familia", tree: "t1" }] }, { name: "chats" });
    });

    afterEach(() => {
        for (const name of ["tree", "super", "mole", "chats"]) fetchMock.removeRoute(name);
        window.location.hash = "";
    });

    function renderWith(ui: React.ReactElement): void {
        render(<MatrixClientContext.Provider value={client}>{ui}</MatrixClientContext.Provider>);
    }

    // The address names a chat and a note: the page shows the list and the note, and asks with the OpenID token.
    it("shows the note in the address", async () => {
        window.location.hash = notesHash(ROOM, "Súper.md");
        renderWith(<NotesPage />);
        expect(await screen.findByRole("heading", { name: "Súper" })).toBeVisible();
        expect(screen.getByRole("navigation", { name: "Files" })).toBeVisible();
        expect(screen.getByRole("checkbox", { name: "Done" })).not.toBeChecked();
        expect(screen.getByRole("checkbox", { name: "Done" })).toBeEnabled();
        const call = fetchMock.callHistory.lastCall("super");
        expect(new Headers(call?.options.headers).get("Authorization")).toBe("Bearer openid");
    });

    // A [[link]] opens the other note and puts it in the address.
    it("follows a link to another note", async () => {
        window.location.hash = notesHash(ROOM, "Súper.md");
        renderWith(<NotesPage />);
        await userEvent.click(await screen.findByRole("button", { name: "Mole" }));
        expect(await screen.findByRole("heading", { name: "Mole" })).toBeVisible();
        expect(window.location.hash).toBe(notesHash(ROOM, "Recetas/Mole.md"));
    });

    // Edit and save through the page: the PUT carries the text and the version it was opened at.
    it("edits and saves a note", async () => {
        fetchMock.put(
            `${ROOM_PATH}/note`,
            { path: "Súper.md", version: "2".padStart(40, "0"), merged: false },
            { name: "save" },
        );
        window.location.hash = notesHash(ROOM, "Súper.md");
        renderWith(<NotesPage />);
        await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
        const box = screen.getByRole("textbox", { name: "The note's text" });
        await userEvent.clear(box);
        await userEvent.type(box, "# Lista");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByRole("heading", { name: "Lista" })).toBeVisible();
        const body = JSON.parse(fetchMock.callHistory.lastCall("save")?.options.body as string);
        expect(body).toEqual({ path: "Súper.md", content: "# Lista", base_version: V });
        fetchMock.removeRoute("save");
    });

    // Ticking a task saves it.
    it("ticks a task", async () => {
        fetchMock.put(
            `${ROOM_PATH}/note`,
            { path: "Súper.md", version: "2".padStart(40, "0"), merged: false },
            { name: "save" },
        );
        window.location.hash = notesHash(ROOM, "Súper.md");
        renderWith(<NotesPage />);
        await userEvent.click(await screen.findByRole("checkbox", { name: "Done" }));
        await waitFor(() => expect(fetchMock.callHistory.called("save")).toBe(true));
        const body = JSON.parse(fetchMock.callHistory.lastCall("save")?.options.body as string);
        expect(body.content).toBe("# Súper\n\n- [x] leche\n\nVer [[Mole]].");
        fetchMock.removeRoute("save");
    });

    // The header button shows for a chat in the Notes API's list and opens its notes.
    it("adds Notes to the header of a chat with notes", async () => {
        renderWith(<NotesHeaderButton roomId={ROOM} />);
        await userEvent.click(await screen.findByRole("button", { name: "Notes" }));
        expect(window.location.hash).toBe(notesHash(ROOM));
    });

    // A chat with the bot's co.artise.notes state has notes without asking the API.
    it("knows from the chat's notes state", async () => {
        const room = mkStubRoom("!otra:mas-k8s.artise.co", "Otra", client);
        vi.mocked(room.currentState.getStateEvents).mockImplementation(((type: string) =>
            type === "co.artise.notes" ? { getContent: () => ({ tree: "t" }) } : null) as never);
        vi.mocked(client.getRoom).mockReturnValue(room);
        renderWith(<NotesHeaderButton roomId="!otra:mas-k8s.artise.co" />);
        expect(screen.getByRole("button", { name: "Notes" })).toBeVisible();
    });

    // A chat without notes gets no button.
    it("leaves other chats' headers alone", async () => {
        renderWith(<NotesHeaderButton roomId="!sin-notas:mas-k8s.artise.co" />);
        await waitFor(() => expect(fetchMock.callHistory.called("chats")).toBe(true));
        expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    });

    // A server without the Notes API: no button, and no request.
    it("does nothing on a workspace without notes", () => {
        client.getClientWellKnown = vi.fn().mockReturnValue({ "co.artise.workspace": { name: "X" } });
        renderWith(<NotesHeaderButton roomId={ROOM} />);
        expect(screen.queryByRole("button")).toBeNull();
        expect(fetchMock.callHistory.called("chats")).toBe(false);
    });
});
