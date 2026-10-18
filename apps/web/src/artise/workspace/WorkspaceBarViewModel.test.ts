/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
    ClientEvent,
    type ClientEventHandlerMap,
    type IClientWellKnown,
    type MatrixClient,
    TypedEventEmitter,
} from "matrix-js-sdk/src/matrix";

import { WorkspaceBarViewModel, type WorkspaceBarViewModelProps } from "./WorkspaceBarViewModel";
import { type WorkspaceEntry } from "./workspacesApi";
import { WORKSPACE_WK_KEY } from "./WorkspaceFile";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const MAS_K8S: IClientWellKnown = {
    "m.homeserver": { base_url: "https://matrix.mas-k8s.artise.co" },
    [WORKSPACE_WK_KEY]: { name: "Prueba MAS" },
};

const LIST: WorkspaceEntry[] = [
    { name: "Prueba MAS", serverName: "mas-k8s.artise.co", webUrl: "https://chat.mas-k8s.artise.co", color: "#1F6FEB" },
    { name: "Artise", serverName: "artise.co", webUrl: "https://chat.artise.co", logo: "https://artise.co/logo.png" },
];

class FakeClient extends TypedEventEmitter<
    ClientEvent.ClientWellKnown,
    Pick<ClientEventHandlerMap, ClientEvent.ClientWellKnown>
> {
    public wellKnown: IClientWellKnown | undefined;
    public constructor(wellKnown: IClientWellKnown | undefined) {
        super();
        this.wellKnown = wellKnown;
    }
    public getClientWellKnown = (): IClientWellKnown | undefined => this.wellKnown;
    public getDomain = (): string => "mas-k8s.artise.co";
}

function makeVm(overrides: Partial<WorkspaceBarViewModelProps> & { wellKnown?: IClientWellKnown } = {}): {
    vm: WorkspaceBarViewModel;
    client: FakeClient;
    props: WorkspaceBarViewModelProps;
} {
    const client = new FakeClient("wellKnown" in overrides ? overrides.wellKnown : MAS_K8S);
    const props: WorkspaceBarViewModelProps = {
        client: client as unknown as MatrixClient,
        inDesktopApp: false,
        loadWorkspaces: vi.fn().mockResolvedValue(LIST),
        navigate: vi.fn(),
        ...overrides,
    };
    return { vm: new WorkspaceBarViewModel(props), client, props };
}

describe("WorkspaceBarViewModel", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    // On an Artise workspace, the bar shows its name and names its button for screen readers.
    it("shows this workspace's name", () => {
        const { vm } = makeVm();
        expect(vm.getSnapshot()).toMatchObject({
            visible: true,
            current: { id: "mas-k8s.artise.co", name: "Prueba MAS" },
            switchLabel: "Change workspace (now: Prueba MAS)",
            menuTitle: "Your workspaces",
        });
    });

    // Once the list arrives, this workspace is left out of the menu and the others are in it, in order.
    it("lists the other workspaces, not this one", async () => {
        const { vm } = makeVm();
        await vi.waitFor(() => expect(vm.getSnapshot().others).toHaveLength(1));
        expect(vm.getSnapshot().others).toEqual([
            { id: "artise.co", name: "Artise", logo: "https://artise.co/logo.png", color: undefined },
        ]);
    });

    // The list's colour for this workspace fills in what its own file didn't set.
    it("takes this workspace's look from the list when its file has none", async () => {
        const { vm } = makeVm();
        await vi.waitFor(() => expect(vm.getSnapshot().current.color).toBe("#1F6FEB"));
    });

    // Picking a workspace opens its own web app.
    it("opens the picked workspace's web app", async () => {
        const { vm, props } = makeVm();
        await vi.waitFor(() => expect(vm.getSnapshot().others).toHaveLength(1));
        vm.switchTo("artise.co");
        expect(props.navigate).toHaveBeenCalledWith("https://chat.artise.co");
    });

    // An id that isn't in the list (stale menu) does nothing.
    it("does nothing for a workspace it doesn't know", async () => {
        const { vm, props } = makeVm();
        await vi.waitFor(() => expect(vm.getSnapshot().others).toHaveLength(1));
        vm.switchTo("unknown.example");
        expect(props.navigate).not.toHaveBeenCalled();
    });

    // The API is down: the name still shows, with no menu.
    it("keeps the name without a menu when the list can't be read", async () => {
        const loadWorkspaces = vi.fn().mockResolvedValue(null);
        const { vm } = makeVm({ loadWorkspaces });
        await vi.waitFor(() => expect(loadWorkspaces).toHaveBeenCalled());
        expect(vm.getSnapshot()).toMatchObject({ visible: true, others: [] });
    });

    // The desktop app switches workspaces in its own window: no bar, no request.
    it("is hidden in the desktop app and asks for nothing", () => {
        const loadWorkspaces = vi.fn();
        const { vm } = makeVm({ inDesktopApp: true, loadWorkspaces });
        expect(vm.getSnapshot().visible).toBe(false);
        expect(loadWorkspaces).not.toHaveBeenCalled();
    });

    // A server that isn't an Artise workspace: no bar, no request.
    it("is hidden on a server that isn't an Artise workspace", () => {
        const loadWorkspaces = vi.fn();
        const { vm } = makeVm({ wellKnown: { "m.homeserver": { base_url: "https://matrix.org" } }, loadWorkspaces });
        expect(vm.getSnapshot().visible).toBe(false);
        expect(loadWorkspaces).not.toHaveBeenCalled();
    });

    // The well-known arrives after the chat list is drawn: the bar appears then, and asks for the list once.
    it("appears when the workspace file arrives late", async () => {
        const loadWorkspaces = vi.fn().mockResolvedValue(LIST);
        const { vm, client } = makeVm({ wellKnown: undefined, loadWorkspaces });
        expect(vm.getSnapshot().visible).toBe(false);
        client.wellKnown = MAS_K8S;
        client.emit(ClientEvent.ClientWellKnown, MAS_K8S);
        client.emit(ClientEvent.ClientWellKnown, MAS_K8S);
        expect(vm.getSnapshot().visible).toBe(true);
        await vi.waitFor(() => expect(vm.getSnapshot().others).toHaveLength(1));
        expect(loadWorkspaces).toHaveBeenCalledTimes(1);
    });

    // Closed before the list arrives: nothing changes afterwards.
    it("ignores a list that arrives after it was closed", async () => {
        let resolve: (list: WorkspaceEntry[]) => void = () => {};
        const loadWorkspaces = vi.fn().mockReturnValue(new Promise<WorkspaceEntry[]>((r) => (resolve = r)));
        const { vm } = makeVm({ loadWorkspaces });
        vm.dispose();
        resolve(LIST);
        await Promise.resolve();
        expect(vm.getSnapshot().others).toEqual([]);
    });
});
