// now-playing widget — handles visibility, circular eq, and marquee text
var card = widget.container.querySelector('.cw-np-card');
var canvas = widget.container.querySelector('.cw-np-visualizer');
var titleEl = widget.container.querySelector('.cw-np-title');
var artistEl = widget.container.querySelector('.cw-np-artist');

var ctx = canvas.getContext('2d');
var isPlaying = false;
var hasTrack = false;

// visualizer sizing
var size = 100;
var center = size / 2;
var radius = 35; // slightly larger than album art (which is 64x64, r=32)

// tweaks
var showEq = widget.tweaks.showEq !== false;
var accentColor = widget.tweaks.accentColor || '#c4b5fd';

if (!showEq) {
    canvas.style.display = 'none';
}

// start hidden
card.classList.add('cw-np-hidden');

function updateVisibility() {
    if (hasTrack || isPlaying) {
        card.classList.remove('cw-np-hidden');
    } else {
        card.classList.add('cw-np-hidden');
    }
}

// Check and apply bounce scroll if text overflows
function checkMarquee(element) {
    if (!element) return;
    var wrapper = element.parentElement;
    
    // reset state
    element.classList.remove('cw-marquee');
    element.style.removeProperty('--scroll-dist');
    
    if (element.scrollWidth > wrapper.clientWidth) {
        element.classList.add('cw-marquee');
        var distance = element.scrollWidth - wrapper.clientWidth;
        element.style.setProperty('--scroll-dist', '-' + distance + 'px');
    }
}

setTimeout(updateVisibility, 500);

widget.on('media', function(data) {
    // detect real tracks vs fallback state — the runtime now sends
    // "Nothing Playing" as fallback text instead of empty strings
    hasTrack = !!(data && data.title && data.title !== 'Nothing Playing');
    updateVisibility();
    
    // delay marquee check so DOM can update layout
    setTimeout(function() {
        checkMarquee(titleEl);
        checkMarquee(artistEl);
    }, 100);
});

widget.on('playback', function(data) {
    if (data) {
        isPlaying = (data.IsPaused === false || data.isPaused === false);
    } else {
        isPlaying = false;
    }
    
    if (isPlaying) {
        card.classList.add('is-playing');
    } else {
        card.classList.remove('is-playing');
    }
    
    updateVisibility();
});

widget.on('audio', function(data) {
    if (!showEq || !data || !Array.isArray(data)) return;
    
    // clear previous frame
    ctx.clearRect(0, 0, size, size);
    
    var numBars = 48; // number of segments around the circle
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = accentColor;
    
    for (var i = 0; i < numBars; i++) {
        // map circle to the lower/mid freq range (0 ~ 48) where bass/vocals live
        var idx = Math.floor((i / numBars) * 48); 
        var val = data[idx] || 0;
        
        // start at top, go clockwise
        var angle = (i / numBars) * Math.PI * 2 - (Math.PI / 2);
        var barHeight = 2 + (val * 12); // outward push
        
        var startX = center + Math.cos(angle) * radius;
        var startY = center + Math.sin(angle) * radius;
        var endX = center + Math.cos(angle) * (radius + barHeight);
        var endY = center + Math.sin(angle) * (radius + barHeight);
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
});
