/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, expect, it, vi, beforeEach } from "vitest";

import { getBuildConfig } from "../build-config.js";
import { isArtise, legacyProtocol, sourceCodeUrl } from "./variant.js";

vi.mock("../build-config.js", () => ({ getBuildConfig: vi.fn() }));

function buildWith(appId: string, protocol: string): void {
    vi.mocked(getBuildConfig).mockReturnValue({ appId, protocol, windowsCertSubjectName: undefined });
}

describe("the Artise variant", () => {
    beforeEach(() => {
        vi.mocked(getBuildConfig).mockReset();
    });

    it("is recognised by its app ID", () => {
        // Built from artise/build.json: the Artise behaviour is on.
        buildWith("co.artise.desktop", "co.artise.desktop");
        expect(isArtise()).toBe(true);
    });

    it("leaves Element's own builds alone", () => {
        // Element's release and nightly variants, and an unbranded `pnpm start`, keep Element's behaviour.
        buildWith("im.riot.app", "io.element.desktop");
        expect(isArtise()).toBe(false);
    });

    it("doesn't take Element's element:// links", () => {
        // ProtocolHandler registers the legacy scheme too; Artise hands it its own scheme instead.
        buildWith("co.artise.desktop", "co.artise.desktop");
        expect(legacyProtocol("element")).toBe("co.artise.desktop");
    });

    it("keeps element:// for Element's builds", () => {
        buildWith("im.riot.app", "io.element.desktop");
        expect(legacyProtocol("element")).toBe("element");
    });

    it("links the source code of the exact version", () => {
        // The AGPL offer points at the release's tag, which is published before its binaries.
        expect(sourceCodeUrl("0.1.0")).toBe("https://github.com/notesby/artise-web/tree/desktop-v0.1.0");
    });
});
