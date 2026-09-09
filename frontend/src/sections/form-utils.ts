export const INTERNATIONAL_PHONE_PATTERN = '\\+[1-9][0-9]{7,14}';
export const INTERNATIONAL_PHONE_TITLE =
    'Enter a valid phone number with country code using digits only, for example +919000000000.';

export function isValidInternationalPhone(phone: string): boolean {
    return /^\\+[1-9]\\d{7,14}$/.test(phone);
}
