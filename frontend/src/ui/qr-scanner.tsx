import { useEffect, useRef, useState } from 'react';
import { Select, Typography } from 'antd';

type QrScannerProps = {
    onScan: (decodedValue: string) => void;
    onError?: (message: string) => void;
};

type Camera = { id: string; label: string };
type Scanner = {
    start: (...args: any[]) => Promise<unknown>;
    stop: () => Promise<void>;
    clear: () => void;
};

let scannerSequence = 0;

export function QrScanner({ onScan, onError }: QrScannerProps) {
    const [scannerId] = useState(() => `inventory-qr-scanner-${scannerSequence++}`);
    const [cameras, setCameras] = useState<Camera[]>([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [cameraLoading, setCameraLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const latestOnScan = useRef(onScan);
    const latestOnError = useRef(onError);
    const lastScan = useRef<{ value: string; at: number } | null>(null);
    const scannerClass = useRef<any>(null);
    const scanner = useRef<Scanner | null>(null);
    const mounted = useRef(true);

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

        const stopScanner = async () => {
            const current = scanner.current;
            scanner.current = null;
            if (!current) return;
            await current.stop().catch(() => undefined);
            current.clear();
        };

        const startScanner = async (cameraId: string) => {
            try {
                await stopScanner();
                if (!active || !scannerClass.current) return;
                const current = new scannerClass.current(scannerId) as Scanner;
                scanner.current = current;
                await current.start(
                    cameraId || { facingMode: 'environment' },
                    { fps: 10 },
                    (decodedValue: string) => {
                        const now = Date.now();
                        if (
                            lastScan.current?.value === decodedValue &&
                            now - lastScan.current.at < 1500
                        ) {
                            return;
                        }
                        lastScan.current = { value: decodedValue, at: now };
                        latestOnScan.current(decodedValue);
                    },
                    () => undefined,
                );
            } catch (error) {
                reportError(error);
            }
        };

        const load = async () => {
            try {
                const { Html5Qrcode } = await import('html5-qrcode');
                if (!active) return;
                scannerClass.current = Html5Qrcode;
                const available = (await Html5Qrcode.getCameras()).map((camera) => ({
                    id: camera.id,
                    label: camera.label || 'Camera',
                }));
                if (!active) return;
                setCameras(available);
                setCameraLoading(false);
                const preferred =
                    available.find((camera) => /back|rear|environment/i.test(camera.label)) ||
                    available[0];
                const cameraId = preferred?.id || '';
                setSelectedCameraId(cameraId);
                await startScanner(cameraId);
            } catch (error) {
                setCameraLoading(false);
                reportError(error);
            }
        };

        load();
        return () => {
            active = false;
            mounted.current = false;
            void stopScanner();
        };
    }, [scannerId]);

    const selectCamera = async (cameraId: string) => {
        setSelectedCameraId(cameraId);
        setErrorMessage('');
        try {
            const current = scanner.current;
            scanner.current = null;
            if (current) {
                await current.stop().catch(() => undefined);
                current.clear();
            }
            if (!mounted.current || !scannerClass.current) return;
            const next = new scannerClass.current(scannerId) as Scanner;
            scanner.current = next;
            await next.start(
                cameraId,
                { fps: 10 },
                (decodedValue: string) => {
                    const now = Date.now();
                    if (
                        lastScan.current?.value === decodedValue &&
                        now - lastScan.current.at < 1500
                    ) {
                        return;
                    }
                    lastScan.current = { value: decodedValue, at: now };
                    latestOnScan.current(decodedValue);
                },
                () => undefined,
            );
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
                <div id={scannerId} className="h-full w-full" />
                <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 aspect-square w-[70%] -translate-x-1/2 -translate-y-1/2 rounded border-4 border-white/90" />
            </div>
            {errorMessage && <div className="text-sm text-red-600">{errorMessage}</div>}
        </div>
    );
}
