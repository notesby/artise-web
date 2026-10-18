/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import { describe, it, expect } from "vitest";

import { preparePhoto, shrunkSize } from "./preparePhoto";

describe("shrunkSize", () => {
    // 2560 px on the long side, keeping the shape.
    it("shrinks large photos", () => {
        expect(shrunkSize(4032, 3024)).toEqual({ width: 2560, height: 1920 });
        expect(shrunkSize(3000, 6000)).toEqual({ width: 1280, height: 2560 });
    });

    it("leaves small photos alone", () => {
        expect(shrunkSize(2560, 1000)).toBeNull();
        expect(shrunkSize(800, 600)).toBeNull();
    });
});

describe("preparePhoto", () => {
    // A document isn't redrawn.
    it("sends other files as they are", async () => {
        const file = new File(["%PDF"], "factura.pdf", { type: "application/pdf" });
        expect(await preparePhoto(file)).toBe(file);
    });

    // A photo the browser can't read goes as it is.
    it("sends a photo it can't read as it is", async () => {
        const file = new File(["not really a jpeg"], "foto.jpg", { type: "image/jpeg" });
        expect(await preparePhoto(file)).toBe(file);
    });
});
