/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX, useContext } from "react";
import DocumentIcon from "@vector-im/compound-design-tokens/assets/web/icons/document";
import { MsgType, type MatrixEvent } from "matrix-js-sdk/src/matrix";
import { logger } from "matrix-js-sdk/src/logger";

import MatrixClientContext from "../../contexts/MatrixClientContext";
import { IconizedContextMenuOption } from "../../components/views/context_menus/IconizedContextMenu";
import Modal from "../../Modal";
import QuestionDialog from "../../components/views/dialogs/QuestionDialog";
import ErrorDialog from "../../components/views/dialogs/ErrorDialog";
import { stripPlainReply } from "../../utils/Reply";
import { artiseT } from "../i18n/artiseT";
import { notesApiFor, NotesApiError } from "./NotesApi";
import { useHasNotes } from "./NotesHeaderButton";
import { notesHash } from "./notesLocation";
import { saveMessageToNotes, savedMessageNote } from "./savedMessage";

const TEXT_TYPES: ReadonlySet<string> = new Set([MsgType.Text, MsgType.Notice, MsgType.Emote]);

/** A message's own words: its plain body, without the quoted message it replies to. */
export function messageText(event: MatrixEvent): string | null {
    if (event.isRedacted() || event.getType() !== "m.room.message") return null;
    const content = event.getContent();
    if (!TEXT_TYPES.has(content.msgtype ?? "") || typeof content.body !== "string") return null;
    const isReply = !!content["m.relates_to"]?.["m.in_reply_to"];
    const text = (isReply ? stripPlainReply(content.body) : content.body).trim();
    return text || null;
}

/**
 * "Guardar en Notas" in a message's menu, as on Android: the message becomes a note in this chat's
 * "Mensajes guardados" folder, saying who wrote it and when. Shown for text messages in chats with notes.
 */
export function SaveToNotesOption({
    mxEvent,
    onFinished,
}: Readonly<{ mxEvent: MatrixEvent; onFinished: () => void }>): JSX.Element | null {
    // Optional: some of Element's menu tests render it with no client.
    const client = useContext(MatrixClientContext) ?? null;
    const roomId = mxEvent.getRoomId() ?? "";
    const hasNotes = useHasNotes(client, roomId);
    const text = messageText(mxEvent);
    if (!client || !hasNotes || !text || !roomId) return null;

    const onClick = async (): Promise<void> => {
        onFinished();
        const api = notesApiFor(client);
        if (!api) return;
        const sender = mxEvent.sender?.name || mxEvent.getSender() || "";
        const note = savedMessageNote(
            artiseT("artise|notes|saved_messages_folder"),
            sender,
            new Date(mxEvent.getTs()),
            text,
        );
        try {
            const path = await saveMessageToNotes(api, roomId, note);
            const { finished } = Modal.createDialog(QuestionDialog, {
                title: artiseT("artise|notes|saved_message"),
                description: path,
                button: artiseT("artise|notes|open_note"),
                cancelButton: artiseT("artise|notes|close"),
            });
            const [open] = await finished;
            if (open) window.location.hash = notesHash(roomId, path);
        } catch (e) {
            logger.warn("Artise: couldn't save a message to Notes", e);
            Modal.createDialog(ErrorDialog, {
                title: artiseT("artise|notes|save_message_failed"),
                description: e instanceof NotesApiError ? e.text : undefined,
            });
        }
    };

    return (
        <IconizedContextMenuOption
            icon={<DocumentIcon />}
            label={artiseT("artise|notes|save_message")}
            onClick={() => void onClick()}
        />
    );
}
