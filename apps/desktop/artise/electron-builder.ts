/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// The Artise build: Element's electron-builder.ts with the Artise variant (artise/build.json) and
// Artise's icons and publisher. From apps/desktop:
//
//     pnpm exec electron-builder --config artise/electron-builder.ts
//
// electron-builder loads this file with jiti, which reads TypeScript directly.

import type { Configuration } from "electron-builder";

import { artiseBuilderConfig } from "../src/artise/build/builderConfig.ts";

export default async function artiseConfig(): Promise<Configuration> {
    // Element's configuration reads the variant when it's imported, so set it first.
    process.env.VARIANT_PATH ??= "artise/build.json";
    const { default: element } = await import("../electron-builder.ts");
    return artiseBuilderConfig(element);
}
