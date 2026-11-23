import { useId, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { FieldValues, UseFormRegisterReturn, UseFormReturn } from 'react-hook-form';
import { Input, Field, Select } from '../ui/form-kit';
import { COUNTRIES, COUNTRY_BY_ISO } from './country-codes';
import {
    cleanNationalNumber,
    defaultCountry,
    joinInternationalPhone,
    splitInternationalPhone,
} from './form-utils';
import { Button, Card as KitCard, Empty as KitEmpty, Typography } from '../ui/kit';
import { Modal } from '../ui/overlay-kit';
import { requestActionTone } from '../ui/request-status';

export { Modal };
import { useDashboard } from '../dashboard-context';
import { showErrorAlert } from '../ui/feedback';

export function Page({
    title,
    headingContent,
    action,
    className,
    hideHeading = false,
    children,
}: {
    title: string;
    headingContent?: ReactNode;
    action?: ReactNode;
    className?: string;
    hideHeading?: boolean;
    children: ReactNode;
}) {
    return (
        <section className={`antd-page${className ? ` ${className}` : ''}`}>
            {!hideHeading && (
                <div className="antd-page-heading">
                    <div>
                        <Typography.Title level={2}>{title}</Typography.Title>
                    </div>
                    {headingContent}
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}
export function Card({
    title,
    action,
    className,
    children,
}: {
    title: ReactNode;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <KitCard title={title} extra={action} className={className}>
            {children}
        </KitCard>
    );
}
export function Empty({ children = 'Nothing here yet.' }: { children?: ReactNode }) {
    return <KitEmpty description={children} />;
}
export function Submit({ label = 'Save', busy }: { label?: string; busy?: boolean }) {
    return (
        <Button type="primary" htmlType="submit" loading={busy}>
            {label}
        </Button>
    );
}

export function SaveFooter({
    label,
    busy,
    errorMessage,
}: {
    label: string;
    busy?: boolean;
    errorMessage?: string;
}) {
    return (
        <div className="flex items-center gap-2">
            <Submit label={label} busy={busy} />
            {errorMessage && (
                <Typography.Text type="danger" className="text-sm">
                    {errorMessage}
                </Typography.Text>
            )}
        </div>
    );
}
const ACTION_DESCRIPTIONS: Record<string, string> = {
    revise: 'Return this rejected request to draft? Its details and activity will be kept. You must submit it again for approval after making changes.',
    unapprove:
        'Withdraw the approval and return this request to submitted? It will need to be approved or rejected again.',
    reopen: 'Reopen this cancelled request as a draft? Its details and activity will be kept. It must be submitted again for approval.',
};

export function ActionConfirmation({
    action,
    description,
    onConfirm,
    onCancel,
}: {
    action: string;
    description?: string;
    onConfirm: () => Promise<void>;
    onCancel: () => void;
}) {
    const label = action.charAt(0).toUpperCase() + action.slice(1);
    return (
        <Modal title={`Confirm ${label}`} close={onCancel}>
            <form
                className="grid gap-3"
                onSubmit={async (event) => {
                    event.preventDefault();
                    await onConfirm();
                }}>
                <p>
                    {description ||
                        ACTION_DESCRIPTIONS[action] ||
                        `Are you sure you want to ${action.toLowerCase()} this request?`}
                </p>
                <div className="flex justify-end gap-2">
                    <Button onClick={onCancel}>No</Button>
                    <Button type="primary" tone={requestActionTone(action)} htmlType="submit">
                        Yes
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
export function useSave<T>(
    action: () => Promise<T>,
    close?: () => void,
    optimistic = false,
    refreshAfterSave = true,
) {
    const { refreshDashboard } = useDashboard();
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    return {
        busy,
        errorMessage,
        clearError: () => setErrorMessage(''),
        run: async (event?: FormEvent) => {
            event?.preventDefault();
            setErrorMessage('');
            if (event) {
                const form = event.currentTarget as HTMLFormElement;
                if (!form.checkValidity()) {
                    form.reportValidity();
                    return false;
                }
            }
            setBusy(true);
            if (optimistic) {
                close?.();
                setBusy(false);
                void action().catch((e) => showErrorAlert(e));
                return null;
            }
            try {
                const result = await action();
                close?.();
                if (refreshAfterSave) await refreshDashboard();
                return result;
            } catch (e) {
                setErrorMessage(e instanceof Error ? e.message : String(e));
                return null;
            } finally {
                setBusy(false);
            }
        },
    };
}

export function useRHFSave<T extends FieldValues>(
    form: UseFormReturn<T>,
    action: (values: T) => Promise<void>,
    refreshAfterSave = true,
) {
    const { refreshDashboard } = useDashboard();
    const [busy, setBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const onSubmit = (event?: FormEvent) => {
        setErrorMessage('');
        return form.handleSubmit(async (values) => {
            setBusy(true);
            try {
                await action(values);
                if (refreshAfterSave) await refreshDashboard();
            } catch (error) {
                setErrorMessage(error instanceof Error ? error.message : String(error));
            } finally {
                setBusy(false);
            }
        })(event);
    };
    return { busy, errorMessage, onSubmit };
}

export function TextField({
    name,
    label,
    value,
    type = 'text',
    list,
    required = false,
    pattern,
    title,
    onChange,
    registration,
    error,
}: {
    name: string;
    label: string;
    value?: string | number;
    type?: string;
    list?: string;
    required?: boolean;
    pattern?: string;
    title?: string;
    onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
    registration?: UseFormRegisterReturn;
    error?: string;
}) {
    const [inputError, setInputError] = useState('');
    const displayedError = error || inputError;
    const {
        onChange: registeredOnChange,
        ref: registeredRef,
        ...registrationProps
    } = registration || {};
    return (
        <Field label={label} required={required} error={displayedError}>
            <Input
                {...registrationProps}
                ref={registeredRef}
                name={name}
                type={type}
                list={list}
                value={onChange ? (value ?? '') : undefined}
                defaultValue={onChange ? undefined : (value ?? '')}
                required={required}
                pattern={pattern}
                title={title}
                onInvalid={(event) => {
                    event.preventDefault();
                    const input = event.currentTarget;
                    setInputError(
                        input.validity.valueMissing
                            ? `${label} is required.`
                            : input.validity.typeMismatch
                              ? `Enter a valid ${label.toLowerCase()}.`
                              : title ||
                                input.validationMessage ||
                                `Enter a valid ${label.toLowerCase()}.`,
                    );
                }}
                onChange={(event) => {
                    setInputError('');
                    void registeredOnChange?.(event);
                    onChange?.(event);
                }}
                onInput={(event) => {
                    void registeredOnChange?.(event);
                }}
            />
        </Field>
    );
}

const COUNTRY_OPTIONS = COUNTRIES.map((country) => ({
    value: country.iso,
    label: `+${country.dial} ${country.name}`,
}));

// A phone number as two inputs, a searchable country code and the number
// itself, so nobody has to know to type "+91" first. The form value stays the
// single international string ("+919000000000"); it is empty until a number is
// typed, which keeps the "required" rule working.
export function PhoneField({
    name,
    label,
    value,
    onChange,
    error,
}: {
    name: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
}) {
    const countryId = useId();
    const [iso, setIso] = useState(() => splitInternationalPhone(value)?.country.iso);
    const parsed = splitInternationalPhone(value);
    // The stored number wins over the picker when they disagree (a form reset).
    const chosen = iso ? COUNTRY_BY_ISO.get(iso) : undefined;
    const country =
        parsed && parsed.country.dial !== chosen?.dial
            ? parsed.country
            : (chosen ?? defaultCountry());
    const national = parsed?.national ?? '';
    return (
        <Field
            label={label}
            required
            error={error}
            help="Pick the country code, then type the number without it.">
            <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-2">
                <Select
                    id={countryId}
                    aria-label={`${label} country code`}
                    value={country.iso}
                    showSearch
                    onChange={(next) => {
                        const picked = COUNTRY_BY_ISO.get(next);
                        if (!picked) return;
                        setIso(picked.iso);
                        onChange(joinInternationalPhone(picked, national));
                    }}
                    options={COUNTRY_OPTIONS}
                />
                <Input
                    name={name}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="Number"
                    value={national}
                    onChange={(event) => {
                        const raw = event.target.value;
                        // Someone pasting a full "+91 90000 00000" still works.
                        const pasted = raw.trim().startsWith('+')
                            ? splitInternationalPhone(raw)
                            : null;
                        if (pasted) {
                            setIso(pasted.country.iso);
                            onChange(joinInternationalPhone(pasted.country, pasted.national));
                        } else {
                            onChange(joinInternationalPhone(country, cleanNationalNumber(raw)));
                        }
                    }}
                />
            </div>
        </Field>
    );
}
