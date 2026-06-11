async function updateGreeting() {
    const wordEl = widget.container.querySelector('#greet-word');
    if (!wordEl) return;
    
    const hour = new Date().getHours();
    let word = "Good evening";
    if (hour >= 5 && hour < 12) {
        word = "Good morning";
    } else if (hour >= 12 && hour < 17) {
        word = "Good afternoon";
    }
    
    if (wordEl.textContent !== word) {
        wordEl.textContent = word;
    }

    // load username if not explicitly overridden by tweak
    if (!widget.tweaks || !widget.tweaks.name || widget.tweaks.name === 'User') {
        try {
            if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
                const sysName = await window.__TAURI__.core.invoke('get_username');
                const result = await window.__TAURI__.core.invoke('get_settings');
                let finalName = 'User';
                if (result && result.success && result.settings && result.settings.displayName) {
                    finalName = result.settings.displayName;
                } else if (sysName) {
                    finalName = sysName;
                }
                
                const nameEl = widget.container.querySelector('#greet-name');
                if (nameEl && nameEl.textContent !== finalName) {
                    nameEl.textContent = finalName;
                }
            }
        } catch (e) {
            console.error('[greeting widget] failed to fetch username:', e);
        }
    }
}

// Initial update
updateGreeting();

// check every minute
setInterval(updateGreeting, 60000);

// update name when tweak changes
widget.on('tweakChange', function(name, val) {
    if (name === 'name') {
        const nameEl = widget.container.querySelector('#greet-name');
        if (nameEl) {
            // if empty, let updateGreeting fetch it from backend
            if (!val || val === 'User' || val === '') {
                updateGreeting();
            } else {
                nameEl.textContent = val;
            }
        }
    }
});
