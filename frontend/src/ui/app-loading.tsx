import { Spin, Typography } from 'antd';
import loadingBackground from '../../assets/loading-background.avif';
import { getRandomQuote } from './quotes';

const APP_LOADING_EVENT = 'setu:app-loading';

export function setAppLoading(loading: boolean): void {
    window.dispatchEvent(new CustomEvent(APP_LOADING_EVENT, { detail: loading }));
}

export { APP_LOADING_EVENT };

export function AppLoading() {
    return (
        <div
            className="app-loading"
            role="status"
            aria-live="polite"
            style={{ backgroundImage: `url(${loadingBackground})` }}>
            <Spin size="large" />
            <Typography.Text className="app-loading-quote">“{getRandomQuote()}”</Typography.Text>
        </div>
    );
}
