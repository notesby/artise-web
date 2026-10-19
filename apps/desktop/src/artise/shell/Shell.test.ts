/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";

import { type Result } from "../artiseId/authorization.js";
import { type ArtiseWorkspace } from "../artiseId/ArtiseId.js";
import { type SignInConfig } from "../artiseId/signInConfig.js";
import { artiseT } from "../i18n/artiseT.js";
import { type ArtiseSettings } from "../settings.js";
import { Shell, type ShellDeps } from "./Shell.js";

const CONFIG: SignInConfig = {
    issuer: "https://id.artise.co",
    clientId: "395738224594584139",
    redirectUri: "co.artise.desktop:/vector/webapp/",
    scopes: ["openid"],
    providers: { google: "1", microsoft: "2", apple: "3" },
};
const WORKSPACES: ArtiseWorkspace[] = [
    { name: "Casa", serverName: "artise.co" },
    { name: "Prueba MAS", serverName: "mas-k8s.artise.co" },
];

function setUp(
    signedIn: boolean,
    settings: ArtiseSettings = {},
): { shell: Shell; deps: ShellDeps; saved: ArtiseSettings } {
    const saved: ArtiseSettings = { ...settings };
    const deps: ShellDeps = {
        artiseId: {
            signInConfig: vi.fn(async (): Promise<Result<SignInConfig>> => ({ ok: true, value: CONFIG })),
            signIn: vi.fn(async (): Promise<Result<void>> => ({ ok: true, value: undefined })),
            cancelSignIn: vi.fn(),
            isSignedIn: vi.fn(async () => signedIn),
            workspaces: vi.fn(async (): Promise<Result<ArtiseWorkspace[]>> => ({ ok: true, value: WORKSPACES })),
            signOut: vi.fn(async () => {}),
        },
        readSettings: () => saved,
        updateSettings: (change) => Object.assign(saved, change),
        show: vi.fn(),
        hide: vi.fn(),
        openServerNames: vi.fn(() => []),
        openWorkspaces: vi.fn(async (): Promise<Result<unknown>> => ({ ok: true, value: undefined })),
        icon: async () => new Uint8Array([137, 80, 78, 71]),
        t: (key) => artiseT(key, {}, "es"),
        language: () => "es",
    };
    return { shell: new Shell(deps), deps, saved };
}

const at = (path: string): URL => new URL(`artise-shell://shell${path}`);

describe("Shell", () => {
    let world: ReturnType<typeof setUp>;

    describe("first launch", () => {
        beforeEach(async () => {
            world = setUp(false);
            await world.shell.start();
        });

        it("shows the welcome with the providers", () => {
            expect(world.deps.show).toHaveBeenCalled();
            expect(world.shell.current).toEqual({ screen: "welcome", providers: ["apple", "google", "microsoft"] });
        });

        it("goes from a provider button to the workspace list, with no typing", async () => {
            // The person presses "Continuar con Google" and finishes in the browser.
            const answer = await world.shell.handle(at("/sign-in?provider=google"));
            expect(answer.status).toBe(303);
            expect(answer.headers.get("Location")).toBe("artise-shell://shell/");
            await vi.waitFor(() => expect(world.shell.current.screen).toBe("workspaces"));

            expect(world.deps.artiseId.signIn).toHaveBeenCalledWith("google");
            expect(world.shell.current).toEqual({
                screen: "workspaces",
                workspaces: [
                    { serverName: "artise.co", name: "Casa", selected: true },
                    { serverName: "mas-k8s.artise.co", name: "Prueba MAS", selected: true },
                ],
            });
        });

        it("lets the action's redirect show the page, and shows it again when the action ends", async () => {
            // Loading the page from inside the request would abort the request's own navigation.
            vi.mocked(world.deps.show).mockClear();
            let finish!: () => void;
            vi.mocked(world.deps.artiseId.signIn).mockReturnValue(
                new Promise((resolve) => (finish = () => resolve({ ok: false, error: "cancelled" }))),
            );
            await world.shell.handle(at("/sign-in"));
            expect(world.shell.current.screen).toBe("waiting");
            expect(world.deps.show).not.toHaveBeenCalled();
            finish();
            await vi.waitFor(() => expect(world.deps.show).toHaveBeenCalled());
        });

        it("ignores a provider it doesn't know", async () => {
            await world.shell.handle(at("/sign-in?provider=facebook"));
            await vi.waitFor(() => expect(world.deps.artiseId.signIn).toHaveBeenCalledWith(undefined));
        });

        it("opens the ticked workspaces and remembers them", async () => {
            await world.shell.handle(at("/sign-in"));
            await vi.waitFor(() => expect(world.shell.current.screen).toBe("workspaces"));

            await world.shell.handle(at("/open?workspace=mas-k8s.artise.co"));
            await vi.waitFor(() => expect(world.deps.hide).toHaveBeenCalled());
            expect(world.deps.openWorkspaces).toHaveBeenCalledWith(["mas-k8s.artise.co"]);
            expect(world.saved.openWorkspaces).toEqual(["mas-k8s.artise.co"]);
        });

        it("stays on the list, as ticked, when the workspace can't be reached", async () => {
            vi.mocked(world.deps.openWorkspaces).mockResolvedValue({ ok: false, error: "unreachable" });
            await world.shell.handle(at("/sign-in"));
            await vi.waitFor(() => expect(world.shell.current.screen).toBe("workspaces"));

            await world.shell.handle(at("/open?workspace=artise.co"));
            await vi.waitFor(() => expect(world.shell.current).toHaveProperty("error", "unreachable"));
            expect(world.shell.current).toEqual({
                screen: "workspaces",
                error: "unreachable",
                workspaces: [
                    { serverName: "artise.co", name: "Casa", selected: true },
                    { serverName: "mas-k8s.artise.co", name: "Prueba MAS", selected: false },
                ],
            });
            expect(world.deps.hide).not.toHaveBeenCalled();
            expect(world.saved.openWorkspaces).toBeUndefined();
        });

        it("opens only workspaces from the person's own list", async () => {
            await world.shell.handle(at("/sign-in"));
            await vi.waitFor(() => expect(world.shell.current.screen).toBe("workspaces"));

            await world.shell.handle(at("/open?workspace=evil.example"));
            expect(world.deps.openWorkspaces).not.toHaveBeenCalled();
        });

        it("goes back to the welcome when the person cancels in the browser", async () => {
            vi.mocked(world.deps.artiseId.signIn).mockResolvedValue({ ok: false, error: "cancelled" });
            await world.shell.handle(at("/sign-in"));
            await vi.waitFor(() => expect(world.shell.current.screen).toBe("welcome"));
            expect(world.shell.current).toEqual({ screen: "welcome", providers: ["apple", "google", "microsoft"] });
        });

        it("shows Artise ID's refusal on the welcome", async () => {
            vi.mocked(world.deps.artiseId.signIn).mockResolvedValue({ ok: false, error: "refused" });
            await world.shell.handle(at("/sign-in"));
            await vi.waitFor(() => expect(world.shell.current).toMatchObject({ screen: "welcome", error: "refused" }));
        });

        it("serves the page, its styles and the icon", async () => {
            const page = await world.shell.handle(at("/"));
            expect(page.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
            expect(await page.text()).toContain("Continuar con Google");
            expect((await world.shell.handle(at("/shell.css"))).headers.get("Content-Type")).toContain("text/css");
            expect((await world.shell.handle(at("/icon.png"))).headers.get("Content-Type")).toBe("image/png");
        });

        it("answers nothing else, on no other host", async () => {
            expect((await world.shell.handle(at("/../../etc/passwd"))).status).toBe(404);
            expect((await world.shell.handle(new URL("artise-shell://other/"))).status).toBe(404);
        });
    });

    it("says when desktop sign-in isn't available on the server yet", async () => {
        world = setUp(false);
        vi.mocked(world.deps.artiseId.signInConfig).mockResolvedValue({ ok: false, error: "not_available" });
        await world.shell.start();
        expect(world.shell.current).toEqual({ screen: "welcome", providers: [], error: "not_available" });
    });

    it("opens last time's workspaces straight away when still signed in", async () => {
        world = setUp(true, { openWorkspaces: ["artise.co"] });
        await world.shell.start();
        expect(world.deps.openWorkspaces).toHaveBeenCalledWith(["artise.co"]);
        expect(world.deps.show).not.toHaveBeenCalled();
    });

    it("shows the list when last time's workspace can't be reached at start", async () => {
        world = setUp(true, { openWorkspaces: ["artise.co"] });
        vi.mocked(world.deps.openWorkspaces).mockResolvedValue({ ok: false, error: "unreachable" });
        await world.shell.start();
        expect(world.deps.show).toHaveBeenCalled();
        expect(world.shell.current.screen).toBe("workspaces");
    });

    it("shows the list when signed in but nothing was opened yet", async () => {
        world = setUp(true);
        await world.shell.start();
        expect(world.shell.current.screen).toBe("workspaces");
    });

    it("asks to sign in again when Artise ID's sign-in expired", async () => {
        world = setUp(true);
        vi.mocked(world.deps.artiseId.workspaces).mockResolvedValue({ ok: false, error: "expired" });
        await world.shell.start();
        expect(world.shell.current).toMatchObject({ screen: "welcome", error: "expired" });
    });

    describe("adding a workspace from the rail", () => {
        beforeEach(async () => {
            world = setUp(true, { openWorkspaces: ["artise.co"] });
            vi.mocked(world.deps.openServerNames).mockReturnValue(["artise.co"]);
            await world.shell.start();
            await world.shell.addWorkspaces();
        });

        it("lists only the workspaces that aren't open, none ticked", () => {
            expect(world.shell.current).toEqual({
                screen: "workspaces",
                adding: true,
                workspaces: [{ serverName: "mas-k8s.artise.co", name: "Prueba MAS", selected: false }],
            });
        });

        it("opens the added one next to the open ones, and remembers both", async () => {
            vi.mocked(world.deps.openServerNames).mockReturnValue(["artise.co", "mas-k8s.artise.co"]);
            await world.shell.handle(at("/open?workspace=mas-k8s.artise.co"));
            await vi.waitFor(() => expect(world.deps.hide).toHaveBeenCalled());
            expect(world.deps.openWorkspaces).toHaveBeenLastCalledWith(["mas-k8s.artise.co"]);
            expect(world.saved.openWorkspaces).toEqual(["artise.co", "mas-k8s.artise.co"]);
        });

        it("goes back to the open workspaces with Volver", async () => {
            await world.shell.handle(at("/close"));
            expect(world.deps.hide).toHaveBeenCalled();
        });

        it("says when every workspace is already open", async () => {
            vi.mocked(world.deps.openServerNames).mockReturnValue(["artise.co", "mas-k8s.artise.co"]);
            await world.shell.addWorkspaces();
            expect(world.shell.current).toMatchObject({ screen: "workspaces", workspaces: [], adding: true });
        });
    });

    describe("signing out of workspaces", () => {
        beforeEach(async () => {
            world = setUp(true, { openWorkspaces: ["artise.co", "mas-k8s.artise.co"] });
            await world.shell.start();
        });

        it("remembers the ones left open", async () => {
            await world.shell.closed(["mas-k8s.artise.co"]);
            expect(world.saved.openWorkspaces).toEqual(["mas-k8s.artise.co"]);
            expect(world.deps.artiseId.signOut).not.toHaveBeenCalled();
        });

        it("signs out of Artise ID too after the last one, in the browser as well, and shows the welcome", async () => {
            // As on the phones (M6): leaving the last workspace ends the Artise ID sign-in.
            await world.shell.closed([]);
            expect(world.deps.artiseId.signOut).toHaveBeenCalledWith(true);
            expect(world.saved.openWorkspaces).toEqual([]);
            expect(world.shell.current.screen).toBe("welcome");
            expect(world.deps.show).toHaveBeenCalled();
        });
    });

    it("signs out of Artise ID with 'Iniciar sesión de otra forma'", async () => {
        world = setUp(true, { openWorkspaces: [] });
        await world.shell.start();
        await world.shell.handle(at("/sign-out"));
        await vi.waitFor(() => expect(world.shell.current.screen).toBe("welcome"));
        expect(world.deps.artiseId.signOut).toHaveBeenCalledWith(false);
    });
});
