/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ArtiseId } from "../artiseId/ArtiseId.js";
import { type ArtiseIdError, type Result } from "../artiseId/authorization.js";
import { type ArtiseIdProvider } from "../artiseId/signInConfig.js";
import { type DesktopTextKey } from "../i18n/artiseT.js";
import { type ArtiseSettings } from "../settings.js";
import { SHELL_CSS, SHELL_ORIGIN, renderShell } from "./render.js";
import { PROVIDER_ORDER, type ShellState, listWorkspaces, offeredProviders } from "./state.js";

/** What the shell needs: Artise ID, its settings, its view, and a way to open the chosen workspaces. */
export interface ShellDeps {
    artiseId: Pick<ArtiseId, "signInConfig" | "signIn" | "cancelSignIn" | "isSignedIn" | "workspaces" | "signOut">;
    readSettings(): ArtiseSettings;
    updateSettings(change: Partial<ArtiseSettings>): void;
    /** Shows the shell's page (again), over the window. */
    show(): void;
    /** Takes the shell's page away. */
    hide(): void;
    /** Opens these workspaces in the window; fails when the first can't be reached. */
    openWorkspaces(serverNames: string[]): Promise<Result<unknown>>;
    /** The Artise icon, as PNG bytes. */
    icon(): Promise<Uint8Array>;
    /** Artise's texts in the current language, and that language's code. */
    t(key: DesktopTextKey): string;
    language(): string;
}

const HTML = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };

/**
 * The desktop's own first screens: "Continuar con …" (Artise ID), then the list of the person's workspaces.
 *
 * The page has no scripts. Each button is a link or a form to `artise-shell://shell/<action>`, which only this
 * shell's session answers ({@link Shell.handle}); the answer is a redirect back to the page, drawn for the new
 * state. Long steps (the browser sign-in, reading the list) show the page again when they end.
 */
export class Shell {
    private state: ShellState = { screen: "loading" };

    public constructor(private readonly deps: ShellDeps) {}

    /** What the shell shows now. */
    public get current(): ShellState {
        return this.state;
    }

    /**
     * Opens the workspaces opened last time when the person is still signed in; otherwise shows the welcome.
     */
    public async start(): Promise<void> {
        const opened = this.deps.readSettings().openWorkspaces ?? [];
        const signedIn = await this.deps.artiseId.isSignedIn();
        if (opened.length > 0 && signedIn && (await this.deps.openWorkspaces(opened)).ok) return;
        this.deps.show();
        if (signedIn) {
            await this.loadWorkspaces();
        } else {
            await this.welcome();
        }
    }

    private set(state: ShellState): void {
        this.state = state;
        this.deps.show();
    }

    private async welcome(error?: ArtiseIdError): Promise<void> {
        const config = await this.deps.artiseId.signInConfig();
        this.set({
            screen: "welcome",
            providers: config.ok ? offeredProviders(config.value.providers) : [],
            error: error ?? (config.ok ? undefined : config.error),
        });
    }

    private async signIn(provider: ArtiseIdProvider | undefined): Promise<void> {
        this.set({ screen: "waiting" });
        const result = await this.deps.artiseId.signIn(provider);
        if (result.ok) {
            await this.loadWorkspaces();
        } else {
            await this.welcome(result.error === "cancelled" ? undefined : result.error);
        }
    }

    private async loadWorkspaces(): Promise<void> {
        this.set({ screen: "workspaces", workspaces: "loading" });
        const result = await this.deps.artiseId.workspaces();
        if (result.ok) {
            const opened = this.deps.readSettings().openWorkspaces ?? [];
            this.set({ screen: "workspaces", workspaces: listWorkspaces(result.value, opened) });
        } else if (result.error === "expired") {
            await this.welcome("expired");
        } else {
            this.set({ screen: "workspaces", workspaces: [], error: result.error });
        }
    }

    private async open(chosen: string[]): Promise<void> {
        const state = this.state;
        if (state.screen !== "workspaces" || state.workspaces === "loading") return;
        // Only workspaces from the person's own list, whatever the form sent.
        const listed = new Set(state.workspaces.map((workspace) => workspace.serverName));
        const serverNames = chosen.filter((serverName) => listed.has(serverName));
        if (serverNames.length === 0) return;
        const list = state.workspaces.map((workspace) => ({
            ...workspace,
            selected: serverNames.includes(workspace.serverName),
        }));
        this.set({ screen: "workspaces", workspaces: "loading" });
        const opened = await this.deps.openWorkspaces(serverNames);
        if (opened.ok) {
            this.deps.updateSettings({ openWorkspaces: serverNames });
            this.deps.hide();
        } else {
            this.set({ screen: "workspaces", workspaces: list, error: opened.error });
        }
    }

    private async signOut(): Promise<void> {
        this.deps.updateSettings({ openWorkspaces: [] });
        await this.deps.artiseId.signOut(false);
        await this.welcome();
    }

    /**
     * Answers a request on the shell's scheme: the page, its styles and icon, or one of its actions.
     *
     * @param url - the requested URL.
     */
    public async handle(url: URL): Promise<Response> {
        // URL.origin is "null" for schemes the URL standard doesn't know, so compare the parts.
        if (`${url.protocol}//${url.host}` !== SHELL_ORIGIN) return new Response(null, { status: 404 });
        const back = (): Response => new Response(null, { status: 303, headers: { Location: `${SHELL_ORIGIN}/` } });
        switch (url.pathname) {
            case "/":
                return new Response(
                    renderShell(this.state, (key) => this.deps.t(key), this.deps.language()),
                    {
                        headers: HTML,
                    },
                );
            case "/shell.css":
                return new Response(SHELL_CSS, { headers: { "Content-Type": "text/css; charset=utf-8" } });
            case "/icon.png":
                return new Response(new Uint8Array(await this.deps.icon()), {
                    headers: { "Content-Type": "image/png" },
                });
            case "/sign-in": {
                if (this.state.screen !== "welcome") return back();
                const asked = url.searchParams.get("provider");
                const provider = PROVIDER_ORDER.find((known) => known === asked);
                void this.signIn(provider);
                return back();
            }
            case "/retry":
                if (this.state.screen === "welcome") void this.welcome();
                return back();
            case "/cancel":
                this.deps.artiseId.cancelSignIn();
                return back();
            case "/workspaces":
                void this.loadWorkspaces();
                return back();
            case "/open":
                void this.open(url.searchParams.getAll("workspace"));
                return back();
            case "/sign-out":
                void this.signOut();
                return back();
            default:
                return new Response(null, { status: 404 });
        }
    }
}
