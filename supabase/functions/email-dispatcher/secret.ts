// Compares the caller's shared secret with the configured one without leaking,
// through response timing, how many leading characters were right. Both values
// are hashed first so the comparison always runs over 32 bytes, whatever their
// lengths.
export async function secretsMatch(provided: string | null, expected: string): Promise<boolean> {
    if (provided === null || !expected) return false;
    const digest = async (value: string) =>
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
    const [left, right] = await Promise.all([digest(provided), digest(expected)]);
    let difference = 0;
    for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
    return difference === 0;
}
