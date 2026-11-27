// Hands a generated file to the person. On a phone, Chrome (and the installed
// app) often drops a download started from a blob link, so there it opens the
// system share sheet instead (Save to Drive, Files, Print, WhatsApp...). On
// desktop, or when sharing is unavailable, it downloads the file.

function downloadFile(file: File): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Chrome starts the download asynchronously, so revoking the blob URL right
    // away cancels it. Release it after the download began.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

export async function saveFile(
    data: Uint8Array<ArrayBuffer>,
    fileName: string,
    mimeType: string,
): Promise<void> {
    const file = new File([data], fileName, { type: mimeType });
    if (isTouchDevice() && navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: fileName });
            return;
        } catch (error) {
            // Closing the share sheet is a choice, not a failure.
            if (error instanceof DOMException && error.name === 'AbortError') return;
            // Anything else (e.g. the tap's permission to share has lapsed while
            // the file was being built) falls back to a plain download.
        }
    }
    downloadFile(file);
}
