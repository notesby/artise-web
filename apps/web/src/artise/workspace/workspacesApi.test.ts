/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi } from "vitest";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { fetchWorkspaces } from "./workspacesApi";

const TOKEN = {
    access_token: "openid-token",
    token_type: "Bearer",
    matrix_server_name: "mas-k8s.artise.co",
    expires_in: 3600,
};

function mockClient(getOpenIdToken = vi.fn().mockResolvedValue(TOKEN)): MatrixClient {
    return { getOpenIdToken, getDomain: () => "mas-k8s.artise.co" } as unknown as MatrixClient;
}

function answer(status: number, body: unknown): typeof fetch {
    return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("fetchWorkspaces", () => {
    // The request S-W1 expects: the server name in the query and the OpenID token as a bearer token.
    it("asks for this server's person with their OpenID token", async () => {
        const fetchFn = answer(200, { workspaces: [] });
        await fetchWorkspaces(mockClient(), fetchFn);
        expect(fetchFn).toHaveBeenCalledWith(
            "https://api.artise.co/v1/workspaces?server_name=mas-k8s.artise.co",
            expect.objectContaining({ headers: { Authorization: "Bearer openid-token" } }),
        );
    });

    // The answer as the server sent it on 2026-10-18, with optional logo and colour.
    it("reads the workspaces", async () => {
        const fetchFn = answer(200, {
            workspaces: [
                {
                    name: "Prueba MAS",
                    server_name: "mas-k8s.artise.co",
                    web_url: "https://chat.mas-k8s.artise.co",
                    logo: "https://mas-k8s.artise.co/logo.png",
                    color: "#1F6FEB",
                },
                { name: "Artise", server_name: "artise.co", web_url: "https://chat.artise.co" },
            ],
        });
        expect(await fetchWorkspaces(mockClient(), fetchFn)).toEqual([
            {
                name: "Prueba MAS",
                serverName: "mas-k8s.artise.co",
                webUrl: "https://chat.mas-k8s.artise.co",
                logo: "https://mas-k8s.artise.co/logo.png",
                color: "#1F6FEB",
            },
            {
                name: "Artise",
                serverName: "artise.co",
                webUrl: "https://chat.artise.co",
                logo: undefined,
                color: undefined,
            },
        ]);
    });

    // An entry the app couldn't open (no https web address, no name) is left out; a bad colour is dropped alone.
    it("leaves out entries it can't use", async () => {
        const fetchFn = answer(200, {
            workspaces: [
                { name: "Sin web", server_name: "a.example", web_url: "http://chat.a.example" },
                { server_name: "b.example", web_url: "https://chat.b.example" },
                "not an object",
                { name: "Bien", server_name: "c.example", web_url: "https://chat.c.example", color: "blue" },
            ],
        });
        expect(await fetchWorkspaces(mockClient(), fetchFn)).toEqual([
            {
                name: "Bien",
                serverName: "c.example",
                webUrl: "https://chat.c.example",
                logo: undefined,
                color: undefined,
            },
        ]);
    });

    // 400 (not an Artise workspace) and 401 (token refused) both mean "no list".
    it.each([400, 401, 500])("gives null when the API answers %i", async (status) => {
        expect(await fetchWorkspaces(mockClient(), answer(status, { error: "x" }))).toBeNull();
    });

    // A body without the workspaces array (e.g. a bare array) is unreadable.
    it("gives null for an answer without a workspaces list", async () => {
        expect(await fetchWorkspaces(mockClient(), answer(200, [{ name: "x" }]))).toBeNull();
    });

    // The server can't hand out an OpenID token (e.g. offline): no request, no list.
    it("gives null when there's no OpenID token", async () => {
        const fetchFn = vi.fn();
        const client = mockClient(vi.fn().mockRejectedValue(new Error("offline")));
        expect(await fetchWorkspaces(client, fetchFn)).toBeNull();
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it("gives null when the API can't be reached", async () => {
        expect(
            await fetchWorkspaces(mockClient(), vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))),
        ).toBeNull();
    });
});
