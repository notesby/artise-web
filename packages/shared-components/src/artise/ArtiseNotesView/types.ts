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

/** The note being edited: its text, a preview, and what's suggested while typing a `[[link]]`. */
export interface ArtiseNotesEditor {
    path: string;
    title: string;
    draft: string;
    /** The draft drawn as the note will look. */
    preview: ArtiseNoteDocument;
    /** True when the draft differs from what's saved. */
    dirty: boolean;
    saving: boolean;
    /** Shown above the editor while combining two versions. */
    hint?: string;
    /** Why the last save failed; the draft is kept. */
    error?: string;
    /** For the `[[link]]` at the cursor: where its typed name starts, and the notes it could be. */
    suggestions?: { from: number; items: { name: string; path: string; insert: string }[] };
}

/** Another person changed the note while it was being edited: the person picks what to keep. */
export interface ArtiseNotesChoice {
    /** `conflict`: the same lines changed; `deleted`: the note was deleted meanwhile. */
    kind: "conflict" | "deleted";
    text: string;
    mine: string;
    /** The other version (for `conflict`). */
    theirs?: string;
}

/** Naming a new note. */
export interface ArtiseNotesNaming {
    name: string;
    /** Why the name can't be used. */
    error?: string;
    saving: boolean;
}

/** A file or folder action waiting for the person: a name to type, a folder to pick, or a delete to confirm. */
export type ArtiseNotesAction =
    | { kind: "rename"; path: string; isFolder: boolean; name: string; error?: string; saving: boolean }
    | { kind: "newFolder"; name: string; hint: string; error?: string; saving: boolean }
    | {
          kind: "move";
          path: string;
          isFolder: boolean;
          /** "Mover “Mole” a…". */
          title: string;
          /** Where it can go; `here` is where it is now. `label` names the top level "Notas (nivel principal)". */
          targets: { path: string; label: string; here: boolean }[];
          error?: string;
          saving: boolean;
      }
    | {
          kind: "delete";
          path: string;
          isFolder: boolean;
          /** "¿Borrar “Mole”?". */
          title: string;
          /** What deleting does, and (for a photo or file) which notes show it. */
          message: string;
          confirmLabel: string;
          error?: string;
          saving: boolean;
      };

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
    /** Set while a note is being edited. */
    editor?: ArtiseNotesEditor;
    /** Set when a save needs the person to choose. */
    choice?: ArtiseNotesChoice;
    /** Set while naming a new note. */
    naming?: ArtiseNotesNaming;
    /** Set when leaving would lose unsaved changes. */
    confirmLeave?: { text: string };
    /** A short message over the note, e.g. that other people's changes were combined with yours. */
    notice?: string;
    /** Something that couldn't be done (e.g. ticking a task while offline), over the note. */
    problem?: string;
    /** Set while a file or folder action waits for the person. */
    action?: ArtiseNotesAction;
    /** "Subiendo “foto.jpg”…" while an upload runs. */
    uploading?: string;
    labels: {
        back: string;
        retry: string;
        tree: string;
        task: string;
        download: string;
        open: string;
        chooseChat: string;
        edit: string;
        save: string;
        cancel: string;
        editor: string;
        preview: string;
        suggestions: string;
        newNote: string;
        name: string;
        create: string;
        mine: string;
        theirs: string;
        keepMine: string;
        keepTheirs: string;
        combine: string;
        keepCopy: string;
        discard: string;
        keepEditing: string;
        leave: string;
        moreActions: string;
        rename: string;
        move: string;
        delete: string;
        newFolder: string;
        folderName: string;
        upload: string;
        moveHere: string;
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
    /** Edit the note shown on the right. */
    edit: () => void;
    /** The editor's text or cursor changed. */
    changeDraft: (draft: string, cursor: number) => void;
    save: () => void;
    /** Stop editing (asks first when there are unsaved changes). */
    cancelEdit: () => void;
    /** Tick or untick the task on a line of the note shown, and save it. */
    toggleTask: (line: number) => void;
    /** Start naming a new note (in the folder of what's open). */
    newNote: () => void;
    changeName: (name: string) => void;
    createNote: () => void;
    cancelNaming: () => void;
    /** Conflict: save mine over theirs. */
    keepMine: () => void;
    /** Conflict: drop mine and show theirs. */
    keepTheirs: () => void;
    /** Conflict: edit both together, mine above the line. */
    combine: () => void;
    /** Deleted meanwhile: save my copy again. */
    keepCopy: () => void;
    /** Deleted meanwhile: drop my change. */
    discard: () => void;
    /** Unsaved changes: stay in the editor. */
    keepEditing: () => void;
    /** Unsaved changes: drop them and go where the person was going. */
    leaveWithoutSaving: () => void;
    /** Hide the notice or the problem. */
    dismissNotice: () => void;
    /** Start renaming a note, file or folder. */
    rename: (path: string) => void;
    /** Start moving a note, file or folder. */
    move: (path: string) => void;
    /** Ask before deleting a note, file or folder. */
    remove: (path: string) => void;
    /** Start naming a new folder. */
    newFolder: () => void;
    /** The name typed in a rename or new folder. */
    changeActionName: (name: string) => void;
    /** Do the action: for a move, `target` is the folder picked (`""` for the top level). */
    confirmAction: (target?: string) => void;
    cancelAction: () => void;
    /** Upload files to the chat's notes (`attachments/`). */
    upload: (files: File[]) => void;
    /** Upload files and put them in the note being edited, at the cursor. */
    attach: (files: File[]) => void;
}

export type ArtiseNotesViewModel = ViewModel<ArtiseNotesViewSnapshot, ArtiseNotesViewActions>;
