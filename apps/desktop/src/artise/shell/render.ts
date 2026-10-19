/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type DesktopTextKey } from "../i18n/artiseT.js";
import { type ShellState } from "./state.js";

/** The shell's scheme: its pages, styles and the actions its links and forms ask for. */
export const SHELL_ORIGIN = "artise-shell://shell";

/** No scripts at all: every button is a link or a form the main process answers (see Shell.ts). */
export const SHELL_CSP = "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'";

type Translate = (key: DesktopTextKey) => string;

/**
 * Text safe to put in HTML, also inside attribute values.
 *
 * @param text - any text, such as a workspace's name from the server.
 */
export function escapeHtml(text: string): string {
    return text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function errorText(state: ShellState, t: Translate): string {
    if (!("error" in state) || !state.error || state.error === "cancelled") return "";
    const key: DesktopTextKey =
        state.error === "unreachable"
            ? "artise|desktop|welcome|error_unreachable"
            : state.error === "not_available"
              ? "artise|desktop|welcome|error_not_available"
              : state.error === "expired"
                ? "artise|desktop|welcome|error_expired"
                : "artise|desktop|welcome|error_refused";
    return `<p class="error" role="alert">${escapeHtml(t(key))}</p>`;
}

function body(state: ShellState, t: Translate): string {
    switch (state.screen) {
        case "loading":
            return `<p class="quiet" aria-busy="true">…</p>`;
        case "welcome": {
            if (state.error === "not_available" || state.error === "unreachable") {
                // Without the sign-in config there's nothing to press but "try again".
                return `<p class="subtitle">${escapeHtml(t("artise|desktop|welcome|subtitle"))}</p>
${errorText(state, t)}
<nav class="actions"><a class="button secondary" href="${SHELL_ORIGIN}/retry">${escapeHtml(
                    t("artise|desktop|welcome|retry"),
                )}</a></nav>`;
            }
            const providers = state.providers
                .map(
                    (provider) =>
                        `<a class="button primary" href="${SHELL_ORIGIN}/sign-in?provider=${provider}">${escapeHtml(
                            t(`artise|desktop|welcome|${provider}`),
                        )}</a>`,
                )
                .join("");
            return `<p class="subtitle">${escapeHtml(t("artise|desktop|welcome|subtitle"))}</p>
${errorText(state, t)}
<nav class="actions">${providers}<a class="button secondary" href="${SHELL_ORIGIN}/sign-in">${escapeHtml(
                t("artise|desktop|welcome|email"),
            )}</a></nav>`;
        }
        case "waiting":
            return `<p class="subtitle" aria-busy="true">${escapeHtml(t("artise|desktop|welcome|waiting"))}</p>
<nav class="actions"><a class="button secondary" href="${SHELL_ORIGIN}/cancel">${escapeHtml(
                t("artise|desktop|welcome|back"),
            )}</a></nav>`;
        case "workspaces": {
            const head = `<h2>${escapeHtml(t("artise|desktop|workspaces|title"))}</h2>`;
            const otherAccount = `<a class="link" href="${SHELL_ORIGIN}/sign-out">${escapeHtml(
                t("artise|desktop|workspaces|other_account"),
            )}</a>`;
            if (state.workspaces === "loading") {
                return `${head}<p class="quiet" aria-busy="true">${escapeHtml(t("artise|desktop|workspaces|loading"))}</p>`;
            }
            if (state.error) {
                return `${head}${errorText(state, t)}<nav class="actions"><a class="button primary" href="${SHELL_ORIGIN}/workspaces">${escapeHtml(
                    t("artise|desktop|welcome|retry"),
                )}</a>${otherAccount}</nav>`;
            }
            if (state.workspaces.length === 0) {
                return `${head}<p class="subtitle">${escapeHtml(t("artise|desktop|workspaces|none"))}</p><nav class="actions">${otherAccount}</nav>`;
            }
            const items = state.workspaces
                .map(
                    (workspace) => `<label class="workspace">
<input type="checkbox" name="workspace" value="${escapeHtml(workspace.serverName)}"${workspace.selected ? " checked" : ""}>
<span class="name">${escapeHtml(workspace.name)}</span><span class="server">${escapeHtml(workspace.serverName)}</span>
</label>`,
                )
                .join("\n");
            return `${head}<p class="subtitle">${escapeHtml(t("artise|desktop|workspaces|description"))}</p>
<form method="get" action="${SHELL_ORIGIN}/open">
<fieldset>${items}</fieldset>
<nav class="actions"><button class="button primary" type="submit">${escapeHtml(t("artise|desktop|workspaces|open"))}</button>${otherAccount}</nav>
</form>`;
        }
    }
}

/**
 * The shell's page for a state, in the person's language.
 *
 * @param state - what to show.
 * @param t - Artise's texts in the current language.
 * @param language - the page's language, for screen readers.
 */
export function renderShell(state: ShellState, t: Translate, language: string): string {
    return `<!doctype html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${SHELL_CSP}">
<title>Artise</title>
<link rel="stylesheet" href="${SHELL_ORIGIN}/shell.css">
</head>
<body>
<main>
<img class="logo" src="${SHELL_ORIGIN}/icon.png" alt="" width="72" height="72">
<h1>Artise</h1>
${body(state, t)}
</main>
</body>
</html>
`;
}

/** The shell's styles: Compound's look (Element's design system), light and dark, with no web fonts. */
export const SHELL_CSS = `:root {
    color-scheme: light dark;
    --bg: #ffffff;
    --text: #1b1d22;
    --secondary: #656d77;
    --border: #cdd3da;
    --primary-bg: #1b1d22;
    --primary-text: #ffffff;
    --critical: #d51928;
    --accent: #0467dd;
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
    :root {
        --bg: #101317;
        --text: #ebeef2;
        --secondary: #808994;
        --border: #3c4045;
        --primary-bg: #ebeef2;
        --primary-text: #101317;
        --critical: #fd3e3c;
        --accent: #4187eb;
    }
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; }
main { width: min(400px, 100% - 32px); display: flex; flex-direction: column; gap: 16px; text-align: center; padding: 32px 0; }
.logo { align-self: center; border-radius: 16px; }
h1 { font-size: 28px; line-height: 34px; font-weight: 600; margin: 0; }
h2 { font-size: 20px; line-height: 27px; font-weight: 600; margin: 8px 0 0; }
p { margin: 0; font-size: 15px; line-height: 22px; }
.subtitle, .quiet { color: var(--secondary); }
.error { color: var(--critical); }
.actions { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.button { display: block; width: 100%; border-radius: 9999px; padding: 10px 24px; font: inherit; font-size: 15px;
    font-weight: 600; line-height: 22px; text-decoration: none; cursor: pointer; text-align: center; }
.button.primary { background: var(--primary-bg); color: var(--primary-text); border: 1px solid var(--primary-bg); }
.button.secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
.button:focus-visible, .link:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.link { color: var(--accent); font-size: 15px; text-decoration: none; }
fieldset { border: 1px solid var(--border); border-radius: 12px; padding: 4px 0; margin: 0; text-align: left; }
.workspace { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; padding: 10px 16px; cursor: pointer; }
.workspace input { grid-row: span 2; align-self: center; width: 18px; height: 18px; accent-color: var(--primary-bg); }
.workspace .name { font-weight: 600; }
.workspace .server { color: var(--secondary); font-size: 13px; }
`;
