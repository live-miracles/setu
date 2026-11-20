import { useState, type FormEvent, type ReactNode } from 'react';
import { useCreate, useDelete, useList, useUpdate } from '../ui/resources';
import { Modal } from '../ui/overlay-kit';
import { Select, Field } from '../ui/form-kit';
import { Button, Checkbox } from '../ui/kit';
import { useDashboard } from '../dashboard-context';
import { showErrorAlert, showSavingBadge } from '../ui/feedback';
import { formatDateTimeLocal } from '../ui/date';
import { TONE_PALETTE, snapToTone, toneName } from '../ui/tone';
import { TextField } from './refine-shared';

export type Field = {
    field: string;
    label: string;
    type?: string;
    datalistId?: string;
    hiddenInTable?: boolean;
    // Names another RESOURCES entry (and ui/resources.ts resource)
    // whose rows populate this select — resolved via its own useList rather
    // than the shared dashboard blob. optionsLabel adds a blank/"All ..."
    // entry ahead of the fetched rows when set.
    optionsResource?: string;
    // Which property of an option is stored as the field's value (default Id).
    optionsValueKey?: 'Id' | 'Name';
    optionsLabel?: string;
    // Only used when adding a new row (never overrides an existing row's value).
    defaultValue?: () => string;
};
export type Row = Record<string, any>;

export interface ResourceConfig {
    kind: string;
    title: string;
    addLabel: string;
    emptyMessage: string;
    fields: Field[];
    // Simple lists (places, brands, types) show as a grid of blocks, the way
    // departments and inventory types do, instead of a table of rows. A block
    // shows the name, a `Color` field as its background, and `describe`'s text
    // on a second line.
    layout?: 'table' | 'blocks';
    describe?: (row: Row) => string;
    // Most resources are keyed by a generated Id. Program languages have no
    // Id column — the name itself is the identifier — so this lets the
    // shared table below key/match/save rows without every resource needing
    // one.
    rowKey?: (row: Row) => string;
    // Postgres's `order by name` isn't locale/numeric-aware (e.g. "Room 10"
    // would sort before "Room 2") — resources that need that go through this
    // instead of relying on the backend's ordering.
    sortRows?: (rows: Row[]) => Row[];
    toInput: (values: Record<string, string>) => Record<string, unknown>;
}

export const rowKeyOf = (config: ResourceConfig, row: Row): string =>
    config.rowKey ? config.rowKey(row) : String(row.Id);
const value = (data: FormData, field: Field) => String(data.get(field.field) || '');

export function SettingsDetailFields({
    fields,
}: {
    fields: Array<[label: string, value: ReactNode]>;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([label, fieldValue]) => (
                <div key={label} className="flex min-w-0 items-baseline gap-2">
                    <dt className="shrink-0 text-xs font-semibold text-steel">{label}</dt>
                    <dd className="min-w-0 break-words text-sm">{fieldValue}</dd>
                </div>
            ))}
        </div>
    );
}

// Create/update/delete for one settings resource, with the saving badge and the
// shared dashboard blob kept in sync. The react-query cache already
// refetches the list on success; refreshDashboard also keeps the dashboard in
// sync for pages that still cross-reference this resource from there (e.g. a
// department/place picker) and haven't been migrated to the resource hooks yet.
export function useResourceMutations(resourceName: string, config: ResourceConfig) {
    const { refreshDashboard } = useDashboard();
    const { mutateAsync: createRow } = useCreate();
    const { mutateAsync: updateRow } = useUpdate();
    const { mutateAsync: deleteRow } = useDelete();

    // Resolves to the created row, or null when an existing row was updated.
    async function save(values: Record<string, string>, editing: Row | null): Promise<Row | null> {
        showSavingBadge(true);
        try {
            const payload = config.toInput(values);
            let created: Row | null = null;
            if (!editing) {
                const response = await createRow({
                    resource: resourceName,
                    values: payload,
                });
                created = response.data as Row;
            } else {
                await updateRow({
                    resource: resourceName,
                    id: rowKeyOf(config, editing),
                    values: payload,
                });
            }
            await refreshDashboard();
            return created;
        } finally {
            showSavingBadge(false);
        }
    }

    async function remove(row: Row): Promise<boolean> {
        showSavingBadge(true);
        try {
            await deleteRow({
                resource: resourceName,
                id: rowKeyOf(config, row),
            });
            await refreshDashboard();
            return true;
        } catch (error) {
            showErrorAlert(error);
            return false;
        } finally {
            showSavingBadge(false);
        }
    }

    return { save, remove };
}

function inputValue(field: Field, raw: unknown): string {
    if (field.type !== 'datetime-local') return String(raw ?? '');
    const date = new Date(String(raw || ''));
    if (Number.isNaN(date.getTime())) return String(raw || '').slice(0, 16);
    return formatDateTimeLocal(date);
}

// Pick from the fixed palette (ui/tone.ts) rather than any colour: the palette
// is chosen to look right on both themes. A colour saved before the palette
// existed starts as the palette colour it is shown as (snapToTone), so saving
// moves it onto the palette.
function ColorField({ row, field }: { row?: Row; field: Field }) {
    const [color, setColor] = useState(snapToTone(inputValue(field, row?.[field.field])));
    const swatch =
        'size-7 shrink-0 cursor-pointer rounded-full border border-ink/20 outline-offset-2 hover:scale-110 focus-visible:outline-2 focus-visible:outline-ink';

    return (
        <div>
            <input type="hidden" name={field.field} value={color} />
            <div
                role="radiogroup"
                aria-label={field.label}
                className="flex flex-wrap items-center gap-2">
                {TONE_PALETTE.map((tone) => {
                    const selected = tone.value.toLowerCase() === color.toLowerCase();
                    return (
                        <button
                            key={tone.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={tone.name}
                            title={tone.name}
                            className={`${swatch}${selected ? ' outline-2 outline-ink' : ''}`}
                            style={{ backgroundColor: tone.value }}
                            onClick={() => setColor(tone.value)}
                        />
                    );
                })}
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-steel">
                <span>{toneName(color) ?? 'No color selected'}</span>
                {color && (
                    <Button type="link" size="small" onClick={() => setColor('')}>
                        Clear
                    </Button>
                )}
            </div>
        </div>
    );
}

function SelectField({ field, row }: { field: Field; row?: Row }) {
    const { result } = useList({
        resource: field.optionsResource || '',
        pagination: { mode: 'off' },
    });
    const options = [
        ...(field.optionsLabel ? [{ value: '', label: field.optionsLabel }] : []),
        ...(result.data as Row[]).map((option) => ({
            value: String(option[field.optionsValueKey ?? 'Id'] ?? option.Name ?? ''),
            label: String(option.Name ?? option.Id ?? ''),
        })),
    ];
    const [selected, setSelected] = useState(String(row?.[field.field] ?? ''));
    return (
        <>
            <input type="hidden" name={field.field} value={selected} />
            <Select
                value={selected}
                onChange={setSelected}
                className="antd-full-width"
                showSearch
                options={options.map((option) => ({ value: option.value, label: option.label }))}
            />
        </>
    );
}

function FieldSet({
    config,
    row,
    onSubmit,
    submitLabel,
    datalistOptions = {},
}: {
    config: ResourceConfig;
    row?: Row;
    onSubmit: (values: Record<string, string>) => Promise<void>;
    submitLabel: string;
    datalistOptions?: Record<string, string[]>;
}) {
    const [busy, setBusy] = useState(false);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!event.currentTarget.checkValidity()) {
            event.currentTarget.reportValidity();
            return;
        }
        setBusy(true);
        try {
            const data = new FormData(event.currentTarget);
            const values = Object.fromEntries(config.fields.map((f) => [f.field, value(data, f)]));
            await onSubmit(values);
        } catch (error) {
            showErrorAlert(error);
        } finally {
            setBusy(false);
        }
    }
    return (
        <form noValidate onSubmit={submit}>
            {config.fields.map((field, index) => {
                const defaultValue = row
                    ? inputValue(field, row[field.field])
                    : (field.defaultValue?.() ?? inputValue(field, undefined));
                if (!['checkbox', 'color', 'select'].includes(field.type || '')) {
                    return (
                        <span key={field.field}>
                            <TextField
                                name={field.field}
                                label={field.label}
                                type={field.type || 'text'}
                                list={field.datalistId}
                                required={index === 0}
                                value={defaultValue}
                            />
                            {field.datalistId && (
                                <datalist id={field.datalistId}>
                                    {(datalistOptions[field.datalistId] || []).map((option) => (
                                        <option key={option} value={option} />
                                    ))}
                                </datalist>
                            )}
                        </span>
                    );
                }
                return (
                    <Field label={field.label} required={index === 0} key={field.field}>
                        {field.type === 'checkbox' ? (
                            <Checkbox
                                name={field.field}
                                defaultChecked={row ? row[field.field] !== false : true}
                            />
                        ) : field.type === 'color' ? (
                            <ColorField field={field} row={row} />
                        ) : (
                            <SelectField field={field} row={row} />
                        )}
                    </Field>
                );
            })}
            <Button type="primary" htmlType="submit" loading={busy}>
                {submitLabel}
            </Button>
        </form>
    );
}

export function Editor({
    config,
    row,
    onClose,
    onSaved,
    datalistOptions,
}: {
    config: ResourceConfig;
    row?: Row;
    onClose: () => void;
    onSaved: (values: Record<string, string>) => Promise<void>;
    datalistOptions?: Record<string, string[]>;
}) {
    const resourceLabel = config.addLabel.replace(/^Add /, '');
    return (
        <Modal title={row ? `Edit ${resourceLabel}` : config.addLabel} close={onClose}>
            <FieldSet
                config={config}
                row={row}
                onSubmit={async (values) => {
                    // Close only once the save succeeded, so a rejected save
                    // (duplicate name, validation) keeps what was typed.
                    await onSaved(values);
                    onClose();
                }}
                datalistOptions={datalistOptions}
                submitLabel={row ? 'Save' : 'Add'}
            />
        </Modal>
    );
}
