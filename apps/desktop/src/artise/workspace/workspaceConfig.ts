/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { type ConfigOptions } from "../../config.js";
import { type WorkspaceInfo } from "./discovery.js";

/**
 * The config.json Element Web gets for one workspace: the packaged config with this workspace's homeserver, the
 * desktop's static client on its MAS, and sign-in starting straight away in the browser.
 *
 * @param base - the packaged config (apps/desktop/artise/config.json, with Element Desktop's defaults).
 * @param workspace - the workspace to open.
 */
export function workspaceConfig(base: ConfigOptions, workspace: WorkspaceInfo): ConfigOptions {
    const config: ConfigOptions = {
        ...base,
        default_server_name: undefined,
        default_hs_url: undefined,
        default_is_url: undefined,
        default_server_config: {
            "m.homeserver": { base_url: workspace.homeserverUrl, server_name: workspace.serverName },
        },
        disable_custom_urls: true,
        // A workspace without a session goes straight to its sign-in page in the browser: the person picked it
        // on the list already, so there's no second "Sign in" to press.
        sso_redirect_options: { on_welcome_page: true },
    };
    if (workspace.webUrl) config.web_base_url = `${workspace.webUrl}/`;
    if (workspace.issuer && workspace.desktopClientId) {
        // Element looks the issuer up with a trailing slash (apps/web/src/utils/oauth/registerClient.ts).
        config.oidc_static_clients = {
            ...base.oidc_static_clients,
            [`${workspace.issuer}/`]: { client_id: workspace.desktopClientId },
        };
    }
    return config;
}
