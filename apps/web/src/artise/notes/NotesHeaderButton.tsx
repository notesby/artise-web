/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX, useEffect, useState } from "react";
import { IconButton, Tooltip } from "@vector-im/compound-web";
import DocumentIcon from "@vector-im/compound-design-tokens/assets/web/icons/document";
import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { artiseT } from "../i18n/artiseT";
import { notesApiFor } from "./NotesApi";
import { NOTES_STATE_EVENT } from "./NotesPageViewModel";
import { notesHash } from "./notesLocation";

/** The chats with notes, asked once per session (and again after a failure). */
let chatsWithNotes: { client: MatrixClient; ids: Promise<Set<string>> } | null = null;

function knownChats(client: MatrixClient): Promise<Set<string>> {
    if (chatsWithNotes?.client !== client) {
        const api = notesApiFor(client);
        const ids = api
            ? api.chats().then((chats) => new Set(chats.map((chat) => chat.id)))
            : Promise.resolve(new Set<string>());
        ids.catch(() => {
            chatsWithNotes = null;
        });
        chatsWithNotes = { client, ids };
    }
    return chatsWithNotes.ids;
}

/** Test hook: forget the chats asked for. */
export function resetChatsWithNotes(): void {
    chatsWithNotes = null;
}

/**
 * Whether a chat has notes: it does when the bot set its `co.artise.notes` state; otherwise the Notes API's
 * list of chats says (a chat can lack the state, see the contract's "Live updates").
 */
function useHasNotes(roomId: string): boolean {
    const client = useMatrixClientContext();
    const hasState = !!client.getRoom(roomId)?.currentState.getStateEvents(NOTES_STATE_EVENT, "");
    const [inList, setInList] = useState(false);
    useEffect(() => {
        if (hasState || !notesApiFor(client)) return;
        let live = true;
        knownChats(client)
            .then((ids) => live && setInList(ids.has(roomId)))
            .catch(() => live && setInList(false));
        return () => {
            live = false;
        };
    }, [client, roomId, hasState]);
    return (hasState && !!notesApiFor(client)) || inList;
}

/** "Notas" in a chat's header, when the chat has notes. */
export function NotesHeaderButton({ roomId }: Readonly<{ roomId: string }>): JSX.Element | null {
    const hasNotes = useHasNotes(roomId);
    if (!hasNotes) return null;
    const label = artiseT("artise|notes|title");
    return (
        <Tooltip label={label}>
            <IconButton
                aria-label={label}
                onClick={() => {
                    window.location.hash = notesHash(roomId);
                }}
            >
                <DocumentIcon />
            </IconButton>
        </Tooltip>
    );
}
