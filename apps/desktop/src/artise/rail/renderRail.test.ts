/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { badgeText, initials, railCss, renderRail, type RailItem } from "./renderRail.js";

const ITEMS: RailItem[] = [
    { name: "Casa Moreno", initials: "CM", color: "#1F4E9C", hasLogo: false, unread: 3, shown: true },
    { name: "Taller <b>", initials: "TA", color: "red; }", hasLogo: true, unread: 0, shown: false },
];

describe("initials", () => {
    it.each([
        ["Casa Moreno", "CM"],
        ["Artise", "AR"],
        ["prueba mas k8s", "PM"],
        ["Ñandú", "ÑA"],
        ["  ", "?"],
    ])("%s → %s", (name, expected) => {
        expect(initials(name)).toBe(expected);
    });
});

describe("badgeText", () => {
    it("caps at 99+", () => {
        expect(badgeText(7)).toBe("7");
        expect(badgeText(120)).toBe("99+");
    });
});

describe("renderRail", () => {
    const html = renderRail(ITEMS, (count) => `Sin leer: ${count}`, "Agregar espacio de trabajo", "es");

    it("links each workspace, marks the shown one and shows its count", () => {
        expect(html).toContain('href="artise-shell://shell/rail/show?i=0"');
        expect(html).toContain('aria-current="page"');
        expect(html).toContain('<span class="count">3</span>');
        expect(html).toContain('aria-label="Casa Moreno. Sin leer: 3"');
    });

    it("uses the logo, served by the shell, when there is one", () => {
        expect(html).toContain('<img src="artise-shell://shell/rail/logo?i=1" alt="">');
    });

    it('ends with "+" to add a workspace', () => {
        expect(html).toContain('href="artise-shell://shell/rail/add" title="Agregar espacio de trabajo"');
    });

    it("escapes names and has no scripts", () => {
        expect(html).toContain('title="Taller &lt;b&gt;"');
        expect(html).not.toMatch(/<script|\son[a-z]+=/i);
    });
});

describe("railCss", () => {
    it("gives each workspace its colour, and Artise's blue for anything that isn't one", () => {
        const css = railCss(ITEMS);
        expect(css).toContain(".item-0 .initials { background: #1F4E9C; }");
        expect(css).toContain(".item-1 .initials { background: #2449A0; }");
        expect(css).not.toContain("red; }");
    });
});
