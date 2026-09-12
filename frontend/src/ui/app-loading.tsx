import { Spin, Typography } from 'antd';
import loadingBackground from '../../assets/loading-background.avif';
import { getRandomQuote } from './quotes';

const APP_LOADING_EVENT = 'setu:app-loading';

export function setAppLoading(loading: boolean): void {
    window.dispatchEvent(new CustomEvent(APP_LOADING_EVENT, { detail: loading }));
}

export { APP_LOADING_EVENT };

// `inline` is for a loading state nested inside a page's own render (e.g. a
// section mid-submit) — it fills its parent in normal flow instead of the
// fixed full-viewport overlay `main.ts` uses before that page exists at all,
// so the page's own title/action bar around it stays visible.
export function AppLoading({ inline = false }: { inline?: boolean } = {}) {
    return (
        <div
            className={`app-loading${inline ? ' app-loading-inline' : ''}`}
            role="status"
            aria-live="polite"
            style={{ backgroundImage: `url(${loadingBackground})` }}>
            <Spin size="large" />
            <Typography.Text className="app-loading-quote">“{getRandomQuote()}”</Typography.Text>
        </div>
    );
}
