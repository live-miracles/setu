import { useEffect, useRef, useState } from 'react';
import { Button, Typography } from 'antd';
import { CameraOutlined } from '@ant-design/icons';

export function ImageCamera({ onCapture }: { onCapture: (file: File) => Promise<void> }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [starting, setStarting] = useState(true);
    const [capturing, setCapturing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        let active = true;
        const start = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                });
                if (!active) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
            } catch (error) {
                if (active) {
                    setErrorMessage(
                        error instanceof Error ? error.message : 'Unable to access the camera.',
                    );
                }
            } finally {
                if (active) setStarting(false);
            }
        };
        void start();
        return () => {
            active = false;
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };
    }, []);

    const capture = async () => {
        const video = videoRef.current;
        if (!video?.videoWidth || !video.videoHeight) {
            setErrorMessage('The camera is not ready yet.');
            return;
        }
        setCapturing(true);
        setErrorMessage('');
        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Unable to capture the camera image.');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    (value) =>
                        value
                            ? resolve(value)
                            : reject(new Error('Unable to capture the camera image.')),
                    'image/jpeg',
                    0.92,
                );
            });
            await onCapture(new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }));
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : 'Unable to capture the image.',
            );
        } finally {
            setCapturing(false);
        }
    };

    return (
        <div className="grid gap-3">
            <div className="relative overflow-hidden rounded border bg-black">
                <video
                    ref={videoRef}
                    className="block aspect-[4/3] w-full object-cover"
                    playsInline
                    muted
                />
            </div>
            {errorMessage && <Typography.Text type="danger">{errorMessage}</Typography.Text>}
            <Button
                type="primary"
                icon={<CameraOutlined />}
                loading={starting || capturing}
                disabled={Boolean(errorMessage) || starting}
                onClick={() => void capture()}>
                Take photo
            </Button>
        </div>
    );
}
