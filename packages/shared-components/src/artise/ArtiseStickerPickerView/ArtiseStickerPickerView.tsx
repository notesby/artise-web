/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import classNames from "classnames";
import { Alert, Button, IconButton, Text } from "@vector-im/compound-web";
import CloseIcon from "@vector-im/compound-design-tokens/assets/web/icons/close";

import { useViewModel } from "../../core/viewmodel";
import styles from "./ArtiseStickerPickerView.module.css";
import { type ArtiseStickerPickerViewModel } from "./types";

/**
 * The sticker picker, as on the phones: the person's own stickers and the starter pack. Pressing one sends it.
 *
 * @example
 * ```tsx
 * <ArtiseStickerPickerView vm={stickerPickerViewModel} />
 * ```
 */
export function ArtiseStickerPickerView({ vm }: Readonly<{ vm: ArtiseStickerPickerViewModel }>): JSX.Element {
    const { tabs, tab, stickers, emptyText, credit, busy, error, removable, confirmRemove, labels } = useViewModel(vm);
    return (
        <div className={styles.picker}>
            <div className={styles.tabs} role="tablist">
                {tabs.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={option.id === tab}
                        className={classNames(styles.tab, { [styles.tabSelected]: option.id === tab })}
                        onClick={() => vm.setTab(option.id)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {error && <Alert type="critical" title={error} />}
            {confirmRemove && (
                <div className={styles.confirm} role="alertdialog" aria-label={confirmRemove.title}>
                    <Text weight="semibold">{confirmRemove.title}</Text>
                    <Text size="sm">{confirmRemove.message}</Text>
                    <div className={styles.buttons}>
                        <Button kind="primary" destructive size="md" onClick={vm.confirmRemoval}>
                            {labels.remove}
                        </Button>
                        <Button kind="tertiary" size="md" onClick={vm.cancelRemoval}>
                            {labels.cancel}
                        </Button>
                    </div>
                </div>
            )}
            <div role="tabpanel" className={styles.panel}>
                {stickers.length === 0 && emptyText ? (
                    <Text size="sm" className={styles.empty}>
                        {emptyText}
                    </Text>
                ) : (
                    <ul className={styles.grid}>
                        {stickers.map((sticker) => (
                            <li key={sticker.id} className={styles.cell}>
                                <button
                                    type="button"
                                    className={styles.sticker}
                                    title={sticker.description}
                                    aria-label={sticker.description}
                                    disabled={busy}
                                    onClick={() => vm.send(sticker.id)}
                                >
                                    <img src={sticker.src} alt="" loading="lazy" />
                                </button>
                                {removable && (
                                    <IconButton
                                        className={styles.remove}
                                        size="24px"
                                        aria-label={`${labels.remove}: ${sticker.description}`}
                                        onClick={() => vm.remove(sticker.id)}
                                    >
                                        <CloseIcon />
                                    </IconButton>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {credit && (
                    <Text size="sm" className={styles.credit}>
                        {credit}
                    </Text>
                )}
            </div>
        </div>
    );
}
