import { Spin, Typography } from 'antd';
import loadingBackground from '../../assets/loading-background.avif';
import { getRandomQuote } from './quotes';

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
