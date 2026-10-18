/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

// @vitest-environment happy-dom

import React, { type ReactElement } from "react";
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, type MockedObject } from "vitest";
import { render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import fetchMock from "@fetch-mock/vitest";
import { type IClientWellKnown, type MatrixClient } from "matrix-js-sdk/src/matrix";
import {
    getMockClientWithEventEmitter,
    mockClientMethodsUser,
    mockClientMethodsServer,
    mockClientMethodsCrypto,
    mockClientMethodsRooms,
    mockPlatformPeg,
    TestSDKContext,
} from "test-utils";
import { makeDelegatedAuthMetadata } from "test-utils/auth.ts";

import SettingsStore from "../../settings/SettingsStore";
import SdkConfig from "../../SdkConfig";
import UserSettingsDialog from "../../components/views/dialogs/UserSettingsDialog";
import { UserTab } from "../../components/views/dialogs/UserTab";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

mockPlatformPeg({
    supportsSpellCheckSettings: vi.fn().mockReturnValue(false),
    getAppVersion: vi.fn().mockResolvedValue("1"),
});

vi.mock("../../settings/SettingsStore", () => ({
    default: {
        getValue: vi.fn(),
        getValueAt: vi.fn(),
        canSetValue: vi.fn(),
        monitorSetting: vi.fn(),
        watchSetting: vi.fn(),
        unwatchSetting: vi.fn(),
        getFeatureSettingNames: vi.fn(),
        getBetaInfo: vi.fn(),
        getDisplayName: vi.fn(),
        getDescription: vi.fn(),
        shouldHaveWarning: vi.fn(),
        disabledMessage: vi.fn(),
        settingIsOveriddenAtConfigLevel: vi.fn(),
        doesSettingSupportLevel: vi.fn(),
    },
}));

const MAS_K8S_WELL_KNOWN: IClientWellKnown = {
    "m.homeserver": { base_url: "https://matrix.mas-k8s.artise.co" },
    "co.artise.workspace": {
        name: "Prueba MAS",
        links: {
            help: "https://artise.co/help",
            delete_account: "https://chat.mas-k8s.artise.co/account/delete",
        },
        contact_user_id: "@hector:mas-k8s.artise.co",
    },
};

// Element's Settings dialog with the Artise hook, on a client whose server has (or hasn't) a workspace file.
describe("Artise's tab in Settings", () => {
    let mockClient: MockedObject<MatrixClient>;
    let sdkContext: TestSDKContext;
    const onFinished = vi.fn();

    const getComponent = (wellKnown: IClientWellKnown): ReactElement => {
        mockClient.getClientWellKnown.mockReturnValue(wellKnown);
        return <UserSettingsDialog sdkContext={sdkContext} onFinished={onFinished} initialTabId={UserTab.Artise} />;
    };

    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });

    afterAll(() => {
        setArtiseTranslationsInTests(false);
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mockClient = getMockClientWithEventEmitter({
            ...mockClientMethodsUser("@ana:mas-k8s.artise.co"),
            ...mockClientMethodsServer(),
            ...mockClientMethodsCrypto(),
            ...mockClientMethodsRooms(),
            getClientWellKnown: vi.fn(),
            getIgnoredUsers: vi.fn().mockResolvedValue([]),
            getPushers: vi.fn().mockResolvedValue([]),
            getProfileInfo: vi.fn().mockResolvedValue({}),
            getMediaConfig: vi.fn(),
            getAuthMetadata: vi.fn().mockResolvedValue(makeDelegatedAuthMetadata()),
            getSyncState: vi.fn().mockReturnValue("SYNCING"),
        });
        sdkContext = new TestSDKContext();
        sdkContext._client = mockClient;
        vi.mocked(SettingsStore).getValue.mockReturnValue(false);
        vi.mocked(SettingsStore).getValueAt.mockReturnValue(false);
        vi.mocked(SettingsStore).getFeatureSettingNames.mockReturnValue([]);
        SdkConfig.reset();
        SdkConfig.put({ brand: "Artise" });
        fetchMock.get(
            "https://api.artise.co/v1/sign-in",
            { security_url: "https://id.artise.co/ui/console/users/me?id=security" },
            { name: "artise-sign-in" },
        );
    });

    afterEach(() => {
        fetchMock.removeRoute("artise-sign-in");
    });

    it("is there on an Artise workspace, with its rows", async () => {
        render(getComponent(MAS_K8S_WELL_KNOWN));
        expect(screen.getByRole("tab", { name: "Help and account" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Help" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Write to your workspace's admin" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Delete account" })).toBeVisible();
        expect(await screen.findByRole("button", { name: "Manage in Artise ID" })).toBeVisible();
    });

    it("isn't there on a server that isn't an Artise workspace", () => {
        render(getComponent({ "m.homeserver": { base_url: "https://matrix.org" } }));
        expect(screen.queryByRole("tab", { name: "Help and account" })).toBeNull();
    });

    it("opens the workspace's help page in a new tab", async () => {
        const open = vi.spyOn(window, "open").mockReturnValue(null);
        render(getComponent(MAS_K8S_WELL_KNOWN));
        await userEvent.click(screen.getByRole("button", { name: "Help" }));
        expect(open).toHaveBeenCalledWith("https://artise.co/help", "_blank", "noopener,noreferrer");
    });

    it("closes Settings when it opens the admin's profile", async () => {
        render(getComponent(MAS_K8S_WELL_KNOWN));
        await userEvent.click(screen.getByRole("button", { name: "Write to your workspace's admin" }));
        expect(onFinished).toHaveBeenCalled();
    });
});
