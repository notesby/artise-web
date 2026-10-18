/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { Button, Heading, Text } from "@vector-im/compound-web";

import { useViewModel } from "../../core/viewmodel";
import styles from "./ArtiseSettingsView.module.css";
import { type ArtiseSettingsViewModel } from "./types";

interface ArtiseSettingsViewProps {
    /** The view model for Artise's settings tab. */
    vm: ArtiseSettingsViewModel;
}

/**
 * Artise's tab in Settings: Help, writing to the workspace's admin, Artise ID's security and deleting the
 * account, as the phones have them. Every text comes translated from the view model.
 *
 * @example
 * ```tsx
 * <ArtiseSettingsView vm={artiseSettingsViewModel} />
 * ```
 */
export function ArtiseSettingsView({ vm }: Readonly<ArtiseSettingsViewProps>): JSX.Element {
    const { title, rows } = useViewModel(vm);

    return (
        <section className={styles.container} aria-label={title}>
            <Heading as="h2" size="sm" weight="semibold">
                {title}
            </Heading>
            <div>
                {rows.map((row) => (
                    <div key={row.id} className={styles.row}>
                        <div className={styles.text}>
                            <Text as="span" size="md" weight="medium">
                                {row.title}
                            </Text>
                            <Text as="span" size="sm" className={styles.description}>
                                {row.description}
                            </Text>
                        </div>
                        <Button
                            kind={row.destructive ? "primary" : "secondary"}
                            destructive={row.destructive}
                            size="md"
                            onClick={() => vm.open(row.id)}
                        >
                            {row.actionLabel}
                        </Button>
                    </div>
                ))}
            </div>
        </section>
    );
}
