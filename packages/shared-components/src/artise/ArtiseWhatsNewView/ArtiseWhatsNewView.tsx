/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { Button, Text } from "@vector-im/compound-web";
import CheckIcon from "@vector-im/compound-design-tokens/assets/web/icons/check";

import { useViewModel } from "../../core/viewmodel";
import styles from "./ArtiseWhatsNewView.module.css";
import { type ArtiseWhatsNewViewModel } from "./types";

interface ArtiseWhatsNewViewProps {
    vm: ArtiseWhatsNewViewModel;
}

/**
 * "What's new": one card above the chat list after an update, with the release's few changes, until it's
 * dismissed (as on iOS).
 *
 * @example
 * ```tsx
 * <ArtiseWhatsNewView vm={whatsNewViewModel} />
 * ```
 */
export function ArtiseWhatsNewView({ vm }: Readonly<ArtiseWhatsNewViewProps>): JSX.Element | null {
    const { visible, title, items, doneLabel } = useViewModel(vm);
    if (!visible) return null;
    return (
        <section className={styles.card} aria-label={title}>
            <Text as="h2" size="md" weight="semibold" className={styles.title}>
                {title}
            </Text>
            <ul className={styles.items}>
                {items.map((item) => (
                    <li key={item} className={styles.item}>
                        <CheckIcon className={styles.check} width="16px" height="16px" aria-hidden />
                        <Text as="span" size="sm" className={styles.text}>
                            {item}
                        </Text>
                    </li>
                ))}
            </ul>
            <Button kind="secondary" size="md" onClick={vm.dismiss} className={styles.done}>
                {doneLabel}
            </Button>
        </section>
    );
}
