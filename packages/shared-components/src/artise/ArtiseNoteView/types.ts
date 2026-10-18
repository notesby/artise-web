/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

/**
 * A note, read from its Markdown into plain parts the view draws as they are. There is no HTML in it: raw HTML
 * in a note is kept as text, so a note can't add scripts or styles to the page.
 */
export type ArtiseNoteDocument = ArtiseNoteBlock[];

/** One block of a note. */
export type ArtiseNoteBlock =
    | { type: "paragraph"; children: ArtiseNoteInline[] }
    | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: ArtiseNoteInline[] }
    | { type: "code"; text: string }
    | { type: "quote"; children: ArtiseNoteBlock[] }
    | { type: "list"; ordered: boolean; start?: number; items: ArtiseNoteListItem[] }
    | { type: "rule" };

/** A list item; `checked` is set for a task (`- [ ]` / `- [x]`). */
export interface ArtiseNoteListItem {
    checked?: boolean;
    children: ArtiseNoteBlock[];
}

/** Text and what sits inside it. */
export type ArtiseNoteInline =
    | { type: "text"; text: string }
    | { type: "code"; text: string }
    | { type: "emph"; children: ArtiseNoteInline[] }
    | { type: "strong"; children: ArtiseNoteInline[] }
    | { type: "break" }
    /** A web link (`https:`, `http:` or `mailto:` only), opened outside the app. */
    | { type: "link"; href: string; children: ArtiseNoteInline[] }
    /**
     * A link to another note or file in this chat: `[[Note]]`, `[[folder/Note|text]]`, or a Markdown link to a
     * file. `path` is the file it points to, or `null` when there's no such note yet.
     */
    | { type: "noteLink"; target: string; path: string | null; text: string }
    /**
     * A photo or file shown in the note: `![[foto.jpg]]` or `![](attachments/foto.jpg)`. `src` is set once the
     * photo is ready to draw; a file that isn't a photo, or a photo outside this chat, shows as its name.
     */
    | { type: "embed"; target: string; path: string | null; name: string; image: boolean; src?: string };
