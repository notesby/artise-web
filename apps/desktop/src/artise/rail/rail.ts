/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { SHELL_ORIGIN } from "../shell/render.js";
import { type RailItem, railCss, renderRail } from "./renderRail.js";

/** What the rail shows and does. */
export interface RailDeps {
    /** The open workspaces, in order. */
    items(): RailItem[];
    /** A workspace's logo URL (https), if it has one. */
    logoUrl(index: number): string | undefined;
    /** Shows a workspace. */
    show(index: number): void;
    /** Downloads a logo. */
    fetch(url: string): Promise<Response>;
    unreadLabel(count: number): string;
    /** "+": opens "Agregar espacio de trabajo". */
    add(): void;
    addLabel(): string;
    language(): string;
}

/** The logo types the rail shows; an SVG in an `<img>` can't run scripts. */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

/**
 * The workspace rail's pages on the shell's scheme (`artise-shell://shell/rail…`): the rail, its styles, each
 * workspace's logo (downloaded here, so the page's policy can stay `img-src 'self'`) and the "show" action.
 */
export class Rail {
    private readonly logos = new Map<string, Promise<{ type: string; bytes: ArrayBuffer } | undefined>>();

    public constructor(private readonly deps: RailDeps) {}

    private logo(url: string): Promise<{ type: string; bytes: ArrayBuffer } | undefined> {
        let found = this.logos.get(url);
        if (!found) {
            found = (async (): Promise<{ type: string; bytes: ArrayBuffer } | undefined> => {
                try {
                    const response = await this.deps.fetch(url);
                    const type = response.headers.get("Content-Type")?.split(";")[0].trim() ?? "";
                    if (response.status !== 200 || !IMAGE_TYPES.has(type)) return undefined;
                    return { type, bytes: await response.arrayBuffer() };
                } catch {
                    return undefined;
                }
            })();
            this.logos.set(url, found);
        }
        return found;
    }

    /**
     * Answers a rail request, or undefined when the path isn't the rail's.
     *
     * @param url - the requested URL.
     */
    public async handle(url: URL): Promise<Response | undefined> {
        const index = Number(url.searchParams.get("i"));
        switch (url.pathname) {
            case "/rail":
                return new Response(
                    renderRail(
                        this.deps.items(),
                        (count) => this.deps.unreadLabel(count),
                        this.deps.addLabel(),
                        this.deps.language(),
                    ),
                    {
                        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
                    },
                );
            case "/rail.css":
                return new Response(railCss(this.deps.items()), {
                    headers: { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" },
                });
            case "/rail/show":
                if (Number.isInteger(index)) this.deps.show(index);
                return new Response(null, { status: 303, headers: { Location: `${SHELL_ORIGIN}/rail` } });
            case "/rail/add":
                this.deps.add();
                return new Response(null, { status: 303, headers: { Location: `${SHELL_ORIGIN}/rail` } });
            case "/rail/logo": {
                const logoUrl = Number.isInteger(index) ? this.deps.logoUrl(index) : undefined;
                const logo = logoUrl ? await this.logo(logoUrl) : undefined;
                if (!logo) return new Response(null, { status: 404 });
                return new Response(new Uint8Array(logo.bytes), { headers: { "Content-Type": logo.type } });
            }
            default:
                return undefined;
        }
    }
}
