/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { type ConfigOptions } from "../../config.js";
import { workspaceConfig } from "./workspaceConfig.js";

const PACKAGED = {
    brand: "Artise",
    help_url: "https://artise.co/help",
    web_base_url: "https://chat.mas-k8s.artise.co/",
    default_server_config: { "m.homeserver": { base_url: "https://matrix.mas-k8s.artise.co" } },
    disable_guests: true,
} as ConfigOptions;

const WORKSPACE = {
    serverName: "artise.co",
    homeserverUrl: "https://matrix.artise.co",
    issuer: "https://auth.artise.co",
    desktopClientId: "01K7ARTSEAPPDESKT0P0000000",
    webUrl: "https://chat.artise.co",
};

describe("workspaceConfig", () => {
    const config = workspaceConfig(PACKAGED, WORKSPACE);

    it("points Element Web at the workspace's homeserver, and only that one", () => {
        expect(config.default_server_config).toEqual({
            "m.homeserver": { base_url: "https://matrix.artise.co", server_name: "artise.co" },
        });
        expect(config.disable_custom_urls).toBe(true);
    });

    it("uses the desktop's static client on the workspace's MAS", () => {
        // Keyed with a trailing slash, as Element looks it up.
        expect(config.oidc_static_clients).toEqual({
            "https://auth.artise.co/": { client_id: "01K7ARTSEAPPDESKT0P0000000" },
        });
    });

    it("leaves Element to register a client when the workspace doesn't list the desktop's", () => {
        const { desktopClientId: _, ...withoutClient } = WORKSPACE;
        expect(workspaceConfig(PACKAGED, withoutClient).oidc_static_clients).toBeUndefined();
    });

    it("goes straight to the workspace's sign-in: the person already chose it", () => {
        expect(config.sso_redirect_options).toEqual({ on_welcome_page: true });
    });

    it("shares links on the workspace's own site", () => {
        expect(config.web_base_url).toBe("https://chat.artise.co/");
    });

    it("keeps the rest of the packaged config", () => {
        expect(config).toMatchObject({ brand: "Artise", help_url: "https://artise.co/help", disable_guests: true });
    });
});
