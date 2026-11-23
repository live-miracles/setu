import { COUNTRIES, COUNTRY_BY_ISO, DEFAULT_COUNTRY_ISO, type Country } from './country-codes';

export const INTERNATIONAL_PHONE_PATTERN = '\\+[1-9][0-9]{7,14}';
export const INTERNATIONAL_PHONE_TITLE =
    'Enter a valid phone number: choose the country code, then type the number using digits only.';
const INTERNATIONAL_PHONE_REGEX = new RegExp(`^${INTERNATIONAL_PHONE_PATTERN}$`);

export function internationalPhoneRules(label: string) {
    return {
        required: `${label} is required`,
        pattern: {
            value: INTERNATIONAL_PHONE_REGEX,
            message: INTERNATIONAL_PHONE_TITLE,
        },
    } as const;
}

export function isValidInternationalPhone(phone: string): boolean {
    return INTERNATIONAL_PHONE_REGEX.test(phone);
}

// The phone field shows the country code and the number as two inputs, but the
// form (and the database) keep the single "+<code><number>" string.

export function defaultCountry(): Country {
    return COUNTRY_BY_ISO.get(DEFAULT_COUNTRY_ISO) ?? COUNTRIES[0];
}

// Splits "+919000000000" into its country and national number, matching the
// longest calling code. Returns null when the value has no known country code.
export function splitInternationalPhone(
    value: string,
): { country: Country; national: string } | null {
    const digits = value.trim().startsWith('+') ? value.replace(/\D/g, '') : '';
    let best: Country | undefined;
    for (const country of COUNTRIES) {
        if (digits.startsWith(country.dial) && (!best || country.dial.length > best.dial.length)) {
            best = country;
        }
    }
    return best ? { country: best, national: digits.slice(best.dial.length) } : null;
}

// What people type into the number box: digits only, without the leading zeros
// some countries write before the number (e.g. 07700 900123 in the UK).
export function cleanNationalNumber(input: string): string {
    return input.replace(/\D/g, '').replace(/^0+/, '');
}

export function joinInternationalPhone(country: Country, national: string): string {
    return national ? `+${country.dial}${national}` : '';
}
