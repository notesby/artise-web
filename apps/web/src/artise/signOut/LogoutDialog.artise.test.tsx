/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React from "react";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";
import { render, screen } from "test-utils-rtl";
import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, type MockedObject } from "vitest";
import { getMockClientWithEventEmitter, mockClientMethodsCrypto, mockClientMethodsUser } from "test-utils";

import LogoutDialog from "../../components/views/dialogs/LogoutDialog";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

// Element's sign-out dialog with the Artise hook, on a workspace with and without Artise's file.
describe("Artise's words in the sign-out dialog", () => {
    let mockClient: MockedObject<MatrixClient>;

    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    beforeEach(() => {
        mockClient = getMockClientWithEventEmitter({
            ...mockClientMethodsCrypto(),
            ...mockClientMethodsUser(),
            getClientWellKnown: vi.fn(),
        });
        // No encryption: the plain confirmation, the one most people see.
        vi.mocked(mockClient.getCrypto).mockReturnValue(undefined);
    });

    // An Artise workspace: "Sign out of Prueba MAS?" and what it does in this browser; the button stays "Sign out".
    it("names the workspace", async () => {
        mockClient.getClientWellKnown.mockReturnValue({ "co.artise.workspace": { name: "Prueba MAS" } });
        render(<LogoutDialog onFinished={vi.fn()} />);
        // The spinner shown first has the same title; wait for the confirmation's sentence.
        expect(
            await screen.findByText(
                "Your chats in Prueba MAS will no longer show in this browser. You can sign back in anytime.",
            ),
        ).toBeVisible();
        expect(screen.getByText("Sign out of Prueba MAS?")).toBeVisible();
        expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    });

    // Another server: Artise's words for Element's texts, no workspace name.
    it("keeps the plain texts elsewhere", async () => {
        mockClient.getClientWellKnown.mockReturnValue({ "m.homeserver": { base_url: "https://matrix.org" } });
        render(<LogoutDialog onFinished={vi.fn()} />);
        expect(await screen.findByText("Are you sure you want to sign out?")).toBeVisible();
    });
});
