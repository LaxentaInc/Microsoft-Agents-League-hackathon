function renderCalendar() {
    const grid = widget.container.querySelector('#days-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const today = now.getDate();
    
    // first day of the month (0 = sunday)
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    // number of days in current month
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    // number of days in previous month
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    
    // total cells (rows * 7) - usually 35 or 42
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    
    for (let i = 0; i < totalCells; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day';
        
        if (i < firstDay) {
            // previous month
            dayDiv.textContent = daysInPrevMonth - firstDay + i + 1;
            dayDiv.classList.add('other-month');
        } else if (i >= firstDay + daysInMonth) {
            // next month
            dayDiv.textContent = i - firstDay - daysInMonth + 1;
            dayDiv.classList.add('other-month');
        } else {
            // current month
            const dayNum = i - firstDay + 1;
            dayDiv.textContent = dayNum;
            if (dayNum === today) {
                dayDiv.classList.add('today');
            }
        }
        grid.appendChild(dayDiv);
    }
}

// Initial render
renderCalendar();

// update daily at midnight (naive approach: just update every hour)
setInterval(renderCalendar, 3600000);

// update glass state when tweak changes
widget.on('tweakChange', function(name, val) {
    if (name === 'glass') {
        const c = widget.container.querySelector('.calendar-container');
        if (c) {
            if (val) {
                c.style.background = 'rgba(20, 20, 25, 0.4)';
                c.style.backdropFilter = 'blur(12px)';
                c.style.webkitBackdropFilter = 'blur(12px)';
                c.style.border = '1px solid rgba(255, 255, 255, 0.1)';
                c.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.2)';
            } else {
                c.style.background = 'transparent';
                c.style.backdropFilter = 'none';
                c.style.webkitBackdropFilter = 'none';
                c.style.border = 'none';
                c.style.boxShadow = 'none';
            }
        }
    }
});
