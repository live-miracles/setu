export function matchesSearch(query: string | undefined, values: unknown[]): boolean {
    const keywords = String(query || '')
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (!keywords.length) return true;
    const fields = values.map((value) => String(value ?? '').toLocaleLowerCase());
    return keywords.some((keyword) => fields.some((field) => field.includes(keyword)));
}
