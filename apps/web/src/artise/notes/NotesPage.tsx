/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX, useEffect, useState } from "react";
import { ArtiseNotesView, useCreateAutoDisposedViewModel } from "@element-hq/web-shared-components";

import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { ModuleApi } from "../../modules/Api";
import { artiseT } from "../i18n/artiseT";
import { type NotesApi, notesApiFor } from "./NotesApi";
import { type NotesFileHandler, NotesPageViewModel } from "./NotesPageViewModel";
import { notesHash, readNotesLocation } from "./notesLocation";

/** Photos and files through object URLs; a download is a temporary link clicked once. */
const browserFiles: NotesFileHandler = {
    url: (blob) => URL.createObjectURL(blob),
    revoke: (url) => URL.revokeObjectURL(url),
    save: (blob, name) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    open: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
};

function NotesForChat({
    api,
    roomId,
    path,
}: Readonly<{ api: NotesApi; roomId: string | null; path: string | null }>): JSX.Element {
    const client = useMatrixClientContext();
    const vm = useCreateAutoDisposedViewModel(
        () =>
            new NotesPageViewModel({
                client,
                api,
                roomId,
                path,
                setLocation: (room, file) => {
                    window.location.hash = notesHash(room, file);
                },
                leave: (room) => {
                    if (room) ModuleApi.instance.navigation.openRoom(room);
                    else window.location.hash = "#/home";
                },
                files: browserFiles,
            }),
    );
    // Back and forward in the browser move between files.
    useEffect(() => vm.showPath(path), [vm, path]);
    // Closing or reloading the tab with unsaved changes: the browser asks first.
    useEffect(() => {
        const onBeforeUnload = (ev: BeforeUnloadEvent): void => {
            if (vm.unsaved) ev.preventDefault();
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [vm]);
    return <ArtiseNotesView vm={vm} />;
}

/** The Notes page, at `#/notes?room=…&path=…`. */
export function NotesPage(): JSX.Element {
    const client = useMatrixClientContext();
    const [location, setLocation] = useState(() => readNotesLocation(window.location.hash));
    const [api] = useState(() => notesApiFor(client));

    useEffect(() => {
        const onHashChange = (): void => setLocation(readNotesLocation(window.location.hash));
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);

    if (!api) {
        return (
            <div className="mx_ArtiseNotesUnavailable" role="alert">
                {artiseT("artise|notes|error|no_chat")}
            </div>
        );
    }
    // A new chat is a new page: its own list, listeners and photos.
    return <NotesForChat key={location.roomId ?? ""} api={api} roomId={location.roomId} path={location.path} />;
}
