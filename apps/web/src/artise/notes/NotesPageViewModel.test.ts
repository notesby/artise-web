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
            const version = tree.files.find((f) => f.path === path)?.version ?? "x";
            return { path, version, content: NOTES[path] };
        }),
        saveNote: vi.fn().mockImplementation(async (_room: string, path: string) => ({
            path,
            version: v(50),
            merged: false,
            created: false,
        })),
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

    describe("editing", () => {
        /** A page with "Súper" open (version v(1) on the server). */
        async function editing() {
            const made = makeVm({ path: "Súper.md" });
            await vi.waitFor(() => expect(made.vm.getSnapshot().content.kind).toBe("note"));
            return made;
        }

        // Edit: the editor starts from the saved text; typing marks it changed and updates the preview.
        it("edits a note with a live preview", async () => {
            const { vm } = await editing();
            vm.edit();
            expect(vm.getSnapshot().editor).toMatchObject({ path: "Súper.md", draft: NOTES["Súper.md"], dirty: false });
            vm.changeDraft("# Nueva", 7);
            expect(vm.getSnapshot().editor).toMatchObject({ dirty: true, preview: [{ type: "heading", level: 1 }] });
        });

        // Typing [[ suggests notes; Escape (cursor -1) hides them.
        it("suggests notes for [[", async () => {
            const { vm } = await editing();
            vm.edit();
            vm.changeDraft("Ver [[Mo", 8);
            expect(vm.getSnapshot().editor?.suggestions).toEqual({
                from: 6,
                items: [{ name: "Mole", path: "Recetas/Mole.md", insert: "Mole]]" }],
            });
            vm.changeDraft("Ver [[Mo", -1);
            expect(vm.getSnapshot().editor?.suggestions).toBeUndefined();
        });

        // Save: sent on the version it was opened at; the note shows the saved text.
        it("saves on the opened version", async () => {
            const { vm, api } = await editing();
            vm.edit();
            vm.changeDraft("- [ ] leche\n- [ ] huevos", 0);
            vm.save();
            await vi.waitFor(() => expect(vm.getSnapshot().editor).toBeUndefined());
            expect(api.saveNote).toHaveBeenCalledWith(ROOM, "Súper.md", "- [ ] leche\n- [ ] huevos", v(1));
            expect(JSON.stringify(vm.getSnapshot().content)).toContain("huevos");
            // The next save is based on the new version.
            vm.edit();
            vm.changeDraft("otra", 0);
            vm.save();
            await vi.waitFor(() => expect(api.saveNote).toHaveBeenCalledTimes(2));
            expect(api.saveNote.mock.calls[1][3]).toBe(v(50));
        });

        // merged: true — the server combined other people's edits: show its text and say so.
        it("shows the merged text", async () => {
            const { vm, api } = await editing();
            api.saveNote.mockResolvedValueOnce({
                path: "Súper.md",
                version: v(51),
                merged: true,
                content: "- [ ] leche\n- [x] pan\n- [ ] sal",
                created: false,
            });
            vm.edit();
            vm.changeDraft("- [ ] leche\n- [ ] sal", 0);
            vm.save();
            await vi.waitFor(() =>
                expect(vm.getSnapshot().notice).toBe(
                    "Someone else changed other lines while you were editing. Both changes were saved.",
                ),
            );
            expect(JSON.stringify(vm.getSnapshot().content)).toContain("pan");
        });

        function conflictOnce(api: { saveNote: Mock }): void {
            api.saveNote.mockRejectedValueOnce(
                new NotesApiError("conflict", 409, { path: "Súper.md", version: v(60), content: "- [x] leche" }),
            );
        }

        // The same lines changed: both versions shown; nothing is lost.
        it("asks on a conflict", async () => {
            const { vm, api } = await editing();
            conflictOnce(api);
            vm.edit();
            vm.changeDraft("- [ ] leche entera", 0);
            vm.save();
            await vi.waitFor(() => expect(vm.getSnapshot().choice).toBeDefined());
            expect(vm.getSnapshot().choice).toEqual({
                kind: "conflict",
                text: "Someone else changed the same lines while you were editing.",
                mine: "- [ ] leche entera",
                theirs: "- [x] leche",
            });
            expect(vm.getSnapshot().editor).toBeUndefined();
        });

        // Keep mine: saved over theirs, on their version.
        it("keeps mine", async () => {
            const { vm, api } = await editing();
            conflictOnce(api);
            vm.edit();
            vm.changeDraft("mía", 0);
            vm.save();
            await vi.waitFor(() => expect(vm.getSnapshot().choice).toBeDefined());
            vm.keepMine();
            await vi.waitFor(() => expect(vm.getSnapshot().choice).toBeUndefined());
            expect(api.saveNote).toHaveBeenLastCalledWith(ROOM, "Súper.md", "mía", v(60));
        });

        // Keep theirs: mine is dropped, theirs is shown, and the next edit starts from it.
        it("keeps theirs", async () => {
            const { vm, api } = await editing();
            conflictOnce(api);
            vm.edit();
            vm.changeDraft("mía", 0);
            vm.save();
            await vi.waitFor(() => expect(vm.getSnapshot().choice).toBeDefined());
            vm.keepTheirs();
            expect(vm.getSnapshot().choice).toBeUndefined();
            expect(api.saveNote).toHaveBeenCalledTimes(1);
            vm.edit();
            expect(vm.getSnapshot().editor?.draft).toBe("- [x] leche");
        });

        // Combine: mine above the line, theirs below, saved on their version.
        it("combines both", async () => {
            const { vm, api } = await editing();
            conflictOnce(api);
            vm.edit();
            vm.changeDraft("mía", 0);
            vm.save();
            await vi.waitFor(() => expect(vm.getSnapshot().choice).toBeDefined());
            vm.combine();
            expect(vm.getSnapshot().editor).toMatchObject({
                draft: "mía\n\n———\n\n- [x] leche",
                dirty: true,
                hint: "Your version is above the line and the other one below. Keep what you want, then save.",
            });
            vm.changeDraft("las dos", 0);
            vm.save();
            await vi.waitFor(() => expect(vm.getSnapshot().editor).toBeUndefined());
            expect(api.saveNote).toHaveBeenLastCalledWith(ROOM, "Súper.md", "las dos", v(60));
        });

        // Deleted meanwhile: keep my copy (saved as new) or discard it.
        it("keeps a copy of a note deleted meanwhile", async () => {
            const { vm, api } = await editing();
            api.saveNote.mockRejectedValueOnce(new NotesApiError("deleted", 409));
            vm.edit();
            vm.changeDraft("mía", 0);
            vm.save();
            await vi.waitFor(() => expect(vm.getSnapshot().choice?.kind).toBe("deleted"));
            vm.keepCopy();
            await vi.waitFor(() => expect(vm.getSnapshot().choice).toBeUndefined());
            expect(api.saveNote).toHaveBeenLastCalledWith(ROOM, "Súper.md", "mía", null);
        });

        it("discards a change to a note deleted meanwhile", async () => {
            const { vm, api, props } = await editing();
            api.saveNote.mockRejectedValueOnce(new NotesApiError("deleted", 409));
            vm.edit();
            vm.changeDraft("mía", 0);
            vm.save();
            await vi.waitFor(() => expect(vm.getSnapshot().choice?.kind).toBe("deleted"));
            vm.discard();
            expect(vm.getSnapshot()).toMatchObject({ choice: undefined, selectedPath: null });
            expect(props.setLocation).toHaveBeenLastCalledWith(ROOM, null);
        });

        // Offline: the text stays in the editor, with why it wasn't saved.
        it("keeps the draft when a save fails", async () => {
            const { vm, api } = await editing();
            api.saveNote.mockRejectedValueOnce(new NotesApiError("offline", 0));
            vm.edit();
            vm.changeDraft("mía", 0);
            vm.save();
            await vi.waitFor(() =>
                expect(vm.getSnapshot().editor?.error).toBe("This needs a connection. Try again when you're online."),
            );
            expect(vm.getSnapshot().editor).toMatchObject({ draft: "mía", saving: false, dirty: true });
        });

        // Ticking a task: drawn at once, saved as a one-character edit on the open version.
        it("ticks a task", async () => {
            const { vm, api } = await editing();
            vm.toggleTask(1);
            expect(JSON.stringify(vm.getSnapshot().content)).toContain('"checked":true,"line":1');
            await vi.waitFor(() =>
                expect(api.saveNote).toHaveBeenCalledWith(ROOM, "Súper.md", "- [x] leche\n- [x] pan", v(1)),
            );
        });

        // A tick that can't be saved goes back, and says why.
        it("undoes a tick that couldn't be saved", async () => {
            const { vm, api } = await editing();
            api.saveNote.mockRejectedValueOnce(new NotesApiError("offline", 0));
            vm.toggleTask(1);
            await vi.waitFor(() =>
                expect(vm.getSnapshot().problem).toBe("This needs a connection. Try again when you're online."),
            );
            expect(JSON.stringify(vm.getSnapshot().content)).toContain('"checked":false,"line":1');
        });

        // Leaving with unsaved changes asks first; staying keeps the draft.
        it("asks before losing unsaved changes", async () => {
            const { vm, api } = await editing();
            vm.edit();
            vm.changeDraft("mía", 0);
            vm.select("Recetas/Mole.md");
            expect(vm.getSnapshot().confirmLeave).toEqual({
                text: "You have changes that aren't saved. Leave without saving?",
            });
            vm.keepEditing();
            expect(vm.getSnapshot()).toMatchObject({ confirmLeave: undefined, editor: { draft: "mía" } });
            vm.select("Recetas/Mole.md");
            vm.leaveWithoutSaving();
            await vi.waitFor(() => expect(vm.getSnapshot().selectedPath).toBe("Recetas/Mole.md"));
            expect(vm.getSnapshot().editor).toBeUndefined();
            expect(api.note).toHaveBeenLastCalledWith(ROOM, "Recetas/Mole.md");
        });

        // Browser back while editing: ask, and staying puts the note back in the address.
        it("asks on browser back and restores the address", async () => {
            const { vm, props } = await editing();
            vm.edit();
            vm.changeDraft("mía", 0);
            vm.showPath(null);
            expect(vm.getSnapshot().confirmLeave).toBeDefined();
            vm.keepEditing();
            expect(props.setLocation).toHaveBeenLastCalledWith(ROOM, "Súper.md");
        });

        // Nothing changed: leave without asking.
        it("doesn't ask when nothing changed", async () => {
            const { vm } = await editing();
            vm.edit();
            vm.cancelEdit();
            expect(vm.getSnapshot().editor).toBeUndefined();
            expect(vm.getSnapshot().confirmLeave).toBeUndefined();
        });

        // Changes elsewhere while editing don't replace the person's text.
        it("keeps the draft when the notes change meanwhile", async () => {
            const { vm, api } = await editing();
            vm.edit();
            vm.changeDraft("mía", 0);
            api.tree.mockResolvedValueOnce({
                ...TREE,
                etag: '"t2"',
                files: TREE.files.map((f) => (f.path === "Súper.md" ? { ...f, version: v(9) } : f)),
            });
            await vm.refresh();
            expect(vm.getSnapshot().editor?.draft).toBe("mía");
            expect(api.note).toHaveBeenCalledTimes(1);
        });

        // New note: in the open note's folder, with .md; then it opens to write in.
        it("creates a note in the open folder", async () => {
            const { vm, api, props } = makeVm({ path: "Recetas/Mole.md" });
            await vi.waitFor(() => expect(vm.getSnapshot().content.kind).toBe("note"));
            vm.newNote();
            vm.changeName("Tamales");
            vm.createNote();
            await vi.waitFor(() => expect(vm.getSnapshot().editor?.path).toBe("Recetas/Tamales.md"));
            expect(api.saveNote).toHaveBeenCalledWith(ROOM, "Recetas/Tamales.md", "", null);
            expect(props.setLocation).toHaveBeenLastCalledWith(ROOM, "Recetas/Tamales.md");
            expect(vm.getSnapshot().items.some((i) => i.path === "Recetas/Tamales.md")).toBe(true);
            expect(vm.getSnapshot().naming).toBeUndefined();
        });

        it.each([
            ["a/b", "Use a name without “/”."],
            ["datos.CSV", "There's already a note with this name."],
        ])("refuses the name %j", async (name, error) => {
            const { vm, api } = makeVm();
            await ready(vm);
            vm.newNote();
            vm.changeName(name);
            vm.createNote();
            expect(vm.getSnapshot().naming?.error).toBe(error);
            expect(api.saveNote).not.toHaveBeenCalled();
        });

        // Someone created it at the same moment: the server's exists becomes the same sentence.
        it("says when the name was just taken", async () => {
            const { vm, api } = makeVm();
            await ready(vm);
            api.saveNote.mockRejectedValueOnce(new NotesApiError("exists", 409));
            vm.newNote();
            vm.changeName("Nueva");
            vm.createNote();
            await vi.waitFor(() =>
                expect(vm.getSnapshot().naming).toMatchObject({
                    saving: false,
                    error: "There's already a note with this name.",
                }),
            );
        });
    });
});
