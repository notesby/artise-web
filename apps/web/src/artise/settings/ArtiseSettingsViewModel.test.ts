/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { ArtiseSettingsViewModel, type ArtiseSettingsViewModelProps } from "./ArtiseSettingsViewModel";
import { type WorkspaceFile } from "../workspace/WorkspaceFile";
import { registerArtiseTranslations, setArtiseTranslationsInTests } from "../i18n/registerArtiseTranslations";

const MAS_K8S: WorkspaceFile = {
    name: "Prueba MAS",
    assistantName: "Ari",
    language: "es",
    links: {
        help: "https://artise.co/help",
        delete_account: "https://chat.mas-k8s.artise.co/account/delete",
    },
    assistantUserId: "@wikibot:mas-k8s.artise.co",
    contactUserId: "@hector:mas-k8s.artise.co",
    branding: {},
};

// artise.co's file on 2026-10-18: no help link and no admin.
const ARTISE_CO: WorkspaceFile = {
    name: "Artise",
    links: { delete_account: "https://chat.artise.co/account/delete" },
    branding: {},
};

const SECURITY_URL = "https://id.artise.co/ui/console/users/me?id=security";

function makeViewModel(overrides: Partial<ArtiseSettingsViewModelProps> = {}): {
    vm: ArtiseSettingsViewModel;
    props: ArtiseSettingsViewModelProps;
} {
    const props: ArtiseSettingsViewModelProps = {
        workspace: MAS_K8S,
        userId: "@ana:mas-k8s.artise.co",
        language: "en",
        loadSignInInfo: vi.fn().mockResolvedValue({ securityUrl: SECURITY_URL }),
        openUrl: vi.fn(),
        openUser: vi.fn(),
        ...overrides,
    };
    return { vm: new ArtiseSettingsViewModel(props), props };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const rowIds = (vm: ArtiseSettingsViewModel): string[] => vm.getSnapshot().rows.map((row) => row.id);

describe("ArtiseSettingsViewModel", () => {
    beforeAll(() => {
        setArtiseTranslationsInTests(true);
        registerArtiseTranslations();
    });

    afterAll(() => {
        setArtiseTranslationsInTests(false);
    });

    it("shows every row for mas-k8s, with Security once Artise ID's page is known", async () => {
        const { vm } = makeViewModel();
        expect(rowIds(vm)).toEqual(["help", "contact_admin", "delete_account"]);
        await flush();
        expect(rowIds(vm)).toEqual(["help", "contact_admin", "security", "delete_account"]);
        expect(vm.getSnapshot().title).toBe("Help and account");
    });

    it("names the workspace in the rows' descriptions", () => {
        const { vm } = makeViewModel();
        const admin = vm.getSnapshot().rows.find((row) => row.id === "contact_admin");
        expect(admin?.description).toBe("For questions about Prueba MAS.");
    });

    it("marks only deleting the account as destructive", () => {
        const { vm } = makeViewModel();
        expect(
            vm
                .getSnapshot()
                .rows.filter((row) => row.destructive)
                .map((row) => row.id),
        ).toEqual(["delete_account"]);
    });

    it("doesn't offer the admin a way to write to themselves", () => {
        const { vm } = makeViewModel({ userId: "@hector:mas-k8s.artise.co" });
        expect(rowIds(vm)).not.toContain("contact_admin");
    });

    it("shows only what artise.co's short workspace file has", async () => {
        const { vm } = makeViewModel({ workspace: ARTISE_CO });
        await flush();
        expect(rowIds(vm)).toEqual(["security", "delete_account"]);
    });

    it("leaves Security out when Artise ID's info can't be read", async () => {
        const { vm } = makeViewModel({ loadSignInInfo: vi.fn().mockResolvedValue(null) });
        await flush();
        expect(rowIds(vm)).not.toContain("security");
    });

    it("shows nothing but Security on a server that isn't an Artise workspace", async () => {
        const { vm } = makeViewModel({ workspace: null });
        await flush();
        expect(rowIds(vm)).toEqual(["security"]);
    });

    it("doesn't update after being disposed", async () => {
        const { vm } = makeViewModel();
        const listener = vi.fn();
        vm.subscribe(listener);
        vm.dispose();
        await flush();
        expect(listener).not.toHaveBeenCalled();
    });

    describe("open", () => {
        it("opens the workspace's help page", () => {
            const { vm, props } = makeViewModel();
            vm.open("help");
            expect(props.openUrl).toHaveBeenCalledWith("https://artise.co/help");
        });

        it("opens the admin's profile", () => {
            const { vm, props } = makeViewModel();
            vm.open("contact_admin");
            expect(props.openUser).toHaveBeenCalledWith("@hector:mas-k8s.artise.co");
        });

        it("opens Artise ID's security page", async () => {
            const { vm, props } = makeViewModel();
            await flush();
            vm.open("security");
            expect(props.openUrl).toHaveBeenCalledWith(SECURITY_URL);
        });

        it("opens the delete-account page in Spanish for a Spanish speaker", () => {
            const { vm, props } = makeViewModel({ language: "es" });
            vm.open("delete_account");
            expect(props.openUrl).toHaveBeenCalledWith("https://chat.mas-k8s.artise.co/account/delete?lang=es");
        });

        it("opens the delete-account page in Portuguese for pt-br", () => {
            const { vm, props } = makeViewModel({ language: "pt-br" });
            vm.open("delete_account");
            expect(props.openUrl).toHaveBeenCalledWith("https://chat.mas-k8s.artise.co/account/delete?lang=pt");
        });

        it("opens the delete-account page as it is in English", () => {
            const { vm, props } = makeViewModel({ language: "en" });
            vm.open("delete_account");
            expect(props.openUrl).toHaveBeenCalledWith("https://chat.mas-k8s.artise.co/account/delete");
        });

        it("does nothing for a row the workspace has no page for", () => {
            const { vm, props } = makeViewModel({ workspace: ARTISE_CO });
            vm.open("help");
            vm.open("contact_admin");
            expect(props.openUrl).not.toHaveBeenCalled();
            expect(props.openUser).not.toHaveBeenCalled();
        });
    });
});
