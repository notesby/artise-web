/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import fetchMock from "@fetch-mock/vitest";
import { clientAndSDKContextRenderOptions, createTestClient, TestSDKContext } from "test-utils";
import { type IClientWellKnown } from "matrix-js-sdk/src/matrix";

import { RoomListPanel } from "../../components/views/rooms/RoomListPanel/RoomListPanel";
import { MetaSpace } from "../../stores/spaces";
import { ReleaseAnnouncementStore } from "../../stores/ReleaseAnnouncementStore";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

vi.spyOn(ReleaseAnnouncementStore.instance, "getReleaseAnnouncement").mockReturnValue(null);

const MAS_K8S: IClientWellKnown = {
    "m.homeserver": { base_url: "https://matrix.mas-k8s.artise.co" },
    "co.artise.workspace": { name: "Prueba MAS" },
};

// Element's chat list panel with the Artise hook, on a client whose server is (or isn't) an Artise workspace.
describe("Artise's workspace bar in the chat list", () => {
    const client = createTestClient();
    const sdkContext = new TestSDKContext();
    sdkContext._client = client;
    const assign = vi.fn();

    function renderPanel(wellKnown: IClientWellKnown): void {
        vi.mocked(client.getClientWellKnown).mockReturnValue(wellKnown);
        render(<RoomListPanel activeSpace={MetaSpace.Home} />, clientAndSDKContextRenderOptions(client, sdkContext));
    }

    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    beforeEach(() => {
        client.getClientWellKnown = vi.fn();
        client.getDomain = vi.fn().mockReturnValue("mas-k8s.artise.co");
        client.getOpenIdToken = vi.fn().mockResolvedValue({
            access_token: "openid-token",
            token_type: "Bearer",
            matrix_server_name: "mas-k8s.artise.co",
            expires_in: 3600,
        });
        vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign });
        fetchMock.get(
            "https://api.artise.co/v1/workspaces?server_name=mas-k8s.artise.co",
            {
                workspaces: [
                    { name: "Prueba MAS", server_name: "mas-k8s.artise.co", web_url: "https://chat.mas-k8s.artise.co" },
                    { name: "Artise", server_name: "artise.co", web_url: "https://chat.artise.co" },
                ],
            },
            { name: "artise-workspaces" },
        );
    });

    afterEach(() => {
        fetchMock.removeRoute("artise-workspaces");
        vi.restoreAllMocks();
        vi.spyOn(ReleaseAnnouncementStore.instance, "getReleaseAnnouncement").mockReturnValue(null);
    });

    // An Artise workspace: its name is above the chat list, and the menu opens another workspace's site.
    it("shows the workspace's name and switches to another workspace", async () => {
        const user = userEvent.setup();
        renderPanel(MAS_K8S);
        const button = await screen.findByRole("button", { name: "Change workspace (now: Prueba MAS)" });
        await user.click(button);
        await user.click(screen.getByRole("menuitem", { name: "Artise" }));
        expect(assign).toHaveBeenCalledWith("https://chat.artise.co");
    });

    // Not an Artise workspace: Element's panel as it was.
    it("isn't there on a server that isn't an Artise workspace", () => {
        renderPanel({ "m.homeserver": { base_url: "https://matrix.org" } });
        expect(screen.queryByTestId("artise-workspace-bar")).toBeNull();
    });
});
