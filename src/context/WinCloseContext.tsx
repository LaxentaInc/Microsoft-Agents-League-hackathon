import React, { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface VisibilityContextType {
    isVisible: boolean;
}

const VisibilityContext = createContext<VisibilityContextType>({ isVisible: true });

export function VisibilityProvider({ children }: { children: React.ReactNode }) {
    const [isVisible, setIsVisible] = useState(!document.hidden);

    useEffect(() => {
        // visibilitychange fires when the window is minimized or restored
        const handleVisibilityChange = () => {
            const visible = !document.hidden;
            setIsVisible(visible);
            console.log(`[visibility] document is now ${visible ? 'visible' : 'hidden'}`);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        // tauri focus events let us detect systray hide/show
        // but we only mark hidden if the window is actually minimized or not visible,
        // not just because the user clicked on another app while colorwall is still on screen
        let unlisten: (() => void) | undefined;
        const appWindow = getCurrentWindow();

        const setupTauriListeners = async () => {
            const unlistenFocus = await appWindow.onFocusChanged(async ({ payload: focused }) => {
                if (focused) {
                    setIsVisible(true);
                    console.log('[visibility] window focused');
                } else {
                    // check if the window is actually hidden (systray) or minimized
                    // if it's just unfocused but still on screen, keep rendering
                    try {
                        const minimized = await appWindow.isMinimized();
                        const windowVisible = await appWindow.isVisible();
                        if (minimized || !windowVisible) {
                            setIsVisible(false);
                            console.log(`[visibility] window hidden (minimized=${minimized}, visible=${windowVisible})`);
                        }
                    } catch (err) {
                        // if the check fails, fall back to document.hidden
                        if (document.hidden) {
                            setIsVisible(false);
                        }
                    }
                }
            });
            unlisten = unlistenFocus;
        };
        setupTauriListeners();

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            unlisten?.();
        };
    }, []);

    return (
        <VisibilityContext.Provider value={{ isVisible }}>
            {children}
        </VisibilityContext.Provider>
    );
}

export function useVisibility() {
    return useContext(VisibilityContext);
}

