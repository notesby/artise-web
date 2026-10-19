/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi } from "vitest";

import { desktopClientId, discoverWorkspace, parseWellKnown } from "./discovery.js";

// mas-k8s.artise.co's /.well-known/matrix/client on 2026-10-18, trimmed, with the desktop client the server adds.
const WELL_KNOWN = {
    "m.homeserver": { base_url: "https://matrix.mas-k8s.artise.co" },
    "co.artise.workspace": {
        version: 1,
        name: "Prueba MAS",
        language: "es",
        links: { web: "https://chat.mas-k8s.artise.co", help: "https://artise.co/help" },
        oauth: { ios: "01K7ARTSEAPP1PH0NE00000000", android: "01K7ARTSEAPPANDR0D00000000" },
        desktop_oauth: "01K7ARTSEAPPDESKT0P0000000",
        logo: "https://mas-k8s.artise.co/brand/logo.png",
        colors: { accent: "#1F4E9C" },
    },
};

describe("parseWellKnown", () => {
    it("reads what opening a workspace needs", () => {
        expect(parseWellKnown("mas-k8s.artise.co", WELL_KNOWN)).toEqual({
            serverName: "mas-k8s.artise.co",
            homeserverUrl: "https://matrix.mas-k8s.artise.co",
            desktopClientId: "01K7ARTSEAPPDESKT0P0000000",
            name: "Prueba MAS",
            language: "es",
            webUrl: "https://chat.mas-k8s.artise.co",
            logo: "https://mas-k8s.artise.co/brand/logo.png",
            color: "#1F4E9C",
        });
    });

    it("needs an https homeserver", () => {
        expect(parseWellKnown("x", { "m.homeserver": { base_url: "http://matrix.x" } })).toBeUndefined();
        expect(parseWellKnown("x", {})).toBeUndefined();
    });

    it("works for a server with no workspace file", () => {
        // An older workspace: everything Artise adds is optional.
        expect(parseWellKnown("x.example", { "m.homeserver": { base_url: "https://matrix.x.example/" } })).toEqual({
            serverName: "x.example",
            homeserverUrl: "https://matrix.x.example",
        });
    });
});

describe("desktopClientId", () => {
    it.each([
        [{ desktop_oauth: "01K7ARTSEAPPDESKT0P0000000" }, "01K7ARTSEAPPDESKT0P0000000"],
        [{ desktop_oauth: { client_id: "01K7ARTSEAPPDESKT0P0000000" } }, "01K7ARTSEAPPDESKT0P0000000"],
        [{ oauth: { desktop: "01K7ARTSEAPPDESKT0P0000000" } }, "01K7ARTSEAPPDESKT0P0000000"],
        [{ oauth: { ios: "x" } }, undefined],
        [{ desktop_oauth: "not an id!" }, undefined],
    ])("reads %j as %s", (file, expected) => {
        expect(desktopClientId(file)).toBe(expected);
    });
});

describe("discoverWorkspace", () => {
    const answer = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

    it("asks the workspace, then its homeserver for the sign-in issuer", async () => {
        const fetch = vi.fn(async (url: string) =>
            url === "https://mas-k8s.artise.co/.well-known/matrix/client"
                ? answer(WELL_KNOWN)
                : url === "https://matrix.mas-k8s.artise.co/_matrix/client/v1/auth_metadata"
                  ? answer({ issuer: "https://auth.mas-k8s.artise.co/" })
                  : answer({}, 404),
        );
        const result = await discoverWorkspace("mas-k8s.artise.co", fetch);
        expect(result).toMatchObject({ ok: true, value: { issuer: "https://auth.mas-k8s.artise.co" } });
    });

    it("still opens a homeserver without MAS: Element signs in the old way", async () => {
        const fetch = vi.fn(async (url: string) =>
            url.endsWith("/.well-known/matrix/client") ? answer(WELL_KNOWN) : answer({}, 404),
        );
        const result = await discoverWorkspace("mas-k8s.artise.co", fetch);
        expect(result.ok && result.value.issuer).toBeUndefined();
    });

    it("fails when the workspace can't be reached", async () => {
        const fetch = vi.fn(async () => {
            throw new Error("offline");
        });
        expect(await discoverWorkspace("mas-k8s.artise.co", fetch)).toEqual({ ok: false, error: "unreachable" });
    });

    it("never asks a server name that isn't one", async () => {
        const fetch = vi.fn();
        expect(await discoverWorkspace("evil.example/path?x=", fetch)).toEqual({ ok: false, error: "refused" });
        expect(fetch).not.toHaveBeenCalled();
    });
});
