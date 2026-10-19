/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { artiseT, type DesktopTextKey } from "../i18n/artiseT.js";
import { escapeHtml, renderShell } from "./render.js";

const es = (key: DesktopTextKey): string => artiseT(key, {}, "es");

describe("renderShell", () => {
    it("offers each provider and email on the welcome screen", () => {
        const html = renderShell({ screen: "welcome", providers: ["apple", "google", "microsoft"] }, es, "es");
        expect(html).toContain('href="artise-shell://shell/sign-in?provider=apple">Continuar con Apple</a>');
        expect(html).toContain('href="artise-shell://shell/sign-in?provider=microsoft">Continuar con Microsoft</a>');
        expect(html).toContain('href="artise-shell://shell/sign-in">Continuar con correo</a>');
        expect(html).toContain('<html lang="es">');
    });

    it("has no scripts, and a policy that refuses them", () => {
        const html = renderShell({ screen: "welcome", providers: ["google"] }, es, "es");
        expect(html).not.toMatch(/<script|\son[a-z]+=/i);
        expect(html).toContain("script-src 'none'");
    });

    it("offers only 'try again' when Artise can't be reached", () => {
        const html = renderShell({ screen: "welcome", providers: [], error: "unreachable" }, es, "es");
        expect(html).toContain("No se puede conectar con Artise.");
        expect(html).toContain('href="artise-shell://shell/retry">Intentar de nuevo</a>');
        expect(html).not.toContain("Continuar con correo");
    });

    it("says why the person has to sign in again", () => {
        const html = renderShell({ screen: "welcome", providers: ["google"], error: "expired" }, es, "es");
        expect(html).toContain("Vuelve a entrar con tu Artise ID.");
    });

    it("says nothing when the person went back from the browser", () => {
        const html = renderShell({ screen: "welcome", providers: ["google"], error: "cancelled" }, es, "es");
        expect(html).not.toContain('class="error"');
    });

    it("lists the workspaces as ticked boxes in one form", () => {
        const html = renderShell(
            {
                screen: "workspaces",
                workspaces: [
                    { serverName: "artise.co", name: "Casa", selected: true },
                    { serverName: "mas-k8s.artise.co", name: "Prueba MAS", selected: false },
                ],
            },
            es,
            "es",
        );
        expect(html).toContain('<form method="get" action="artise-shell://shell/open">');
        expect(html).toContain('name="workspace" value="artise.co" checked>');
        expect(html).toContain('name="workspace" value="mas-k8s.artise.co">');
        expect(html).toContain(">Abrir</button>");
        expect(html).toContain("Iniciar sesión de otra forma");
    });

    it("escapes a workspace's name from the server", () => {
        const html = renderShell(
            {
                screen: "workspaces",
                workspaces: [{ serverName: "x.example", name: '<img src=x onerror="a">', selected: true }],
            },
            es,
            "es",
        );
        expect(html).toContain("&lt;img src=x onerror=&quot;a&quot;&gt;");
        expect(html).not.toContain("<img src=x");
    });

    it("explains an empty list as the phones do", () => {
        const html = renderShell({ screen: "workspaces", workspaces: [] }, es, "es");
        expect(html).toContain("Todavía no estás en ningún espacio de trabajo.");
    });
});

describe("escapeHtml", () => {
    it("escapes every character that matters in text and attributes", () => {
        expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
            "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
        );
    });
});
