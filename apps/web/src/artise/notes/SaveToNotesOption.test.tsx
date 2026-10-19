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
import { type MatrixClient, MatrixEvent } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import MatrixClientContext from "../../contexts/MatrixClientContext";
import Modal from "../../Modal";
import { SaveToNotesOption, messageText } from "./SaveToNotesOption";
import { resetChatsWithNotes } from "./NotesHeaderButton";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const BASE = "https://chat.mas-k8s.artise.co/api/notes/v1";
const ROOM = "!familia:mas-k8s.artise.co";

function message(content: Record<string, unknown>, extra: Record<string, unknown> = {}): MatrixEvent {
    return new MatrixEvent({
        type: "m.room.message",
        room_id: ROOM,
        sender: "@ana:mas-k8s.artise.co",
        origin_server_ts: new Date(2026, 9, 18, 9, 5).getTime(),
        content,
        ...extra,
    });
}

describe("messageText", () => {
    // Text, notices and emotes are saved; their reply quote is left out.
    it("takes a message's own words", () => {
        expect(messageText(message({ msgtype: "m.text", body: "Comprar pan" }))).toBe("Comprar pan");
        expect(
            messageText(
                message({
                    "msgtype": "m.text",
                    "body": "> <@luis:x> ¿Qué falta?\n\nComprar pan",
                    "m.relates_to": { "m.in_reply_to": { event_id: "$q" } },
                }),
            ),
        ).toBe("Comprar pan");
        // A message that quotes on purpose (not a reply) keeps its quote.
        expect(messageText(message({ msgtype: "m.text", body: "> dicho\nyo" }))).toBe("> dicho\nyo");
    });

    it("skips what isn't text", () => {
        expect(messageText(message({ msgtype: "m.image", body: "foto.jpg" }))).toBeNull();
        expect(messageText(message({ msgtype: "m.text", body: "   " }))).toBeNull();
        expect(messageText(new MatrixEvent({ type: "m.reaction", content: {} }))).toBeNull();
    });
});

describe("SaveToNotesOption", () => {
    let client: MatrixClient;

    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    beforeEach(() => {
        resetChatsWithNotes();
        client = stubClient();
        client.getClientWellKnown = vi.fn().mockReturnValue({ "co.artise.workspace": { links: { notes_api: BASE } } });
        client.getOpenIdToken = vi.fn().mockResolvedValue({
            access_token: "openid",
            token_type: "Bearer",
            matrix_server_name: "mas-k8s.artise.co",
            expires_in: 3600,
        });
        fetchMock.get(`${BASE}/chats`, { chats: [{ id: ROOM, name: "Familia", tree: "t" }] }, { name: "chats" });
        fetchMock.put(
            `${BASE}/chats/%21familia%3Amas-k8s.artise.co/note`,
            { status: 201, body: { path: "Saved messages/2026-10-18 0905 Ana.md", version: "v", merged: false } },
            { name: "save" },
        );
    });

    afterEach(() => {
        fetchMock.removeRoute("chats");
        fetchMock.removeRoute("save");
        Modal.forceCloseAllModals();
    });

    // In a chat with notes: saved as Android writes it, then a dialog says so.
    it("saves the message as a note", async () => {
        const onFinished = vi.fn();
        const event = message({ msgtype: "m.text", body: "Comprar pan" });
        vi.spyOn(event, "sender", "get").mockReturnValue({ name: "Ana" } as never);
        render(
            <MatrixClientContext.Provider value={client}>
                <SaveToNotesOption mxEvent={event} onFinished={onFinished} />
            </MatrixClientContext.Provider>,
        );
        await userEvent.click(await screen.findByRole("menuitem", { name: "Save to Notes" }));
        expect(onFinished).toHaveBeenCalled();
        await waitFor(() => expect(fetchMock.callHistory.called("save")).toBe(true));
        expect(JSON.parse(fetchMock.callHistory.lastCall("save")?.options.body as string)).toEqual({
            path: "Saved messages/2026-10-18 0905 Ana.md",
            content: "> Comprar pan\n\n— Ana, 18/10/2026 09:05\n",
            base_version: null,
        });
        expect(await screen.findByText("Saved to this chat's Notes")).toBeVisible();
    });

    // A chat without notes: no option.
    it("isn't offered in a chat without notes", async () => {
        const event = message({ msgtype: "m.text", body: "hola" }, { room_id: "!otra:x" });
        render(
            <MatrixClientContext.Provider value={client}>
                <SaveToNotesOption mxEvent={event} onFinished={vi.fn()} />
            </MatrixClientContext.Provider>,
        );
        await waitFor(() => expect(fetchMock.callHistory.called("chats")).toBe(true));
        expect(screen.queryByRole("menuitem")).toBeNull();
    });
});
