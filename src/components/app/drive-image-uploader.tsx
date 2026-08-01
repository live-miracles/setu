'use client';

import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { isDemoMode } from '@/lib/env';
import { driveImageUrl } from '@/lib/drive-image';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 50 * 1024;

export function DriveImageUploader({
    value,
    onChange,
    label = 'Add photo',
}: {
    value?: string;
    onChange: (driveFileId: string | undefined) => void;
    label?: string;
}) {
    const { message } = App.useApp();

    const upload: UploadProps['customRequest'] = async ({ file, onError, onSuccess }) => {
        const selected = file as File;
        try {
            if (!ALLOWED_TYPES.has(selected.type)) {
                throw new Error('Use JPEG, PNG or WebP images.');
            }
            if (selected.size > MAX_BYTES) {
                throw new Error('Images must be 50KB or smaller.');
            }
            if (isDemoMode) {
                await new Promise((resolve) => setTimeout(resolve, 250));
                onChange(`demo-${crypto.randomUUID()}`);
                onSuccess?.({ demo: true });
                message.success(`${selected.name} attached in demo mode.`);
                return;
            }

            const formData = new FormData();
            formData.append('file', selected);
            const response = await fetch('/api/v1/images', { method: 'POST', body: formData });
            const body = (await response.json()) as {
                data?: { driveFileId: string };
                error?: { message?: string };
            };
            if (!response.ok || !body.data) {
                throw new Error(body.error?.message ?? 'Upload failed.');
            }
            onChange(body.data.driveFileId);
            onSuccess?.({ driveFileId: body.data.driveFileId });
            message.success(`${selected.name} uploaded.`);
        } catch (error) {
            const uploadError = error instanceof Error ? error : new Error('Upload failed.');
            onError?.(uploadError);
            message.error(uploadError.message);
        }
    };

    if (value) {
        const isDemoImage = value.startsWith('demo-');
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {isDemoImage ? (
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: 8,
                            background: '#f1f1ed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            color: '#888b92',
                        }}>
                        Photo
                    </div>
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={driveImageUrl(value)}
                        alt=""
                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }}
                    />
                )}
                <Button icon={<DeleteOutlined />} onClick={() => onChange(undefined)}>
                    Remove
                </Button>
            </div>
        );
    }

    return (
        <Upload
            customRequest={upload}
            accept=".jpg,.jpeg,.png,.webp"
            maxCount={1}
            showUploadList={false}>
            <Button icon={<UploadOutlined />}>{label}</Button>
        </Upload>
    );
}
