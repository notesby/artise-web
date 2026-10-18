/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi, afterEach } from "vitest";
import { type IClientWellKnown, type MatrixClient, type Room } from "matrix-js-sdk/src/matrix";

import DMRoomMap from "../../utils/DMRoomMap";
import { type Section } from "../../stores/room-list-v3/RoomListStoreV3";
import { findAssistantRoomId, putAssistantFirst, withAssistantFirst } from "./assistantFirst";

const ARI = "@wikibot:mas-k8s.artise.co";
const room = (roomId: string): Room => ({ roomId }) as Room;
const ids = (sections: Section[]): string[][] => sections.map((s) => s.rooms.map((r) => r.roomId));

function clientWithAssistant(assistant: string | undefined): MatrixClient {
    const wellKnown: IClientWellKnown = {
        "co.artise.workspace": assistant
            ? { name: "Prueba MAS", assistant_user_id: assistant }
            : { name: "Prueba MAS" },
    };
    return { getClientWellKnown: () => wellKnown } as unknown as MatrixClient;
}

function dmRoomsWith(byUser: Record<string, string[]>): void {
    vi.spyOn(DMRoomMap, "shared").mockReturnValue({
        getDMRoomsForUserId: (userId: string) => byUser[userId] ?? [],
    } as unknown as DMRoomMap);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("putAssistantFirst", () => {
    const sections: Section[] = [
        { tag: "m.favourite", rooms: [room("!fav")] },
        { tag: "chats", rooms: [room("!familia"), room("!trabajo"), room("!ari")] },
    ];

    it("moves Ari's chat to the top of its own section and keeps the others in order", () => {
        expect(ids(putAssistantFirst(sections, "!ari", undefined))).toEqual([
            ["!fav"],
            ["!ari", "!familia", "!trabajo"],
        ]);
    });

    it("leaves the list alone while a filter is on", () => {
        expect(putAssistantFirst(sections, "!ari", ["unread"])).toBe(sections);
    });

    it("treats an empty filter list as no filter", () => {
        expect(ids(putAssistantFirst(sections, "!ari", []))[1][0]).toBe("!ari");
    });

    it("leaves the list alone without an assistant chat", () => {
        expect(putAssistantFirst(sections, undefined, undefined)).toBe(sections);
    });

    it("doesn't change the sections it was given", () => {
        putAssistantFirst(sections, "!ari", undefined);
        expect(ids(sections)[1]).toEqual(["!familia", "!trabajo", "!ari"]);
    });

    it("keeps a favourite Ari in Favourites, first there", () => {
        const withFavouriteAri: Section[] = [
            { tag: "m.favourite", rooms: [room("!fav"), room("!ari")] },
            { tag: "chats", rooms: [room("!familia")] },
        ];
        expect(ids(putAssistantFirst(withFavouriteAri, "!ari", undefined))).toEqual([["!ari", "!fav"], ["!familia"]]);
    });
});

describe("findAssistantRoomId", () => {
    const sections: Section[] = [{ tag: "chats", rooms: [room("!familia"), room("!ari-new"), room("!ari-old")] }];

    it("finds the direct chat with the workspace file's assistant", () => {
        dmRoomsWith({ [ARI]: ["!ari-old"] });
        expect(findAssistantRoomId(clientWithAssistant(ARI), sections)).toBe("!ari-old");
    });

    it("picks the chat shown highest when there are several", () => {
        dmRoomsWith({ [ARI]: ["!ari-old", "!ari-new"] });
        expect(findAssistantRoomId(clientWithAssistant(ARI), sections)).toBe("!ari-new");
    });

    it("finds nothing when the workspace file names no assistant (artise.co on 2026-10-18)", () => {
        dmRoomsWith({ [ARI]: ["!ari-old"] });
        expect(findAssistantRoomId(clientWithAssistant(undefined), sections)).toBeUndefined();
    });

    it("finds nothing when the person has no chat with Ari yet", () => {
        dmRoomsWith({});
        expect(findAssistantRoomId(clientWithAssistant(ARI), sections)).toBeUndefined();
    });
});

describe("withAssistantFirst", () => {
    it("returns the list as it is before sign-in", () => {
        const sections: Section[] = [{ tag: "chats", rooms: [room("!a")] }];
        expect(withAssistantFirst(undefined, sections, undefined)).toBe(sections);
    });

    it("puts Ari first for a signed-in person", () => {
        dmRoomsWith({ [ARI]: ["!ari"] });
        const sections: Section[] = [{ tag: "chats", rooms: [room("!familia"), room("!ari")] }];
        expect(ids(withAssistantFirst(clientWithAssistant(ARI), sections, undefined))).toEqual([["!ari", "!familia"]]);
    });
});
