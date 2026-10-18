/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type IOpenIDToken, type MatrixClient } from "matrix-js-sdk/src/matrix";

import { artiseT, type ArtiseTextKey } from "../i18n/artiseT";
import { getWorkspaceFile } from "../workspace/WorkspaceFile";

/*
 * The Notes API v1 client, following the contract in family-wiki docs/notes-api.md. Every chat's notes are files
 * on the workspace's server; this reads and writes them with the person's Matrix OpenID token.
 */

/** The error codes the API answers, plus the two this client adds: `offline` (no answer) and `failed` (anything else). */
export type NotesErrorCode =
    | "unauthorized"
    | "no_chat"
    | "bad_path"
    | "not_found"
    | "exists"
    | "conflict"
    | "deleted"
    | "too_big"
    | "not_a_note"
    | "not_empty"
    | "not_in_trash"
    | "offline"
    | "failed";

const SERVER_CODES: ReadonlySet<string> = new Set<NotesErrorCode>([
    "unauthorized",
    "no_chat",
    "bad_path",
    "not_found",
    "exists",
    "conflict",
    "deleted",
    "too_big",
    "not_a_note",
    "not_empty",
    "not_in_trash",
]);

/** What's on the server now, sent with `exists` and `conflict`: `content` for notes. */
export interface NotesCurrent {
    path: string;
    version: string;
    content?: string;
}

/** A failed Notes request, with the API's code and a sentence to show the person. */
export class NotesApiError extends Error {
    public constructor(
        public readonly code: NotesErrorCode,
        /** The HTTP status, or 0 when there was no answer. */
        public readonly status: number,
        /** The server's copy, for `exists` and `conflict`. */
        public readonly current?: NotesCurrent,
        /** The rest of the error's JSON, e.g. `{"files": 3, "folders": 1}` for `not_empty`. */
        public readonly details: Record<string, unknown> = {},
    ) {
        super(`Notes API: ${code} (${status})`);
        this.name = "NotesApiError";
    }

    /** One plain sentence about what went wrong, in the person's language. */
    public get text(): string {
        return artiseT(`artise|notes|error|${this.code}` as ArtiseTextKey);
    }
}

/** A chat whose notes the person can open. */
export interface NotesChat {
    id: string;
    name: string;
    /** Changes whenever anything in this chat's notes changes. */
    tree: string;
}

/** A file in a chat's notes. */
export interface NotesFile {
    path: string;
    version: string;
    size: number;
    /** Seconds since 1970. */
    modified: number;
    /** True for text opened with {@link NotesApi.note} (`.md .txt .csv .json .yaml .yml`); the rest is raw. */
    note: boolean;
}

/** Every file and folder of a chat's notes. */
export interface NotesTree {
    tree: string;
    files: NotesFile[];
    folders: string[];
    /** Send back to {@link NotesApi.tree} to get `notModified` when nothing changed. */
    etag?: string;
}

export interface NotesNote {
    path: string;
    version: string;
    content: string;
}

/** A saved note. `merged`: the server combined other people's edits on different lines; show `content`. */
export interface NotesSaved {
    path: string;
    version: string;
    merged: boolean;
    content?: string;
    /** True when the note was new (`201`). */
    created: boolean;
}

export interface NotesRaw {
    blob: Blob;
    contentType: string;
    /** The file's version (its `ETag`). */
    version?: string;
}

export interface NotesMoved {
    from: string;
    to: string;
    version: string;
    /** Notes whose links were updated: fetch them again. */
    linksUpdated: string[];
}

export interface NotesFolderMoved {
    from: string;
    to: string;
    moved: { from: string; to: string; version: string }[];
    linksUpdated: string[];
}

export interface NotesFolderDeleted {
    path: string;
    notes: number;
    files: number;
}

export interface NotesTrashItem {
    id: string;
    path: string;
    /** Seconds since 1970. */
    deletedAt: number;
    reason: "deleted" | "replaced";
    by: string;
    size: number;
    daysLeft: number;
}

export interface NotesSearchResult {
    path: string;
    lines: string[];
}

export interface NotesLinks {
    path: string;
    /** `path: null` means the note doesn't exist yet. */
    outgoing: { target: string; path: string | null }[];
    backlinks: { path: string; line: string }[];
}

export interface NotesGraph {
    nodes: string[];
    edges: [string, string][];
}

export interface NotesVersion {
    commit: string;
    /** ISO 8601 with the server's offset. */
    at: string;
    message: string;
    /** The person's name, `Ari`, or `synced device`. */
    by: string;
}

/** Renew the OpenID token this long before it runs out. */
const RENEW_BEFORE_MS = 60_000;

interface RequestOptions {
    query?: Record<string, string | undefined>;
    json?: unknown;
    body?: Blob;
    headers?: Record<string, string>;
}

type JsonObject = Record<string, unknown>;

/**
 * One workspace's Notes API.
 *
 * Sign-in follows the contract: an OpenID token (never the Matrix access token), requested again a minute before
 * `expires_in` runs out, and once more on a `401` before the request is retried a single time.
 */
export class NotesApi {
    private token: { value: string; expiresAt: number } | null = null;
    private pendingToken: Promise<string> | null = null;

    /**
     * @param baseUrl - The workspace file's `links.notes_api`, e.g. `https://chat.artise.co/api/notes/v1`.
     * @param client - The signed-in client, for OpenID tokens.
     * @param fetchFn - `fetch`, replaceable in tests.
     * @param now - The clock, replaceable in tests.
     */
    public constructor(
        private readonly baseUrl: string,
        private readonly client: Pick<MatrixClient, "getOpenIdToken">,
        private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
        private readonly now: () => number = Date.now,
    ) {}

    private async getToken(renew: boolean): Promise<string> {
        if (!renew && this.token && this.now() < this.token.expiresAt - RENEW_BEFORE_MS) return this.token.value;
        // One request for a token at a time: requests waiting meanwhile share it.
        if (!this.pendingToken) {
            this.pendingToken = this.client
                .getOpenIdToken()
                .then((token: IOpenIDToken) => {
                    this.token = { value: token.access_token, expiresAt: this.now() + token.expires_in * 1000 };
                    return token.access_token;
                })
                .finally(() => {
                    this.pendingToken = null;
                });
        }
        return this.pendingToken;
    }

    private url(path: string, query?: Record<string, string | undefined>): string {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(query ?? {})) {
            if (value !== undefined) params.set(key, value);
        }
        const search = params.toString();
        return `${this.baseUrl.replace(/\/+$/, "")}${path}${search ? `?${search}` : ""}`;
    }

    private async send(method: string, path: string, options: RequestOptions, renewToken: boolean): Promise<Response> {
        let token: string;
        try {
            token = await this.getToken(renewToken);
        } catch {
            throw new NotesApiError("unauthorized", 0);
        }
        const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...options.headers };
        let body: BodyInit | undefined;
        if (options.json !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(options.json);
        } else if (options.body) {
            body = options.body;
        }
        try {
            return await this.fetchFn(this.url(path, options.query), { method, headers, body });
        } catch {
            throw new NotesApiError("offline", 0);
        }
    }

    /** Sends a request, renewing the token and retrying once on `401`; any other error becomes a NotesApiError. */
    private async request(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
        let response = await this.send(method, path, options, false);
        if (response.status === 401) response = await this.send(method, path, options, true);
        if (response.ok || response.status === 304) return response;
        throw await NotesApi.toError(response);
    }

    private static async toError(response: Response): Promise<NotesApiError> {
        let body: JsonObject = {};
        try {
            const parsed: unknown = await response.json();
            if (typeof parsed === "object" && parsed !== null) body = parsed as JsonObject;
        } catch {
            // Not JSON (a proxy's page): the status alone.
        }
        const { error, message: _message, current, ...details } = body;
        const code: NotesErrorCode =
            typeof error === "string" && SERVER_CODES.has(error)
                ? (error as NotesErrorCode)
                : response.status === 401
                  ? "unauthorized"
                  : response.status === 413
                    ? "too_big"
                    : "failed";
        return new NotesApiError(code, response.status, NotesApi.toCurrent(current), details);
    }

    private static toCurrent(value: unknown): NotesCurrent | undefined {
        if (typeof value !== "object" || value === null) return undefined;
        const raw = value as JsonObject;
        if (typeof raw.path !== "string" || typeof raw.version !== "string") return undefined;
        return {
            path: raw.path,
            version: raw.version,
            content: typeof raw.content === "string" ? raw.content : undefined,
        };
    }

    private async json<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
        const response = await this.request(method, path, options);
        return (await response.json()) as T;
    }

    /** The chat's part of a path: room IDs are URL-encoded (`!abc:artise.co` → `%21abc%3Aartise.co`). */
    private static chat(room: string, rest: string): string {
        // encodeURIComponent keeps `!` (and `'()*`) as they are; the contract wants every one encoded.
        const encoded = encodeURIComponent(room).replace(
            /[!'()*]/g,
            (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
        );
        return `/chats/${encoded}${rest}`;
    }

    /** The chats the person can open notes for. */
    public async chats(): Promise<NotesChat[]> {
        const body = await this.json<{ chats: NotesChat[] }>("GET", "/chats");
        return body.chats;
    }

    /**
     * Every file and folder in a chat's notes.
     *
     * @param etag - The previous answer's `etag`: when nothing changed, the answer is `"notModified"`.
     */
    public async tree(room: string, etag?: string): Promise<NotesTree | "notModified"> {
        const response = await this.request("GET", NotesApi.chat(room, "/tree"), {
            headers: etag ? { "If-None-Match": etag } : undefined,
        });
        if (response.status === 304) return "notModified";
        const body = (await response.json()) as Omit<NotesTree, "etag">;
        return { ...body, etag: response.headers.get("ETag") ?? undefined };
    }

    /** A note's text, now or (with `at`, a commit from {@link history}) as it was then. */
    public note(room: string, path: string, at?: string): Promise<NotesNote> {
        return this.json("GET", NotesApi.chat(room, "/note"), { query: { path, at } });
    }

    /**
     * Saves a note.
     *
     * @param baseVersion - The version it was opened at, or `null` to create it.
     * @throws NotesApiError `conflict` (same lines edited: `current` has theirs), `deleted`, or `exists`.
     */
    public async saveNote(
        room: string,
        path: string,
        content: string,
        baseVersion: string | null,
    ): Promise<NotesSaved> {
        const response = await this.request("PUT", NotesApi.chat(room, "/note"), {
            json: { path, content, base_version: baseVersion },
        });
        const body = (await response.json()) as { path: string; version: string; merged?: boolean; content?: string };
        return {
            path: body.path,
            version: body.version,
            merged: body.merged === true,
            content: body.content,
            created: response.status === 201,
        };
    }

    /** A photo's or document's bytes. */
    public async raw(room: string, path: string): Promise<NotesRaw> {
        const response = await this.request("GET", NotesApi.chat(room, "/raw"), { query: { path } });
        return {
            blob: await response.blob(),
            contentType: response.headers.get("Content-Type") ?? "application/octet-stream",
            version: response.headers.get("ETag")?.replace(/^W\//, "").replace(/"/g, "") || undefined,
        };
    }

    /**
     * Uploads a photo or document (up to 50 MB).
     *
     * @param base - The version it replaces, or none to create it.
     */
    public async putRaw(
        room: string,
        path: string,
        blob: Blob,
        base?: string,
    ): Promise<{ path: string; version: string }> {
        return this.json("PUT", NotesApi.chat(room, "/raw"), {
            query: { path, base },
            body: blob,
            headers: { "Content-Type": blob.type || "application/octet-stream" },
        });
    }

    /** Deletes a note (its history keeps it) or a file (to the 30-day trash: `trash: true`). */
    public deleteFile(
        room: string,
        path: string,
        base: string,
    ): Promise<{ path: string; deleted: boolean; trash: boolean }> {
        return this.json("DELETE", NotesApi.chat(room, "/file"), { query: { path, base } });
    }

    /** Moves or renames a note or file; every link to it is updated in the same change. */
    public async move(room: string, from: string, to: string, baseVersion: string): Promise<NotesMoved> {
        const body = await this.json<{ from: string; to: string; version: string; links_updated?: string[] }>(
            "POST",
            NotesApi.chat(room, "/move"),
            { json: { from, to, base_version: baseVersion } },
        );
        return { from: body.from, to: body.to, version: body.version, linksUpdated: body.links_updated ?? [] };
    }

    /** Moves or renames a folder with everything in it. */
    public async moveFolder(room: string, from: string, to: string): Promise<NotesFolderMoved> {
        const body = await this.json<{
            from: string;
            to: string;
            moved?: NotesFolderMoved["moved"];
            links_updated?: string[];
        }>("POST", NotesApi.chat(room, "/move"), { json: { from, to, folder: true } });
        return { from: body.from, to: body.to, moved: body.moved ?? [], linksUpdated: body.links_updated ?? [] };
    }

    /** Creates a folder and its parents. */
    public createFolder(room: string, path: string): Promise<{ path: string }> {
        return this.json("POST", NotesApi.chat(room, "/folder"), { json: { path } });
    }

    /**
     * Deletes a folder.
     *
     * @param recursive - Also what's inside; without it a folder with things inside is `not_empty`.
     */
    public deleteFolder(room: string, path: string, recursive = false): Promise<NotesFolderDeleted> {
        return this.json("DELETE", NotesApi.chat(room, "/folder"), {
            query: { path, recursive: recursive ? "true" : undefined },
        });
    }

    /** Photos and files deleted or replaced in the last 30 days, newest first. */
    public async trash(room: string): Promise<NotesTrashItem[]> {
        const body = await this.json<{
            items: {
                id: string;
                path: string;
                deleted_at: number;
                reason: NotesTrashItem["reason"];
                by: string;
                size: number;
                days_left: number;
            }[];
        }>("GET", NotesApi.chat(room, "/trash"));
        return body.items.map((item) => ({
            id: item.id,
            path: item.path,
            deletedAt: item.deleted_at,
            reason: item.reason,
            by: item.by,
            size: item.size,
            daysLeft: item.days_left,
        }));
    }

    /** Brings back a trashed photo or file, by its path or its trash item's id. The answer's `path` says where. */
    public restore(room: string, which: { path: string } | { id: string }): Promise<{ path: string; version: string }> {
        return this.json("POST", NotesApi.chat(room, "/trash/restore"), { query: which });
    }

    /** File names and note lines matching `q` (up to 50 files, 3 lines each). */
    public async search(room: string, q: string): Promise<NotesSearchResult[]> {
        const body = await this.json<{ results: NotesSearchResult[] }>("GET", NotesApi.chat(room, "/search"), {
            query: { q },
        });
        return body.results;
    }

    /** A note's links and the notes that link to it. */
    public links(room: string, path: string): Promise<NotesLinks> {
        return this.json("GET", NotesApi.chat(room, "/links"), { query: { path } });
    }

    /** Every note and the links between them. */
    public graph(room: string): Promise<NotesGraph> {
        return this.json("GET", NotesApi.chat(room, "/graph"));
    }

    /** A note's last 50 versions, newest first. */
    public async history(room: string, path: string): Promise<NotesVersion[]> {
        const body = await this.json<{ versions: NotesVersion[] }>("GET", NotesApi.chat(room, "/history"), {
            query: { path },
        });
        return body.versions;
    }
}

/**
 * The Notes API of the signed-in workspace, or `null` when its workspace file has no `links.notes_api`.
 *
 * @param client - The signed-in client.
 */
export function notesApiFor(client: MatrixClient): NotesApi | null {
    const baseUrl = getWorkspaceFile(client)?.links.notes_api;
    return baseUrl ? new NotesApi(baseUrl, client) : null;
}
