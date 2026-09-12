export const INTERNATIONAL_PHONE_PATTERN = '\\+[1-9][0-9]{7,14}';
export const INTERNATIONAL_PHONE_TITLE =
    'Enter a valid phone number starting with + and country code, using digits only, for example +919000000000.';
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
