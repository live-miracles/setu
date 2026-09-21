import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';

// The bucket backing uploaded images is private (see uploadImage/getImageUrl
// in the Edge Function), so unlike the source app's Drive-hosted photos —
// fetchable directly by id — rendering one here needs a signed URL rather
// than one built client-side. The Edge Function mints a new token on every
// call, so without this cache each remount would fetch (and the browser
// would re-download) the same image under a different URL. Signed URLs are
// valid for an hour server-side; reuse ours until shortly before then so the
// same `imageId` keeps the same `src` and hits the browser's HTTP cache.
const SIGNED_URL_TTL_MS = 60 * 60 * 1000;
const SIGNED_URL_REUSE_MARGIN_MS = 5 * 60 * 1000;
const imageUrlCache = new Map<string, { url: string; expiresAt: number }>();

// 'idle' means there's no imageId at all (nothing to show but the fallback);
// 'loading' means one is set but the signed URL hasn't resolved yet — that's
// the state that should read as "loading", not "no photo".
type ImageUrlStatus = 'idle' | 'loading' | 'loaded' | 'error';

function cachedEntry(id: string) {
    const entry = id ? imageUrlCache.get(id) : undefined;
    return entry && entry.expiresAt > Date.now() ? entry : undefined;
}

export function useImageUrl(imageId: string): { url: string; status: ImageUrlStatus } {
    const id = imageId.trim();
    const initial = cachedEntry(id);
    const [url, setUrl] = useState(initial?.url ?? '');
    const [status, setStatus] = useState<ImageUrlStatus>(!id ? 'idle' : initial ? 'loaded' : 'loading');
    useEffect(() => {
        if (!id) {
            setUrl('');
            setStatus('idle');
            return;
        }
        const fresh = cachedEntry(id);
        if (fresh) {
            setUrl(fresh.url);
            setStatus('loaded');
            return;
        }
        setUrl('');
        setStatus('loading');
        let cancelled = false;
        api.getImageUrl(id)
            .then((signedUrl) => {
                imageUrlCache.set(id, {
                    url: signedUrl,
                    expiresAt: Date.now() + SIGNED_URL_TTL_MS - SIGNED_URL_REUSE_MARGIN_MS,
                });
                if (!cancelled) {
                    setUrl(signedUrl);
                    setStatus('loaded');
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setUrl('');
                    setStatus('error');
                }
            });
        return () => {
            cancelled = true;
        };
    }, [id]);
    return { url, status };
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
