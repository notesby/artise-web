/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi, beforeAll, afterAll, type Mock } from "vitest";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { NotesApi, NotesApiError, notesApiFor } from "./NotesApi";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const BASE = "https://chat.mas-k8s.artise.co/api/notes/v1";
const ROOM = "!abc:mas-k8s.artise.co";
const ROOM_PATH = `${BASE}/chats/%21abc%3Amas-k8s.artise.co`;
const V1 = "3b18".padEnd(40, "0");
const V2 = "77ac".padEnd(40, "0");

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

/** A client whose OpenID tokens are `token-1`, `token-2`…, each valid for an hour. */
function tokenClient(): { client: Pick<MatrixClient, "getOpenIdToken">; getOpenIdToken: Mock } {
    let n = 0;
    const getOpenIdToken = vi.fn().mockImplementation(async () => ({
        access_token: `token-${++n}`,
        token_type: "Bearer",
        matrix_server_name: "mas-k8s.artise.co",
        expires_in: 3600,
    }));
    return { client: { getOpenIdToken } as unknown as Pick<MatrixClient, "getOpenIdToken">, getOpenIdToken };
}

function setup(...responses: Response[]): { api: NotesApi; fetchFn: Mock; getOpenIdToken: Mock; clock: { t: number } } {
    const fetchFn = vi.fn();
    for (const response of responses) fetchFn.mockResolvedValueOnce(response);
    const { client, getOpenIdToken } = tokenClient();
    const clock = { t: 1_000_000 };
    return { api: new NotesApi(BASE, client, fetchFn, () => clock.t), fetchFn, getOpenIdToken, clock };
}

function call(fetchFn: Mock, n = 0): { url: string; init: RequestInit & { headers: Record<string, string> } } {
    const [url, init] = fetchFn.mock.calls[n];
    return { url, init };
}

async function errorOf(promise: Promise<unknown>): Promise<NotesApiError> {
    try {
        await promise;
    } catch (e) {
        if (e instanceof NotesApiError) return e;
        throw e;
    }
    throw new Error("expected a NotesApiError");
}

describe("NotesApi", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    describe("sign-in", () => {
        // Every request carries the OpenID token as a bearer token, never the Matrix access token.
        it("sends the OpenID token", async () => {
            const { api, fetchFn } = setup(json(200, { user: "@ana:mas-k8s.artise.co", chats: [] }));
            await api.chats();
            expect(call(fetchFn).url).toBe(`${BASE}/chats`);
            expect(call(fetchFn).init.headers.Authorization).toBe("Bearer token-1");
        });

        // A token is reused while it's valid, and renewed a minute before expires_in runs out.
        it("reuses the token and renews it before it runs out", async () => {
            const chats = (): Response => json(200, { chats: [] });
            const { api, fetchFn, getOpenIdToken, clock } = setup(chats(), chats(), chats());
            await api.chats();
            clock.t += 3600_000 - 61_000;
            await api.chats();
            expect(getOpenIdToken).toHaveBeenCalledTimes(1);
            clock.t += 2_000;
            await api.chats();
            expect(getOpenIdToken).toHaveBeenCalledTimes(2);
            expect(call(fetchFn, 2).init.headers.Authorization).toBe("Bearer token-2");
        });

        // Requests made together share one token request.
        it("asks for one token for requests made together", async () => {
            const { api, getOpenIdToken } = setup(json(200, { chats: [] }), json(200, { chats: [] }));
            await Promise.all([api.chats(), api.chats()]);
            expect(getOpenIdToken).toHaveBeenCalledTimes(1);
        });

        // A 401 gets a new token and one retry.
        it("renews the token and retries once on 401", async () => {
            const { api, fetchFn } = setup(json(401, { error: "unauthorized" }), json(200, { chats: [] }));
            await expect(api.chats()).resolves.toEqual([]);
            expect(fetchFn).toHaveBeenCalledTimes(2);
            expect(call(fetchFn, 1).init.headers.Authorization).toBe("Bearer token-2");
        });

        // A second 401 is the person's problem to fix: unauthorized, with its sentence.
        it("gives unauthorized after the retry fails too", async () => {
            const { api, fetchFn } = setup(json(401, { error: "unauthorized" }), json(401, { error: "unauthorized" }));
            const error = await errorOf(api.chats());
            expect(error.code).toBe("unauthorized");
            expect(error.text).toBe("Couldn't confirm it's you. Reload the page and try again.");
            expect(fetchFn).toHaveBeenCalledTimes(2);
        });

        // The chat server won't give a token: unauthorized, without a request.
        it("gives unauthorized when there's no token", async () => {
            const fetchFn = vi.fn();
            const client = { getOpenIdToken: vi.fn().mockRejectedValue(new Error("M_UNKNOWN_TOKEN")) };
            const api = new NotesApi(BASE, client as unknown as MatrixClient, fetchFn);
            expect((await errorOf(api.chats())).code).toBe("unauthorized");
            expect(fetchFn).not.toHaveBeenCalled();
        });
    });

    describe("errors", () => {
        // Each error code in the contract comes through with its status and a plain sentence.
        it.each([
            [404, "no_chat", "This chat has no notes, or you're no longer in it."],
            [400, "bad_path", "That name can't be used here."],
            [404, "not_found", "Someone else deleted or moved it in the meantime."],
            [409, "deleted", "Someone deleted this note while you were editing it."],
            [413, "too_big", "It's too big: up to 1 MB for a note and 50 MB for a file."],
            [415, "not_a_note", "That file isn't a note."],
            [404, "not_in_trash", "It's no longer in the trash (things stay there for 30 days)."],
        ])("%i %s", async (status, code, text) => {
            const { api } = setup(json(status, { error: code, message: "server text" }));
            const error = await errorOf(api.note(ROOM, "Súper.md"));
            expect([error.code, error.status, error.text]).toEqual([code, status, text]);
        });

        // conflict and exists carry the server's copy.
        it("keeps the server's copy on conflict", async () => {
            const current = { path: "Súper.md", version: V2, content: "- leche\n- pan" };
            const { api } = setup(json(409, { error: "conflict", message: "x", current }));
            const error = await errorOf(api.saveNote(ROOM, "Súper.md", "- leche\n- huevos", V1));
            expect(error.code).toBe("conflict");
            expect(error.current).toEqual(current);
            expect(error.text).toBe("Someone else changed the same lines while you were editing.");
        });

        it("keeps the server's copy on exists", async () => {
            const { api } = setup(json(409, { error: "exists", current: { path: "Súper.md", version: V2 } }));
            const error = await errorOf(api.saveNote(ROOM, "Súper.md", "x", null));
            expect(error.code).toBe("exists");
            expect(error.current).toEqual({ path: "Súper.md", version: V2, content: undefined });
        });

        // not_empty's counts are kept for the "delete everything inside?" question.
        it("keeps not_empty's counts", async () => {
            const { api } = setup(json(409, { error: "not_empty", files: 3, folders: 1 }));
            const error = await errorOf(api.deleteFolder(ROOM, "Recetas"));
            expect(error.code).toBe("not_empty");
            expect(error.details).toEqual({ files: 3, folders: 1 });
        });

        // No answer at all: offline.
        it("gives offline when the server can't be reached", async () => {
            const fetchFn = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
            const api = new NotesApi(BASE, tokenClient().client, fetchFn);
            const error = await errorOf(api.chats());
            expect([error.code, error.status]).toEqual(["offline", 0]);
            expect(error.text).toBe("This needs a connection. Try again when you're online.");
        });

        // A proxy's HTML page or an unknown code: failed, except a bare 413, which is still too_big.
        it("gives failed for an answer it doesn't know", async () => {
            const { api } = setup(new Response("<html>Bad gateway</html>", { status: 502 }));
            expect((await errorOf(api.chats())).code).toBe("failed");
        });

        it("reads a bare 413 as too_big", async () => {
            const { api } = setup(new Response("", { status: 413 }));
            expect((await errorOf(api.putRaw(ROOM, "Fotos/luna.jpg", new Blob(["x"])))).code).toBe("too_big");
        });
    });

    describe("endpoints", () => {
        it("lists the chats", async () => {
            const chats = [{ id: ROOM, name: "Familia", tree: "9f1c" }];
            const { api } = setup(json(200, { user: "@ana:mas-k8s.artise.co", chats }));
            expect(await api.chats()).toEqual(chats);
        });

        // The tree sends its ETag back as If-None-Match; 304 means nothing changed.
        it("reads the tree with its ETag, and 304 as not modified", async () => {
            const tree = {
                tree: "9f1c",
                files: [{ path: "Recetas/Mole.md", version: V1, size: 812, modified: 1790000000, note: true }],
                folders: ["Recetas"],
            };
            const { api, fetchFn } = setup(json(200, tree, { ETag: '"9f1c"' }), new Response(null, { status: 304 }));
            const first = await api.tree(ROOM);
            expect(first).toEqual({ ...tree, etag: '"9f1c"' });
            expect(call(fetchFn).url).toBe(`${ROOM_PATH}/tree`);
            expect(await api.tree(ROOM, '"9f1c"')).toBe("notModified");
            expect(call(fetchFn, 1).init.headers["If-None-Match"]).toBe('"9f1c"');
        });

        // Paths go in the query, encoded; at= reads an old version.
        it("reads a note, now or at a commit", async () => {
            const note = { path: "Recetas/Mole.md", version: V1, content: "# Mole" };
            const { api, fetchFn } = setup(json(200, note), json(200, note));
            expect(await api.note(ROOM, "Recetas/Mole.md")).toEqual(note);
            expect(call(fetchFn).url).toBe(`${ROOM_PATH}/note?path=Recetas%2FMole.md`);
            await api.note(ROOM, "Recetas/Mole.md", "a41f");
            expect(call(fetchFn, 1).url).toBe(`${ROOM_PATH}/note?path=Recetas%2FMole.md&at=a41f`);
        });

        // A new note: base_version null, 201.
        it("creates a note", async () => {
            const { api, fetchFn } = setup(json(201, { path: "Súper.md", version: V1, merged: false }));
            expect(await api.saveNote(ROOM, "Súper.md", "- leche", null)).toEqual({
                path: "Súper.md",
                version: V1,
                merged: false,
                content: undefined,
                created: true,
            });
            const { init } = call(fetchFn);
            expect(init.method).toBe("PUT");
            expect(init.headers["Content-Type"]).toBe("application/json");
            expect(JSON.parse(init.body as string)).toEqual({
                path: "Súper.md",
                content: "- leche",
                base_version: null,
            });
        });

        // Edits on different lines are merged by the server: merged true with the text to show.
        it("saves a note the server merged", async () => {
            const { api } = setup(
                json(200, { path: "Súper.md", version: V2, merged: true, content: "- leche\n- pan" }),
            );
            expect(await api.saveNote(ROOM, "Súper.md", "- leche", V1)).toEqual({
                path: "Súper.md",
                version: V2,
                merged: true,
                content: "- leche\n- pan",
                created: false,
            });
        });

        it("downloads a file with its type and version", async () => {
            const { api } = setup(
                new Response("jpeg", { status: 200, headers: { "Content-Type": "image/jpeg", "ETag": `"${V1}"` } }),
            );
            const raw = await api.raw(ROOM, "Fotos/luna.jpg");
            expect([raw.contentType, raw.version, await raw.blob.text()]).toEqual(["image/jpeg", V1, "jpeg"]);
        });

        // An upload sends the bytes as they are, with their type, and base= when it replaces a file.
        it("uploads a file", async () => {
            const { api, fetchFn } = setup(json(201, { path: "Fotos/luna.jpg", version: V1 }));
            const blob = new Blob(["jpeg"], { type: "image/jpeg" });
            await api.putRaw(ROOM, "Fotos/luna.jpg", blob, V2);
            const { url, init } = call(fetchFn);
            expect(url).toBe(`${ROOM_PATH}/raw?path=Fotos%2Fluna.jpg&base=${V2}`);
            expect([init.method, init.headers["Content-Type"], init.body]).toEqual(["PUT", "image/jpeg", blob]);
        });

        it("deletes a file", async () => {
            const { api, fetchFn } = setup(json(200, { path: "Fotos/luna.jpg", deleted: true, trash: true }));
            expect(await api.deleteFile(ROOM, "Fotos/luna.jpg", V1)).toEqual({
                path: "Fotos/luna.jpg",
                deleted: true,
                trash: true,
            });
            expect(call(fetchFn).init.method).toBe("DELETE");
            expect(call(fetchFn).url).toBe(`${ROOM_PATH}/file?path=Fotos%2Fluna.jpg&base=${V1}`);
        });

        it("moves a note and says which links changed", async () => {
            const { api, fetchFn } = setup(
                json(200, { from: "Súper.md", to: "Listas/Súper.md", version: V2, links_updated: ["Recetas/Mole.md"] }),
            );
            expect(await api.move(ROOM, "Súper.md", "Listas/Súper.md", V1)).toEqual({
                from: "Súper.md",
                to: "Listas/Súper.md",
                version: V2,
                linksUpdated: ["Recetas/Mole.md"],
            });
            expect(JSON.parse(call(fetchFn).init.body as string)).toEqual({
                from: "Súper.md",
                to: "Listas/Súper.md",
                base_version: V1,
            });
        });

        // A folder move has folder: true and no base_version.
        it("moves a folder", async () => {
            const moved = [{ from: "Recetas/Mole.md", to: "Cocina/Recetas/Mole.md", version: V1 }];
            const { api, fetchFn } = setup(
                json(200, { from: "Recetas", to: "Cocina/Recetas", moved, links_updated: ["Índice.md"] }),
            );
            expect(await api.moveFolder(ROOM, "Recetas", "Cocina/Recetas")).toEqual({
                from: "Recetas",
                to: "Cocina/Recetas",
                moved,
                linksUpdated: ["Índice.md"],
            });
            expect(JSON.parse(call(fetchFn).init.body as string)).toEqual({
                from: "Recetas",
                to: "Cocina/Recetas",
                folder: true,
            });
        });

        it("creates and deletes folders", async () => {
            const { api, fetchFn } = setup(
                json(201, { path: "Recetas/Postres" }),
                json(200, { path: "Recetas", deleted: true, notes: 1, files: 3 }),
            );
            expect(await api.createFolder(ROOM, "Recetas/Postres")).toEqual({ path: "Recetas/Postres" });
            expect(call(fetchFn).init.method).toBe("POST");
            await api.deleteFolder(ROOM, "Recetas", true);
            expect(call(fetchFn, 1).url).toBe(`${ROOM_PATH}/folder?path=Recetas&recursive=true`);
        });

        it("lists the trash and restores from it", async () => {
            const item = {
                id: "1790712345678-3fa1c2d9",
                path: "attachments/foto.jpg",
                deleted_at: 1790712345.6,
                reason: "deleted",
                by: "Ana",
                size: 842113,
                days_left: 30,
            };
            const { api, fetchFn } = setup(
                json(200, { days: 30, items: [item] }),
                json(200, { path: "attachments/foto (restored).jpg", version: V1 }),
            );
            expect(await api.trash(ROOM)).toEqual([
                {
                    id: item.id,
                    path: item.path,
                    deletedAt: item.deleted_at,
                    reason: "deleted",
                    by: "Ana",
                    size: 842113,
                    daysLeft: 30,
                },
            ]);
            expect(await api.restore(ROOM, { id: item.id })).toEqual({
                path: "attachments/foto (restored).jpg",
                version: V1,
            });
            expect(call(fetchFn, 1).url).toBe(`${ROOM_PATH}/trash/restore?id=1790712345678-3fa1c2d9`);
        });

        it("searches, reads links, the graph and history", async () => {
            const links = { path: "Súper.md", outgoing: [{ target: "Leche", path: null }], backlinks: [] };
            const graph = { nodes: ["Súper.md"], edges: [] };
            const versions = [
                { commit: "a41f", at: "2026-09-29T18:02:11-06:00", message: "app: edit Súper.md", by: "Ana" },
            ];
            const { api, fetchFn } = setup(
                json(200, { q: "chocolate", results: [{ path: "Recetas/Mole.md", lines: ["- chocolate"] }] }),
                json(200, links),
                json(200, graph),
                json(200, { path: "Súper.md", versions }),
            );
            expect(await api.search(ROOM, "chocolate")).toEqual([{ path: "Recetas/Mole.md", lines: ["- chocolate"] }]);
            expect(call(fetchFn).url).toBe(`${ROOM_PATH}/search?q=chocolate`);
            expect(await api.links(ROOM, "Súper.md")).toEqual(links);
            expect(await api.graph(ROOM)).toEqual(graph);
            expect(await api.history(ROOM, "Súper.md")).toEqual(versions);
        });
    });

    describe("notesApiFor", () => {
        // The address comes from the workspace file; without it there are no notes on the web.
        it("uses the workspace file's notes_api", async () => {
            const withNotes = {
                getClientWellKnown: () => ({ "co.artise.workspace": { links: { notes_api: BASE } } }),
            } as unknown as MatrixClient;
            const without = { getClientWellKnown: () => ({ "co.artise.workspace": {} }) } as unknown as MatrixClient;
            expect(notesApiFor(withNotes)).toBeInstanceOf(NotesApi);
            expect(notesApiFor(without)).toBeNull();
        });
    });
});
