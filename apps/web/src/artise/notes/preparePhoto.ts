/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { MAX_PHOTO_SIDE } from "./noteFiles";

/** Photos the browser can redraw smaller. HEIC isn't one in most browsers: it's uploaded as it is. */
const SHRINKABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * A photo's size once shrunk to {@link MAX_PHOTO_SIDE} on its long side, or `null` when it's small enough.
 */
export function shrunkSize(width: number, height: number): { width: number; height: number } | null {
    const long = Math.max(width, height);
    if (long <= MAX_PHOTO_SIDE) return null;
    const scale = MAX_PHOTO_SIDE / long;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Readies a picked file for upload: a large JPEG, PNG or WebP photo is redrawn at 2560 px on its long side, in
 * its own format (turned upright from its camera data). Anything else, or anything the browser can't redraw,
 * goes as it is.
 */
export async function preparePhoto(file: File): Promise<Blob> {
    if (!SHRINKABLE.has(file.type) || typeof createImageBitmap !== "function") return file;
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        return file;
    }
    try {
        const size = shrunkSize(bitmap.width, bitmap.height);
        if (!size) return file;
        const canvas = document.createElement("canvas");
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext("2d");
        if (!context) return file;
        context.drawImage(bitmap, 0, 0, size.width, size.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.9));
        return blob ?? file;
    } finally {
        bitmap.close();
    }
}
