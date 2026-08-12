import { useEffect, useRef, useState } from 'react';
import { Select, Typography } from 'antd';

type QrScannerProps = {
    onScan: (decodedValue: string) => void;
    onError?: (message: string) => void;
};

type Camera = { id: string; label: string };

const SCAN_FORMATS = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];
const SCAN_INTERVAL_MS = 100;

let scannerSequence = 0;

export function QrScanner({ onScan, onError }: QrScannerProps) {
    const [scannerId] = useState(() => `inventory-qr-scanner-${scannerSequence++}`);
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [cameraLoading, setCameraLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const video = useRef<HTMLVideoElement>(null);
    const stream = useRef<MediaStream | null>(null);
    const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestOnScan = useRef(onScan);
    const latestOnError = useRef(onError);
    const lastScan = useRef<{ value: string; at: number } | null>(null);
    const mounted = useRef(true);
    const detector = useRef<BarcodeDetectorLike | null>(null);

    useEffect(() => {
        latestOnScan.current = onScan;
        latestOnError.current = onError;
    }, [onScan, onError]);

    useEffect(() => {
        mounted.current = true;
        let active = true;

        const reportError = (error: unknown) => {
            const message = error instanceof Error ? error.message : 'Unable to start camera.';
            if (!active) return;
            setErrorMessage(message);
            latestOnError.current?.(message);
        };

        const stopCamera = () => {
            if (scanTimer.current !== null) {
                clearTimeout(scanTimer.current);
                scanTimer.current = null;
            }
            stream.current?.getTracks().forEach((track) => track.stop());
            stream.current = null;
            if (video.current) video.current.srcObject = null;
        };

        const scanFrame = async () => {
            if (!active || !video.current || !detector.current) return;
            try {
                const results = await detector.current.detect(video.current);
                const result = results.find((candidate) => candidate.rawValue);
                if (result) {
                    const now = Date.now();
                    if (
                        lastScan.current?.value !== result.rawValue ||
                        now - lastScan.current.at >= 1500
                    ) {
                        lastScan.current = { value: result.rawValue, at: now };
                        latestOnScan.current(result.rawValue);
                    }
                }
            } catch (error) {
                if (active && (error as DOMException).name !== 'InvalidStateError') {
                    reportError(error);
                }
            }
            if (active) scanTimer.current = setTimeout(() => void scanFrame(), SCAN_INTERVAL_MS);
        };

        const startCamera = async (cameraId: string) => {
            stopCamera();
            const constraints: MediaStreamConstraints = cameraId
                ? { video: { deviceId: { exact: cameraId } } }
                : { video: { facingMode: { ideal: 'environment' } } };
            const nextStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (!active || !video.current) {
                nextStream.getTracks().forEach((track) => track.stop());
                return;
            }
            stream.current = nextStream;
            video.current.srcObject = nextStream;
            await video.current.play();
            void scanFrame();
        };

        const load = async () => {
            try {
                if (!('BarcodeDetector' in window)) {
                    throw new Error('Barcode scanning requires a supported Chrome platform.');
                }
                const supported = await BarcodeDetector.getSupportedFormats();
                const formats = SCAN_FORMATS.filter((format) => supported.includes(format));
                if (formats.length === 0) {
                    throw new Error(
                        'This Chrome platform does not support the required barcode formats.',
                    );
                }
                detector.current = new BarcodeDetector({ formats });

                await startCamera('');
                const available = (await navigator.mediaDevices.enumerateDevices())
                    .filter((device) => device.kind === 'videoinput')
                    .map((device, index) => ({
                        id: device.deviceId,
                        label: device.label || `Camera ${index + 1}`,
                    }));
                if (!active) return;
                setCameras(available);
                setCameraLoading(false);
                const preferred =
                    available.find((camera) => /back|rear|environment/i.test(camera.label)) ||
                    available[0];
                const cameraId = preferred?.id || '';
                setSelectedCameraId(cameraId);
                if (cameraId) await startCamera(cameraId);
            } catch (error) {
                setCameraLoading(false);
                reportError(error);
            }
        };

        void load();
        return () => {
            active = false;
            mounted.current = false;
            stopCamera();
        };
    }, [scannerId]);

    const selectCamera = async (cameraId: string) => {
        setSelectedCameraId(cameraId);
        setErrorMessage('');
        try {
            const constraints: MediaStreamConstraints = cameraId
                ? { video: { deviceId: { exact: cameraId } } }
                : { video: { facingMode: { ideal: 'environment' } } };
            stream.current?.getTracks().forEach((track) => track.stop());
            const nextStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (!mounted.current || !video.current) {
                nextStream.getTracks().forEach((track) => track.stop());
                return;
            }
            stream.current = nextStream;
            video.current.srcObject = nextStream;
            await video.current.play();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to start camera.';
            setErrorMessage(message);
            latestOnError.current?.(message);
        }
    };

    return (
        <div className="grid gap-3">
            <label className="grid gap-1">
                <Typography.Text strong>Camera</Typography.Text>
                <Select
                    value={selectedCameraId || undefined}
                    loading={cameraLoading}
                    disabled={cameraLoading}
                    placeholder="No camera detected"
                    options={cameras.map((camera, index) => ({
                        value: camera.id,
                        label: camera.label || `Camera ${index + 1}`,
                    }))}
                    onChange={(value) => void selectCamera(value)}
                    style={{ width: '100%' }}
                />
            </label>
            <div className="relative aspect-square w-full overflow-hidden rounded border">
                <video ref={video} className="h-full w-full object-cover" muted playsInline />
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 aspect-square w-[70%] -translate-x-1/2 -translate-y-1/2 rounded border-4 border-white/90" />
            </div>
            {errorMessage && <div className="text-sm text-red-600">{errorMessage}</div>}
        </div>
    );
}
