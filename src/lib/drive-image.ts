// Pure URL helper — safe to import from client components. The upload
// logic (which needs server-only credentials) lives in @/lib/drive instead.
export function driveImageUrl(driveFileId: string): string {
    return `https://lh3.googleusercontent.com/d/${driveFileId}=w1000`;
}
