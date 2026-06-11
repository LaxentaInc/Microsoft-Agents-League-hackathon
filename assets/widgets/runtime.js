// widget runtime — injected into scene webviews by the colorwall backend
// handles: loading, rendering, data-attribute auto-binding, dragging, tweaks
// widgets use data-cw-* attributes for zero-js data binding:
//   data-cw-time="HH:mm"         → auto-updates with formatted time
//   data-cw-date="dddd"           → auto-updates with day name
//   data-cw-media="title"         → auto-updates with track title
//   data-cw-system="cpu"          → auto-updates with cpu usage
// tweaks are exposed as css variables: var(--tw-fontSize), var(--tw-textColor), etc.

(function() {
    'use strict';

    // avoid double-init
    if (window.__cw_widget_runtime) return;
    window.__cw_widget_runtime = true;

    // expose app version (set by rust via eval after scene loads)
    window.__cw_app_version = null;
    window.__cw_setAppVersion = function(v) {
        window.__cw_app_version = v;
        document.documentElement.setAttribute('data-cw-app-version', v);
    };

    // ── state ──
    var widgets = {};
    var dataListeners = { time: [], date: [], media: [], audio: [], system: [], playback: [], tweakChange: [] };

    // ── widget layer ──
    var layer = document.createElement('div');
    layer.id = 'cw-widget-layer';
    layer.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;overflow:hidden;';
    document.body.appendChild(layer);

    // ── font loading (deduped) ──
    var loadedFonts = {};
    function loadFont(font) {
        var key = font.family + '-' + (font.weights || []).join(',');
        if (loadedFonts[key]) return;
        loadedFonts[key] = true;

        if (font.source === 'google') {
            var weights = (font.weights && font.weights.length) ? font.weights.join(';') : '400';
            var family = font.family.replace(/ /g, '+');
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=' + family + ':wght@' + weights + '&display=swap';
            document.head.appendChild(link);
        } else if (font.source === 'url' && font.url) {
            var style = document.createElement('style');
            style.textContent = '@font-face { font-family: "' + font.family + '"; src: url("' + font.url + '"); }';
            document.head.appendChild(style);
        }
    }

    // ── time/date formatting ──
    var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function formatTime(fmt, d) {
        return fmt
            .replace(/HH/g, pad(d.getHours()))
            .replace(/hh/g, pad(d.getHours() % 12 || 12))
            .replace(/H/g, '' + d.getHours())
            .replace(/h/g, '' + (d.getHours() % 12 || 12))
            .replace(/mm/g, pad(d.getMinutes()))
            .replace(/ss/g, pad(d.getSeconds()))
            .replace(/A/g, d.getHours() >= 12 ? 'PM' : 'AM')
            .replace(/a/g, d.getHours() >= 12 ? 'pm' : 'am');
    }

    function formatDate(fmt, d) {
        return fmt
            .replace(/dddd/g, DAYS[d.getDay()])
            .replace(/ddd/g, DAYS[d.getDay()].substring(0, 3))
            .replace(/DD/g, pad(d.getDate()))
            .replace(/D/g, '' + d.getDate())
            .replace(/MMMM/g, MONTHS[d.getMonth()])
            .replace(/MMM/g, MONTHS[d.getMonth()].substring(0, 3))
            .replace(/YYYY/g, '' + d.getFullYear())
            .replace(/YY/g, ('' + d.getFullYear()).slice(-2));
    }

    // ── auto-binding updates ──
    // fallback values shown when nothing is playing — prevents empty text and broken images
    var currentMedia = { title: 'Nothing Playing', artist: '—', thumbnail: '' };
    var currentSystem = { cpu: '0%', ram: '0%' };
    var currentAudio = null;
    var currentSystemData = null;

    function updateAutoBindings() {
        var now = new Date();

        var timeEls = layer.querySelectorAll('[data-cw-time]');
        for (var i = 0; i < timeEls.length; i++) {
            timeEls[i].textContent = formatTime(timeEls[i].getAttribute('data-cw-time'), now);
        }

        var dateEls = layer.querySelectorAll('[data-cw-date]');
        for (var i = 0; i < dateEls.length; i++) {
            dateEls[i].textContent = formatDate(dateEls[i].getAttribute('data-cw-date'), now);
        }

        // auto-bind app version elements
        if (window.__cw_app_version) {
            var verEls = layer.querySelectorAll('[data-cw-app-version]');
            var verText = 'v' + window.__cw_app_version;
            for (var i = 0; i < verEls.length; i++) {
                if (verEls[i].textContent !== verText) verEls[i].textContent = verText;
            }
        }
    }

    setInterval(updateAutoBindings, 1000);
    setTimeout(updateAutoBindings, 50);

    // ── drag system ──
    var dragging = null, dragOffsetX = 0, dragOffsetY = 0;

    document.addEventListener('mousedown', function(e) {
        // guard: don't re-enter if already dragging
        if (dragging) return;
        var el = document.elementFromPoint(e.clientX, e.clientY);
        while (el && el !== layer && el !== document.body) {
            if (el.hasAttribute('data-cw-draggable')) break;
            el = el.parentElement;
        }
        if (!el || !el.hasAttribute('data-cw-draggable')) return;

        var rect = el.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        el.style.left = rect.left + 'px';
        el.style.top = rect.top + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
        el.classList.add('cw-dragging');
        dragging = el;
    });

    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        dragging.style.left = (e.clientX - dragOffsetX) + 'px';
        dragging.style.top = (e.clientY - dragOffsetY) + 'px';
    });

    document.addEventListener('mouseup', function() {
        if (!dragging) return;
        
        var instanceId = dragging.getAttribute('data-cw-instance');
        var px = dragging.style.left;
        var py = dragging.style.top;
        
        dragging.classList.remove('cw-dragging');
        dragging = null;
        
        // notify tauri backend to save the position permanently
        if (instanceId && window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
            window.__TAURI__.core.invoke('update_widget_position', {
                instanceId: instanceId,
                x: px,
                y: py,
                wallpaperId: window.__cw_wallpaper_id
            }).catch(function(e) {
                console.error('[widget] failed to save position to disk:', e);
            });
        }
    });

    // ── apply a tweak value as a css variable on the container ──
    function applyTweakVar(el, name, value) {
        if (typeof value === 'number') {
            el.style.setProperty('--tw-' + name, value);
            el.style.setProperty('--tw-' + name + '-px', value + 'px');
        } else if (typeof value === 'string') {
            el.style.setProperty('--tw-' + name, value);
        } else if (typeof value === 'boolean') {
            el.style.setProperty('--tw-' + name, value ? '1' : '0');
        }
    }

    // ── load a single widget into the dom ──
    function loadWidget(data) {
        var id = data.instanceId;
        var scopeId = 'cw-w-' + id.replace(/[^a-zA-Z0-9_-]/g, '_');

        // guard: skip if this instance is already in the dom
        if (widgets[id] || document.getElementById(scopeId)) {
            return;
        }

        // create container
        var container = document.createElement('div');
        container.id = scopeId;
        container.className = 'cw-widget';
        container.setAttribute('data-cw-instance', id);
        container.setAttribute('data-cw-widget', data.widgetId);
        container.style.pointerEvents = 'auto';

        if (data.manifest && data.manifest.draggable !== false) {
            container.setAttribute('data-cw-draggable', 'true');
            container.style.cursor = 'grab';
        }

        console.log('[cw-runtime] loading widget:', id, '(type:', data.widgetId + ')');

        // position
        if (data.position) {
            container.style.position = 'fixed';
            container.style.left = data.position.x;
            container.style.top = data.position.y;
        } else if (data.manifest && data.manifest.defaultPosition) {
            container.style.position = 'fixed';
            var dp = data.manifest.defaultPosition;
            if (dp.x && dp.x.indexOf('%') !== -1) {
                container.style.left = dp.x;
                container.style.top = dp.y || '0';
                container.style.transform = 'translateX(-50%)';
            } else {
                container.style.left = dp.x || '0';
                container.style.top = dp.y || '0';
            }
        } else {
            container.style.position = 'fixed';
            container.style.left = '50%';
            container.style.top = '10%';
            container.style.transform = 'translateX(-50%)';
        }

        if (data.zIndex) container.style.zIndex = data.zIndex;

        // apply tweaks as css variables (defaults first, then overrides)
        var tweaks = {};
        if (data.manifest && data.manifest.tweaks) {
            for (var key in data.manifest.tweaks) {
                tweaks[key] = data.manifest.tweaks[key].value;
                applyTweakVar(container, key, data.manifest.tweaks[key].value);
            }
        }
        if (data.tweaks) {
            for (var key in data.tweaks) {
                tweaks[key] = data.tweaks[key];
                applyTweakVar(container, key, data.tweaks[key]);
            }
        }

        // load fonts
        if (data.fonts) {
            for (var i = 0; i < data.fonts.length; i++) loadFont(data.fonts[i]);
        }

        // inject css
        if (data.css) {
            var styleEl = document.createElement('style');
            styleEl.setAttribute('data-cw-widget', id);
            styleEl.textContent = data.css;
            document.head.appendChild(styleEl);
        }

        // inject html + populate widget metadata
        var inlineScripts = null;
        if (data.html) {
            var raw = data.html;
            var collectedStyles = [];
            var collectedScripts = [];
            var bodyHtml = raw;

            // use domparser for robust html extraction — handles malformed tags,
            // nested </body> strings in template literals, all edge cases
            var isFullDocument = /<html[\s>]/i.test(raw) || /<body[\s>]/i.test(raw);
            if (isFullDocument) {
                var doc = new DOMParser().parseFromString(raw, 'text/html');

                // collect styles from <head>
                var headStyles = doc.head ? doc.head.querySelectorAll('style') : [];
                for (var hs = 0; hs < headStyles.length; hs++) {
                    collectedStyles.push(headStyles[hs].textContent);
                }

                // collect scripts from <body>
                var bodyScripts = doc.body ? doc.body.querySelectorAll('script') : [];
                for (var bs = 0; bs < bodyScripts.length; bs++) {
                    if (bodyScripts[bs].textContent.trim()) {
                        collectedScripts.push(bodyScripts[bs].textContent);
                    }
                    bodyScripts[bs].remove();
                }

                // collect and remove any <style> tags from body
                var bodyStyles = doc.body ? doc.body.querySelectorAll('style') : [];
                for (var bst = 0; bst < bodyStyles.length; bst++) {
                    collectedStyles.push(bodyStyles[bst].textContent);
                    bodyStyles[bst].remove();
                }

                bodyHtml = doc.body ? doc.body.innerHTML : raw;
            } else {
                // simple template — just strip any inline script/style tags via regex
                bodyHtml = bodyHtml.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, function(_, css) {
                    collectedStyles.push(css);
                    return '';
                });
                bodyHtml = bodyHtml.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, function(_, js) {
                    if (js.trim()) collectedScripts.push(js);
                    return '';
                });
            }

            // set cleaned html
            container.innerHTML = bodyHtml;

            // nuke any surviving script/style tags innerhtml might have parsed
            var survivors = container.querySelectorAll('script');
            for (var si = 0; si < survivors.length; si++) survivors[si].remove();
            var styleLeftovers = container.querySelectorAll('style');
            for (var si = 0; si < styleLeftovers.length; si++) {
                collectedStyles.push(styleLeftovers[si].textContent);
                styleLeftovers[si].remove();
            }

            // inject collected styles into document head (single merged tag)
            if (collectedStyles.length > 0) {
                var mergedStyle = document.createElement('style');
                mergedStyle.setAttribute('data-cw-widget', id);
                mergedStyle.textContent = collectedStyles.join('\n');
                document.head.appendChild(mergedStyle);
            }

            // populate widget metadata attributes
            if (data.manifest) {
                var nameEls = container.querySelectorAll('[data-cw-widget-name]');
                for (var j = 0; j < nameEls.length; j++) nameEls[j].textContent = data.manifest.name || '';
                var verEls = container.querySelectorAll('[data-cw-widget-version]');
                for (var j = 0; j < verEls.length; j++) verEls[j].textContent = 'v' + (data.manifest.version || '1.0');
                var authorEls = container.querySelectorAll('[data-cw-widget-author]');
                for (var j = 0; j < authorEls.length; j++) authorEls[j].textContent = data.manifest.author || '';
            }

            // save for execution after dom append
            if (collectedScripts.length > 0) inlineScripts = collectedScripts;
        }

        // add to layer (must happen before script execution so dom queries work)
        layer.appendChild(container);

        // build widget api for scripts (iife scope)
        var widgetApi = {
            container: container,
            tweaks: tweaks,
            on: function(event, callback) {
                if (!dataListeners[event]) {
                    console.warn('[cw-runtime] widget', id, 'tried to subscribe to unknown event:', event);
                    return;
                }
                // dedup: remove existing listener for this id before adding
                var before = dataListeners[event].length;
                dataListeners[event] = dataListeners[event].filter(function(l) { return l.id !== id; });
                dataListeners[event].push({ id: id, fn: callback });
                console.log('[cw-runtime] widget', id, 'subscribed to', event,
                    '(listeners:', dataListeners[event].length + ',',
                    'ids:', dataListeners[event].map(function(l) { return l.id; }).join(', ') + ')');
                // immediately dispatch cached state so widgets don't sit empty
                // until the next backend tick (could be 3s for system info)
                if (event === 'media' && currentMedia) {
                    try { callback(currentMedia); } catch(e) {}
                }
                if (event === 'playback' && window.__cw_currentPlayback !== undefined) {
                    try { callback(window.__cw_currentPlayback); } catch(e) {}
                }
                if (event === 'audio' && currentAudio) {
                    console.log('[cw-runtime] immediate audio dispatch to', id, '(cached frame)');
                    try { callback(currentAudio); } catch(e) {}
                }
                if (event === 'system' && currentSystemData) {
                    try { callback(currentSystemData); } catch(e) {}
                }
            }
        };

        // store state
        widgets[id] = {
            container: container,
            api: widgetApi,
            data: data,
            tweaks: tweaks
        };

        // execute inline scripts from self-contained html (runs after dom is live)
        if (inlineScripts) {
            console.log('[cw-runtime] executing', inlineScripts.length, 'inline script(s) for', id);
            for (var si = 0; si < inlineScripts.length; si++) {
                try {
                    var inlineFn = new Function(inlineScripts[si]);
                    inlineFn();
                } catch(e) {
                    console.error('[widget] inline script error in ' + id + ':', e);
                }
            }
        }

        // execute separate script.js (widget api injected as argument)
        if (data.js) {
            console.log('[cw-runtime] executing script.js for', id);
            try {
                var fn = new Function('widget', data.js);
                fn(widgetApi);
            } catch(e) {
                console.error('[widget] script error in ' + id + ':', e);
            }
        }

        console.log('[cw-runtime] widget loaded:', id,
            '| audio listeners:', dataListeners.audio.length,
            '| media listeners:', dataListeners.media.length,
            '| system listeners:', dataListeners.system.length);
    }

    // ── main entry point — called by rust after scene loads ──
    window.__cw_loadWidgets = function(payload) {
        if (!payload || !payload.widgets) return;
        for (var i = 0; i < payload.widgets.length; i++) {
            if (payload.widgets[i].enabled) loadWidget(payload.widgets[i]);
        }
        updateAutoBindings();
    };

    // ── live injection — called by rust to add a single widget without full reload ──
    window.__cw_addSingleWidget = function(data) {
        if (!data || !data.instanceId) return;
        if (widgets[data.instanceId]) {
            window.__cw_removeWidget(data.instanceId);
        }
        loadWidget(data);
        updateAutoBindings();
    };

    // ── hook into existing colorwall callbacks to forward data ──
    // these are the runtime's master dispatchers — they fan out data to all
    // registered widget listeners. we must protect them from being overwritten
    // by self-contained widget html that sets window.colorwallAudioListener directly.

    // user handlers set by inline widget scripts or interactive wallpapers.
    // if a widget script does `window.colorwallAudioListener = fn`, we capture
    // that fn here instead of letting it overwrite the runtime's dispatcher.
    var _userHandlers = {
        colorwallCurrentTrack: window.colorwallCurrentTrack || null,
        colorwallWallpaperPlaybackChanged: window.colorwallWallpaperPlaybackChanged || null,
        colorwallAudioListener: window.colorwallAudioListener || null,
        colorwallSystemInformation: window.colorwallSystemInformation || null,
    };

    // master dispatcher for media track changes
    function _runtimeTrackHandler(d) {
        if (_userHandlers.colorwallCurrentTrack) {
            try { _userHandlers.colorwallCurrentTrack(d); } catch(e) {}
        }
        try {
            var data = (typeof d === 'string') ? JSON.parse(d) : d;
            if (data) {
                currentMedia = {
                    title: data.Title || 'Unknown Track',
                    artist: data.Artist || 'Unknown Artist',
                    thumbnail: data.Thumbnail || ''
                };
            } else {
                // nothing playing — show fallback text, not empty strings
                currentMedia = { title: 'Nothing Playing', artist: '\u2014', thumbnail: '' };
            }
            // auto-bind media elements
            var els = layer.querySelectorAll('[data-cw-media]');
            for (var i = 0; i < els.length; i++) {
                var field = els[i].getAttribute('data-cw-media');
                if (field === 'thumbnail' && els[i].tagName === 'IMG') {
                    // don't set src to empty string — causes broken image icon
                    if (currentMedia[field]) {
                        els[i].src = currentMedia[field];
                    } else {
                        els[i].removeAttribute('src');
                        els[i].style.visibility = 'hidden';
                    }
                } else if (currentMedia[field] !== undefined) {
                    els[i].textContent = currentMedia[field];
                    // restore visibility if thumbnail comes back
                    els[i].style.visibility = '';
                }
            }
            // dispatch to all listeners — each in its own try-catch so one
            // crashing widget can't silence every other widget on the page
            for (var j = 0; j < dataListeners.media.length; j++) {
                try { dataListeners.media[j].fn(currentMedia); } catch(e) {
                    console.error('[cw-runtime] media listener error (' + dataListeners.media[j].id + '):', e);
                }
            }
        } catch(e) {
            console.error('[cw-runtime] media error:', e);
        }
    }

    // master dispatcher for playback state
    function _runtimePlaybackHandler(d) {
        if (_userHandlers.colorwallWallpaperPlaybackChanged) {
            try { _userHandlers.colorwallWallpaperPlaybackChanged(d); } catch(e) {}
        }
        try {
            var data = (typeof d === 'string') ? JSON.parse(d) : d;
            window.__cw_currentPlayback = data;
            for (var j = 0; j < dataListeners.playback.length; j++) {
                try { dataListeners.playback[j].fn(data); } catch(e) {
                    console.error('[cw-runtime] playback listener error (' + dataListeners.playback[j].id + '):', e);
                }
            }
        } catch(e) {
            console.error('[cw-runtime] playback error:', e);
        }
    }

    // master dispatcher for audio fft data
    function _runtimeAudioHandler(d) {
        if (_userHandlers.colorwallAudioListener) {
            try { _userHandlers.colorwallAudioListener(d); } catch(e) {}
        }
        try {
            var data = (typeof d === 'string') ? JSON.parse(d) : d;
            currentAudio = data;
            for (var j = 0; j < dataListeners.audio.length; j++) {
                try { dataListeners.audio[j].fn(data); } catch(e) {
                    console.error('[cw-runtime] audio listener error (' + dataListeners.audio[j].id + '):', e);
                }
            }
        } catch(e) {
            console.error('[cw-runtime] audio error:', e);
        }
    }

    // master dispatcher for system telemetry
    function _runtimeSystemHandler(d) {
        if (_userHandlers.colorwallSystemInformation) {
            try { _userHandlers.colorwallSystemInformation(d); } catch(e) {}
        }
        try {
            var data = (typeof d === 'string') ? JSON.parse(d) : d;
            currentSystemData = data;
            if (data) {
                if (data.CurrentCpu !== undefined) currentSystem.cpu = data.CurrentCpu + '%';
                if (data.CurrentRamAvail !== undefined && data.TotalRam) {
                    currentSystem.ram = Math.round(((data.TotalRam - data.CurrentRamAvail) / data.TotalRam) * 100) + '%';
                }
            }
            var els = layer.querySelectorAll('[data-cw-system]');
            for (var i = 0; i < els.length; i++) {
                var field = els[i].getAttribute('data-cw-system');
                if (currentSystem[field] !== undefined) els[i].textContent = currentSystem[field];
            }
            for (var j = 0; j < dataListeners.system.length; j++) {
                try { dataListeners.system[j].fn(data); } catch(e) {
                    console.error('[cw-runtime] system listener error (' + dataListeners.system[j].id + '):', e);
                }
            }
        } catch(e) {
            console.error('[cw-runtime] system error:', e);
        }
    }

    // install the master dispatchers — these are the functions the rust
    // forwarder actually calls via window.eval(). we protect them with
    // defineProperty so widget inline scripts can't overwrite them.
    // if a widget script tries to set window.colorwallAudioListener = fn,
    // we intercept it and store fn as a user handler that gets chained.
    var _hookNames = [
        ['colorwallCurrentTrack', _runtimeTrackHandler],
        ['colorwallWallpaperPlaybackChanged', _runtimePlaybackHandler],
        ['colorwallAudioListener', _runtimeAudioHandler],
        ['colorwallSystemInformation', _runtimeSystemHandler],
    ];

    for (var hi = 0; hi < _hookNames.length; hi++) {
        (function(hookName, masterFn) {
            Object.defineProperty(window, hookName, {
                configurable: true,
                get: function() { return masterFn; },
                set: function(fn) {
                    // a widget script is trying to set this hook directly —
                    // capture it as a user handler instead of replacing the master
                    if (fn !== masterFn && typeof fn === 'function') {
                        console.log('[cw-runtime] intercepted', hookName, 'override from widget script — chaining as user handler');
                        _userHandlers[hookName] = fn;
                    }
                }
            });
        })(_hookNames[hi][0], _hookNames[hi][1]);
    }

    console.log('[cw-runtime] hooks installed and protected');

    // ── tweak update from backend ──
    window.__cw_updateWidgetTweak = function(instanceId, tweakName, value) {
        var w = widgets[instanceId];
        if (!w) return;

        // special: __cw_locked controls draggability, not a css variable
        if (tweakName === '__cw_locked') {
            if (value) {
                w.container.removeAttribute('data-cw-draggable');
                w.container.style.cursor = 'default';
            } else {
                if (w.data && w.data.manifest && w.data.manifest.draggable !== false) {
                    w.container.setAttribute('data-cw-draggable', 'true');
                    w.container.style.cursor = 'grab';
                }
            }
            return;
        }

        w.tweaks[tweakName] = value;
        applyTweakVar(w.container, tweakName, value);
        for (var j = 0; j < dataListeners.tweakChange.length; j++) {
            if (dataListeners.tweakChange[j].id === instanceId) {
                dataListeners.tweakChange[j].fn(tweakName, value);
            }
        }
    };

    // ── remove widget ──
    window.__cw_removeWidget = function(instanceId) {
        var w = widgets[instanceId];
        if (!w) return;
        if (w.container.parentNode) w.container.parentNode.removeChild(w.container);
        // clean up injected style tags from document head
        var widgetStyles = document.head.querySelectorAll('style[data-cw-widget="' + instanceId + '"]');
        for (var i = 0; i < widgetStyles.length; i++) widgetStyles[i].remove();
        for (var event in dataListeners) {
            dataListeners[event] = dataListeners[event].filter(function(l) { return l.id !== instanceId; });
        }
        delete widgets[instanceId];
    };

    // ── global widget styles ──
    var gs = document.createElement('style');
    gs.textContent = '.cw-widget{transition:opacity .5s ease}.cw-widget.cw-dragging{cursor:grabbing!important;opacity:.8;z-index:999!important}';
    document.head.appendChild(gs);
})();
