export const frontendDesignSkill = `---
name: frontend-design
---

This skill guides the creation of sleek, dark-mode, minimalist, and ultra-refined frontend interfaces that match our app's core aesthetic.

## Aesthetic Direction (CRITICAL)
- **Overall Vibe**: The app has a sophisticated dark mode glassmorphic yet not too animation heavy UI. Your wallpapers MUST match this. Use deep blacks (#000000), very dark translucent grays (rgba(12, 14, 20, 0.85)), and frosted glass effects (backdrop-filter: blur(16px)).
- **BANNED STYLES**: DO NOT use neon rainbows, highly saturated multi-colors, or chaotic rainbow gradients. DO NOT use generic 2D canvas spectrum bars.
- **Colors**: Keep it monochrome or dual-tone. Use a single elegant accent color (like soft gold, pure white, or a subtle deep blue) against a dark background.
- **Typography**: Use ultra-sleek, elegant fonts like 'Inter' or system fonts. Make use of very thin font weights and high contrast (white text on dark backgrounds).
- **STYLE**: OFTEN lean towards cute aesthetics, like making cute fonts, heart animations, lovely mouse hovers, bigger headings, calenders, time based greetings that change, mouse movement animations, halo's, sometimes going with blue archive type accents and themes too!
## Layout & Widgets
- **CRITICAL: You MUST include multiple different widgets (e.g., clock, system stats, now playing, weather, greeting) by default in your design, UNLESS the user explicitly asks for a minimal or single-widget design in their prompt.**
- **Widget Styling**: Widgets DO NOT always need a visible container or background box! It is HIGHLY ENCOURAGED to make widgets seamlessly integrated into the wallpaper with completely transparent backgrounds (i.e., just floating elegant text and icons).
- If you do use a container box, use the app's glassmorphic aesthetic: background: rgba(0, 0, 0, 0.45); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; backdrop-filter: blur(12px); box-shadow: 0 32px 64px -16px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02) inset;.
- **Greetings**: The greeting (if present) should be much larger, use distinct and elegant typography, and feature a unique color treatment (e.g., subtle gradient text or an elegant accent color).
- **Typography & Fonts**: Creative font usage is strongly encouraged! Import diverse, elegant Google Fonts (like 'Playfair Display', 'Outfit', 'Cinzel', or 'Space Grotesk') to make the text elements look distinct and premium.
- Do NOT make everything huge. Scale elements elegantly and place them symmetrically or with creative alignment around the edges.

## Motion, WebGL & Shaders
- **CRITICAL: Prefer Three.js or custom WebGL shaders over basic 2D Canvas.** Write custom GLSL fragment shaders to create highly premium, liquid, or ambient light effects that react to audio.
- If using 2D Canvas, implement advanced effects like particle fluid simulations, delicate geometric wireframes, or soft glowing light leaks. NO blocky visualizer bars.
- Ensure the motion feels soothing, high-quality, and expensive. Never erratic. Use easing functions for all data reactivity.

Always write code that feels like a premium software experience, not a cheap glowing widget.`;