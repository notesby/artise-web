/*
Copyright 2026 Artise.

SPDX-License-Identifier: AGPL-3.0-only
*/

import React, { type JSX } from "react";
import { Form, Heading, SettingsToggleInput, Text } from "@vector-im/compound-web";

import { useViewModel } from "../../core/viewmodel";
import styles from "./ArtiseNotificationHoursView.module.css";
import { type ArtiseNotificationHoursViewModel } from "./types";

interface TimesProps {
    start: string;
    end: string;
    fromLabel: string;
    untilLabel: string;
    /** Prefixed to the fields' names for screen readers, e.g. "Lunes". */
    dayLabel?: string;
    disabled?: boolean;
    onChange: (isStart: boolean, time: string) => void;
}

function Times({ start, end, fromLabel, untilLabel, dayLabel, disabled, onChange }: Readonly<TimesProps>): JSX.Element {
    const name = (label: string): string => (dayLabel ? `${dayLabel}: ${label}` : label);
    return (
        <span className={styles.times}>
            <label className={styles.time}>
                <span>{fromLabel}</span>
                <input
                    type="time"
                    value={start}
                    disabled={disabled}
                    aria-label={name(fromLabel)}
                    onChange={(ev) => ev.target.value && onChange(true, ev.target.value)}
                />
            </label>
            <label className={styles.time}>
                <span>{untilLabel}</span>
                <input
                    type="time"
                    value={end}
                    disabled={disabled}
                    aria-label={name(untilLabel)}
                    onChange={(ev) => ev.target.value && onChange(false, ev.target.value)}
                />
            </label>
        </span>
    );
}

/**
 * "Horario de notificaciones", as on the phones: when this workspace's notifications may sound. Outside the
 * hours they still show, without sound.
 *
 * @example
 * ```tsx
 * <ArtiseNotificationHoursView vm={notificationHoursViewModel} />
 * ```
 */
export function ArtiseNotificationHoursView({ vm }: Readonly<{ vm: ArtiseNotificationHoursViewModel }>): JSX.Element {
    const s = useViewModel(vm);
    return (
        <section className={styles.section} aria-label={s.title}>
            <Heading as="h3" size="sm" weight="semibold">
                {s.title}
            </Heading>
            <Form.Root onSubmit={(ev) => ev.preventDefault()} className={styles.form}>
                <SettingsToggleInput
                    name="artise_hours_enabled"
                    label={s.title}
                    helpMessage={s.description}
                    checked={s.enabled}
                    onChange={(ev) => vm.setEnabled(ev.target.checked)}
                />
                {s.enabled && (
                    <>
                        <fieldset className={styles.fieldset}>
                            <legend className={styles.legend}>{s.scheduleLabel}</legend>
                            {s.schedules.map((option) => (
                                <label key={option.id} className={styles.radio}>
                                    <input
                                        type="radio"
                                        name="artise_hours_schedule"
                                        value={option.id}
                                        checked={s.schedule === option.id}
                                        onChange={() => vm.setSchedule(option.id)}
                                    />
                                    <span>{option.label}</span>
                                </label>
                            ))}
                            {s.footer && (
                                <Text size="sm" className={styles.footer}>
                                    {s.footer}
                                </Text>
                            )}
                        </fieldset>
                        <fieldset className={styles.fieldset}>
                            <legend className={styles.legend}>{s.hoursLabel}</legend>
                            {s.days ? (
                                <ul className={styles.days}>
                                    {s.days.map((day) => (
                                        <li key={day.id} className={styles.day}>
                                            <label className={styles.dayName}>
                                                <input
                                                    type="checkbox"
                                                    checked={day.on}
                                                    onChange={(ev) => vm.setDay(day.id, ev.target.checked)}
                                                />
                                                <span>{day.label}</span>
                                            </label>
                                            <Times
                                                start={day.start}
                                                end={day.end}
                                                fromLabel={s.fromLabel}
                                                untilLabel={s.untilLabel}
                                                dayLabel={day.label}
                                                disabled={!day.on}
                                                onChange={(isStart, time) => vm.setTime(day.id, isStart, time)}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <Times
                                    start={s.start}
                                    end={s.end}
                                    fromLabel={s.fromLabel}
                                    untilLabel={s.untilLabel}
                                    onChange={(isStart, time) => vm.setTime(undefined, isStart, time)}
                                />
                            )}
                        </fieldset>
                        <SettingsToggleInput
                            name="artise_hours_mentions"
                            label={s.mentionsLabel}
                            checked={s.mentions}
                            onChange={(ev) => vm.setMentions(ev.target.checked)}
                        />
                    </>
                )}
            </Form.Root>
            {s.warning && (
                <Text size="sm" className={styles.warning} role="status">
                    {s.warning}
                </Text>
            )}
        </section>
    );
}
