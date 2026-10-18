/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

/** Between the two versions when combining them, as on Android (`CONFLICT_SEPARATOR`). */
export const CONFLICT_SEPARATOR = "\n\n———\n\n";

/** The file types `/note` reads and writes (the contract's `note: true`). */
const NOTE_EXTENSIONS = new Set(["md", "txt", "csv", "json", "yaml", "yml"]);

/** How many suggestions to show for a `[[`. */
const MAX_SUGGESTIONS = 8;

/** Your text above the line, the other person's below: the person keeps what they want. */
export function combineVersions(mine: string, theirs: string): string {
    return `${mine}${CONFLICT_SEPARATOR}${theirs}`;
}

/**
 * Ticks or unticks the task on a line (`- [ ]` ↔ `- [x]`): a one-character edit, as the contract asks.
 *
 * @param text - The note's text.
 * @param line - The task's line, from 1.
 * @returns The new text, or `null` when that line isn't a task (the note changed meanwhile).
 */
export function toggleTask(text: string, line: number): string | null {
    const lines = text.split("\n");
    const current = lines[line - 1];
    if (current === undefined) return null;
    const match = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\])/.exec(current);
    if (!match) return null;
    const ticked = match[2] === " " ? "x" : " ";
    lines[line - 1] = `${match[1]}${ticked}${match[3]}${current.slice(match[0].length)}`;
    return lines.join("\n");
}

/** One suggestion while typing a `[[link]]`: what to show, and what replaces the typed text. */
export interface LinkSuggestion {
    name: string;
    path: string;
    /** Inserted from {@link LinkSuggestions.from} to the cursor, closing the link: `Mole]]`. */
    insert: string;
}

export interface LinkSuggestions {
    /** Where the typed name starts (just after `[[`). */
    from: number;
    items: LinkSuggestion[];
}

function fold(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
}

function basename(path: string): string {
    return path.split("/").pop() ?? path;
}

function noteName(path: string): string {
    const name = basename(path);
    return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

/**
 * Suggestions for the `[[` link being typed at the cursor: notes for `[[`, photos and files too for `![[`.
 * A name used twice gets its path, so the link points to the right one.
 *
 * @param text - The editor's text.
 * @param cursor - Where the cursor is.
 * @param files - Every file path in the chat's notes, with whether it's a note.
 */
export function linkSuggestions(
    text: string,
    cursor: number,
    files: readonly { path: string; note: boolean }[],
): LinkSuggestions | null {
    const before = text.slice(0, cursor);
    const open = before.lastIndexOf("[[");
    if (open < 0) return null;
    const typed = before.slice(open + 2);
    if (typed.includes("]]") || typed.includes("\n") || typed.length > 100) return null;
    const embed = before[open - 1] === "!";
    const query = fold(typed.split("|")[0]);
    if (typed.includes("|") || typed.includes("#")) return null;

    const candidates = files.filter((file) => (embed ? true : file.note));
    const nameCount = new Map<string, number>();
    for (const file of candidates) {
        const name = embed ? basename(file.path) : noteName(file.path);
        nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
    }
    const items = candidates
        .map((file) => {
            const name = embed ? basename(file.path) : noteName(file.path);
            const unique = (nameCount.get(name) ?? 0) === 1;
            const target = unique ? name : embed ? file.path : file.path.replace(/\.md$/i, "");
            return { name, path: file.path, insert: `${target}]]`, folded: fold(name), foldedPath: fold(file.path) };
        })
        .filter((item) => !query || item.folded.includes(query) || item.foldedPath.includes(query))
        // Names that start with what was typed first, then the rest, each alphabetical.
        .sort(
            (a, b) =>
                Number(!a.folded.startsWith(query)) - Number(!b.folded.startsWith(query)) ||
                a.name.localeCompare(b.name),
        )
        .slice(0, MAX_SUGGESTIONS)
        .map(({ name, path, insert }) => ({ name, path, insert }));
    return items.length ? { from: open + 2, items } : null;
}

/** Why a new note's name can't be used, or `null` when it can. */
export type NameProblem = "invalid" | "exists";

/**
 * The path for a new note named by the person, in a folder: `.md` is added unless the name already ends in a
 * note type (`Lista.txt`).
 *
 * @returns The path, or the reason the name can't be used.
 */
export function newNotePath(
    folder: string,
    name: string,
    existing: ReadonlySet<string>,
): { path: string } | { problem: NameProblem } {
    const trimmed = name.trim();
    if (!trimmed || trimmed.includes("/") || trimmed.startsWith(".") || trimmed.length > 100) {
        return { problem: "invalid" };
    }
    const dot = trimmed.lastIndexOf(".");
    const hasNoteType = dot > 0 && NOTE_EXTENSIONS.has(trimmed.slice(dot + 1).toLowerCase());
    const file = hasNoteType ? trimmed : `${trimmed}.md`;
    const path = folder ? `${folder}/${file}` : file;
    const lower = path.toLowerCase();
    for (const other of existing) {
        if (other.toLowerCase() === lower) return { problem: "exists" };
    }
    return { path };
}
