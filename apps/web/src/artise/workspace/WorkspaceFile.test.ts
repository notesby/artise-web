/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect } from "vitest";
import { type IClientWellKnown, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { getWorkspaceFile, parseWorkspaceFile, WORKSPACE_WK_KEY } from "./WorkspaceFile";

// The two live workspace files as they were on 2026-10-18 (feature lists left out).
const ARTISE_CO: IClientWellKnown = {
    "m.homeserver": { base_url: "https://matrix.artise.co" },
    "co.artise.workspace": {
        version: 1,
        name: "Artise",
        assistant_name: "Ari",
        language: "es",
        push_gateway: "https://push.artise.co/_matrix/push/v1/notify",
        links: {
            web: "https://chat.artise.co",
            notes_api: "https://chat.artise.co/api/notes/v1",
            delete_account: "https://chat.artise.co/account/delete",
        },
        oauth: { ios: "01K7ARTSEAPP1PH0NE00000000", redirect_uri: "https://join.artise.co/oauth" },
    },
};

const MAS_K8S: IClientWellKnown = {
    "m.homeserver": { base_url: "https://matrix.mas-k8s.artise.co" },
    "co.artise.workspace": {
        version: 1,
        name: "Prueba MAS",
        assistant_name: "Ari",
        language: "es",
        links: {
            web: "https://chat.mas-k8s.artise.co",
            notes_api: "https://chat.mas-k8s.artise.co/api/notes/v1",
            invites_api: "https://chat.mas-k8s.artise.co/api/invites/v1",
            delete_account: "https://chat.mas-k8s.artise.co/account/delete",
            help: "https://artise.co/help",
        },
        assistant_user_id: "@wikibot:mas-k8s.artise.co",
        contact_user_id: "@hector:mas-k8s.artise.co",
        min_app_version: {},
        store_links: { android: "https://play.google.com/store/apps/details?id=co.artise.app" },
    },
};

describe("parseWorkspaceFile", () => {
    it("reads mas-k8s's full file: every link, Ari and the contact", () => {
        expect(parseWorkspaceFile(MAS_K8S)).toEqual({
            name: "Prueba MAS",
            assistantName: "Ari",
            language: "es",
            links: {
                web: "https://chat.mas-k8s.artise.co",
                notes_api: "https://chat.mas-k8s.artise.co/api/notes/v1",
                invites_api: "https://chat.mas-k8s.artise.co/api/invites/v1",
                delete_account: "https://chat.mas-k8s.artise.co/account/delete",
                help: "https://artise.co/help",
            },
            assistantUserId: "@wikibot:mas-k8s.artise.co",
            contactUserId: "@hector:mas-k8s.artise.co",
            branding: {},
        });
    });

    it("reads artise.co's shorter file and leaves its missing fields undefined", () => {
        const file = parseWorkspaceFile(ARTISE_CO);
        expect(file?.name).toBe("Artise");
        expect(file?.links).toEqual({
            web: "https://chat.artise.co",
            notes_api: "https://chat.artise.co/api/notes/v1",
            delete_account: "https://chat.artise.co/account/delete",
        });
        expect(file?.links.help).toBeUndefined();
        expect(file?.assistantUserId).toBeUndefined();
        expect(file?.contactUserId).toBeUndefined();
    });

    it("returns null for a server with no Artise section", () => {
        expect(parseWorkspaceFile({ "m.homeserver": { base_url: "https://matrix.org" } })).toBeNull();
        expect(parseWorkspaceFile(undefined)).toBeNull();
    });

    it("returns null when the Artise section isn't an object", () => {
        expect(parseWorkspaceFile({ [WORKSPACE_WK_KEY]: "Artise" } as IClientWellKnown)).toBeNull();
        expect(parseWorkspaceFile({ [WORKSPACE_WK_KEY]: ["Artise"] } as IClientWellKnown)).toBeNull();
    });

    it("drops each malformed value on its own and keeps the rest", () => {
        const file = parseWorkspaceFile({
            [WORKSPACE_WK_KEY]: {
                name: "  Familia  ",
                assistant_name: 42,
                links: {
                    web: "http://chat.example.com",
                    help: "javascript:alert(1)",
                    notes_api: "not a url",
                    delete_account: "https://chat.example.com/account/delete",
                },
                assistant_user_id: "wikibot",
                contact_user_id: "@ana:example.com",
                logo: "http://example.com/logo.png",
                colors: { accent: "red" },
            },
        } as IClientWellKnown);
        expect(file).toEqual({
            name: "Familia",
            assistantName: undefined,
            language: undefined,
            links: { delete_account: "https://chat.example.com/account/delete" },
            assistantUserId: undefined,
            contactUserId: "@ana:example.com",
            branding: {},
        });
    });

    // The shape the phones read, set by `!workspace logo` and `!workspace color`: both fields are read.
    it("reads the logo and the accent colour the admin set", () => {
        const file = parseWorkspaceFile({
            [WORKSPACE_WK_KEY]: { logo: "https://artise.co/brand/logo.png", colors: { accent: "#1F6FEB" } },
        } as IClientWellKnown);
        expect(file?.branding).toEqual({ logo: "https://artise.co/brand/logo.png", color: "#1F6FEB" });
    });

    // A `branding` block was the web's guess before the server's shape was known: it isn't read.
    it("ignores a branding block", () => {
        const file = parseWorkspaceFile({
            [WORKSPACE_WK_KEY]: { branding: { logo: "https://artise.co/brand/logo.png", color: "#1F6FEB" } },
        } as IClientWellKnown);
        expect(file?.branding).toEqual({});
    });
});

describe("getWorkspaceFile", () => {
    it("reads the well-known the client already has", () => {
        const client = { getClientWellKnown: () => MAS_K8S } as unknown as MatrixClient;
        expect(getWorkspaceFile(client)?.name).toBe("Prueba MAS");
    });

    it("returns null before the client has the well-known", () => {
        const client = { getClientWellKnown: () => undefined } as unknown as MatrixClient;
        expect(getWorkspaceFile(client)).toBeNull();
    });
});
