import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';

// The bucket backing uploaded images is private (see uploadImage/getImageUrl
// in the Edge Function), so unlike the source app's Drive-hosted photos —
// fetchable directly by id — rendering one here needs a fresh signed URL
// fetched per mount rather than a URL built client-side.
export function useImageUrl(imageId: string): string {
    const [url, setUrl] = useState('');
    useEffect(() => {
        const id = imageId.trim();
        setUrl('');
        if (!id) return;
        let cancelled = false;
        api.getImageUrl(id)
            .then((signedUrl) => {
                if (!cancelled) setUrl(signedUrl);
            })
            .catch(() => {
                if (!cancelled) setUrl('');
            });
        return () => {
            cancelled = true;
        };
    }, [imageId]);
    return url;
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
    const url = useImageUrl(imageId);
    return url ? <img src={url} alt={alt} className={className} /> : <>{fallback}</>;
}
