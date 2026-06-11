var container = widget.container.querySelector('.cw-visualizer-container');
var canvas = widget.container.querySelector('#vis-canvas');
var ctx = canvas.getContext('2d');

var size = 1000;
var center = size / 2;

// track the current color to dynamically update the shadow filter without doing it every frame
var lastColor = '';

widget.on('audio', function(data) {
    if (!data || !Array.isArray(data)) return;
    
    var color = widget.tweaks.color || '#ffffff';
    var radius = widget.tweaks.radius || 150;
    var thickness = widget.tweaks.thickness || 8;
    var maxLen = widget.tweaks.lengthMultiplier || 80;
    var numBars = widget.tweaks.barCount || 64;
    var roundedEnds = widget.tweaks.roundedEnds === true;
    
    ctx.clearRect(0, 0, size, size);
    
    ctx.lineCap = roundedEnds ? 'round' : 'butt';
    ctx.lineWidth = thickness;
    ctx.strokeStyle = color;
    
    for (var i = 0; i < numBars; i++) {
        var idx = Math.floor((i / numBars) * 48);
        var val = data[idx] || 0;
        
        var angle = (i / numBars) * Math.PI * 2 - (Math.PI / 2);
        var barHeight = Math.max(2, val * (maxLen / 2)); // scale the value
        
        var startX = center + Math.cos(angle) * radius;
        var startY = center + Math.sin(angle) * radius;
        var endX = center + Math.cos(angle) * (radius + barHeight);
        var endY = center + Math.sin(angle) * (radius + barHeight);
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }
    
    if (color !== lastColor) {
        lastColor = color;
        // set a nice matching drop shadow with 30% opacity
        canvas.style.filter = 'drop-shadow(0 0 12px ' + color + '4D)';
    }
});
