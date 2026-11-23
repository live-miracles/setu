import { useId, useState, type ChangeEvent } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Input, Field, Select } from '../ui/form-kit';
import { COUNTRIES, COUNTRY_BY_ISO } from './country-codes';
import {
    cleanNationalNumber,
    defaultCountry,
    joinInternationalPhone,
    splitInternationalPhone,
} from './form-utils';
import { Button, Typography } from '../ui/kit';

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
