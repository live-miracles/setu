'use client';

import { GoogleOutlined, LockOutlined } from '@ant-design/icons';
import { App, Button, Divider } from 'antd';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { isDemoMode } from '@/lib/env';

export default function LoginPage() {
    const router = useRouter();
    const { message } = App.useApp();
    const demoMode = isDemoMode;

    useEffect(() => {
        const error = new URLSearchParams(window.location.search).get('error');
        if (error === 'not-approved') {
            message.error('This Google account is not active on the allowlist.');
        } else if (error === 'oauth') {
            message.error('Google sign-in could not be completed.');
        }
    }, [message]);

    const signIn = async () => {
        if (demoMode) {
            router.push('/app');
            return;
        }
        const supabase = createBrowserSupabaseClient();
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                scopes: 'openid email profile',
            },
        });
        if (error) message.error(error.message);
    };

    return (
        <main className="login-page">
            <section className="login-visual">
                <div className="login-visual-copy">
                    <span className="demo-pill">Livestream team</span>
                    <h1>Stay ready. Stay live.</h1>
                    <p>
                        One focused workspace for roster coverage, equipment handovers and studio
                        support.
                    </p>
                </div>
            </section>
            <section className="login-panel">
                <div className="login-card">
                    <Image
                        src="/icons/icon-192.png"
                        alt="Livestream Operations"
                        width={60}
                        height={60}
                        priority
                    />
                    <h2>Welcome back</h2>
                    <p>
                        Sign in with an approved Google account. Access is managed by the Livestream
                        operations admins.
                    </p>
                    <Button
                        type="primary"
                        size="large"
                        block
                        icon={<GoogleOutlined />}
                        onClick={() => void signIn()}>
                        {demoMode ? 'Enter demo workspace' : 'Continue with Google'}
                    </Button>
                    <Divider plain>secure internal access</Divider>
                    <div style={{ color: '#878a90', fontSize: 11, lineHeight: 1.6 }}>
                        <LockOutlined style={{ marginRight: 7 }} />
                        Your Google password is never shared with this application.
                    </div>
                </div>
            </section>
        </main>
    );
}
