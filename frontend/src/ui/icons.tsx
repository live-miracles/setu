// Small hand-authored line-icon set (no external icon font or CDN, keeping
// the build free of runtime dependencies). Every icon shares the same
// stroke weight and cap style so they read as one system.

export type IconName =
    | 'home'
    | 'calendar'
    | 'box'
    | 'clapper'
    | 'user'
    | 'shield'
    | 'plus'
    | 'external'
    | 'inbox'
    | 'alert'
    | 'list'
    | 'columns'
    | 'chevronDown'
    | 'chevronLeft'
    | 'chevronRight'
    | 'pin'
    | 'edit'
    | 'trash'
    | 'search'
    | 'mail'
    | 'message'
    | 'arrowLeft'
    | 'camera'
    | 'upload'
    | 'download'
    | 'filePdf'
    | 'whatsapp'
    | 'team'
    | 'tags'
    | 'settings'
    | 'schedule'
    | 'history'
    | 'reload'
    | 'phone'
    | 'more'
    | 'eye'
    | 'eyeOff'
    | 'checkCircle'
    | 'block'
    | 'appstore'
    | 'apartment'
    | 'close'
    | 'logout'
    | 'check'
    | 'sun'
    | 'moon';

const ICON_PATHS: Record<IconName, string> = {
    home: '<path d="M4 11.5 12 4l8 7.5" /><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9" />',
    calendar:
        '<rect x="4" y="5" width="16" height="15" rx="2" /><line x1="4" y1="9" x2="20" y2="9" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="16" y1="3" x2="16" y2="7" />',
    box: '<path d="M3.5 8 12 4l8.5 4L12 12 3.5 8Z" /><path d="M3.5 8v8L12 20l8.5-4V8" /><path d="M12 12v8" />',
    clapper:
        '<path d="M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9Z" /><path d="M4 9 5 5h3l-1 4Z" /><path d="M9.5 9 10.5 5h3l-1 4Z" /><path d="M15 9l1-4h3l-1 4Z" />',
    user: '<circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3.2-6 7-6s7 2.5 7 6" />',
    shield: '<path d="M12 3.5 5 6v5.5c0 5 3 8 7 9 4-1 7-4 7-9V6l-7-2.5Z" /><path d="M9 12l2 2 4-4" />',
    plus: '<line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />',
    external:
        '<path d="M14 4h6v6" /><line x1="20" y1="4" x2="10" y2="14" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />',
    inbox: '<path d="M4 12h4l2 3h4l2-3h4" /><path d="M4 12 6 5h12l2 7" /><path d="M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />',
    alert: '<path d="M12 4 3 20h18L12 4Z" /><line x1="12" y1="10" x2="12" y2="13.5" /><circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none" />',
    list: '<line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="18" r="1" fill="currentColor" stroke="none" />',
    columns:
        '<rect x="3.5" y="4" width="7" height="16" rx="1.5" /><rect x="13.5" y="4" width="7" height="16" rx="1.5" /><line x1="6" y1="8" x2="8" y2="8" /><line x1="16" y1="8" x2="18" y2="8" />',
    chevronDown: '<polyline points="6 9 12 15 18 9" />',
    chevronLeft: '<polyline points="15 6 9 12 15 18" />',
    chevronRight: '<polyline points="9 6 15 12 9 18" />',
    pin: '<path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.3" />',
    edit: '<path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" /><line x1="13.5" y1="6.5" x2="17.5" y2="10.5" />',
    trash: '<path d="M5 7h14" /><path d="M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />',
    search: '<circle cx="11" cy="11" r="6.5" /><line x1="16" y1="16" x2="21" y2="21" />',
    mail: '<rect x="4" y="6" width="16" height="12" rx="2" /><path d="m5 8 7 5 7-5" />',
    message:
        '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16H9l-4.5 4v-4H5A1.5 1.5 0 0 1 3.5 14.5v-8A1.5 1.5 0 0 1 5 5Z" />',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12" /><polyline points="11 6 5 12 11 18" />',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" />',
    upload: '<path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /><polyline points="7 9 12 4 17 9" /><line x1="12" y1="4" x2="12" y2="16" />',
    download:
        '<path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /><polyline points="7 11 12 16 17 11" /><line x1="12" y1="4" x2="12" y2="16" />',
    filePdf:
        '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v5h5" /><line x1="8.5" y1="14" x2="15.5" y2="14" /><line x1="8.5" y1="17.5" x2="13" y2="17.5" />',
    whatsapp:
        '<path d="M4 20l1.2-4.2A8 8 0 1 1 8.3 18.9L4 20Z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-.8.8c-.9-.4-1.7-1.2-2.1-2.1l.8-.8-1-2L9 9.5Z" />',
    team: '<circle cx="9" cy="8.5" r="3" /><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" /><circle cx="17" cy="9.5" r="2.3" /><path d="M17 14c2.5.2 4.5 1.8 4.5 4.5" />',
    tags: '<path d="M3.5 12V5a1.5 1.5 0 0 1 1.5-1.5h7l8 8a1.5 1.5 0 0 1 0 2.1l-5.4 5.4a1.5 1.5 0 0 1-2.1 0l-9-9Z" /><circle cx="8" cy="8" r="1.2" />',
    settings:
        '<path d="M10.1 5.9 L10.3 3.2 L13.7 3.2 L13.9 5.9 L16.4 7.3 L18.8 6.1 L20.5 9.1 L18.2 10.6 L18.2 13.4 L20.5 14.9 L18.8 17.9 L16.4 16.7 L13.9 18.1 L13.7 20.8 L10.3 20.8 L10.1 18.1 L7.6 16.7 L5.2 17.9 L3.5 14.9 L5.8 13.4 L5.8 10.6 L3.5 9.1 L5.2 6.1 L7.6 7.3Z" /><circle cx="12" cy="12" r="2.5" />',
    schedule: '<circle cx="12" cy="12" r="8.5" /><polyline points="12 7 12 12 15.5 14" />',
    history:
        '<path d="M4 12a8 8 0 1 0 2.5-5.8" /><polyline points="4 4 4 8.5 8.5 8.5" /><polyline points="12 8 12 12 15 13.5" />',
    reload: '<path d="M20 12a8 8 0 1 1-2.5-5.8" /><polyline points="20 4 20 8.5 15.5 8.5" />',
    phone: '<path d="M5 4h3.5l1.5 4-2 1.3a11 11 0 0 0 6.7 6.7L16 14l4 1.5V19a1.5 1.5 0 0 1-1.5 1.5C10.5 20.5 3.5 13.5 3.5 5.5A1.5 1.5 0 0 1 5 4Z" />',
    more: '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" />',
    eyeOff: '<path d="M9.9 6a9 9 0 0 1 2.1-.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.3 7.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" /><line x1="4" y1="4" x2="20" y2="20" />',
    checkCircle:
        '<circle cx="12" cy="12" r="8.5" /><polyline points="8.5 12.3 11 14.8 15.8 9.5" />',
    block: '<rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /><path d="M13 7h4a2 2 0 0 1 2 2v2M11 17H7a2 2 0 0 1-2-2v-2" />',
    appstore:
        '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />',
    apartment:
        '<rect x="9" y="3.5" width="6" height="5" rx="1" /><rect x="3" y="15.5" width="6" height="5" rx="1" /><rect x="15" y="15.5" width="6" height="5" rx="1" /><path d="M12 8.5v3.5M6 15.5V12h12v3.5" />',
    close: '<line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />',
    logout: '<path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" /><polyline points="15 8 19 12 15 16" /><line x1="19" y1="12" x2="9" y2="12" />',
    check: '<polyline points="5 12.5 10 17.5 19 7" />',
    sun: '<circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />',
};

// Sized to the surrounding text (1em) like an icon font; override with className.
export function Icon({
    name,
    className = '',
    spin = false,
    title,
    'aria-label': ariaLabel,
}: {
    name: IconName;
    className?: string;
    spin?: boolean;
    title?: string;
    'aria-label'?: string;
}) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`inline-block size-[1em] shrink-0 align-[-0.125em]${spin ? ' animate-spin' : ''}${className ? ` ${className}` : ''}`}
            aria-hidden={ariaLabel ? undefined : true}
            aria-label={ariaLabel}
            role={ariaLabel ? 'img' : undefined}
            dangerouslySetInnerHTML={{
                __html:
                    (title ? `<title>${title.replace(/[<>&]/g, '')}</title>` : '') +
                    ICON_PATHS[name],
            }}
        />
    );
}
