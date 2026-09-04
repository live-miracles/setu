import { useEffect, useRef, useState } from 'react';
import { Select, Typography } from 'antd';
import QrScannerLib from 'qr-scanner';

/**
 * A code in front of the camera decodes on every frame. A repeat of the same
 * value only counts as a new scan once the code has been away this long.
 */
const SCAN_DEBOUNCE_MS = 2500;

type Camera = { id: string; label: string };
type CameraErrorKind = 'permission-denied' | 'not-available';

function errorName(error: unknown): string {
    return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
}

function errorMessage(error: unknown): string {
    return typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error);
}

/**
 * A blocked camera is worth a different message than a missing one, and the
 * failures arrive in three shapes: a DOMException from getUserMedia, a plain
 * string thrown by the scanner ('Camera not found.'), and browsers that only
 * describe the problem in the message text.
 */
function cameraErrorKind(error: unknown): CameraErrorKind {
    const name = errorName(error);
    const searchable = `${name} ${errorMessage(error)}`.toLowerCase();
    return name === 'NotAllowedError' ||
        name === 'SecurityError' ||
        (name !== 'NotFoundError' && /permission|denied|not.?allowed|security/.test(searchable))
        ? 'permission-denied'
        : 'not-available';
}

function streamCameraId(video: HTMLVideoElement): string {
    const stream = video.srcObject;
    if (!(stream instanceof MediaStream)) return '';
    return stream.getVideoTracks()[0]?.getSettings().deviceId || '';
}

export function QrScanner({ onScan }: { onScan: (decodedValue: string) => void }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const scanner = useRef<QrScannerLib | null>(null);
    const latestOnScan = useRef(onScan);
    const scanTimes = useRef(new Map<string, number>());
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [cameraId, setCameraId] = useState('');
    const [cameraError, setCameraError] = useState<CameraErrorKind | null>(null);

    useEffect(() => {
        latestOnScan.current = onScan;
    }, [onScan]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        let active = true;

        const handleScan = (decodedValue: string) => {
            const value = decodedValue.trim();
            const now = Date.now();
            for (const [scanned, at] of scanTimes.current) {
                if (now - at >= SCAN_DEBOUNCE_MS) scanTimes.current.delete(scanned);
            }
            const previous = scanTimes.current.get(value);
            if (previous !== undefined && now - previous < SCAN_DEBOUNCE_MS) return;
            scanTimes.current.set(value, now);
            latestOnScan.current(value);
        };

        // The browser's own BarcodeDetector where it exists, and a bundled
        // worker everywhere else, so decoding never blocks the UI thread. The
        // library draws the corner brackets and the outline over a found code
        // itself — the frame below only has to be the positioned parent.
        const current = new QrScannerLib(video, (result) => handleScan(result.data), {
            preferredCamera: 'environment',
            maxScansPerSecond: 12,
            highlightScanRegion: true,
            highlightCodeOutline: true,
            returnDetailedScanResult: true,
        });
        scanner.current = current;

        void current
            .start()
            .then(async () => {
                if (!active) return;
                setCameraId(streamCameraId(video));
                // Device labels are only readable once camera permission has
                // been granted, so the list is read after the first start
                // rather than before it.
                const available = await QrScannerLib.listCameras(true).catch(() => []);
                if (active) setCameras(available);
            })
            .catch((error: unknown) => {
                if (active) setCameraError(cameraErrorKind(error));
            });

        return () => {
            active = false;
            scanner.current = null;
            current.destroy();
        };
    }, []);

    const selectCamera = async (nextCameraId: string) => {
        const current = scanner.current;
        if (!current) return;
        setCameraId(nextCameraId);
        setCameraError(null);
        try {
            await current.setCamera(nextCameraId);
        } catch (error) {
            setCameraError(cameraErrorKind(error));
        }
    };

    return (
        <div className="grid gap-3">
            <div className="relative aspect-square w-full overflow-hidden rounded border bg-black">
                <video
                    ref={videoRef}
                    aria-label="Scan a QR code"
                    className="block h-full w-full object-cover"
                    muted
                    playsInline
                />
            </div>
            {cameraError ? (
                <div className="grid gap-1">
                    <Typography.Text type="danger" strong>
                        {cameraError === 'permission-denied'
                            ? 'Camera access was blocked.'
                            : 'No camera is available.'}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                        {cameraError === 'permission-denied'
                            ? 'Allow the camera for this site in your browser settings, then open the scanner again.'
                            : 'Close the scanner and pick the inventory type from the list instead.'}
                    </Typography.Text>
                </div>
            ) : (
                cameras.length > 1 && (
                    <label className="grid gap-1">
                        <Typography.Text strong>Camera</Typography.Text>
                        <Select
                            value={cameraId || undefined}
                            placeholder="Select camera"
                            options={cameras.map((camera, index) => ({
                                value: camera.id,
                                label: camera.label || `Camera ${index + 1}`,
                            }))}
                            onChange={(value) => void selectCamera(value)}
                            style={{ width: '100%' }}
                        />
                    </label>
                )
            )}
        </div>
    );
}
