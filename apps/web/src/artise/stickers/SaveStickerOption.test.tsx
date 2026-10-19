/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { vi, describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { type MatrixClient, MatrixEvent } from "matrix-js-sdk/src/matrix";
import { stubClient } from "test-utils";

import MatrixClientContext from "../../contexts/MatrixClientContext";
import Modal from "../../Modal";
import { SaveStickerOption } from "./SaveStickerOption";
import { USER_PACK_EVENT_TYPE } from "./imagePack";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const sticker = (content: Record<string, unknown>): MatrixEvent =>
    new MatrixEvent({ type: "m.sticker", room_id: "!r:x", sender: "@luis:x", content });

function renderWith(client: MatrixClient, event: MatrixEvent, onFinished = vi.fn()): void {
    render(
        <MatrixClientContext.Provider value={client}>
            <SaveStickerOption mxEvent={event} onFinished={onFinished} />
        </MatrixClientContext.Provider>,
    );
}

describe("SaveStickerOption", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));
    afterEach(() => Modal.forceCloseAllModals());

    // Someone's sticker joins the person's own pack, in their account.
    it("saves a received sticker to the person's own", async () => {
        const client = stubClient();
        vi.mocked(client.getAccountData).mockReturnValue(undefined);
        vi.mocked(client.setAccountData).mockResolvedValue({});
        renderWith(
            client,
            sticker({ body: "Gato bailando", url: "mxc://x/gato", info: { w: 200, h: 200, mimetype: "image/png" } }),
        );
        await userEvent.click(screen.getByRole("menuitem", { name: "Save to my stickers" }));
        await waitFor(() => expect(client.setAccountData).toHaveBeenCalled());
        expect(vi.mocked(client.setAccountData).mock.calls[0]).toEqual([
            USER_PACK_EVENT_TYPE,
            expect.objectContaining({
                images: {
                    sticker_1: {
                        url: "mxc://x/gato",
                        body: "Gato bailando",
                        info: { w: 200, h: 200, mimetype: "image/png", size: 0 },
                        usage: ["sticker"],
                    },
                },
            }),
        ]);
        expect(await screen.findByText("Saved to your stickers")).toBeVisible();
    });

    // A sticker they already have, or a message that isn't a sticker: no option.
    it("isn't offered when it doesn't fit", () => {
        const client = stubClient();
        vi.mocked(client.getAccountData).mockReturnValue(
            new MatrixEvent({
                type: USER_PACK_EVENT_TYPE,
                content: { images: { sticker_1: { url: "mxc://x/gato" } } },
            }),
        );
        renderWith(client, sticker({ body: "Gato", url: "mxc://x/gato" }));
        expect(screen.queryByRole("menuitem")).toBeNull();
        renderWith(client, new MatrixEvent({ type: "m.room.message", content: { msgtype: "m.text", body: "hola" } }));
        expect(screen.queryByRole("menuitem")).toBeNull();
    });
});
