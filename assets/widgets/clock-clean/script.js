// clock widget script — sets time format based on tweaks
var timeEl = widget.container.querySelector('.cw-clock-time');
var dateEl = widget.container.querySelector('.cw-clock-date');

// build the format string from tweaks
var fmt = widget.tweaks.is24h ? 'HH:mm' : 'hh:mm A';
if (widget.tweaks.showSeconds) {
    fmt = widget.tweaks.is24h ? 'HH:mm:ss' : 'hh:mm:ss A';
}
timeEl.setAttribute('data-cw-time', fmt);

// date visibility
if (widget.tweaks.showDate === false) {
    dateEl.style.display = 'none';
}
