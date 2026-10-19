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
import { type NotesApi, NotesApiError, type NotesCurrent, type NotesFile } from "./NotesApi";
import { extensionOf, isImagePath, noteDocument } from "./noteDocument";
import { combineVersions, linkSuggestions, newNotePath, toggleTask } from "./noteEditing";
import {
    folderContents,
    freeAttachmentPath,
    MAX_UPLOAD_BYTES,
    movedPath,
    moveTargets,
    newFolderPath,
    pathAfterFolderMove,
    renamedPath,
} from "./noteFiles";

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
    /** Readies a picked file for upload: photos are shrunk to 2560 px on the long side, as the phones do. */
    prepare: (file: File) => Promise<Blob>;
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
    /** The open note's photos by path, kept while it stays open (ticking a task or editing redraws it). */
    private photos = new Map<string, string>();
    /** Each new pick or refresh gets a number; answers for an older one are dropped. */
    private loadId = 0;
    /** The open note's text and version on the server. */
    private note: { path: string; text: string; version: string } | null = null;
    /** The version a save is based on (the note's, or the other version's when combining). */
    private editBase: string | null = null;
    /** The server's copy from the last conflict. */
    private conflictCurrent: NotesCurrent | null = null;
    /** Where the person was going when asked about unsaved changes. */
    private leaveTo: (() => void) | null = null;
    /** The editing note to put back in the address when the person stays. */
    private restorePath: string | null = null;
    /** Where the editor's cursor last was, for putting uploaded files in the note. */
    private cursor = 0;
    /** The old version being looked at in the history. */
    private historyText: string | null = null;
    /** The open history's versions, by commit, for a version's caption. */
    private historyVersions = new Map<string, { at: string; by: string }>();
    /** Each search gets a number; answers for an older one are dropped. */
    private searchId = 0;
    private searchTimer: ReturnType<typeof setTimeout> | undefined;

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
                edit: artiseT("artise|notes|edit"),
                save: artiseT("artise|notes|save"),
                cancel: artiseT("artise|notes|cancel"),
                editor: artiseT("artise|notes|editor_label"),
                preview: artiseT("artise|notes|preview"),
                suggestions: artiseT("artise|notes|suggestions"),
                newNote: artiseT("artise|notes|new_note"),
                name: artiseT("artise|notes|name"),
                create: artiseT("artise|notes|create"),
                mine: artiseT("artise|notes|choice_mine"),
                theirs: artiseT("artise|notes|choice_theirs"),
                keepMine: artiseT("artise|notes|keep_mine"),
                keepTheirs: artiseT("artise|notes|keep_theirs"),
                combine: artiseT("artise|notes|combine"),
                keepCopy: artiseT("artise|notes|keep_copy"),
                discard: artiseT("artise|notes|discard"),
                keepEditing: artiseT("artise|notes|keep_editing"),
                leave: artiseT("artise|notes|leave"),
                moreActions: artiseT("artise|notes|more_actions"),
                rename: artiseT("artise|notes|rename"),
                move: artiseT("artise|notes|move"),
                delete: artiseT("artise|notes|delete"),
                newFolder: artiseT("artise|notes|new_folder"),
                folderName: artiseT("artise|notes|folder_name"),
                upload: artiseT("artise|notes|upload"),
                moveHere: artiseT("artise|notes|move_here"),
                history: artiseT("artise|notes|history"),
                restore: artiseT("artise|notes|restore"),
                backToNote: artiseT("artise|notes|back_to_note"),
                linkedFrom: artiseT("artise|notes|linked_from"),
                search: artiseT("artise|notes|search"),
                clearSearch: artiseT("artise|notes|clear_search"),
            },
            search: { query: "", state: "idle", results: [] },
        });
        if (props.roomId) {
            this.disposables.trackListener(props.client, RoomStateEvent.Events, this.onStateEvent as () => void);
            const onFocus = (): void => void this.refresh();
            window.addEventListener("focus", onFocus);
            this.disposables.track(() => window.removeEventListener("focus", onFocus));
        }
        this.disposables.track(() => this.freeUrls());
        this.disposables.track(() => clearTimeout(this.searchTimer));
        void this.load();
    }

    private freeUrls(): void {
        for (const url of this.urls) this.props.files.revoke(url);
        this.urls = [];
        this.photos.clear();
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
        // The same note drawn again (a task ticked, a save) keeps its photos; anything else frees them.
        const sameNote = content.kind === "note" && content.path === this.snapshot.current.selectedPath;
        if (!sameNote) this.freeUrls();
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
        this.snapshot.merge({
            items: this.visibleItems(),
            editor: undefined,
            choice: undefined,
            notice: undefined,
            problem: undefined,
            history: undefined,
            backlinks: undefined,
        });
        this.note = null;
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
            this.note = { path, text: note.content, version: note.version };
            void this.loadBacklinks(id, path);
            await this.showNote(id, path, note.content);
        } catch (e) {
            if (this.isDisposed || id !== this.loadId) return;
            this.setContent({ kind: "error", text: errorText(e) }, path);
        }
    }

    private track(url: string): string {
        this.urls.push(url);
        return url;
    }

    /** A note's text as the page draws it, with the photos already downloaded in place. */
    private documentFor(path: string, text: string): ArtiseNoteDocument {
        // Notes that aren't Markdown (.txt, .csv, .json, .yaml) are shown as they are.
        const document: ArtiseNoteDocument =
            extensionOf(path) === "md" ? noteDocument(text, [...this.files.keys()], path) : [{ type: "code", text }];
        return mapEmbeds(document, (embed) =>
            embed.path && this.photos.has(embed.path) ? { ...embed, src: this.photos.get(embed.path) } : embed,
        );
    }

    /** Draws a note, then downloads its photos that aren't here yet and draws it again with them. */
    private async showNote(id: number, path: string, text: string): Promise<void> {
        const title = displayName(path);
        const document = this.documentFor(path, text);
        this.setContent({ kind: "note", path, title, document }, path);
        const { api, roomId } = this.props;
        if (!roomId) return;
        const wanted = new Set<string>();
        visitEmbeds(document, (embed) => {
            const size = embed.path ? (this.files.get(embed.path)?.size ?? Infinity) : Infinity;
            if (embed.image && embed.path && !this.photos.has(embed.path) && size <= MAX_EMBED_BYTES) {
                wanted.add(embed.path);
            }
        });
        if (wanted.size === 0) return;
        await Promise.all(
            [...wanted].map(async (photo) => {
                try {
                    const raw = await api.raw(roomId, photo);
                    if (this.isDisposed || id !== this.loadId) return;
                    const type = `image/${extensionOf(photo)}`;
                    this.photos.set(photo, this.track(this.props.files.url(new Blob([raw.blob], { type }))));
                } catch (e) {
                    logger.warn("Artise: couldn't load a photo in a note", e);
                }
            }),
        );
        if (this.isDisposed || id !== this.loadId || this.note?.path !== path) return;
        const current = this.snapshot.current;
        if (current.content.kind === "note" && current.content.path === path) {
            this.snapshot.merge({
                content: { kind: "note", path, title, document: this.documentFor(path, this.note.text) },
            });
        }
        if (current.editor?.path === path) {
            this.snapshot.merge({
                editor: { ...current.editor, preview: this.documentFor(path, current.editor.draft) },
            });
        }
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
            // While the person edits or chooses, their text stays: saving merges with what changed.
            const busy = !!this.snapshot.current.editor || !!this.snapshot.current.choice;
            if (!busy && selected && this.files.get(selected)?.version !== before) await this.open(selected);
        } catch (e) {
            logger.warn("Artise: couldn't refresh the notes", e);
        }
    }

    private readonly onStateEvent = (event: MatrixEvent): void => {
        if (event.getType() === NOTES_STATE_EVENT && event.getRoomId() === this.props.roomId) void this.refresh();
    };

    /** True while there's text the person would lose: unsaved edits, or a choice not made yet. */
    private hasUnsaved(): boolean {
        const { editor, choice } = this.snapshot.current;
        return !!editor?.dirty || !!choice;
    }

    /** Goes on at once, or first asks about unsaved changes. */
    private guard(go: () => void, restorePath: string | null = null): void {
        if (!this.hasUnsaved()) {
            go();
            return;
        }
        this.leaveTo = go;
        this.restorePath = restorePath;
        this.snapshot.merge({ confirmLeave: { text: artiseT("artise|notes|unsaved") } });
    }

    /** Whether the page would lose unsaved changes if closed now (for the browser's own warning). */
    public get unsaved(): boolean {
        return this.hasUnsaved();
    }

    /** The page's address changed (back/forward in the browser): show that file. */
    public showPath(path: string | null): void {
        if (path === this.snapshot.current.selectedPath) return;
        const editing = this.snapshot.current.editor?.path ?? this.snapshot.current.selectedPath;
        if (this.hasUnsaved()) {
            this.guard(() => this.showPath(path), editing);
            return;
        }
        if (path) {
            void this.open(path);
        } else {
            this.loadId++;
            this.setContent({ kind: "none", text: artiseT("artise|notes|pick") }, null);
        }
    }

    public back = (): void => this.guard(() => this.props.leave(this.props.roomId));

    public retry = (): void => void this.load();

    public chooseChat = (roomId: string): void => this.props.setLocation(roomId, null);

    public select = (path: string): void =>
        this.guard(() => {
            this.props.setLocation(this.props.roomId, path);
            void this.open(path);
        });

    public toggleFolder = (path: string): void => {
        if (this.expanded.has(path)) this.expanded.delete(path);
        else this.expanded.add(path);
        this.snapshot.merge({ items: this.visibleItems() });
    };

    public openLink = (path: string | null, target: string): void => {
        if (path) {
            this.select(path);
        } else {
            this.guard(() => {
                this.loadId++;
                this.snapshot.merge({ editor: undefined, choice: undefined });
                this.setContent({ kind: "error", text: artiseT("artise|notes|missing", { name: target }) }, null);
            });
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

    public edit = (): void => {
        const note = this.note;
        if (!note) return;
        this.editBase = note.version;
        this.cursor = note.text.length;
        this.snapshot.merge({
            notice: undefined,
            problem: undefined,
            editor: {
                path: note.path,
                title: displayName(note.path),
                draft: note.text,
                preview: this.documentFor(note.path, note.text),
                dirty: false,
                saving: false,
            },
        });
    };

    public changeDraft = (draft: string, cursor: number): void => {
        const editor = this.snapshot.current.editor;
        if (!editor) return;
        if (cursor >= 0) this.cursor = cursor;
        const files = [...this.files.values()].map((file) => ({ path: file.path, note: file.note }));
        const original = this.snapshot.current.editor?.hint ? null : (this.note?.text ?? null);
        this.snapshot.merge({
            editor: {
                ...editor,
                draft,
                // Combining is never "unchanged": saving it is the choice.
                dirty: original === null || draft !== original,
                preview: this.documentFor(editor.path, draft),
                suggestions: cursor >= 0 ? (linkSuggestions(draft, cursor, files) ?? undefined) : undefined,
                error: undefined,
            },
        });
    };

    public save = (): void => {
        const editor = this.snapshot.current.editor;
        if (!editor || editor.saving) return;
        this.snapshot.merge({ editor: { ...editor, saving: true, suggestions: undefined } });
        void this.saveText(editor.path, editor.draft, this.editBase);
    };

    public cancelEdit = (): void =>
        this.guard(() => {
            this.snapshot.merge({ editor: undefined });
        });

    public toggleTask = (line: number): void => {
        const note = this.note;
        if (!note || this.snapshot.current.editor || this.snapshot.current.choice) return;
        const text = toggleTask(note.text, line);
        if (text === null) {
            void this.open(note.path);
            return;
        }
        // Drawn ticked at once; the save follows (and is undone if it fails).
        this.setContent(
            {
                kind: "note",
                path: note.path,
                title: displayName(note.path),
                document: this.documentFor(note.path, text),
            },
            note.path,
        );
        void this.saveText(note.path, text, note.version);
    };

    /**
     * Saves a note's text on `base`, then shows what the server kept. A conflict or a deletion meanwhile asks the
     * person what to keep; other problems keep the text and say why.
     */
    private async saveText(path: string, text: string, base: string | null): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        try {
            const saved = await api.saveNote(roomId, path, text, base);
            if (this.isDisposed) return;
            const kept = saved.merged && saved.content !== undefined ? saved.content : text;
            const file = this.files.get(path);
            this.files.set(path, {
                path,
                version: saved.version,
                size: new Blob([kept]).size,
                modified: Math.floor(Date.now() / 1000),
                note: true,
            });
            if (!file) this.snapshot.merge({ items: this.visibleItems() });
            this.note = { path, text: kept, version: saved.version };
            this.conflictCurrent = null;
            this.snapshot.merge({
                editor: undefined,
                choice: undefined,
                notice: saved.merged ? artiseT("artise|notes|merged") : undefined,
                problem: undefined,
            });
            await this.showNote(this.loadId, path, kept);
        } catch (e) {
            if (this.isDisposed) return;
            if (e instanceof NotesApiError && e.code === "conflict" && e.current) {
                this.conflictCurrent = e.current;
                this.snapshot.merge({
                    editor: undefined,
                    choice: { kind: "conflict", text: e.text, mine: text, theirs: e.current.content ?? "" },
                });
            } else if (e instanceof NotesApiError && e.code === "deleted") {
                this.snapshot.merge({ editor: undefined, choice: { kind: "deleted", text: e.text, mine: text } });
            } else if (this.snapshot.current.editor) {
                const editor = this.snapshot.current.editor;
                this.snapshot.merge({ editor: { ...editor, saving: false, error: errorText(e) } });
            } else {
                // A task that couldn't be ticked: back as it was, and why.
                if (this.note) await this.showNote(this.loadId, this.note.path, this.note.text);
                this.snapshot.merge({ problem: errorText(e), choice: undefined });
            }
        }
    }

    public keepMine = (): void => {
        const { choice } = this.snapshot.current;
        const current = this.conflictCurrent;
        const path = this.note?.path;
        if (choice?.kind !== "conflict" || !current || !path) return;
        void this.saveText(path, choice.mine, current.version);
    };

    public keepTheirs = (): void => {
        const { choice } = this.snapshot.current;
        const current = this.conflictCurrent;
        if (choice?.kind !== "conflict" || !current) return;
        const text = current.content ?? "";
        const file = this.files.get(current.path);
        if (file) this.files.set(current.path, { ...file, version: current.version });
        this.note = { path: current.path, text, version: current.version };
        this.conflictCurrent = null;
        this.snapshot.merge({ choice: undefined });
        void this.showNote(this.loadId, current.path, text);
    };

    public combine = (): void => {
        const { choice } = this.snapshot.current;
        const current = this.conflictCurrent;
        if (choice?.kind !== "conflict" || !current) return;
        const draft = combineVersions(choice.mine, current.content ?? "");
        this.editBase = current.version;
        this.snapshot.merge({
            choice: undefined,
            editor: {
                path: current.path,
                title: displayName(current.path),
                draft,
                preview: this.documentFor(current.path, draft),
                dirty: true,
                saving: false,
                hint: artiseT("artise|notes|combine_hint"),
            },
        });
    };

    public keepCopy = (): void => {
        const { choice } = this.snapshot.current;
        const path = this.note?.path ?? this.snapshot.current.selectedPath;
        if (choice?.kind !== "deleted" || !path) return;
        void this.saveText(path, choice.mine, null);
    };

    public discard = (): void => {
        if (this.snapshot.current.choice?.kind !== "deleted") return;
        this.note = null;
        this.snapshot.merge({ choice: undefined });
        this.setContent({ kind: "none", text: artiseT("artise|notes|pick") }, null);
        this.props.setLocation(this.props.roomId, null);
        void this.refresh();
    };

    public keepEditing = (): void => {
        this.leaveTo = null;
        this.snapshot.merge({ confirmLeave: undefined });
        // Back in the browser had already changed the address: put the note being edited back.
        if (this.restorePath) this.props.setLocation(this.props.roomId, this.restorePath);
        this.restorePath = null;
    };

    public leaveWithoutSaving = (): void => {
        const go = this.leaveTo;
        this.leaveTo = null;
        this.restorePath = null;
        this.conflictCurrent = null;
        this.snapshot.merge({ confirmLeave: undefined, editor: undefined, choice: undefined });
        go?.();
    };

    public dismissNotice = (): void => this.snapshot.merge({ notice: undefined, problem: undefined });

    public newNote = (): void => this.guard(() => this.snapshot.merge({ naming: { name: "", saving: false } }));

    public changeName = (name: string): void => {
        const naming = this.snapshot.current.naming;
        if (naming) this.snapshot.merge({ naming: { ...naming, name, error: undefined } });
    };

    public cancelNaming = (): void => this.snapshot.merge({ naming: undefined });

    /** Creates the named note in the folder of what's open, then opens it to write in. */
    public createNote = (): void => {
        const naming = this.snapshot.current.naming;
        const { api, roomId } = this.props;
        if (!naming || naming.saving || !roomId) return;
        const folder = parentOf(this.snapshot.current.selectedPath ?? "");
        const result = newNotePath(folder, naming.name, new Set([...this.files.keys(), ...this.folders]));
        if ("problem" in result) {
            const key = result.problem === "exists" ? "artise|notes|name_exists" : "artise|notes|name_invalid";
            this.snapshot.merge({ naming: { ...naming, error: artiseT(key) } });
            return;
        }
        const { path } = result;
        this.snapshot.merge({ naming: { ...naming, saving: true } });
        void (async () => {
            try {
                const saved = await api.saveNote(roomId, path, "", null);
                if (this.isDisposed) return;
                this.files.set(path, {
                    path,
                    version: saved.version,
                    size: 0,
                    modified: Math.floor(Date.now() / 1000),
                    note: true,
                });
                for (let parent = parentOf(path); parent; parent = parentOf(parent)) this.expanded.add(parent);
                this.snapshot.merge({ naming: undefined, items: this.visibleItems() });
                this.props.setLocation(roomId, path);
                this.loadId++;
                this.note = { path, text: "", version: saved.version };
                await this.showNote(this.loadId, path, "");
                this.edit();
            } catch (e) {
                if (this.isDisposed) return;
                const text =
                    e instanceof NotesApiError && e.code === "exists"
                        ? artiseT("artise|notes|name_exists")
                        : errorText(e);
                this.snapshot.merge({ naming: { ...naming, saving: false, error: text } });
            }
        })();
    };

    private isFolder(path: string): boolean {
        return this.folders.has(path);
    }

    private allPaths(): string[] {
        return [...this.files.keys(), ...this.folders];
    }

    private setAction(action: ArtiseNotesViewSnapshot["action"]): void {
        this.snapshot.merge({ action });
    }

    /** The open action with `saving` or `error` changed. */
    private updateAction(change: { saving?: boolean; error?: string }): void {
        const action = this.snapshot.current.action;
        if (action) this.setAction({ ...action, ...change });
    }

    /** A file action's failure as one sentence: "changed meanwhile" rather than the save conflict's "same lines". */
    private actionError(e: unknown, isFolder: boolean): string {
        if (e instanceof NotesApiError) {
            if (e.code === "conflict") return artiseT("artise|notes|changed_meanwhile");
            if (e.code === "exists" && isFolder) return artiseT("artise|notes|folder_exists");
        }
        return errorText(e);
    }

    public rename = (path: string): void =>
        this.guard(() => {
            const isFolder = this.isFolder(path);
            this.setAction({
                kind: "rename",
                path,
                isFolder,
                name: isFolder ? basename(path) : displayName(path),
                saving: false,
            });
        });

    public move = (path: string): void =>
        this.guard(() => {
            const isFolder = this.isFolder(path);
            const name = isFolder ? basename(path) : displayName(path);
            const targets = moveTargets(path, isFolder, this.folders).map((target) => ({
                ...target,
                label: target.path || artiseT("artise|notes|move_top_level"),
            }));
            this.setAction({
                kind: "move",
                path,
                isFolder,
                title: artiseT("artise|notes|move_title", { name }),
                targets,
                saving: false,
            });
        });

    public remove = (path: string): void =>
        this.guard(() => {
            const isFolder = this.isFolder(path);
            const name = isFolder ? basename(path) : displayName(path);
            const title = artiseT("artise|notes|delete_title", { name });
            if (isFolder) {
                const inside = folderContents(path, this.files.values(), this.folders);
                const parts = [
                    inside.notes ? artiseT("artise|notes|count_notes", { count: inside.notes }) : null,
                    inside.files ? artiseT("artise|notes|count_files", { count: inside.files }) : null,
                    inside.folders ? artiseT("artise|notes|count_folders", { count: inside.folders }) : null,
                ].filter((part): part is string => !!part);
                const message = parts.length
                    ? artiseT("artise|notes|delete_folder_message", { contents: parts.join(", ") })
                    : artiseT("artise|notes|delete_folder_empty");
                this.setAction({
                    kind: "delete",
                    path,
                    isFolder,
                    title,
                    message,
                    confirmLabel: artiseT("artise|notes|delete_folder"),
                    saving: false,
                });
                return;
            }
            const note = this.files.get(path)?.note ?? false;
            const message = artiseT(note ? "artise|notes|delete_note_message" : "artise|notes|delete_file_message");
            this.setAction({
                kind: "delete",
                path,
                isFolder,
                title,
                message,
                confirmLabel: artiseT("artise|notes|delete"),
                saving: false,
            });
            if (!note) void this.addUsedIn(path, message);
        });

    /** Before a photo or file is deleted: which notes show or link it (from `/links`). */
    private async addUsedIn(path: string, message: string): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        try {
            const links = await api.links(roomId, path);
            const action = this.snapshot.current.action;
            if (this.isDisposed || action?.kind !== "delete" || action.path !== path) return;
            const notes = [...new Set(links.backlinks.map((link) => displayName(link.path)))];
            if (!notes.length) return;
            const usedIn = artiseT("artise|notes|delete_used_in", { notes: notes.join(", ") });
            this.setAction({ ...action, message: `${message} ${usedIn}` });
        } catch (e) {
            logger.warn("Artise: couldn't read where a file is used", e);
        }
    }

    public newFolder = (): void =>
        this.setAction({ kind: "newFolder", name: "", hint: artiseT("artise|notes|folder_name_hint"), saving: false });

    public changeActionName = (name: string): void => {
        const action = this.snapshot.current.action;
        if (action?.kind === "rename" || action?.kind === "newFolder")
            this.setAction({ ...action, name, error: undefined });
    };

    public cancelAction = (): void => this.setAction(undefined);

    public confirmAction = (target?: string): void => {
        const action = this.snapshot.current.action;
        const { roomId } = this.props;
        if (!action || action.saving || !roomId) return;
        switch (action.kind) {
            case "rename": {
                const result = renamedPath(action.path, action.name, action.isFolder, this.allPaths());
                if ("problem" in result) {
                    const key =
                        result.problem === "invalid"
                            ? "artise|notes|error|bad_path"
                            : action.isFolder
                              ? "artise|notes|folder_exists"
                              : "artise|notes|error|exists";
                    this.updateAction({ error: artiseT(key) });
                    return;
                }
                if (result.path === action.path) {
                    this.setAction(undefined);
                    return;
                }
                void this.doMove(action.path, result.path, action.isFolder);
                return;
            }
            case "move": {
                if (target === undefined) return;
                const to = movedPath(action.path, target);
                if (to === action.path) return;
                if (this.allPaths().some((path) => path.toLowerCase() === to.toLowerCase())) {
                    this.updateAction({
                        error: artiseT(action.isFolder ? "artise|notes|folder_exists" : "artise|notes|error|exists"),
                    });
                    return;
                }
                void this.doMove(action.path, to, action.isFolder);
                return;
            }
            case "delete":
                void this.doDelete(action.path, action.isFolder);
                return;
            case "newFolder": {
                const result = newFolderPath(action.name, this.allPaths());
                if ("problem" in result) {
                    this.updateAction({
                        error: artiseT(
                            result.problem === "exists" ? "artise|notes|folder_exists" : "artise|notes|error|bad_path",
                        ),
                    });
                    return;
                }
                void this.doCreateFolder(result.path);
            }
        }
    };

    private async doMove(from: string, to: string, isFolder: boolean): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        this.updateAction({ saving: true, error: undefined });
        try {
            let linksUpdated: string[];
            if (isFolder) {
                linksUpdated = (await api.moveFolder(roomId, from, to)).linksUpdated;
            } else {
                const version = this.files.get(from)?.version ?? "";
                linksUpdated = (await api.move(roomId, from, to, version)).linksUpdated;
            }
            if (this.isDisposed) return;
            this.setAction(undefined);
            // Open folders and the open note follow the move.
            this.expanded = new Set([...this.expanded].map((path) => pathAfterFolderMove(path, from, to)));
            if (isFolder) this.expanded.add(to);
            for (let parent = parentOf(to); parent; parent = parentOf(parent)) this.expanded.add(parent);
            const selected = this.snapshot.current.selectedPath;
            const next = selected ? pathAfterFolderMove(selected, from, to) : null;
            await this.reloadTree();
            if (selected && next && (next !== selected || linksUpdated.includes(next))) {
                this.props.setLocation(roomId, next);
                await this.open(next);
            }
        } catch (e) {
            if (this.isDisposed) return;
            this.updateAction({ saving: false, error: this.actionError(e, isFolder) });
            if (e instanceof NotesApiError && e.code === "conflict") void this.reloadTree();
        }
    }

    private async doDelete(path: string, isFolder: boolean): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        this.updateAction({ saving: true, error: undefined });
        try {
            if (isFolder) {
                const inside = folderContents(path, this.files.values(), this.folders);
                await api.deleteFolder(roomId, path, inside.notes + inside.files + inside.folders > 0);
            } else {
                await api.deleteFile(roomId, path, this.files.get(path)?.version ?? "");
            }
            if (this.isDisposed) return;
            this.setAction(undefined);
            const selected = this.snapshot.current.selectedPath;
            if (selected && (selected === path || selected.startsWith(`${path}/`))) {
                this.note = null;
                this.loadId++;
                this.snapshot.merge({ editor: undefined, choice: undefined });
                this.setContent({ kind: "none", text: artiseT("artise|notes|pick") }, null);
                this.props.setLocation(roomId, null);
            }
            await this.reloadTree();
        } catch (e) {
            if (this.isDisposed) return;
            if (e instanceof NotesApiError && e.code === "not_empty") {
                // Something was added meanwhile: ask again with what's inside now.
                await this.reloadTree();
                this.remove(path);
                return;
            }
            this.updateAction({ saving: false, error: this.actionError(e, isFolder) });
            if (e instanceof NotesApiError && e.code === "conflict") void this.reloadTree();
        }
    }

    private async doCreateFolder(path: string): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        this.updateAction({ saving: true, error: undefined });
        try {
            await api.createFolder(roomId, path);
            if (this.isDisposed) return;
            this.setAction(undefined);
            for (let folder = path; folder; folder = parentOf(folder)) {
                this.folders.add(folder);
                this.expanded.add(folder);
            }
            this.snapshot.merge({ items: this.visibleItems() });
            void this.reloadTree();
        } catch (e) {
            if (this.isDisposed) return;
            this.updateAction({ saving: false, error: this.actionError(e, true) });
        }
    }

    /** The tree again in full (after the person changed it), keeping open folders and the open note. */
    private async reloadTree(): Promise<void> {
        this.etag = undefined;
        await this.refresh();
    }

    public upload = (files: File[]): void => void this.uploadAll(files);

    public attach = (files: File[]): void =>
        void (async () => {
            const paths = await this.uploadAll(files);
            const editor = this.snapshot.current.editor;
            if (this.isDisposed || !editor || !paths.length) return;
            // Each on its own line, as the app writes embeds; by name unless the name is used twice.
            const names = paths.map((path) => {
                const name = basename(path);
                const twice = [...this.files.keys()].filter((other) => basename(other) === name).length > 1;
                return `![[${twice ? path : name}]]`;
            });
            const at = Math.min(this.cursor, editor.draft.length);
            const before = editor.draft.slice(0, at);
            const after = editor.draft.slice(at);
            const lead = before && !before.endsWith("\n") ? "\n" : "";
            const trail = after.startsWith("\n") ? "" : "\n";
            const inserted = `${lead}${names.join("\n")}${trail}`;
            this.changeDraft(before + inserted + after, -1);
            this.cursor = at + inserted.length;
        })();

    /** Uploads files one at a time to free names in `attachments/`; returns the paths that made it. */
    private async uploadAll(files: File[]): Promise<string[]> {
        const { api, roomId } = this.props;
        if (!roomId) return [];
        const done: string[] = [];
        for (const file of files) {
            if (this.isDisposed) break;
            if (file.size > MAX_UPLOAD_BYTES) {
                this.snapshot.merge({ problem: artiseT("artise|notes|upload_too_big") });
                continue;
            }
            const path = freeAttachmentPath(file.name, this.allPaths());
            this.snapshot.merge({ uploading: artiseT("artise|notes|uploading", { name: basename(path) }) });
            try {
                const blob = await this.props.files.prepare(file);
                if (blob.size > MAX_UPLOAD_BYTES) throw new NotesApiError("too_big", 413);
                const saved = await api.putRaw(roomId, path, blob);
                this.files.set(saved.path, {
                    path: saved.path,
                    version: saved.version,
                    size: blob.size,
                    modified: Math.floor(Date.now() / 1000),
                    note: false,
                });
                this.folders.add(parentOf(saved.path));
                done.push(saved.path);
            } catch (e) {
                if (this.isDisposed) break;
                const tooBig = e instanceof NotesApiError && e.code === "too_big";
                this.snapshot.merge({
                    problem: artiseT(tooBig ? "artise|notes|upload_too_big" : "artise|notes|upload_failed"),
                });
            }
        }
        if (this.isDisposed) return done;
        this.snapshot.merge({ uploading: undefined, items: this.visibleItems() });
        if (done.length) void this.reloadTree();
        return done;
    }

    /** "Enlazada desde": the notes that link to the open one. */
    private async loadBacklinks(id: number, path: string): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        try {
            const links = await api.links(roomId, path);
            if (this.isDisposed || id !== this.loadId) return;
            const seen = new Set<string>();
            const backlinks = links.backlinks
                .filter((link) => link.path !== path && !seen.has(link.path) && seen.add(link.path))
                .map((link) => ({ path: link.path, name: displayName(link.path), line: link.line }));
            this.snapshot.merge({ backlinks: backlinks.length ? backlinks : undefined });
        } catch (e) {
            logger.warn("Artise: couldn't read a note's links", e);
        }
    }

    private static when(at: string): string {
        const date = new Date(at);
        if (Number.isNaN(date.getTime())) return at;
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
    }

    public openHistory = (): void => {
        const note = this.note;
        const { api, roomId } = this.props;
        if (!note || !roomId) return;
        const base = {
            path: note.path,
            title: displayName(note.path),
            emptyText: artiseT("artise|notes|history_empty"),
            items: [],
        };
        this.historyText = null;
        this.snapshot.merge({ history: { ...base, state: "loading" }, notice: undefined, problem: undefined });
        void (async () => {
            try {
                const versions = await api.history(roomId, note.path);
                if (this.isDisposed || this.snapshot.current.history?.path !== note.path) return;
                this.historyVersions = new Map(versions.map((version) => [version.commit, version]));
                const items = versions.map((version) => ({
                    commit: version.commit,
                    label: artiseT("artise|notes|history_entry", {
                        by: version.by,
                        when: NotesPageViewModel.when(version.at),
                    }),
                    message: version.message,
                }));
                this.snapshot.merge({ history: { ...base, state: "ready", items } });
            } catch (e) {
                if (this.isDisposed) return;
                this.snapshot.merge({ history: { ...base, state: "error", errorText: errorText(e) } });
            }
        })();
    };

    public closeHistory = (): void => {
        this.historyText = null;
        this.snapshot.merge({ history: undefined });
    };

    public viewVersion = (commit: string): void => {
        const history = this.snapshot.current.history;
        const { api, roomId } = this.props;
        if (!history || !roomId) return;
        const version = this.historyVersions.get(commit);
        void (async () => {
            try {
                const old = await api.note(roomId, history.path, commit);
                const current = this.snapshot.current.history;
                if (this.isDisposed || current?.path !== history.path) return;
                this.historyText = old.content;
                const caption = artiseT("artise|notes|history_version", {
                    when: version ? NotesPageViewModel.when(version.at) : commit,
                    by: version?.by ?? "",
                });
                this.snapshot.merge({
                    history: {
                        ...current,
                        viewing: { commit, caption, document: this.documentFor(history.path, old.content) },
                    },
                });
            } catch (e) {
                if (this.isDisposed) return;
                this.snapshot.merge({ history: { ...history, state: "error", errorText: errorText(e) } });
            }
        })();
    };

    /** Saves the old version as the note's text: a normal edit on the current version, as the contract says. */
    public restoreVersion = (): void => {
        const note = this.note;
        const text = this.historyText;
        if (!note || text === null) return;
        this.historyText = null;
        this.snapshot.merge({ history: undefined });
        void this.saveText(note.path, text, note.version);
    };

    public changeSearch = (query: string): void => {
        clearTimeout(this.searchTimer);
        const id = ++this.searchId;
        // One letter or none: nothing to ask yet; the list shows again.
        if (query.trim().length < 2) {
            this.snapshot.merge({ search: { query, state: "idle", results: [] } });
            return;
        }
        this.snapshot.merge({ search: { ...this.snapshot.current.search, query, state: "loading" } });
        // Ask once the person pauses typing.
        this.searchTimer = setTimeout(() => void this.runSearch(id, query.trim()), 300);
    };

    private async runSearch(id: number, query: string): Promise<void> {
        const { api, roomId } = this.props;
        if (!roomId) return;
        try {
            const found = await api.search(roomId, query);
            if (this.isDisposed || id !== this.searchId) return;
            const results = found.map((result) => ({
                path: result.path,
                name: displayName(result.path),
                lines: [...new Set(result.lines)],
            }));
            this.snapshot.merge({
                search: {
                    query: this.snapshot.current.search.query,
                    state: "ready",
                    results,
                    message: results.length ? undefined : artiseT("artise|notes|search_empty", { query }),
                },
            });
        } catch (e) {
            if (this.isDisposed || id !== this.searchId) return;
            this.snapshot.merge({
                search: {
                    query: this.snapshot.current.search.query,
                    state: "error",
                    results: [],
                    message: errorText(e),
                },
            });
        }
    }

    public clearSearch = (): void => {
        clearTimeout(this.searchTimer);
        this.searchId++;
        this.snapshot.merge({ search: { query: "", state: "idle", results: [] } });
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
