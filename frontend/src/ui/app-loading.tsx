import { Spin, Typography } from 'antd';
import { getRandomQuote } from './quotes';

export function AppLoading() {
    return (
        <div className="app-loading" role="status" aria-live="polite">
            <Spin size="large" />
            <Typography.Text className="app-loading-quote">“{getRandomQuote()}”</Typography.Text>
        </div>
    );
}
