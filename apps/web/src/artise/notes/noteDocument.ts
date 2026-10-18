/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import * as commonmark from "commonmark";
import {
    type ArtiseNoteBlock,
    type ArtiseNoteDocument,
    type ArtiseNoteInline,
    type ArtiseNoteListItem,
} from "@element-hq/web-shared-components";

/** Photos the page draws inline. SVG isn't one: it can carry scripts, so it's only downloaded. */
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"]);

/** Obsidian links and embeds: `[[Note]]`, `[[folder/Note#Heading|text]]`, `![[foto.jpg]]`. */
const WIKI_LINK = /(!?)\[\[([^\]\n]+?)\]\]/g;

const TASK = /^\[([ xX])\]\s+/;

/** The extension of a path, lowercased, without the dot. */
export function extensionOf(path: string): string {
    const name = path.split("/").pop() ?? "";
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Whether a file is a photo the page shows inline. */
export function isImagePath(path: string): boolean {
    return IMAGE_EXTENSIONS.has(extensionOf(path));
}

function basename(path: string): string {
    return path.split("/").pop() ?? path;
}

/** Fewer folders first, then alphabetical: the same pick every time a name is used twice. */
function byShortestPath(a: string, b: string): number {
    return a.split("/").length - b.split("/").length || a.localeCompare(b);
}

function withoutMd(path: string): string {
    return path.toLowerCase().endsWith(".md") ? path.slice(0, -3) : path;
}

/**
 * Finds the file a link points to, as Obsidian does: the exact path, the path with `.md`, a path relative to the
 * note's folder, then any file with that name (the shortest path first, when the name is used twice).
 *
 * @param target - The link without its `#heading` or `|text`, e.g. `Súper`, `Listas/Súper` or `foto.jpg`.
 * @param files - Every file path in the chat's notes.
 * @param fromPath - The note the link is in.
 */
export function resolveTarget(target: string, files: readonly string[], fromPath: string): string | null {
    const wanted = target.trim().replace(/^\/+/, "");
    if (!wanted) return null;
    const folder = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/") + 1) : "";
    const candidates = [wanted, `${wanted}.md`, `${folder}${wanted}`, `${folder}${wanted}.md`];
    for (const candidate of candidates) {
        if (files.includes(candidate)) return candidate;
    }
    const name = basename(wanted).toLowerCase();
    const matches = files.filter((file) => {
        const fileName = basename(file).toLowerCase();
        return fileName === name || withoutMd(fileName) === name;
    });
    if (wanted.includes("/")) {
        const suffix = wanted.toLowerCase();
        const bySuffix = matches.filter((file) => {
            const lower = file.toLowerCase();
            return lower.endsWith(suffix) || withoutMd(lower).endsWith(suffix);
        });
        if (bySuffix.length) return bySuffix.sort(byShortestPath)[0];
        return null;
    }
    return matches.length ? matches.sort(byShortestPath)[0] : null;
}

function isExternal(href: string): boolean {
    return /^(https?:|mailto:)/i.test(href);
}

function hasScheme(href: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

function decode(href: string): string {
    try {
        return decodeURIComponent(href);
    } catch {
        return href;
    }
}

/** Joins neighbouring text pieces (commonmark splits text at brackets and around dropped links). */
function mergeText(nodes: ArtiseNoteInline[]): ArtiseNoteInline[] {
    const out: ArtiseNoteInline[] = [];
    for (const node of nodes) {
        const last = out[out.length - 1];
        if (node.type === "text" && last?.type === "text") {
            out[out.length - 1] = { type: "text", text: last.text + node.text };
        } else if (node.type !== "text" || node.text) {
            out.push(node);
        }
    }
    return out;
}

class Converter {
    public constructor(
        private readonly files: readonly string[],
        private readonly fromPath: string,
    ) {}

    private wikiParts(text: string): ArtiseNoteInline[] {
        const parts: ArtiseNoteInline[] = [];
        let last = 0;
        for (const match of text.matchAll(WIKI_LINK)) {
            const index = match.index ?? 0;
            if (index > last) parts.push({ type: "text", text: text.slice(last, index) });
            const [, bang, inner] = match;
            const [linkPart, shown] = inner.split("|", 2);
            const target = linkPart.split("#")[0].trim();
            const path = resolveTarget(target, this.files, this.fromPath);
            if (bang) {
                const name = basename(path ?? target);
                parts.push({ type: "embed", target, path, name, image: isImagePath(path ?? target) });
            } else {
                const text = (shown ?? linkPart).trim() || target;
                parts.push({ type: "noteLink", target, path, text });
            }
            last = index + match[0].length;
        }
        if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
        return parts;
    }

    private inlines(node: commonmark.Node): ArtiseNoteInline[] {
        const out: ArtiseNoteInline[] = [];
        let pendingText = "";
        const flush = (): void => {
            if (pendingText) out.push(...this.wikiParts(pendingText));
            pendingText = "";
        };
        for (let child = node.firstChild; child; child = child.next) {
            switch (child.type) {
                case "text":
                case "html_inline":
                    // Raw HTML stays text, as written.
                    pendingText += child.literal ?? "";
                    continue;
                default:
                    flush();
            }
            switch (child.type) {
                case "softbreak":
                case "linebreak":
                    // Obsidian keeps a note's line breaks.
                    out.push({ type: "break" });
                    break;
                case "code":
                    out.push({ type: "code", text: child.literal ?? "" });
                    break;
                case "emph":
                    out.push({ type: "emph", children: this.inlines(child) });
                    break;
                case "strong":
                    out.push({ type: "strong", children: this.inlines(child) });
                    break;
                case "link":
                    out.push(...this.link(child));
                    break;
                case "image":
                    out.push(this.image(child));
                    break;
                default:
                    out.push(...this.inlines(child));
            }
        }
        flush();
        return mergeText(out);
    }

    private plainText(node: commonmark.Node): string {
        let text = "";
        for (let child = node.firstChild; child; child = child.next) {
            text += child.literal ?? this.plainText(child);
        }
        return text;
    }

    private link(node: commonmark.Node): ArtiseNoteInline[] {
        const href = node.destination ?? "";
        const children = this.inlines(node);
        if (isExternal(href)) return [{ type: "link", href, children }];
        // javascript:, data:, file:, a bare #heading and the like: the words only.
        if (!href || hasScheme(href) || href.startsWith("#")) return children;
        const target = decode(href.split("#")[0]);
        const path = resolveTarget(target, this.files, this.fromPath);
        return [{ type: "noteLink", target, path, text: this.plainText(node) }];
    }

    private image(node: commonmark.Node): ArtiseNoteInline {
        const href = node.destination ?? "";
        const alt = this.plainText(node);
        if (isExternal(href) || hasScheme(href)) {
            // A photo on another site isn't loaded (it would tell that site who reads the note): a link to it.
            return isExternal(href)
                ? { type: "link", href, children: [{ type: "text", text: alt || href }] }
                : { type: "text", text: alt };
        }
        const target = decode(href);
        const path = resolveTarget(target, this.files, this.fromPath);
        return {
            type: "embed",
            target,
            path,
            name: alt || basename(path ?? target),
            image: isImagePath(path ?? target),
        };
    }

    private listItem(node: commonmark.Node): ArtiseNoteListItem {
        const children = this.blocks(node);
        const first = children[0];
        if (first?.type === "paragraph" && first.children[0]?.type === "text") {
            const lead = first.children[0];
            const task = TASK.exec(lead.text);
            if (task) {
                const rest = lead.text.slice(task[0].length);
                const inlines: ArtiseNoteInline[] = rest
                    ? [{ type: "text", text: rest }, ...first.children.slice(1)]
                    : first.children.slice(1);
                return {
                    checked: task[1] !== " ",
                    line: node.sourcepos?.[0]?.[0],
                    children: [{ type: "paragraph", children: inlines }, ...children.slice(1)],
                };
            }
        }
        return { children };
    }

    public blocks(node: commonmark.Node): ArtiseNoteBlock[] {
        const out: ArtiseNoteBlock[] = [];
        for (let child = node.firstChild; child; child = child.next) {
            switch (child.type) {
                case "paragraph":
                    out.push({ type: "paragraph", children: this.inlines(child) });
                    break;
                case "heading":
                    out.push({
                        type: "heading",
                        level: Math.min(6, Math.max(1, child.level)) as 1 | 2 | 3 | 4 | 5 | 6,
                        children: this.inlines(child),
                    });
                    break;
                case "code_block":
                    out.push({ type: "code", text: (child.literal ?? "").replace(/\n$/, "") });
                    break;
                case "html_block":
                    out.push({
                        type: "paragraph",
                        children: [{ type: "text", text: (child.literal ?? "").replace(/\n$/, "") }],
                    });
                    break;
                case "block_quote":
                    out.push({ type: "quote", children: this.blocks(child) });
                    break;
                case "list": {
                    const items: ArtiseNoteListItem[] = [];
                    for (let item = child.firstChild; item; item = item.next) items.push(this.listItem(item));
                    const ordered = child.listType === "ordered";
                    out.push({ type: "list", ordered, start: ordered ? (child.listStart ?? 1) : undefined, items });
                    break;
                }
                case "thematic_break":
                    out.push({ type: "rule" });
                    break;
                default:
                    out.push(...this.blocks(child));
            }
        }
        return out;
    }
}

/**
 * Reads a note's Markdown into the parts the Notes page draws.
 *
 * @param markdown - The note's text.
 * @param files - Every file path in the chat's notes, to find what `[[links]]` and embeds point to.
 * @param fromPath - The note's own path (links can be relative to its folder).
 */
export function noteDocument(markdown: string, files: readonly string[], fromPath: string): ArtiseNoteDocument {
    const tree = new commonmark.Parser().parse(markdown);
    return new Converter(files, fromPath).blocks(tree);
}
