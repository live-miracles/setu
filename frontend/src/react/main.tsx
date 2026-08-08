import { createRoot } from 'react-dom/client';
import { SettingsApp } from './SettingsApp';

const host = document.getElementById('app-content');
if (!host) throw new Error('React application host was not found.');

createRoot(host).render(<SettingsApp />);
