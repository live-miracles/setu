import type { ReactNode } from 'react';
import { publicImageUrl } from './image-storage';

type ImageUrlStatus = 'idle' | 'loading' | 'loaded' | 'error';

export function useImageUrl(imageId: string): { url: string; status: ImageUrlStatus } {
    const id = imageId.trim();
    const url = publicImageUrl(id);
    return { url, status: url ? 'loaded' : 'idle' };
}

export function RequestImage({
    imageId,
    alt,
    className,
    fallback,
}: {
    imageId: string;
    alt: string;
    className?: string;
    fallback: ReactNode;
}) {
    const { url, status } = useImageUrl(imageId);
    if (status === 'loading') return <span>Loading…</span>;
    return url ? <img src={url} alt={alt} className={className} /> : <>{fallback}</>;
}
