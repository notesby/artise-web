/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it } from "vitest";

import { listWorkspaces, offeredProviders } from "./state.js";

describe("offeredProviders", () => {
    it("lists the providers Artise ID has, Apple first as on the phones", () => {
        expect(offeredProviders({ microsoft: "3", google: "2", apple: "1" })).toEqual(["apple", "google", "microsoft"]);
        expect(offeredProviders({ google: "2" })).toEqual(["google"]);
    });
});

describe("listWorkspaces", () => {
    const mine = [
        { serverName: "artise.co", name: "Casa" },
        { serverName: "mas-k8s.artise.co", name: "Prueba MAS" },
    ];

    it("ticks every workspace the first time", () => {
        // The desktop opens them all, like the phones keep them all.
        expect(listWorkspaces(mine).map((workspace) => workspace.selected)).toEqual([true, true]);
    });

    it("ticks the ones opened before, when there were some", () => {
        expect(listWorkspaces(mine, ["artise.co"]).map((workspace) => workspace.selected)).toEqual([true, false]);
    });

    it("ticks every one when none opened before is still on the list", () => {
        // The person left the workspace they had open: don't show a list with nothing ticked.
        expect(listWorkspaces(mine, ["gone.example"]).map((workspace) => workspace.selected)).toEqual([true, true]);
    });
});
