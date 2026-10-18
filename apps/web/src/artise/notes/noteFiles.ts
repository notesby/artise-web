/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

/** Where the app puts photos and documents (the contract's "How the app writes notes"). */
export const ATTACHMENTS_FOLDER = "attachments";

/** The API's upload limit. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Photos are shrunk to this many pixels on the long side before uploading, as the phones do. */
export const MAX_PHOTO_SIDE = 2560;

function basename(path: string): string {
    return path.split("/").pop() ?? path;
}

function parentOf(path: string): string {
    return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function join(folder: string, name: string): string {
    return folder ? `${folder}/${name}` : name;
}

function splitExtension(name: string): [string, string] {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
}

function taken(path: string, existing: Iterable<string>, except?: string): boolean {
    const lower = path.toLowerCase();
    for (const other of existing) {
        if (other !== except && other.toLowerCase() === lower) return true;
    }
    return false;
}

/** One name in a path, as the API accepts it: not empty, not hidden, no `..`, at most 100 characters. */
function validName(name: string): boolean {
    return !!name && !name.startsWith(".") && name !== ".." && name.length <= 100 && !name.includes("/");
}

export type FileProblem = "invalid" | "exists";

/**
 * The new path for a note, file or folder renamed in place. A note named without `.md` keeps it; a file keeps its
 * own extension when the new name has none.
 */
export function renamedPath(
    path: string,
    name: string,
    isFolder: boolean,
    existing: Iterable<string>,
): { path: string } | { problem: FileProblem } {
    const trimmed = name.trim();
    if (!validName(trimmed)) return { problem: "invalid" };
    let file = trimmed;
    if (!isFolder) {
        const [, ext] = splitExtension(basename(path));
        if (ext && !splitExtension(trimmed)[1]) file = `${trimmed}${ext}`;
    }
    const target = join(parentOf(path), file);
    if (target === path) return { path };
    // A change of case only is the same file to the server's disk on some systems: allowed.
    if (target.toLowerCase() !== path.toLowerCase() && taken(target, existing, path)) return { problem: "exists" };
    return { path: target };
}

/** A note, file or folder moved into another folder (`""` is the top level), keeping its name. */
export function movedPath(path: string, folder: string): string {
    return join(folder, basename(path));
}

/** Where a folder may be moved: the top level and every folder not inside it, with where it is now. */
export function moveTargets(
    path: string,
    isFolder: boolean,
    folders: Iterable<string>,
): { path: string; here: boolean }[] {
    const here = parentOf(path);
    const all = ["", ...[...folders].sort((a, b) => a.localeCompare(b))];
    return all
        .filter((folder) => !isFolder || (folder !== path && !folder.startsWith(`${path}/`)))
        .map((folder) => ({ path: folder, here: folder === here }));
}

/**
 * A new folder's path from what the person typed: `/` makes a folder inside another (`Recetas/Postres`), as the
 * phones' hint says. Checked as the API checks it (`POST /folder`).
 */
export function newFolderPath(name: string, existing: Iterable<string>): { path: string } | { problem: FileProblem } {
    const parts = name
        .trim()
        .split("/")
        .map((part) => part.trim());
    if (parts.some((part) => !validName(part))) return { problem: "invalid" };
    const path = parts.join("/");
    if (path.length > 255) return { problem: "invalid" };
    if (taken(path, existing)) return { problem: "exists" };
    return { path };
}

/** A free path in `attachments/` for an upload: `foto.jpg`, then `foto (2).jpg`, `foto (3).jpg`… */
export function freeAttachmentPath(fileName: string, existing: Iterable<string>): string {
    const all = [...existing];
    const clean = basename(fileName).replace(/^\.+/, "").trim() || "archivo";
    const [stem, ext] = splitExtension(clean);
    let candidate = join(ATTACHMENTS_FOLDER, clean);
    for (let n = 2; taken(candidate, all); n++) candidate = join(ATTACHMENTS_FOLDER, `${stem} (${n})${ext}`);
    return candidate;
}

/** What's inside a folder, for "everything inside is deleted": its notes, other files and subfolders. */
export function folderContents(
    path: string,
    files: Iterable<{ path: string; note: boolean }>,
    folders: Iterable<string>,
): { notes: number; files: number; folders: number } {
    const prefix = `${path}/`;
    let notes = 0;
    let others = 0;
    for (const file of files) {
        if (!file.path.startsWith(prefix)) continue;
        if (file.note) notes++;
        else others++;
    }
    const subfolders = [...folders].filter((folder) => folder.startsWith(prefix)).length;
    return { notes, files: others, folders: subfolders };
}

/** A path inside a moved folder, moved with it. */
export function pathAfterFolderMove(path: string, from: string, to: string): string {
    return path === from || path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path;
}
