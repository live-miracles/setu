import { useEffect, useState } from 'react';

// Keep in sync with the `max-width: 767px` mobile breakpoint in input.css.
const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobileViewport(): boolean {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
    useEffect(() => {
        const mediaQuery = window.matchMedia(MOBILE_QUERY);
        const sync = () => setIsMobile(mediaQuery.matches);
        mediaQuery.addEventListener('change', sync);
        sync();
        return () => mediaQuery.removeEventListener('change', sync);
    }, []);
    return isMobile;
}
