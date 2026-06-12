import React from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Zap, Music, Cpu, Mouse, FileJson, Puzzle, RefreshCw } from 'lucide-react';

// ── types ──

interface DocEntry {
    id: string;
    title: string;
    icon: any;
    iconColor: string;
    description: string;
    details?: string;
    warning?: string;
    tip?: string;
    params?: { name: string; desc: string }[];
    payload?: string;
    code: string;
}

// ── all api documentation in one clean array ──

const API_SECTIONS: DocEntry[] = [
    {
        id: 'audio',
        title: 'colorwallAudioListener(data)',
        icon: Zap,
        iconColor: '#f59e0b',
        description: 'receives processed audio frequency data from system audio output (wasapi loopback capture). called ~30 times per second while audio is playing. the signal is smoothed and interpolated with bass-driven energy for wallpaper-quality visuals — raw fft is too jittery for smooth animations.',
        details: 'data arrives as a JSON string — call JSON.parse() to get a float array of 128 values (0.0 to 1.0). each index maps to a frequency band on a logarithmic scale (20hz → nyquist). index 0 = deep bass, index 127 = highest treble. the backend runs a 2048-point fft, maps to 128 log-spaced bands, converts to dB scale, then blends with bass-energy-driven interpolation and smoothing.',
        tip: 'for circular/radial visualizers, make your container element larger than the visible radius — bars extend outward and will get clipped if the container has overflow:hidden or is too small. use a canvas that is 2× the outer radius, centered with CSS. for equalizer-style widgets, the relative band proportions are still accurate — bass-heavy songs will still light up the low end more.',
        warning: 'audio capture uses windows wasapi loopback — it captures whatever is coming out of your speakers/headphones, not microphone input.',
        params: [
            { name: 'data', desc: 'JSON string — parse it to get an array of 128 floats (0.0 to 1.0)' },
        ],
        code: `window.colorwallAudioListener = function(data) {
    // data always arrives as a json string, parse it first
    if (typeof data === 'string') data = JSON.parse(data);
    // data is now a float array: [0.12, 0.45, 0.78, ...] (128 values)

    // example: average bass bands (0-7)
    var bass = 0;
    for (var i = 0; i < 8; i++) bass += data[i];
    bass /= 8;

    // drive visuals with it
    myCanvas.style.transform = 'scale(' + (1 + bass * 0.1) + ')';
};`,
    },
    {
        id: 'media',
        title: 'colorwallCurrentTrack(data)',
        icon: Music,
        iconColor: '#8b5cf6',
        description: 'called when the currently playing media track changes or playback stops. polls windows global media transport controls (smtc) every ~1 second. works with spotify, youtube (in browser), windows media player, vlc, and anything else that reports to windows smtc.',
        details: 'when nothing is playing, the function receives the string "null" — your wallpaper should handle this gracefully with a fallback state. thumbnail is a full data:image/jpeg;base64,... string ready to use as an img src, but can be null even for active tracks if the player doesn\'t provide album art (e.g. some web players). thumbnail is only fetched when the track changes to avoid performance overhead.',
        tip: 'always provide a fallback state for when nothing is playing — show a default message like "nothing playing" and a placeholder image. users will see your wallpaper in this state most of the time. Always make the container for visualizers be big even if the visualizer is small (which is encouraged, usually go for circle shapes, depends), to avoid the waves being cutoff on high pitches.',
        params: [
            { name: 'data', desc: '{ "Title": string, "Artist": string, "Thumbnail": string | null } or "null"' },
        ],
        code: `window.colorwallCurrentTrack = function(data) {
    if (!data || data === 'null') {
        // nothing playing — show fallback state instead of hiding
        document.getElementById('title').textContent = 'Nothing Playing';
        document.getElementById('artist').textContent = 'Play something to see it here';
        document.getElementById('albumart').src = 'fallback-art.png'; // your default image
        return;
    }
    if (typeof data === 'string') data = JSON.parse(data);

    document.getElementById('title').textContent = data.Title || 'Unknown Track';
    document.getElementById('artist').textContent = data.Artist || 'Unknown Artist';
    // thumbnail can be null if the player doesn't provide album art
    if (data.Thumbnail) {
        document.getElementById('albumart').src = data.Thumbnail;
    } else {
        document.getElementById('albumart').src = 'fallback-art.png';
    }
};`,
    },
    {
        id: 'playback',
        title: 'colorwallWallpaperPlaybackChanged(state)',
        icon: RefreshCw,
        iconColor: '#22c55e',
        description: 'called when media playback state changes (play/pause). useful for pausing/resuming animations.',
        params: [
            { name: 'state', desc: '{ "IsPaused": boolean }' },
        ],
        code: `window.colorwallWallpaperPlaybackChanged = function(state) {
    if (typeof state === 'string') state = JSON.parse(state);
    var isPlaying = state && state.IsPaused === false;

    if (isPlaying) artRing.classList.add('playing');
    else artRing.classList.remove('playing');
};`,
    },
    {
        id: 'properties',
        title: 'colorwallPropertyListener(name, value)',
        icon: FileJson,
        iconColor: '#3b82f6',
        description: 'called when the user changes a setting in the wallpaper\'s property panel. also fires on load with initial values.',
        details: 'properties are defined in project.json under the "properties" key.',
        params: [
            { name: 'name', desc: 'property key string (e.g. "speed", "showClock")' },
            { name: 'value', desc: 'the raw value — number, boolean, or string' },
        ],
        code: `window.colorwallPropertyListener = function(name, value) {
    switch (name) {
        case 'speed':
            animationSpeed = parseFloat(value);
            break;
        case 'showClock':
            document.getElementById('clock').style.display = value ? '' : 'none';
            break;
        case 'blurIntensity':
            bg.style.filter = 'blur(' + parseFloat(value) + 'px)';
            break;
    }
};`,
    },
    {
        id: 'system',
        title: 'colorwallSystemInformation(data)',
        icon: Cpu,
        iconColor: '#06b6d4',
        description: 'receives live system telemetry data every ~3 seconds. useful for cpu/ram/network monitoring widgets. cpu usage is real system-wide usage, ram is real available memory.',
        details: 'static fields (NameCpu, NameGpu, NameNetCard, TotalRam) are cached once at session start and never change. dynamic fields (CurrentCpu, CurrentRamAvail, CurrentNetDown, CurrentNetUp) update every tick. you can safely use the static fields for labels without worrying about them flickering.',
        warning: 'gpu usage (CurrentGpu3D) is currently mocked as 0 — implementing real gpu metrics requires wmi/dxgi queries that are too expensive for a hot loop. network stats (CurrentNetDown/CurrentNetUp) are cumulative bytes since the forwarder started, not per-second rates — calculate the delta yourself if you need speed (see example below).',
        payload: `{
  "NameCpu":        "AMD Ryzen 9 5900X",    // cached once
  "NameGpu":        "Primary GPU",          // cached once (mocked)
  "NameNetCard":    "Ethernet",             // cached once
  "TotalRam":       32768,                  // cached once (MB)
  "CurrentCpu":     23,                     // live 0-100%
  "CurrentGpu3D":   0,                      // always 0 (mocked)
  "CurrentNetDown": 1234567,                // cumulative bytes received
  "CurrentNetUp":   456789,                 // cumulative bytes sent
  "CurrentRamAvail": 18432                  // live available (MB)
}`,
        code: `var lastNetDown = 0, lastNetUp = 0, lastTick = Date.now();

window.colorwallSystemInformation = function(data) {
    if (typeof data === 'string') data = JSON.parse(data);

    // cpu & ram — use directly
    document.getElementById('cpu-bar').style.width = data.CurrentCpu + '%';
    document.getElementById('cpu-label').textContent = data.NameCpu;

    var usedRam = data.TotalRam - data.CurrentRamAvail;
    var ramPercent = Math.round((usedRam / data.TotalRam) * 100);
    document.getElementById('ram-bar').style.width = ramPercent + '%';

    // network speed — calculate delta from cumulative bytes
    var now = Date.now();
    var elapsed = (now - lastTick) / 1000; // seconds since last update
    var downSpeed = 0;
    var upSpeed = 0;
    
    if (elapsed > 0 && lastNetDown > 0) {
        downSpeed = Math.round((data.CurrentNetDown - lastNetDown) / elapsed);
        upSpeed = Math.round((data.CurrentNetUp - lastNetUp) / elapsed);
        // downSpeed/upSpeed are now in bytes/second
    }
    
    lastNetDown = data.CurrentNetDown;
    lastNetUp = data.CurrentNetUp;
    lastTick = now;
};`,
    },
    {
        id: 'mouse',
        title: 'mouse / pointer events',
        icon: Mouse,
        iconColor: '#ec4899',
        description: 'the backend polls cursor position at ~20fps and dispatches synthetic MouseEvent + PointerEvent to window, document, body, and all canvas elements.',
        details: 'standard mousemove, mousedown, mouseup, pointermove etc. all work out of the box. no special colorwall function needed.',
        code: `// standard event listeners work — parallax example
document.addEventListener('mousemove', function(e) {
    var x = (window.innerWidth  - e.pageX) / 90;
    var y = (window.innerHeight - e.pageY) / 90;
    bg.style.transform = 'translateX(' + x + 'px) translateY(' + y + 'px)';
});`,
    },
    {
        id: 'vanilla-js',
        title: 'Vanilla JS Capabilities (Clocks, Weather, etc.)',
        icon: Puzzle,
        iconColor: '#10b981',
        description: 'You are NOT limited to ColorWall APIs! You are generating a full HTML5 environment.',
        details: 'You MUST use standard JavaScript to create diverse widgets. For a Clock, use setInterval and new Date(). For Weather, use fetch() with an open API (like open-meteo) or generate beautiful mock data. For Battery, use navigator.getBattery(). Be creative and implement dynamic greetings, quotes, and sophisticated layouts using pure JavaScript.',
        code: `// Clock Widget
setInterval(() => {
    const now = new Date();
    document.getElementById('time').textContent = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}, 1000);

// Battery Widget
if (navigator.getBattery) {
    navigator.getBattery().then(batt => {
        document.getElementById('batt').textContent = Math.round(batt.level * 100) + '%';
    });
}`,
    },
    {
        id: 'tauri-os',
        title: 'Tauri OS APIs (Username)',
        icon: FileJson,
        iconColor: '#f43f5e',
        description: 'Fetch the local OS username to dynamically personalize your greetings!',
        details: 'Because the wallpaper runs in Tauri, you can invoke backend commands. Use get_username to get the Windows logged-in user name.',
        code: `// Fetch OS Username for a Greeting
if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
    window.__TAURI__.core.invoke('get_username').then(sysName => {
        if (sysName) {
            document.getElementById('name-el').textContent = sysName;
        }
    }).catch(e => console.error('Failed to get username', e));
}`,
    },
];

// ── project.json + widget.json structures ──

const PROJECT_JSON_EXAMPLE = `{
    "title": "My Wallpaper",
    "description": "a cool interactive wallpaper",
    "author": "you",
    "type": "web",
    "file": "index.html",
    "preview": "preview.gif",
    "properties": {
        "speed": {
            "text": "Animation Speed",
            "type": "slider",
            "value": 0.5,
            "min": 0, "max": 2, "step": 0.1
        },
        "showClock": {
            "text": "Show Clock",
            "type": "checkbox",
            "value": true
        },
        "color": {
            "text": "Accent Color",
            "type": "color",
            "value": "#c4b5fd"
        }
    }
}`;

const WIDGET_JSON_EXAMPLE = `{
    "id": "my-widget",
    "name": "My Widget",
    "author": "YourName",
    "version": "1.0.0",
    "description": "what the widget does",
    "entry": "template.html",
    "style": "style.css",
    "script": "script.js",
    "preview": "preview.png",
    "draggable": true,
    "defaultPosition": { "x": "50%", "y": "10%" },
    "dataBindings": ["time", "date", "media", "audio", "system"],
    "fonts": [
        { "family": "Inter", "source": "google", "weights": [400, 600] }
    ],
    "tweaks": {
        "fontSize": {
            "text": "Font Size",
            "type": "slider",
            "value": 24,
            "min": 10, "max": 80, "step": 1
        },
        "accentColor": {
            "text": "Accent",
            "type": "color",
            "value": "#c4b5fd"
        }
    }
}`;

const LIVELY_MAPPINGS = [
    ['livelyPropertyListener', 'colorwallPropertyListener'],
    ['livelyCurrentTrack', 'colorwallCurrentTrack'],
    ['livelyAudioListener', 'colorwallAudioListener'],
    ['livelyWallpaperPlaybackChanged', 'colorwallWallpaperPlaybackChanged'],
    ['livelySystemInformation', 'colorwallSystemInformation'],
];

const WIDGET_DATA_BINDINGS = [
    { attr: 'data-cw-time="HH:mm"', desc: 'auto-updates with formatted time' },
    { attr: 'data-cw-date="dddd"', desc: 'auto-updates with day name' },
    { attr: 'data-cw-media="title"', desc: 'auto-updates with track title' },
    { attr: 'data-cw-system="cpu"', desc: 'auto-updates with cpu usage' },
];

const WIDGET_FOLDER_STRUCTURE = [
    { name: 'widget.json', required: true, desc: 'manifest' },
    { name: 'template.html', required: true, desc: 'html template (or set "entry"/"file" to your filename)' },
    { name: 'style.css', required: false, desc: 'styles' },
    { name: 'script.js', required: false, desc: 'widget logic' },
    { name: 'preview.png', required: false, desc: 'thumbnail for library' },
];

// ── helper: build full docs text for copy-all ──

export function buildFullDocsText(): string {
    let text = '# colorwall interactive api\n\n';
    text += 'interactive wallpapers are html/js pages rendered in a webview behind the desktop.\n';
    text += 'the backend injects data by calling global window.colorwall* functions.\n\n';

    for (const section of API_SECTIONS) {
        text += `## ${section.title}\n${section.description}\n`;
        if (section.details) text += `${section.details}\n`;
        if (section.params) {
            for (const p of section.params) text += `- ${p.name}: ${p.desc}\n`;
        }
        if (section.payload) text += `\`\`\`json\n${section.payload}\n\`\`\`\n`;
        text += `\`\`\`js\n${section.code}\n\`\`\`\n`;
        if (section.warning) text += `⚠️ ${section.warning}\n`;
        text += '\n';
    }

    text += `## project.json structure\nevery interactive wallpaper folder needs a project.json.\n\`\`\`json\n${PROJECT_JSON_EXAMPLE}\n\`\`\`\n`;
    text += `supported property types: slider, checkbox, color, textbox, dropdown.\n\n`;

    text += `## widget.json structure\nevery desktop widget needs a widget.json.\n\`\`\`json\n${WIDGET_JSON_EXAMPLE}\n\`\`\`\n`;
    text += `auto-patching: "title"→"name", "file"→"entry", missing "id" derived from folder name.\n`;
    text += `data-binding attributes: ${WIDGET_DATA_BINDINGS.map(b => b.attr).join(', ')}\n`;
    text += `tweaks exposed as css vars: var(--tw-name), var(--tw-name-px)\n\n`;

    text += `## lively wallpaper compatibility\n`;
    for (const [old, nw] of LIVELY_MAPPINGS) text += `${old} → ${nw}\n`;

    return text;
}

// ── components ──

function CopyButton({ text, label = 'Copy', size = 'sm' }: { text: string; label?: string; size?: 'sm' | 'md' }) {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    const isMd = size === 'md';
    return (
        <button
            onClick={handleCopy}
            style={{
                background: copied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                border: '1px solid',
                borderColor: copied ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: isMd ? '8px 12px' : '4px 8px',
                cursor: 'pointer',
                color: copied ? '#22c55e' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: isMd ? '12px' : '10px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
                flexShrink: 0,
            }}
        >
            {copied ? <Check size={isMd ? 14 : 10} /> : <Copy size={isMd ? 14 : 10} />}
            {copied ? 'Copied' : label}
        </button>
    );
}

function CodeBlock({ code }: { code: string }) {
    return (
        <div style={{
            position: 'relative',
            background: 'rgba(0, 0, 0, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '8px',
            padding: '14px 16px',
            marginTop: '8px',
            marginBottom: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: '12px',
            lineHeight: '1.65',
            color: 'rgba(255, 255, 255, 0.78)',
            overflowX: 'auto',
            whiteSpace: 'pre',
            userSelect: 'text',
            WebkitUserSelect: 'text',
        }}>
            <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                <CopyButton text={code} />
            </div>
            {code}
        </div>
    );
}

function InfoBox({ type, children }: { type: 'warning' | 'tip' | 'info'; children: React.ReactNode }) {
    const colors = {
        warning: { bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.1)', text: 'rgba(245, 158, 11, 0.7)', icon: '⚠️' },
        tip: { bg: 'rgba(139, 92, 246, 0.06)', border: 'rgba(139, 92, 246, 0.12)', text: 'rgba(139, 92, 246, 0.8)', icon: '💡' },
        info: { bg: 'rgba(59, 130, 246, 0.06)', border: 'rgba(59, 130, 246, 0.12)', text: 'rgba(59, 130, 246, 0.8)', icon: 'ℹ️' },
    };
    const c = colors[type];
    return (
        <div style={{
            fontSize: '11px',
            color: c.text,
            padding: '8px 12px',
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: '6px',
            marginTop: '8px',
            lineHeight: '1.5',
        }}>
            {c.icon} {children}
        </div>
    );
}

function ParamGrid({ params }: { params: { name: string; desc: string }[] }) {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: params.length > 1 ? '1fr 1fr' : '1fr',
            gap: '8px',
            marginBottom: '10px',
        }}>
            {params.map((p) => (
                <div key={p.name} style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {p.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                        <code style={{ fontSize: '11px' }}>{p.desc}</code>
                    </div>
                </div>
            ))}
        </div>
    );
}

function DocSection({ entry, defaultOpen = false }: { entry: DocEntry; defaultOpen?: boolean }) {
    const [open, setOpen] = React.useState(defaultOpen);
    const Icon = entry.icon;

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            marginBottom: '10px',
            overflow: 'hidden',
        }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                }}
                onClick={() => setOpen(!open)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {open ? <ChevronDown size={13} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />}
                    <Icon size={14} style={{ color: entry.iconColor, flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {entry.title}
                    </span>
                </div>
                <CopyButton text={entry.code} label="Code" />
            </div>
            {open && (
                <div style={{
                    padding: '0 16px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.65',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                }}>
                    <p style={{ marginTop: '12px', marginBottom: '8px' }}>{entry.description}</p>
                    {entry.details && <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>{entry.details}</p>}
                    {entry.params && <ParamGrid params={entry.params} />}
                    {entry.payload && <CodeBlock code={entry.payload} />}
                    <CodeBlock code={entry.code} />
                    {entry.warning && <InfoBox type="warning">{entry.warning}</InfoBox>}
                    {entry.tip && <InfoBox type="tip">{entry.tip}</InfoBox>}
                </div>
            )}
        </div>
    );
}

function StaticSection({ title, icon: Icon, iconColor, defaultOpen = false, children }: {
    title: string;
    icon: any;
    iconColor: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = React.useState(defaultOpen);
    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '12px',
            marginBottom: '10px',
            overflow: 'hidden',
        }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    gap: '10px',
                    transition: 'background 0.15s',
                }}
                onClick={() => setOpen(!open)}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
                {open ? <ChevronDown size={13} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-tertiary)' }} />}
                <Icon size={14} style={{ color: iconColor, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
            </div>
            {open && (
                <div style={{
                    padding: '0 16px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.65',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                }}>
                    {children}
                </div>
            )}
        </div>
    );
}

// ── main component ──

export default function ApiDocsTab() {
    const fullText = React.useMemo(() => buildFullDocsText(), []);

    return (
        <div style={{ userSelect: 'text', WebkitUserSelect: 'text' }}>
            {/* header */}
            <div style={{
                padding: '18px 22px',
                background: 'rgba(139, 92, 246, 0.06)',
                border: '1px solid rgba(139, 92, 246, 0.15)',
                borderRadius: '12px',
                marginBottom: '18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
            }}>
                <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'rgb(167, 139, 250)', marginBottom: '6px' }}>
                        colorwall interactive api
                    </h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.6', maxWidth: '520px' }}>
                        interactive wallpapers and widgets are html/js rendered in a webview behind the desktop.
                        define <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: '3px', fontSize: '11px' }}>window.colorwall*</code> functions
                        and the backend feeds data automatically. widgets can also use <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: '3px', fontSize: '11px' }}>data-cw-*</code> attributes for zero-js binding.
                    </p>
                </div>
                <CopyButton text={fullText} label="Copy All Docs" size="md" />
            </div>

            {/* api callback sections */}
            {API_SECTIONS.map((entry, i) => (
                <DocSection key={entry.id} entry={entry} defaultOpen={i === 0} />
            ))}

            {/* project.json */}
            <StaticSection title="project.json — interactive wallpaper config" icon={FileJson} iconColor="#3b82f6">
                <p style={{ marginTop: '12px', marginBottom: '8px' }}>
                    every interactive wallpaper folder needs a <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: '3px' }}>project.json</code> that describes the wallpaper and its configurable properties.
                </p>
                <CodeBlock code={PROJECT_JSON_EXAMPLE} />
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    supported property types: <code>slider</code>, <code>checkbox</code>, <code>color</code>, <code>textbox</code>, <code>dropdown</code>.
                    these render in the properties panel and send updates via <code>colorwallPropertyListener</code>.
                </p>
            </StaticSection>

            {/* widget.json */}
            <StaticSection title="widget.json — desktop widget config" icon={Puzzle} iconColor="#a78bfa">
                <p style={{ marginTop: '12px', marginBottom: '8px' }}>
                    every desktop widget needs a <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: '3px' }}>widget.json</code> manifest.
                    widgets can be self-contained html files (all-in-one with inline scripts) or split into separate template/style/script files.
                </p>

                {/* folder structure */}
                <div style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    marginBottom: '10px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '12px',
                    lineHeight: '1.7',
                }}>
                    <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>folder structure</div>
                    <div style={{ color: 'var(--text-primary)' }}>my-widget/</div>
                    {WIDGET_FOLDER_STRUCTURE.map((f) => (
                        <div key={f.name} style={{ paddingLeft: '16px' }}>
                            <span style={{ color: f.required ? 'rgba(34, 197, 94, 0.8)' : 'var(--text-tertiary)' }}>{f.name}</span>
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}> — {f.desc}</span>
                        </div>
                    ))}
                </div>

                <CodeBlock code={WIDGET_JSON_EXAMPLE} />

                <InfoBox type="tip">
                    auto-patching: if your manifest uses <code>"title"</code> instead of <code>"name"</code>, or <code>"file"</code> instead of <code>"entry"</code>,
                    the importer patches them automatically. if <code>"id"</code> is missing it's derived from the folder name.
                    self-contained html files with inline {'<script>'} and {'<style>'} tags are fully supported — scripts are extracted and executed at runtime.
                </InfoBox>

                {/* data bindings */}
                <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginTop: '14px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    html data-binding attributes (zero-js)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                    {WIDGET_DATA_BINDINGS.map((b) => (
                        <div key={b.attr} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '5px', padding: '8px 10px' }}>
                            <code style={{ fontSize: '11px', color: 'rgb(167, 139, 250)' }}>{b.attr}</code>
                            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{b.desc}</div>
                        </div>
                    ))}
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    tweaks are exposed as css variables: <code>var(--tw-fontSize)</code>, <code>var(--tw-accentColor)</code>.
                    sliders also get a <code>-px</code> variant: <code>var(--tw-fontSize-px)</code>.
                    tweak types: <code>slider</code>, <code>checkbox</code>, <code>color</code>, <code>textbox</code>, <code>dropdown</code>.
                </p>

                {/* widget.on() api for script.js */}
                <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginTop: '14px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    widget.on() api — for separate script.js files
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                    when using a separate <code>script.js</code>, a <code>widget</code> object is injected with <code>widget.container</code>, <code>widget.tweaks</code>, and <code>widget.on(event, callback)</code>.
                </p>
                <CodeBlock code={`// script.js — widget api example
widget.on('media', function(data) {
    // data = { title, artist, thumbnail }
    widget.container.querySelector('.title').textContent = data.title || '';
});

widget.on('audio', function(data) {
    // data = array of 128 floats
    var bass = 0;
    for (var i = 0; i < 8; i++) bass += data[i];
    bass /= 8;
});

widget.on('playback', function(data) {
    var playing = data && data.IsPaused === false;
});

// tweaks are available as widget.tweaks.myTweakName`} />
            </StaticSection>

            {/* lively compat */}
            <StaticSection title="lively wallpaper compatibility" icon={RefreshCw} iconColor="#22c55e">
                <p style={{ marginTop: '12px', marginBottom: '10px' }}>
                    imported wallpapers using lively wallpaper's api are automatically patched on import. all <code>lively*</code> function names are replaced with <code>colorwall*</code> equivalents:
                </p>
                <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '12px',
                    lineHeight: '1.8',
                }}>
                    {LIVELY_MAPPINGS.map(([old, nw]) => (
                        <div key={old}>
                            <span style={{ color: 'rgba(239, 68, 68, 0.7)' }}>{old}</span>
                            <span style={{ color: 'var(--text-tertiary)' }}> → </span>
                            <span style={{ color: 'rgba(34, 197, 94, 0.8)' }}>{nw}</span>
                        </div>
                    ))}
                </div>
            </StaticSection>
        </div>
    );
}
