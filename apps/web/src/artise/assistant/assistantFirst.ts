/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type MatrixClient } from "matrix-js-sdk/src/matrix";

import type { FilterKey } from "../../stores/room-list-v3/skip-list/filters";
import type { Section } from "../../stores/room-list-v3/RoomListStoreV3";
import DMRoomMap from "../../utils/DMRoomMap";
import { getWorkspaceFile } from "../workspace/WorkspaceFile";

/**
 * The room ID of the person's direct chat with the workspace's assistant (Ari), if they have one.
 *
 * The assistant comes from the workspace file's `assistant_user_id`. When there are several direct chats with
 * it, the one the room list already shows highest (the most recent) wins.
 *
 * @param client - The signed-in Matrix client.
 * @param sections - The room list as Element sorted it.
 */
export function findAssistantRoomId(client: MatrixClient, sections: Section[]): string | undefined {
    const assistant = getWorkspaceFile(client)?.assistantUserId;
    if (!assistant) return undefined;
    const dmRooms = new Set(DMRoomMap.shared().getDMRoomsForUserId(assistant));
    if (dmRooms.size === 0) return undefined;
    for (const section of sections) {
        const room = section.rooms.find((r) => dmRooms.has(r.roomId));
        if (room) return room.roomId;
    }
    return undefined;
}

/**
 * Puts the assistant's chat at the top of its section, as the phones pin Ari at the top of the chat list.
 *
 * Nothing moves while a filter is on (the person is looking for something else), and the chat never moves
 * to another section: a person who made Ari a favourite finds it first in Favourites.
 *
 * @param sections - The room list as Element sorted it. Not changed.
 * @param assistantRoomId - From {@link findAssistantRoomId}.
 * @param filterKeys - The active filters, if any.
 * @returns The same sections, with the assistant's chat first in its own.
 */
export function putAssistantFirst(
    sections: Section[],
    assistantRoomId: string | undefined,
    filterKeys: FilterKey[] | undefined,
): Section[] {
    if (!assistantRoomId || (filterKeys && filterKeys.length > 0)) return sections;
    return sections.map((section) => {
        const index = section.rooms.findIndex((room) => room.roomId === assistantRoomId);
        if (index <= 0) return section;
        const rooms = [...section.rooms];
        const [assistantRoom] = rooms.splice(index, 1);
        return { ...section, rooms: [assistantRoom, ...rooms] };
    });
}

/**
 * The room list with the assistant's chat first; the one call the room list store makes into Artise.
 *
 * @param client - The signed-in Matrix client, or undefined before sign-in.
 * @param sections - The room list as Element sorted it.
 * @param filterKeys - The active filters, if any.
 */
export function withAssistantFirst(
    client: MatrixClient | undefined,
    sections: Section[],
    filterKeys: FilterKey[] | undefined,
): Section[] {
    if (!client) return sections;
    return putAssistantFirst(sections, findAssistantRoomId(client, sections), filterKeys);
}
