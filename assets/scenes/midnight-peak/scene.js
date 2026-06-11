// scene.js — webgl effects overlay for scene wallpapers
// renders effects (stars, aurora, clouds, god rays, moon glow) on a transparent canvas
// the background is a <video> or <img> element behind this canvas

(function () {
    'use strict';

    let gl = null;
    let program = null;
    let canvas = null;
    let startTime = Date.now();
    let mouseX = 0.5, mouseY = 0.5;
    let targetMouseX = 0.5, targetMouseY = 0.5;

    // cached uniform locations — looked up once after linking, not every frame
    const loc = {};

    // configurable properties (updated via colorwallPropertyListener)
    const props = {
        schemeColor: [0.082, 0.165, 0.247],
        cloudSpeed: 0.5,
        rayIntensity: 0.4,
        parallaxStrength: 0.3,
        starBrightness: 0.7,
        auroraIntensity: 0.3,
    };

    // ---- vertex shader (fullscreen quad) ----
    const VERT = `
        attribute vec2 a_pos;
        varying vec2 v_uv;
        void main() {
            v_uv = a_pos * 0.5 + 0.5;
            gl_Position = vec4(a_pos, 0.0, 1.0);
        }
    `;

    // ---- fragment shader (all effects, outputs with alpha for transparent overlay) ----
    const FRAG = `
        precision highp float;
        varying vec2 v_uv;

        uniform float u_time;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform vec3 u_scheme;
        uniform float u_cloudSpeed;
        uniform float u_rayIntensity;
        uniform float u_parallax;
        uniform float u_starBrightness;
        uniform float u_auroraIntensity;

        // -- simplex noise (ashima arts / ian mcewan) --
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289v2(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

        float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                               -0.577350269189626, 0.024390243902439);
            vec2 i = floor(v + dot(v, C.yy));
            vec2 x0 = v - i + dot(i, C.xx);
            vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod289v2(i);
            vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                     + i.x + vec3(0.0, i1.x, 1.0));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m * m * m * m;
            vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x_) - 0.5;
            vec3 ox = floor(x_ + 0.5);
            vec3 a0 = x_ - ox;
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
            vec3 g;
            g.x = a0.x * x0.x + h.x * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }

        // -- cheap hash for stars --
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        // -- fractal brownian motion (4 octaves) --
        float fbm(vec2 p, float t) {
            float v = 0.0;
            float a = 0.5;
            vec2 shift = vec2(100.0);
            for (int i = 0; i < 4; i++) {
                v += a * snoise(p + t * 0.04);
                p = p * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        // -- twinkling star field (two density layers) --
        float starField(vec2 uv, float time) {
            float stars = 0.0;

            // bright stars
            vec2 gv = fract(uv * 120.0) - 0.5;
            vec2 id = floor(uv * 120.0);
            float n = hash(id);
            float show = step(0.92, n);
            float sz = fract(n * 345.32) * 0.014 + 0.004;
            float d = length(gv);
            float s = show * smoothstep(sz, sz * 0.1, d);
            float tw = sin(time * (fract(n * 567.89) * 4.0 + 0.5) + n * 6.283) * 0.5 + 0.5;
            stars += s * mix(0.3, 1.0, tw);

            // dim background stars
            gv = fract(uv * 300.0) - 0.5;
            id = floor(uv * 300.0);
            n = hash(id + 77.0);
            show = step(0.93, n);
            sz = fract(n * 123.45) * 0.005 + 0.001;
            d = length(gv);
            s = show * smoothstep(sz, 0.0, d);
            tw = sin(time * (fract(n * 234.56) * 2.0 + 1.0) + n * 6.283) * 0.5 + 0.5;
            stars += s * mix(0.1, 0.5, tw);

            return stars;
        }

        // -- aurora borealis (three color bands with noise-warped sine waves) --
        vec3 aurora(vec2 uv, float time, vec3 scheme) {
            vec3 col = vec3(0.0);
            float edge = smoothstep(0.0, 0.25, uv.x) * smoothstep(1.0, 0.75, uv.x);

            // band 1 — green
            float w1 = sin(uv.x * 2.5 + time * 0.08) + snoise(vec2(uv.x * 1.5, time * 0.06)) * 0.4;
            float d1 = abs(uv.y - 0.22 - w1 * 0.06);
            float b1 = smoothstep(0.12, 0.0, d1) * edge;
            col += mix(vec3(0.1, 0.8, 0.4), scheme * 2.0, 0.3) * b1 * 0.4;

            // band 2 — blue
            float w2 = sin(uv.x * 4.0 + time * 0.11 + 2.1) + snoise(vec2(uv.x * 1.5 + 1.0, time * 0.06 + 0.7)) * 0.4;
            float d2 = abs(uv.y - 0.26 - w2 * 0.05);
            float b2 = smoothstep(0.1, 0.0, d2) * edge;
            col += mix(vec3(0.2, 0.5, 0.9), scheme * 1.5, 0.4) * b2 * 0.32;

            // band 3 — purple
            float w3 = sin(uv.x * 5.5 + time * 0.14 + 4.2) + snoise(vec2(uv.x * 1.5 + 2.0, time * 0.06 + 1.4)) * 0.4;
            float d3 = abs(uv.y - 0.3 - w3 * 0.04);
            float b3 = smoothstep(0.08, 0.0, d3) * edge;
            col += mix(vec3(0.5, 0.2, 0.8), scheme * 1.8, 0.3) * b3 * 0.24;

            return col * smoothstep(0.5, 0.15, uv.y);
        }

        // -- domain-warped clouds (organic, volumetric look) --
        float warpedClouds(vec2 uv, float time, float speed) {
            // first warp
            vec2 q = vec2(
                fbm(uv, time * speed * 0.3),
                fbm(uv + vec2(5.2, 1.3), time * speed * 0.25)
            );
            // second warp — warp the warp for swirling organic shapes
            vec2 r = vec2(
                fbm(uv + 3.0 * q + vec2(1.7, 9.2), time * speed * 0.2),
                fbm(uv + 3.0 * q + vec2(8.3, 2.8), time * speed * 0.18)
            );
            return fbm(uv + 3.5 * r, time * speed * 0.15);
        }

        // -- god rays (angle-based radial streaks from light source) --
        float godRays(vec2 uv, vec2 lightPos, float time) {
            vec2 delta = uv - lightPos;
            float dist = length(delta);
            float angle = atan(delta.y, delta.x);

            // angular ray pattern
            float rays = snoise(vec2(angle * 6.0, dist * 3.0 + time * 0.08)) * 0.5 + 0.5;
            rays += snoise(vec2(angle * 12.0, dist * 6.0 - time * 0.04)) * 0.25;
            rays *= rays;

            // exponential radial falloff
            float falloff = exp(-dist * 3.5);

            // concentrate rays upward from light source
            float upMask = smoothstep(-0.2, 0.6, -sin(angle));

            return rays * falloff * upMask;
        }

        void main() {
            vec2 uv = v_uv;
            uv.y = 1.0 - uv.y;

            float ar = u_resolution.x / u_resolution.y;
            float time = u_time;
            vec2 parallax = (u_mouse - 0.5) * u_parallax * 0.02;

            vec4 result = vec4(0.0);

            // ---- stars (upper sky only) ----
            float starMask = smoothstep(0.65, 0.15, uv.y);
            float starsVal = starField(uv * vec2(ar, 1.0) + parallax * 0.5, time);
            starsVal *= starMask * u_starBrightness;
            vec3 starColor = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.95, 0.8), hash(floor(uv * 120.0)));
            result.rgb += starColor * starsVal;
            result.a += starsVal * 0.8;

            // ---- aurora borealis (toggleable via intensity) ----
            vec3 auroraCol = aurora(uv + parallax * 0.8, time, u_scheme);
            float auroraMask = smoothstep(0.6, 0.1, uv.y);
            auroraCol *= auroraMask * u_auroraIntensity;
            float auroraAlpha = (auroraCol.r + auroraCol.g + auroraCol.b) * 0.4;
            result.rgb += auroraCol;
            result.a += auroraAlpha;

            // ---- domain-warped clouds ----
            vec2 cloudUV = uv * vec2(2.5, 1.5) + parallax * 2.0;
            float clouds = warpedClouds(cloudUV, time, u_cloudSpeed);
            clouds = smoothstep(-0.15, 0.65, clouds);

            float vertFade = smoothstep(0.75, 0.1, uv.y);
            float edgeFade = smoothstep(0.0, 0.15, uv.x) * smoothstep(0.0, 0.15, 1.0 - uv.x);
            float cloudAlpha = clouds * vertFade * edgeFade * 0.2;
            vec3 cloudColor = mix(vec3(0.7, 0.78, 0.92), u_scheme * 2.0 + 0.5, 0.25);

            // subtle edge highlight on clouds
            float cloudEdge = smoothstep(0.3, 0.6, clouds) - smoothstep(0.6, 0.9, clouds);
            cloudColor += vec3(0.12, 0.1, 0.06) * cloudEdge;

            result.rgb += cloudColor * cloudAlpha;
            result.a += cloudAlpha;

            // ---- god rays from behind peak ----
            vec2 lightPos = vec2(0.5, 0.28) + parallax;
            float rays = godRays(uv, lightPos, time);
            float heightMask = smoothstep(0.65, 0.2, uv.y);
            rays *= heightMask * u_rayIntensity * 2.5;
            rays *= 1.0 + 0.06 * sin(time * 0.3);

            vec3 rayColor = mix(vec3(1.0, 0.9, 0.7), u_scheme * 2.5 + 0.4, 0.2);
            float rayAlpha = clamp(rays * 0.45, 0.0, 0.35);
            result.rgb += rayColor * rayAlpha;
            result.a += rayAlpha;

            // ---- moon glow (soft light source behind peak) ----
            float moonDist = length(uv - lightPos);
            float moonGlow = exp(-moonDist * 4.5) * 0.22;
            moonGlow += exp(-moonDist * 12.0) * 0.12;
            vec3 moonColor = mix(vec3(0.9, 0.92, 1.0), u_scheme * 2.0 + 0.6, 0.15);
            float moonMask = smoothstep(0.55, 0.2, uv.y);
            result.rgb += moonColor * moonGlow * moonMask;
            result.a += moonGlow * moonMask * 0.5;

            // ---- atmospheric vignette ----
            float vig = 1.0 - smoothstep(0.4, 1.4, length((uv - 0.5) * vec2(ar, 1.0)));
            float atmosAlpha = (1.0 - vig) * 0.06;
            result.rgb += u_scheme * atmosAlpha;
            result.a += atmosAlpha;

            // ---- subtle film grain ----
            float grain = (hash(uv * u_resolution.xy + fract(time)) - 0.5) * 0.012;
            result.rgb += grain;

            result.a = clamp(result.a, 0.0, 0.7);
            gl_FragColor = result;
        }
    `;

    // ---- webgl helpers ----
    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('[scene] shader error:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    function link(vs, fs) {
        const v = compile(gl.VERTEX_SHADER, vs);
        const f = compile(gl.FRAGMENT_SHADER, fs);
        if (!v || !f) return null;
        const p = gl.createProgram();
        gl.attachShader(p, v);
        gl.attachShader(p, f);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error('[scene] link error:', gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    // ---- cache uniform locations (called once after linking) ----
    function cacheUniforms() {
        const names = [
            'u_time', 'u_resolution', 'u_mouse', 'u_scheme',
            'u_cloudSpeed', 'u_rayIntensity', 'u_parallax',
            'u_starBrightness', 'u_auroraIntensity'
        ];
        for (let i = 0; i < names.length; i++) {
            loc[names[i]] = gl.getUniformLocation(program, names[i]);
        }
    }

    // ---- background setup ----
    function setupBackground() {
        const video = document.getElementById('bg-video');
        const image = document.getElementById('bg-image');

        if (!video || !image) return;

        let videoFailed = false;

        video.addEventListener('canplay', function () {
            if (!videoFailed) {
                image.style.display = 'none';
                video.style.display = '';
                console.log('[scene] using video background');
            }
        });

        video.addEventListener('error', function () {
            videoFailed = true;
            video.style.display = 'none';
            console.log('[scene] video not found, using image fallback');
        });

        image.addEventListener('error', function () {
            image.style.display = 'none';
            console.log('[scene] image not found, using gradient fallback');
        });
    }

    // ---- init ----
    function init() {
        setupBackground();

        canvas = document.getElementById('fx-canvas');
        if (!canvas) return;

        // need alpha: true for transparent overlay
        gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
        if (!gl) gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
        if (!gl) {
            console.error('[scene] webgl not available');
            return;
        }

        // enable blending for transparent overlay
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        program = link(VERT, FRAG);
        if (!program) return;

        // fullscreen quad
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(program, 'a_pos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        resize();
        window.addEventListener('resize', resize);

        cacheUniforms();
        startTime = Date.now();
        render();
        console.log('[scene] effects canvas initialized');
    }

    function resize() {
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    }

    // ---- render loop ----
    function render() {
        if (!gl || !program) { requestAnimationFrame(render); return; }

        // smooth mouse lerp
        mouseX += (targetMouseX - mouseX) * 0.03;
        mouseY += (targetMouseY - mouseY) * 0.03;

        const t = (Date.now() - startTime) / 1000.0;

        // clear to transparent
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(program);

        // use cached uniform locations instead of looking them up every frame
        gl.uniform1f(loc.u_time, t);
        gl.uniform2f(loc.u_resolution, canvas.width, canvas.height);
        gl.uniform2f(loc.u_mouse, mouseX, mouseY);
        gl.uniform3fv(loc.u_scheme, props.schemeColor);
        gl.uniform1f(loc.u_cloudSpeed, props.cloudSpeed);
        gl.uniform1f(loc.u_rayIntensity, props.rayIntensity);
        gl.uniform1f(loc.u_parallax, props.parallaxStrength);
        gl.uniform1f(loc.u_starBrightness, props.starBrightness);
        gl.uniform1f(loc.u_auroraIntensity, props.auroraIntensity);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        requestAnimationFrame(render);
    }

    // ---- mouse ----
    window.addEventListener('mousemove', function (e) {
        targetMouseX = e.clientX / window.innerWidth;
        targetMouseY = e.clientY / window.innerHeight;
    });

    // ---- property listener (called by colorwall app via js eval) ----
    window.colorwallPropertyListener = function (name, value) {
        switch (name) {
            case 'schemecolor':
                if (typeof value === 'string' && value.startsWith('#')) {
                    props.schemeColor = [
                        parseInt(value.slice(1, 3), 16) / 255,
                        parseInt(value.slice(3, 5), 16) / 255,
                        parseInt(value.slice(5, 7), 16) / 255
                    ];
                    document.documentElement.style.setProperty('--scheme-color', value);
                } else if (typeof value === 'string' && value.includes(' ')) {
                    const parsed = value.split(' ').map(Number);
                    props.schemeColor = parsed;
                    document.documentElement.style.setProperty('--scheme-color',
                        `rgb(${Math.floor(parsed[0]*255)}, ${Math.floor(parsed[1]*255)}, ${Math.floor(parsed[2]*255)})`);
                }
                break;
            case 'cloudSpeed':
                props.cloudSpeed = (typeof value === 'number' ? value : parseFloat(value)) / 100;
                break;
            case 'rayIntensity':
                props.rayIntensity = (typeof value === 'number' ? value : parseFloat(value)) / 100;
                break;
            case 'parallaxStrength':
                props.parallaxStrength = (typeof value === 'number' ? value : parseFloat(value)) / 100;
                break;
            case 'starBrightness':
                props.starBrightness = (typeof value === 'number' ? value : parseFloat(value)) / 100;
                break;
            case 'auroraIntensity':
                props.auroraIntensity = (typeof value === 'number' ? value : parseFloat(value)) / 100;
                break;
            case 'clockEnabled':
                var w = document.getElementById('clock-widget');
                if (w) w.classList.toggle('hidden', !value);
                break;
            case 'clockSize':
                // maps slider 20-100 to 60px-200px
                var raw = typeof value === 'number' ? value : parseFloat(value);
                var px = Math.round(60 + (raw - 20) * (140 / 80));
                document.documentElement.style.setProperty('--clock-size', px + 'px');
                break;
            case 'clock24h':
                window.__clockProps = window.__clockProps || {};
                window.__clockProps.is24h = !!value;
                break;
            case 'clockLang':
                window.__clockProps = window.__clockProps || {};
                window.__clockProps.lang = value;
                // rebuild calendar with new language
                if (window.__rebuildCalendar) window.__rebuildCalendar();
                break;
            case 'showDate':
                var d = document.getElementById('clock-date');
                var dy = document.getElementById('clock-day');
                if (d) d.style.display = value ? '' : 'none';
                if (dy) dy.style.display = value ? '' : 'none';
                break;
            case 'showGreeting':
                window.__clockProps = window.__clockProps || {};
                window.__clockProps.showGreeting = !!value;
                break;
            case 'customText':
                if (window.__setCustomText) window.__setCustomText(value || '');
                break;
            case 'widgetOpacity':
                var op = (typeof value === 'number' ? value : parseFloat(value)) / 100;
                document.documentElement.style.setProperty('--widget-bg', op.toFixed(2));
                break;
            case 'showCalendar':
                window.__clockProps = window.__clockProps || {};
                window.__clockProps.showCalendar = !!value;
                if (window.__updateCalVisibility) window.__updateCalVisibility();
                break;
            case 'showMediaWidget':
                window.__clockProps = window.__clockProps || {};
                window.__clockProps.showMedia = value;
                if (window.__updateMediaVisibility) window.__updateMediaVisibility();
                break;
            case 'showSystemWidget':
                window.__clockProps = window.__clockProps || {};
                window.__clockProps.showSystem = value;
                if (window.__updateSysVisibility) window.__updateSysVisibility();
                break;
        }
    };

    // ---- init on ready ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
