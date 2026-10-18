/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import {
    BaseViewModel,
    type ArtiseNoteBlock,
    type ArtiseNoteDocument,
    type ArtiseNoteInline,
    type ArtiseNotesContent,
    type ArtiseNotesTreeItem,
    type ArtiseNotesViewModel as ArtiseNotesViewModelInterface,
    type ArtiseNotesViewSnapshot,
} from "@element-hq/web-shared-components";
import { type MatrixClient, type MatrixEvent, RoomStateEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import { artiseT } from "../i18n/artiseT";
import { getWorkspaceFile } from "../workspace/WorkspaceFile";
import { type NotesApi, NotesApiError, type NotesFile } from "./NotesApi";
import { extensionOf, isImagePath, noteDocument } from "./noteDocument";

/** The room state event the bot sets when a chat's notes change (`content.tree` is the new tree hash). */
export const NOTES_STATE_EVENT = "co.artise.notes";

/** Photos larger than this aren't drawn inside a note (the phones' rule): they show as their name. */
const MAX_EMBED_BYTES = 15 * 1024 * 1024;

/** How the page hands files to the browser. Object URLs are made for photos and freed when they're gone. */
export interface NotesFileHandler {
    url: (blob: Blob) => string;
    revoke: (url: string) => void;
    /** Saves a file to the computer. */
    save: (blob: Blob, name: string) => void;
    /** Opens a PDF in a new tab. */
    open: (blob: Blob) => void;
}

export interface NotesPageViewModelProps {
    client: MatrixClient;
    api: NotesApi;
    /** The chat whose notes to show, or `null` to pick one. */
    roomId: string | null;
    /** The note or file to open first. */
    path: string | null;
    /** Puts the chat and file in the page's address (`#/notes?room=…&path=…`). */
    setLocation: (roomId: string | null, path: string | null) => void;
    /** Leaves the page: back to the chat, or (with no chat) to the app. */
    leave: (roomId: string | null) => void;
    files: NotesFileHandler;
}

function basename(path: string): string {
    return path.split("/").pop() ?? path;
}

function displayName(path: string): string {
    const name = basename(path);
    return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function parentOf(path: string): string {
    return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function errorText(e: unknown): string {
    if (e instanceof NotesApiError) return e.text;
    logger.warn("Artise: notes", e);
    return artiseT("artise|notes|error|failed");
}

/**
 * A chat's notes, read-only (W3-2): the files and folders from `/tree`, the picked note drawn from its Markdown,
 * photos through `/raw`, other files to download (PDFs can also open in a new tab).
 *
 * It refreshes when the bot's `co.artise.notes` state changes in the chat and when the window comes back into
 * focus (for chats without that state), asking with the tree's ETag so an unchanged tree costs nothing.
 */
export class NotesPageViewModel
    extends BaseViewModel<ArtiseNotesViewSnapshot, NotesPageViewModelProps>
    implements ArtiseNotesViewModelInterface
{
    private files = new Map<string, NotesFile>();
    private folders = new Set<string>();
    private expanded = new Set<string>();
    private etag: string | undefined;
    /** Object URLs of the photos on screen, freed when the content changes. */
    private urls: string[] = [];
    /** Each new pick or refresh gets a number; answers for an older one are dropped. */
    private loadId = 0;

    public constructor(props: NotesPageViewModelProps) {
        const assistant = getWorkspaceFile(props.client)?.assistantName ?? "Ari";
        super(props, {
            title: artiseT("artise|notes|title"),
            chatName: props.roomId ? (props.client.getRoom(props.roomId)?.name ?? "") : "",
            state: "loading",
            items: [],
            selectedPath: null,
            content: { kind: "none", text: artiseT("artise|notes|pick") },
            privacyText: artiseT("artise|notes|privacy", { assistant }),
            labels: {
                back: artiseT("artise|notes|back"),
                retry: artiseT("artise|notes|retry"),
                tree: artiseT("artise|notes|tree"),
                task: artiseT("artise|notes|task"),
                download: artiseT("artise|notes|download"),
                open: artiseT("artise|notes|open"),
                chooseChat: artiseT("artise|notes|choose_chat"),
            },
        });
        if (props.roomId) {
            this.disposables.trackListener(props.client, RoomStateEvent.Events, this.onStateEvent as () => void);
            const onFocus = (): void => void this.refresh();
            window.addEventListener("focus", onFocus);
            this.disposables.track(() => window.removeEventListener("focus", onFocus));
        }
        this.disposables.track(() => this.freeUrls());
        void this.load();
    }

    private freeUrls(): void {
        for (const url of this.urls) this.props.files.revoke(url);
        this.urls = [];
    }

    private async load(): Promise<void> {
        const { api, roomId, path } = this.props;
        this.snapshot.merge({ state: "loading" });
        try {
            if (!roomId) {
                const chats = await api.chats();
                if (this.isDisposed) return;
                this.snapshot.merge({
                    state: "ready",
                    chats: chats.map((chat) => ({ id: chat.id, name: chat.name })),
                    content: {
                        kind: "none",
                        text: artiseT(chats.length ? "artise|notes|pick" : "artise|notes|no_chats"),
                    },
                });
                return;
            }
            const tree = await api.tree(roomId);
            if (this.isDisposed || tree === "notModified") return;
            this.setTree(tree.files, tree.folders, tree.etag);
            this.snapshot.merge({ state: "ready" });
            if (path) {
                await this.open(path);
            } else if (this.files.size === 0) {
                this.snapshot.merge({ content: { kind: "none", text: artiseT("artise|notes|empty") } });
            }
        } catch (e) {
            if (this.isDisposed) return;
            this.snapshot.merge({ state: "error", errorText: errorText(e) });
        }
    }

    private setTree(files: NotesFile[], folders: string[], etag: string | undefined): void {
        this.files = new Map(files.map((file) => [file.path, file]));
        this.folders = new Set(folders);
        // A file's folders are folders even when the list leaves them out.
        for (const file of files) {
            for (let parent = parentOf(file.path); parent; parent = parentOf(parent)) this.folders.add(parent);
        }
        this.etag = etag;
        this.snapshot.merge({ items: this.visibleItems() });
    }

    private visibleItems(): ArtiseNotesTreeItem[] {
        const children = new Map<string, { folders: string[]; files: string[] }>();
        const entry = (parent: string): { folders: string[]; files: string[] } => {
            let found = children.get(parent);
            if (!found) {
                found = { folders: [], files: [] };
                children.set(parent, found);
            }
            return found;
        };
        for (const folder of this.folders) entry(parentOf(folder)).folders.push(folder);
        for (const path of this.files.keys()) entry(parentOf(path)).files.push(path);

        const items: ArtiseNotesTreeItem[] = [];
        const walk = (parent: string, depth: number): void => {
            const here = children.get(parent);
            if (!here) return;
            for (const folder of [...here.folders].sort((a, b) => collator.compare(basename(a), basename(b)))) {
                const expanded = this.expanded.has(folder);
                items.push({ path: folder, name: basename(folder), depth, kind: "folder", expanded });
                if (expanded) walk(folder, depth + 1);
            }
            for (const path of [...here.files].sort((a, b) => collator.compare(displayName(a), displayName(b)))) {
                const note = this.files.get(path)?.note ?? false;
                items.push({ path, name: displayName(path), depth, kind: note ? "note" : "file" });
            }
        };
        walk("", 0);
        return items;
    }

    private setContent(content: ArtiseNotesContent, selectedPath: string | null): void {
        this.freeUrls();
        this.snapshot.merge({ content, selectedPath });
    }

    /** Opens a note or file, showing its folders in the list. */
    private async open(path: string): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        const file = this.files.get(path);
        if (!file) {
            this.setContent(
                { kind: "error", text: artiseT("artise|notes|missing", { name: displayName(path) }) },
                null,
            );
            return;
        }
        for (let parent = parentOf(path); parent; parent = parentOf(parent)) this.expanded.add(parent);
        this.snapshot.merge({ items: this.visibleItems() });
        const id = ++this.loadId;
        const title = displayName(path);

        if (!file.note && isImagePath(path)) {
            this.setContent({ kind: "image", path, title }, path);
            try {
                const raw = await api.raw(roomId, path);
                if (this.isDisposed || id !== this.loadId) return;
                const src = this.track(
                    this.props.files.url(new Blob([raw.blob], { type: `image/${extensionOf(path)}` })),
                );
                this.snapshot.merge({ content: { kind: "image", path, title, src } });
            } catch (e) {
                if (this.isDisposed || id !== this.loadId) return;
                this.setContent({ kind: "error", text: errorText(e) }, path);
            }
            return;
        }
        if (!file.note) {
            const canOpen = extensionOf(path) === "pdf";
            const text = artiseT(canOpen ? "artise|notes|file_open" : "artise|notes|file_download");
            this.setContent({ kind: "file", path, title: basename(path), text, canOpen }, path);
            return;
        }

        this.setContent({ kind: "loading" }, path);
        try {
            const note = await api.note(roomId, path);
            if (this.isDisposed || id !== this.loadId) return;
            // Notes that aren't Markdown (.txt, .csv, .json, .yaml) are shown as they are.
            const document: ArtiseNoteDocument =
                extensionOf(path) === "md"
                    ? noteDocument(note.content, [...this.files.keys()], path)
                    : [{ type: "code", text: note.content }];
            this.setContent({ kind: "note", path, title, document }, path);
            await this.loadPhotos(id, path, title, document);
        } catch (e) {
            if (this.isDisposed || id !== this.loadId) return;
            this.setContent({ kind: "error", text: errorText(e) }, path);
        }
    }

    private track(url: string): string {
        this.urls.push(url);
        return url;
    }

    /** Downloads the note's photos and puts each in place as it arrives. */
    private async loadPhotos(id: number, path: string, title: string, document: ArtiseNoteDocument): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        const wanted = new Set<string>();
        visitEmbeds(document, (embed) => {
            const size = embed.path ? (this.files.get(embed.path)?.size ?? Infinity) : Infinity;
            if (embed.image && embed.path && size <= MAX_EMBED_BYTES) wanted.add(embed.path);
        });
        const srcs = new Map<string, string>();
        await Promise.all(
            [...wanted].map(async (photo) => {
                try {
                    const raw = await api.raw(roomId, photo);
                    if (this.isDisposed || id !== this.loadId) return;
                    srcs.set(
                        photo,
                        this.track(this.props.files.url(new Blob([raw.blob], { type: `image/${extensionOf(photo)}` }))),
                    );
                } catch (e) {
                    logger.warn("Artise: couldn't load a photo in a note", e);
                }
            }),
        );
        if (this.isDisposed || id !== this.loadId || srcs.size === 0) return;
        const withPhotos = mapEmbeds(document, (embed) =>
            embed.path && srcs.has(embed.path) ? { ...embed, src: srcs.get(embed.path) } : embed,
        );
        this.snapshot.merge({ content: { kind: "note", path, title, document: withPhotos } });
    }

    /** The tree again (free when nothing changed); a changed or removed open file is opened again. */
    public async refresh(): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId || this.snapshot.current.state !== "ready") return;
        const selected = this.snapshot.current.selectedPath;
        const before = selected ? this.files.get(selected)?.version : undefined;
        try {
            const tree = await api.tree(roomId, this.etag);
            if (this.isDisposed || tree === "notModified") return;
            this.setTree(tree.files, tree.folders, tree.etag);
            if (selected && this.files.get(selected)?.version !== before) await this.open(selected);
        } catch (e) {
            logger.warn("Artise: couldn't refresh the notes", e);
        }
    }

    private readonly onStateEvent = (event: MatrixEvent): void => {
        if (event.getType() === NOTES_STATE_EVENT && event.getRoomId() === this.props.roomId) void this.refresh();
    };

    /** The page's address changed (back/forward in the browser): show that file. */
    public showPath(path: string | null): void {
        if (path === this.snapshot.current.selectedPath) return;
        if (path) {
            void this.open(path);
        } else {
            this.loadId++;
            this.setContent({ kind: "none", text: artiseT("artise|notes|pick") }, null);
        }
    }

    public back = (): void => this.props.leave(this.props.roomId);

    public retry = (): void => void this.load();

    public chooseChat = (roomId: string): void => this.props.setLocation(roomId, null);

    public select = (path: string): void => {
        this.props.setLocation(this.props.roomId, path);
        void this.open(path);
    };

    public toggleFolder = (path: string): void => {
        if (this.expanded.has(path)) this.expanded.delete(path);
        else this.expanded.add(path);
        this.snapshot.merge({ items: this.visibleItems() });
    };

    public openLink = (path: string | null, target: string): void => {
        if (path) {
            this.select(path);
        } else {
            this.loadId++;
            this.setContent({ kind: "error", text: artiseT("artise|notes|missing", { name: target }) }, null);
        }
    };

    public openEmbed = (path: string): void => this.select(path);

    public download = (path: string): void =>
        void this.withRaw(path, (blob) => {
            // As bytes, whatever the file says it is, so the browser saves it instead of showing it.
            this.props.files.save(new Blob([blob], { type: "application/octet-stream" }), basename(path));
        });

    public openFile = (path: string): void => {
        if (extensionOf(path) !== "pdf") return;
        void this.withRaw(path, (blob) => this.props.files.open(new Blob([blob], { type: "application/pdf" })));
    };

    private async withRaw(path: string, handle: (blob: Blob) => void): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        try {
            const raw = await api.raw(roomId, path);
            if (!this.isDisposed) handle(raw.blob);
        } catch (e) {
            if (this.isDisposed) return;
            this.setContent({ kind: "error", text: errorText(e) }, this.snapshot.current.selectedPath);
        }
    }
}

type Embed = Extract<ArtiseNoteInline, { type: "embed" }>;

function visitInlines(nodes: ArtiseNoteInline[], visit: (embed: Embed) => void): void {
    for (const node of nodes) {
        if (node.type === "embed") visit(node);
        else if ("children" in node) visitInlines(node.children, visit);
    }
}

function visitEmbeds(blocks: ArtiseNoteBlock[], visit: (embed: Embed) => void): void {
    for (const block of blocks) {
        if (block.type === "paragraph" || block.type === "heading") visitInlines(block.children, visit);
        else if (block.type === "quote") visitEmbeds(block.children, visit);
        else if (block.type === "list") for (const item of block.items) visitEmbeds(item.children, visit);
    }
}

function mapInlines(nodes: ArtiseNoteInline[], map: (embed: Embed) => Embed): ArtiseNoteInline[] {
    return nodes.map((node) => {
        if (node.type === "embed") return map(node);
        if (node.type === "emph" || node.type === "strong" || node.type === "link") {
            return { ...node, children: mapInlines(node.children, map) };
        }
        return node;
    });
}

function mapEmbeds(blocks: ArtiseNoteBlock[], map: (embed: Embed) => Embed): ArtiseNoteBlock[] {
    return blocks.map((block) => {
        switch (block.type) {
            case "paragraph":
            case "heading":
                return { ...block, children: mapInlines(block.children, map) };
            case "quote":
                return { ...block, children: mapEmbeds(block.children, map) };
            case "list":
                return {
                    ...block,
                    items: block.items.map((item) => ({ ...item, children: mapEmbeds(item.children, map) })),
                };
            default:
                return block;
        }
    });
}
