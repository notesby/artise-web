/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { escapeHtml, SHELL_CSP, SHELL_ORIGIN } from "../shell/render.js";

/** The rail's width, in pixels: the workspaces' views start right of it. */
export const RAIL_WIDTH = 72;

/** One workspace on the rail. */
export interface RailItem {
    name: string;
    /** Up to two letters, when the workspace has no logo. */
    initials: string;
    /** The workspace's colour as `#RRGGBB`. */
    color: string;
    hasLogo: boolean;
    unread: number;
    shown: boolean;
}

/** Artise's blue, for a workspace without its own colour. */
export const DEFAULT_COLOR = "#2449A0";

/**
 * A workspace's initials: the first letters of its first two words ("Casa Moreno" → "CM"), or the first two
 * letters of a one-word name ("Artise" → "AR"). Letters and digits only, in capitals.
 *
 * @param name - the workspace's name.
 */
export function initials(name: string): string {
    const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
    const [first = "?", second] = words;
    const letters = second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2);
    return letters.toLocaleUpperCase();
}

/**
 * The count as the badge shows it: up to 99, then "99+".
 *
 * @param count - the unread count.
 */
export function badgeText(count: number): string {
    return count > 99 ? "99+" : String(count);
}

/**
 * The rail: a link per workspace (Ctrl/⌘+number in order), the shown one marked, each with its logo or initials
 * and its unread count. No scripts, like the shell's pages: a link asks the main process to show that workspace.
 *
 * @param items - the open workspaces, in order.
 * @param unreadLabel - the screen-reader text for a count, e.g. "Sin leer: 3".
 * @param addLabel - the "+" button's text, "Agregar espacio de trabajo".
 * @param language - the page's language.
 */
export function renderRail(
    items: readonly RailItem[],
    unreadLabel: (count: number) => string,
    addLabel: string,
    language: string,
): string {
    const links = items
        .map((item, index) => {
            const label = item.unread > 0 ? `${item.name}. ${unreadLabel(item.unread)}` : item.name;
            const face = item.hasLogo
                ? `<img src="${SHELL_ORIGIN}/rail/logo?i=${index}" alt="">`
                : `<span class="initials">${escapeHtml(item.initials)}</span>`;
            const count = item.unread > 0 ? `<span class="count">${badgeText(item.unread)}</span>` : "";
            return `<a class="item item-${index}${item.shown ? " shown" : ""}" href="${SHELL_ORIGIN}/rail/show?i=${index}" title="${escapeHtml(
                item.name,
            )}" aria-label="${escapeHtml(label)}"${item.shown ? ' aria-current="page"' : ""}>${face}${count}</a>`;
        })
        .join("\n");
    return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${SHELL_CSP}">
<link rel="stylesheet" href="${SHELL_ORIGIN}/rail.css">
</head>
<body>
<nav>
${links}
<a class="item add" href="${SHELL_ORIGIN}/rail/add" title="${escapeHtml(addLabel)}" aria-label="${escapeHtml(addLabel)}"><span class="plus">+</span></a>
</nav>
</body>
</html>
`;
}

/**
 * The rail's styles, with each workspace's colour as a rule (the page's policy refuses inline styles).
 *
 * @param items - the open workspaces, in order.
 */
export function railCss(items: readonly RailItem[]): string {
    const colors = items
        .map((item, index) => {
            const color = /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : DEFAULT_COLOR;
            return `.item-${index} .initials { background: ${color}; }`;
        })
        .join("\n");
    return `:root {
    color-scheme: light dark;
    --bg: #f0f2f5;
    --marker: #1b1d22;
    --critical: #d51928;
    --focus: #0467dd;
    --secondary: #656d77;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
    :root { --bg: #1d1f24; --marker: #ebeef2; --critical: #fd3e3c; --focus: #4187eb; --secondary: #808994; }
}
html, body { margin: 0; height: 100%; background: var(--bg); overflow: hidden; }
nav { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px 0; }
.item { position: relative; display: block; width: 44px; height: 44px; border-radius: 12px; text-decoration: none; }
.item img, .item .initials { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center;
    justify-content: center; object-fit: cover; color: #fff; font-weight: 600; font-size: 16px; }
.item::before { content: ""; position: absolute; left: -14px; top: 18px; width: 4px; height: 8px; border-radius: 0 4px 4px 0;
    background: var(--marker); opacity: 0; transition: height 0.1s, top 0.1s; }
.item.shown::before { opacity: 1; top: 4px; height: 36px; }
.item:hover::before { opacity: 1; }
.item:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.count { position: absolute; right: -6px; top: -6px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box;
    border-radius: 9px; background: var(--critical); color: #fff; font-size: 11px; font-weight: 600; line-height: 18px;
    text-align: center; border: 2px solid var(--bg); box-sizing: content-box; }
.add .plus { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    font-size: 24px; color: var(--secondary); border: 1px dashed var(--secondary); box-sizing: border-box; }
.add:hover .plus { color: var(--marker); border-color: var(--marker); }
${colors}
`;
}
