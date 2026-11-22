// Records docs/images/demo.gif: a short walkthrough of the demo server
// (demo.mjs) — open a program request, approve it, see it on the calendar, then
// roster and inventory. It drives headless Chrome over the DevTools protocol
// (no extra dependency) and encodes the frames with ffmpeg, so both must be
// installed. Set CHROME_PATH if Chrome is not in a standard location.
//
//   npm run demo:gif
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root } from './shell.mjs';

const APP_PORT = 47197;
const DEBUG_PORT = 9333;
const ORIGIN = `http://localhost:${APP_PORT}`;
const WIDTH = 1200;
const HEIGHT = 720;
const GIF_WIDTH = 880;
const GIF_FPS = 10;
const outFile = path.join(root, 'docs/images/demo.gif');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
    ];
    const found = candidates.find((candidate) => candidate && existsSync(candidate));
    if (!found) throw new Error('Chrome not found. Set CHROME_PATH to its executable.');
    return found;
}

async function until(check, what, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const value = await check().catch(() => null);
        if (value) return value;
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${what}.`);
}

// --- Minimal DevTools client -----------------------------------------------

async function connect() {
    const target = await until(async () => {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
        return list.find((t) => t.type === 'page');
    }, 'Chrome');
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
    });
    let nextId = 0;
    const pending = new Map();
    const listeners = new Map();
    socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id && pending.has(message.id)) {
            const { resolve, reject } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
        } else if (message.method) {
            listeners.get(message.method)?.(message.params);
        }
    };
    return {
        send: (method, params = {}) =>
            new Promise((resolve, reject) => {
                const id = ++nextId;
                pending.set(id, { resolve, reject });
                socket.send(JSON.stringify({ id, method, params }));
            }),
        on: (method, handler) => listeners.set(method, handler),
        close: () => socket.close(),
    };
}

// --- Page driver -------------------------------------------------------------

const CURSOR = `(() => {
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;' +
        'pointer-events:none;transform:translate(${WIDTH / 2}px,${HEIGHT / 2}px);' +
        'transition:transform .6s cubic-bezier(.4,0,.2,1)';
    cursor.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M3 2l7 19 2.8-7.7L21 10.5z" ' +
        'fill="#1b1b1b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
})()`;

const byText = (selector, text) =>
    `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.offsetParent && e.textContent.trim() === ${JSON.stringify(text)})`;
const linkContaining = (text) =>
    `[...document.querySelectorAll('a')].find((e) => e.offsetParent && e.textContent.includes(${JSON.stringify(text)}))`;

function driver(cdp) {
    const evaluate = async (expression) => {
        const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });
        if (exceptionDetails) throw new Error(exceptionDetails.text);
        return result.value;
    };
    const locate = (element) =>
        evaluate(`(() => {
            const el = ${element};
            if (!el) return null;
            el.scrollIntoView({ block: 'nearest' });
            const r = el.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })()`);
    const glide = async (point) => {
        await evaluate(
            `document.getElementById('demo-cursor').style.transform = 'translate(${point.x - 3}px,${point.y - 2}px)'`,
        );
        await sleep(700);
    };
    return {
        evaluate,
        sleep,
        async moveTo(element) {
            await glide(await until(() => locate(element), `an element: ${element}`));
        },
        async click(element, wait = 1000) {
            const point = await until(() => locate(element), `an element: ${element}`);
            await glide(point);
            const mouse = { x: point.x, y: point.y, button: 'left', clickCount: 1 };
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...mouse });
            await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...mouse });
            await evaluate(`(() => {
                const ring = document.createElement('div');
                ring.style.cssText = 'position:fixed;left:${point.x - 16}px;top:${point.y - 16}px;width:32px;height:32px;' +
                    'border-radius:50%;border:3px solid #d9480f;pointer-events:none;z-index:2147483646';
                document.body.appendChild(ring);
                ring.animate([{ transform: 'scale(.4)', opacity: 0.9 }, { transform: 'scale(1.7)', opacity: 0 }], 450)
                    .finished.then(() => ring.remove());
            })()`);
            await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...mouse });
            await sleep(wait);
        },
    };
}

// --- Storyboard -------------------------------------------------------------

async function storyboard(d) {
    await d.sleep(1400); // home
    await d.click(byText('a', 'Requests'), 1300); // opens on Programs
    await d.click(linkContaining('Spanish storytelling hour'), 1600);
    await d.click(byText('button', 'approve'), 1000);
    await d.click(byText('button', 'Yes'), 2200); // now approved, with a new comment
    await d.click(byText('a', 'Calendar'), 900);
    // The deepest element holding the program's name is its calendar block.
    const block = `[...document.querySelectorAll('div, td')].filter((e) => e.textContent.includes('Spanish storytelling hour')).at(-1)`;
    await d.evaluate(`${block}.scrollIntoView({ behavior: 'smooth', block: 'center' })`);
    await d.sleep(1000);
    await d.moveTo(block);
    await d.sleep(1600); // the approved program is on the calendar
    await d.click(byText('a', 'Roster'), 2000);
    await d.click(byText('a', 'Requests'), 1400);
    await d.click(byText('button', 'Inventory'), 1400); // the Programs / Inventory switch
    await d.click(linkContaining('Spring interview shoot'), 2200);
}

// --- Main -------------------------------------------------------------------

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
    throw new Error('ffmpeg is required to encode the GIF.');
}
const chrome = findChrome();
const work = mkdtempSync(path.join(tmpdir(), 'setu-gif-'));
const server = spawn(process.execPath, [path.join(root, 'build-tools/demo.mjs')], {
    env: { ...process.env, PORT: String(APP_PORT) },
    stdio: ['ignore', 'inherit', 'inherit'],
});
const browser = spawn(
    chrome,
    [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${path.join(work, 'profile')}`,
        `--window-size=${WIDTH},${HEIGHT + 120}`,
        'about:blank',
    ],
    { stdio: 'ignore' },
);

try {
    await until(() => fetch(ORIGIN), 'the demo server');
    const cdp = await connect();
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: WIDTH,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: false,
    });
    const d = driver(cdp);
    await cdp.send('Page.navigate', { url: ORIGIN });
    await until(() => d.evaluate(`!!document.querySelector('nav')`), 'the app to load');
    await d.evaluate(CURSOR);

    const frames = [];
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
        frames.push({ time: metadata.timestamp, data });
        void cdp.send('Page.screencastFrameAck', { sessionId });
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85 });
    await storyboard(d);
    await sleep(300);
    await cdp.send('Page.stopScreencast');
    cdp.close();
    if (frames.length < 10) throw new Error(`Only ${frames.length} frames were captured.`);

    // ffmpeg's concat demuxer replays each frame for the time it was on screen.
    let list = '';
    frames.forEach((frame, i) => {
        const file = path.join(work, `frame-${String(i).padStart(5, '0')}.jpg`);
        writeFileSync(file, Buffer.from(frame.data, 'base64'));
        const next = frames[i + 1]?.time ?? frame.time + 2;
        list += `file '${file.replaceAll('\\', '/')}'\nduration ${(next - frame.time).toFixed(4)}\n`;
    });
    const lastFile = path.join(work, `frame-${String(frames.length - 1).padStart(5, '0')}.jpg`);
    list += `file '${lastFile.replaceAll('\\', '/')}'\n`;
    writeFileSync(path.join(work, 'frames.txt'), list);

    mkdirSync(path.dirname(outFile), { recursive: true });
    const filter =
        `fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];` +
        '[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle';
    const encode = spawnSync(
        'ffmpeg',
        [
            '-y',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            path.join(work, 'frames.txt'),
            '-vf',
            filter,
            outFile,
        ],
        { stdio: 'ignore' },
    );
    if (encode.status !== 0) throw new Error('ffmpeg failed to encode the GIF.');
    console.log(`[demo-gif] ${path.relative(root, outFile)} from ${frames.length} frames`);
} finally {
    browser.kill();
    server.kill();
    await sleep(500);
    rmSync(work, { recursive: true, force: true });
}
