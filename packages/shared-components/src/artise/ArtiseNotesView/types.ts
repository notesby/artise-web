/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ViewModel } from "../../core/viewmodel";
import { type ArtiseNoteDocument } from "../ArtiseNoteView/types";

/** One row of the file list: a folder, a note or another file, indented by its depth. */
export interface ArtiseNotesTreeItem {
    path: string;
    name: string;
    depth: number;
    kind: "folder" | "note" | "file";
    /** For folders: whether its contents are shown. */
    expanded?: boolean;
}

/** What the right side shows. */
export type ArtiseNotesContent =
    /** Nothing picked yet, or an empty chat: a sentence. */
    | { kind: "none"; text: string }
    | { kind: "loading" }
    | { kind: "note"; path: string; title: string; document: ArtiseNoteDocument }
    /** A photo; `src` once it has downloaded. */
    | { kind: "image"; path: string; title: string; src?: string }
    /** Another file: downloaded, or (PDFs) opened in a new tab. `text` says so. */
    | { kind: "file"; path: string; title: string; text: string; canOpen: boolean }
    /** Something went wrong, or the link points to a note that doesn't exist: a sentence. */
    | { kind: "error"; text: string };

export interface ArtiseNotesViewSnapshot {
    /** "Notas". */
    title: string;
    /** The chat whose notes these are; empty while choosing a chat. */
    chatName: string;
    /** "loading" while the list loads, "error" if it couldn't, "ready" otherwise. */
    state: "loading" | "ready" | "error";
    /** The sentence for "error". */
    errorText?: string;
    /** With no chat picked: the chats with notes. Otherwise undefined. */
    chats?: { id: string; name: string }[];
    /** The visible rows of the file list (a collapsed folder's contents are left out). */
    items: ArtiseNotesTreeItem[];
    selectedPath: string | null;
    content: ArtiseNotesContent;
    /** Under the list: who can read notes ("Ari puede leer las notas de este chat…"). */
    privacyText: string;
    labels: {
        back: string;
        retry: string;
        tree: string;
        task: string;
        download: string;
        open: string;
        chooseChat: string;
    };
}

export interface ArtiseNotesViewActions {
    /** Back to the chat (or the app, while choosing a chat). */
    back: () => void;
    /** Try loading again after an error. */
    retry: () => void;
    /** Show a chat's notes. */
    chooseChat: (roomId: string) => void;
    /** Open a note or file from the list. */
    select: (path: string) => void;
    /** Open or close a folder in the list. */
    toggleFolder: (path: string) => void;
    /** A `[[link]]` in the note: `path` is `null` when that note doesn't exist yet. */
    openLink: (path: string | null, target: string) => void;
    /** An embedded file in the note (not a photo). */
    openEmbed: (path: string) => void;
    /** Save the file shown on the right to the computer. */
    download: (path: string) => void;
    /** Open the PDF shown on the right in a new tab. */
    openFile: (path: string) => void;
}

export type ArtiseNotesViewModel = ViewModel<ArtiseNotesViewSnapshot, ArtiseNotesViewActions>;
