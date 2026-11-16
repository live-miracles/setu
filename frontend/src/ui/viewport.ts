import { useEffect, useState } from 'react';

// Keep in sync with the `max-width: 767px` mobile breakpoint in input.css.
const MOBILE_QUERY = '(max-width: 767px)';
// Keep in sync with the `max-width: 1023px` detail-page breakpoint in input.css.
const WIDE_QUERY = '(min-width: 1024px)';

function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
    useEffect(() => {
        const mediaQuery = window.matchMedia(query);
        const sync = () => setMatches(mediaQuery.matches);
        mediaQuery.addEventListener('change', sync);
        sync();
        return () => mediaQuery.removeEventListener('change', sync);
    }, [query]);
    return matches;
}

export function useIsMobileViewport(): boolean {
    return useMediaQuery(MOBILE_QUERY);
}

// Wide enough to show a list and the selected record's details side by side.
export function useIsWideViewport(): boolean {
    return useMediaQuery(WIDE_QUERY);
}
