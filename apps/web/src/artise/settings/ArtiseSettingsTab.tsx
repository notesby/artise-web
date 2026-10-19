/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import {
    ArtiseNotificationHoursView,
    ArtiseSettingsView,
    useCreateAutoDisposedViewModel,
} from "@element-hq/web-shared-components";

import SettingsTab from "../../components/views/settings/tabs/SettingsTab";
import { useMatrixClientContext } from "../../contexts/MatrixClientContext";
import { getCurrentLanguage } from "../../languageHandler";
import { ModuleApi } from "../../modules/Api";
import { fetchSignInInfo } from "../artiseId/signInInfo";
import { getWorkspaceFile } from "../workspace/WorkspaceFile";
import { ArtiseSettingsViewModel } from "./ArtiseSettingsViewModel";
import { NotificationHoursViewModel } from "../notifications/NotificationHoursViewModel";

function browserStorage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

interface ArtiseSettingsTabProps {
    /** Closes Settings, so a profile opened from here isn't hidden behind it. */
    closeSettingsFn: () => void;
}

/** Artise's tab in Settings ("Ayuda y cuenta"), added to Element's Settings dialog by the hook there. */
export function ArtiseSettingsTab({ closeSettingsFn }: Readonly<ArtiseSettingsTabProps>): JSX.Element {
    const client = useMatrixClientContext();
    const vm = useCreateAutoDisposedViewModel(
        () =>
            new ArtiseSettingsViewModel({
                workspace: getWorkspaceFile(client),
                userId: client.getSafeUserId(),
                language: getCurrentLanguage(),
                loadSignInInfo: () => fetchSignInInfo(),
                // A new tab on the web; Element Desktop sends window.open to the system browser.
                openUrl: (url) => window.open(url, "_blank", "noopener,noreferrer"),
                openUser: (userId) => {
                    closeSettingsFn();
                    void ModuleApi.instance.navigation.toMatrixToLink(`https://matrix.to/#/${userId}`);
                },
            }),
    );
    const hoursVm = useCreateAutoDisposedViewModel(
        () =>
            new NotificationHoursViewModel({
                userId: client.getSafeUserId(),
                storage: browserStorage(),
                language: getCurrentLanguage(),
                inDesktopApp: !!window.electron,
            }),
    );
    return (
        <SettingsTab>
            <ArtiseSettingsView vm={vm} />
            <ArtiseNotificationHoursView vm={hoursVm} />
        </SettingsTab>
    );
}
