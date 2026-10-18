/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeAll, afterAll, type Mock } from "vitest";
import {
    type ClientEventHandlerMap,
    type MatrixClient,
    MatrixEvent,
    RoomStateEvent,
    TypedEventEmitter,
} from "matrix-js-sdk/src/matrix";

import { NotesPageViewModel, type NotesFileHandler, type NotesPageViewModelProps } from "./NotesPageViewModel";
import { NotesApiError, type NotesApi, type NotesTree } from "./NotesApi";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const ROOM = "!familia:mas-k8s.artise.co";
const v = (n: number): string => String(n).padStart(40, "0");

const TREE: NotesTree = {
    tree: "t1",
    etag: '"t1"',
    files: [
        { path: "Súper.md", version: v(1), size: 20, modified: 0, note: true },
        { path: "Recetas/Mole.md", version: v(2), size: 80, modified: 0, note: true },
        { path: "Recetas/Postres/Flan.md", version: v(3), size: 40, modified: 0, note: true },
        { path: "attachments/foto.jpg", version: v(4), size: 1000, modified: 0, note: false },
        { path: "attachments/factura.pdf", version: v(5), size: 1000, modified: 0, note: false },
        { path: "attachments/página.html", version: v(6), size: 1000, modified: 0, note: false },
        { path: "datos.csv", version: v(7), size: 10, modified: 0, note: true },
    ],
    folders: ["Recetas", "Recetas/Postres", "Vacía", "attachments"],
};

const NOTES: Record<string, string> = {
    "Súper.md": "- [ ] leche\n- [x] pan",
    "Recetas/Mole.md": "# Mole\n\nVer [[Súper]] y [[Nueva]].\n\n![[foto.jpg]]",
    "datos.csv": "a,b\n1,2",
};

class FakeClient extends TypedEventEmitter<RoomStateEvent.Events, Pick<ClientEventHandlerMap, RoomStateEvent.Events>> {
    public getRoom = (id: string): { name: string } | null => (id === ROOM ? { name: "Familia" } : null);
    public getClientWellKnown = (): unknown => ({
        "co.artise.workspace": { name: "Prueba MAS", assistant_name: "Ari" },
    });
}

function fakeApi(tree: NotesTree = TREE): { [K in keyof NotesApi]: Mock } {
    return {
        chats: vi.fn().mockResolvedValue([{ id: ROOM, name: "Familia", tree: "t1" }]),
        tree: vi.fn().mockResolvedValue(tree),
        note: vi.fn().mockImplementation(async (_room: string, path: string) => {
            if (!(path in NOTES)) throw new NotesApiError("not_found", 404);
            return { path, version: "x", content: NOTES[path] };
        }),
        raw: vi.fn().mockImplementation(async (_room: string, path: string) => ({
            blob: new Blob([`bytes of ${path}`], { type: "text/html" }),
            contentType: "text/html",
            version: "x",
        })),
    } as unknown as { [K in keyof NotesApi]: Mock };
}

function fileHandler(): { [K in keyof NotesFileHandler]: Mock } {
    let n = 0;
    return { url: vi.fn().mockImplementation(() => `blob:test/${++n}`), revoke: vi.fn(), save: vi.fn(), open: vi.fn() };
}

function makeVm(overrides: Partial<NotesPageViewModelProps> = {}) {
    const client = new FakeClient();
    const api = fakeApi();
    const files = fileHandler();
    const props: NotesPageViewModelProps = {
        client: client as unknown as MatrixClient,
        api: api as unknown as NotesApi,
        roomId: ROOM,
        path: null,
        setLocation: vi.fn(),
        leave: vi.fn(),
        files,
        ...overrides,
    };
    const vm = new NotesPageViewModel(props);
    return { vm, client, api: props.api as unknown as { [K in keyof NotesApi]: Mock }, files, props };
}

const ready = async (vm: NotesPageViewModel): Promise<void> => {
    await vi.waitFor(() => expect(vm.getSnapshot().state).toBe("ready"));
};

describe("NotesPageViewModel", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });
    afterAll(() => setArtiseTranslationsInTests(false));

    // The list: folders first (an empty one too), then notes without .md, sorted; folders start closed.
    it("lists the top of the tree", async () => {
        const { vm } = makeVm();
        await ready(vm);
        expect(vm.getSnapshot().items.map((i) => `${i.kind}:${i.name}`)).toEqual([
            "folder:attachments",
            "folder:Recetas",
            "folder:Vacía",
            "note:datos.csv",
            "note:Súper",
        ]);
        expect(vm.getSnapshot()).toMatchObject({
            chatName: "Familia",
            title: "Notes",
            privacyText: expect.stringContaining("Ari can read the notes in this chat"),
            content: { kind: "none", text: "Pick a note to read it." },
        });
    });

    // Opening a folder shows its contents one level deeper.
    it("opens and closes folders", async () => {
        const { vm } = makeVm();
        await ready(vm);
        vm.toggleFolder("Recetas");
        expect(vm.getSnapshot().items.map((i) => `${i.depth}:${i.name}`)).toEqual([
            "0:attachments",
            "0:Recetas",
            "1:Postres",
            "1:Mole",
            "0:Vacía",
            "0:datos.csv",
            "0:Súper",
        ]);
        vm.toggleFolder("Recetas");
        expect(vm.getSnapshot().items).toHaveLength(5);
    });

    // Picking a note: it's in the address, its folders open, its Markdown is drawn, links are found.
    it("opens a note", async () => {
        const { vm, props } = makeVm();
        await ready(vm);
        vm.select("Recetas/Mole.md");
        expect(props.setLocation).toHaveBeenCalledWith(ROOM, "Recetas/Mole.md");
        await vi.waitFor(() => expect(vm.getSnapshot().content.kind).toBe("note"));
        const { content, items, selectedPath } = vm.getSnapshot();
        expect(selectedPath).toBe("Recetas/Mole.md");
        expect(items.find((i) => i.path === "Recetas")?.expanded).toBe(true);
        expect(content).toMatchObject({ title: "Mole" });
        expect(JSON.stringify(content)).toContain('"path":"Súper.md"');
    });

    // The note's photo is downloaded and drawn from an object URL, typed as a photo whatever the server said.
    it("draws the note's photos", async () => {
        const { vm, files } = makeVm();
        await ready(vm);
        vm.select("Recetas/Mole.md");
        await vi.waitFor(() => expect(JSON.stringify(vm.getSnapshot().content)).toContain('"src":"blob:test/1"'));
        expect((files.url.mock.calls[0][0] as Blob).type).toBe("image/jpg");
    });

    // Leaving a note frees its photos' object URLs.
    it("frees photos when another note opens", async () => {
        const { vm, files } = makeVm();
        await ready(vm);
        vm.select("Recetas/Mole.md");
        await vi.waitFor(() => expect(JSON.stringify(vm.getSnapshot().content)).toContain("blob:test/1"));
        vm.select("Súper.md");
        await vi.waitFor(() => expect(vm.getSnapshot().selectedPath).toBe("Súper.md"));
        expect(files.revoke).toHaveBeenCalledWith("blob:test/1");
    });

    // A note that isn't Markdown is shown as it is.
    it("shows a CSV as text", async () => {
        const { vm } = makeVm();
        await ready(vm);
        vm.select("datos.csv");
        await vi.waitFor(() => expect(vm.getSnapshot().content.kind).toBe("note"));
        expect(vm.getSnapshot().content).toMatchObject({ document: [{ type: "code", text: "a,b\n1,2" }] });
    });

    it("shows a photo", async () => {
        const { vm } = makeVm();
        await ready(vm);
        vm.select("attachments/foto.jpg");
        await vi.waitFor(() => expect(vm.getSnapshot().content).toMatchObject({ kind: "image", src: "blob:test/1" }));
    });

    // A PDF opens in a new tab as a PDF; an HTML file is download-only, and saved as bytes.
    it("opens PDFs and only downloads other files", async () => {
        const { vm, files } = makeVm();
        await ready(vm);
        vm.select("attachments/factura.pdf");
        expect(vm.getSnapshot().content).toMatchObject({ kind: "file", canOpen: true });
        vm.openFile("attachments/factura.pdf");
        await vi.waitFor(() => expect(files.open).toHaveBeenCalled());
        expect((files.open.mock.calls[0][0] as Blob).type).toBe("application/pdf");

        vm.select("attachments/página.html");
        expect(vm.getSnapshot().content).toMatchObject({
            kind: "file",
            canOpen: false,
            text: "Download it to open it on your computer.",
        });
        vm.openFile("attachments/página.html");
        vm.download("attachments/página.html");
        await vi.waitFor(() => expect(files.save).toHaveBeenCalled());
        expect(files.open).toHaveBeenCalledTimes(1);
        expect((files.save.mock.calls[0][0] as Blob).type).toBe("application/octet-stream");
        expect(files.save.mock.calls[0][1]).toBe("página.html");
    });

    // A link to a note that doesn't exist yet says so.
    it("says when a linked note doesn't exist", async () => {
        const { vm } = makeVm();
        await ready(vm);
        vm.openLink(null, "Nueva");
        expect(vm.getSnapshot().content).toEqual({ kind: "error", text: "“Nueva” doesn't exist yet." });
    });

    // Opened at an address with a file: that file opens.
    it("opens the file in the address", async () => {
        const { vm } = makeVm({ path: "Súper.md" });
        await vi.waitFor(() => expect(vm.getSnapshot().content).toMatchObject({ kind: "note", title: "Súper" }));
    });

    // The bot's co.artise.notes event: the tree is asked again with its ETag, and the open note reloads when changed.
    it("refreshes on the notes event and reloads a changed note", async () => {
        const { vm, client, api } = makeVm({ path: "Súper.md" });
        await vi.waitFor(() => expect(vm.getSnapshot().content.kind).toBe("note"));
        api.tree.mockResolvedValueOnce({
            ...TREE,
            etag: '"t2"',
            files: TREE.files.map((f) => (f.path === "Súper.md" ? { ...f, version: v(9) } : f)),
        });
        const event = new MatrixEvent({
            type: "co.artise.notes",
            state_key: "",
            room_id: ROOM,
            content: { tree: "t2" },
        });
        client.emit(RoomStateEvent.Events, event, {} as never, null);
        await vi.waitFor(() => expect(api.note).toHaveBeenCalledTimes(2));
        expect(api.tree).toHaveBeenLastCalledWith(ROOM, '"t1"');
    });

    // Another chat's event, or another type: nothing.
    it("ignores other chats' events", async () => {
        const { vm, client, api } = makeVm();
        await ready(vm);
        const other = new MatrixEvent({ type: "co.artise.notes", state_key: "", room_id: "!otro:x", content: {} });
        client.emit(RoomStateEvent.Events, other, {} as never, null);
        expect(api.tree).toHaveBeenCalledTimes(1);
    });

    // The window comes back into focus: refresh (for chats without the state event); 304 changes nothing.
    it("refreshes on focus", async () => {
        const { vm, api } = makeVm();
        await ready(vm);
        api.tree.mockResolvedValueOnce("notModified");
        window.dispatchEvent(new Event("focus"));
        await vi.waitFor(() => expect(api.tree).toHaveBeenCalledTimes(2));
        expect(vm.getSnapshot().items).toHaveLength(5);
    });

    // The list can't load: the API's sentence, and retrying works.
    it("says what went wrong and retries", async () => {
        const { vm, api } = makeVm();
        api.tree.mockRejectedValueOnce(new NotesApiError("no_chat", 404));
        const vm2 = new NotesPageViewModel({ ...vm["props"], api: api as unknown as NotesApi });
        await vi.waitFor(() => expect(vm2.getSnapshot().state).toBe("error"));
        expect(vm2.getSnapshot().errorText).toBe("This chat has no notes, or you're no longer in it.");
        vm2.retry();
        await ready(vm2);
    });

    // No chat in the address: the chats with notes, and picking one puts it in the address.
    it("lists the chats when none is picked", async () => {
        const { vm, props } = makeVm({ roomId: null });
        await ready(vm);
        expect(vm.getSnapshot().chats).toEqual([{ id: ROOM, name: "Familia" }]);
        vm.chooseChat(ROOM);
        expect(props.setLocation).toHaveBeenCalledWith(ROOM, null);
    });

    it("goes back to the chat", async () => {
        const { vm, props } = makeVm();
        vm.back();
        expect(props.leave).toHaveBeenCalledWith(ROOM);
    });

    // Browser back/forward changes the address: the page follows.
    it("follows the address", async () => {
        const { vm, api } = makeVm();
        await ready(vm);
        vm.showPath("Súper.md");
        await vi.waitFor(() => expect(vm.getSnapshot().selectedPath).toBe("Súper.md"));
        vm.showPath("Súper.md");
        expect(api.note).toHaveBeenCalledTimes(1);
        vm.showPath(null);
        expect(vm.getSnapshot()).toMatchObject({ selectedPath: null, content: { kind: "none" } });
    });

    // Closing the page frees the photos and stops listening.
    it("cleans up when closed", async () => {
        const { vm, files, client, api } = makeVm({ path: "attachments/foto.jpg" });
        await vi.waitFor(() => expect(vm.getSnapshot().content).toMatchObject({ src: "blob:test/1" }));
        vm.dispose();
        expect(files.revoke).toHaveBeenCalledWith("blob:test/1");
        const event = new MatrixEvent({ type: "co.artise.notes", state_key: "", room_id: ROOM, content: {} });
        client.emit(RoomStateEvent.Events, event, {} as never, null);
        expect(api.tree).toHaveBeenCalledTimes(1);
    });
});
