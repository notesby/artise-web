/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";

import { registerArtise } from "./registerArtise";
import { type ModuleApi } from "../../modules/Api";

describe("registerArtise", () => {
    // Start-up registers the Notes page at #/notes, a button in every chat's header, and Sticker in the composer.
    it("registers the Notes page and header button", () => {
        const api = {
            navigation: { registerLocationRenderer: vi.fn() },
            extras: { addRoomHeaderButtonCallback: vi.fn() },
            composer: { addFileUploadOption: vi.fn() },
        };
        registerArtise(api as unknown as ModuleApi);
        expect(api.navigation.registerLocationRenderer).toHaveBeenCalledWith("notes", expect.any(Function));
        expect(api.extras.addRoomHeaderButtonCallback).toHaveBeenCalledWith(expect.any(Function));
        expect(api.composer.addFileUploadOption).toHaveBeenCalledWith(
            expect.objectContaining({ type: "co.artise.sticker", onSelected: expect.any(Function) }),
        );
    });
});
