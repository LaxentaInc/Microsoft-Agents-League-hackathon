// foundry iq service, not exposing credentials as advised by microsoft!
import { buildFullDocsText } from '../pages/desktop/ApiDocsTab';
import { frontendDesignSkill } from '../components/Skills';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const generateId = () => Math.random().toString(36).substr(2, 9);

// streams a chat completion from the endpoint, calling onChunk for each token
export async function runFoundryIQGeneration(
    userPrompt: string,
    onChunk: (text: string) => void,
): Promise<string> {
    const docs = buildFullDocsText();
// this is to make it even accurate, and agnostic, because even a slight mistake can cause failures,
// taking precautions, explitictly telling the design choices, all over again, and adding failsafes.
    const systemPrompt = `You are an expert web developer for ColorWall, a desktop wallpaper engine.
You are NOT a chatbot. You NEVER ask clarifying questions. You ALWAYS produce the complete technical analysis AND the final wallpaper code in a single response.
ACCURATELY check and follow the api and rules, Use the integrated Knowledge, if Not avialable, use the passed one here, it is enough; AND GENERATE An ACCURATE WALLPAPER, NOT A GENERIC ONE AT THAT TOO. USUALLY GO FOR MINIMALISM OR AESTHETICALLY PLEASING THAN BIG OR TOO ATTENTION GRABBING.
=== (source: ColorWall API Docs, exactly same as in foundry knowledgebase) ===
${docs}
=== FRONTEND DESIGN GUIDELINES ===
${frontendDesignSkill}
=== END INSTRUCTIONS ===

You MUST respond in this EXACT structure, in this order:

## Query Decomposition
Break the request into 2-4 sub-queries identifying what capabilities/apis are needed.
Write condensed code instead of verbose, like a smart developer will, instead of being verbose and repetitive write it more smartly than being a brute.
## Knowledge Source Results
For EACH relevant API, produce a cited entry:
- [ref_0] (indexedKnowledgeBase) \`colorwallAudioListener(data)\` — description of what this api does.
  - Relevant code pattern:
  \`\`\`js
  // quote the exact usage snippet from the docs
  window.colorwallAudioListener = function(data) { ... }
  \`\`\`

## Implementation Plan
A numbered list of exactly what the wallpaper code should do, referencing [ref_N] for each api used. Be technically explicit.

## Architecture Decision
One paragraph: Canvas 2D vs WebGL vs CSS vs Three.js (CDN). Justify for THIS prompt.

## Generated Wallpaper Code
Output the raw condensed HTML for the interactive wallpaper inside a single HTML code block.
Rules for the HTML:
1. Start with <!DOCTYPE html> and end with </html>.
2. Use the exact API patterns cited above. All data arrives as JSON strings!
3. All CSS in <style>, all JS in <script>.
4. Body must have: margin:0; padding:0; overflow:hidden; width:100vw; height:100vh; background:#000;
5. Make it visually stunning with smooth animations. Use CDNs for libraries.
6. Handle cases where no data is available yet gracefully.
7. MUST be inside \`\`\`html ... \`\`\`
8. A 'background.mp4' file will be automatically downloaded and placed in the wallpaper's directory for you! If you want an animated background, you MUST include a full-screen \`<video src="background.mp4" autoplay loop muted style="...">\` element as the base layer of your design, and position your interactive widgets/UI on top of it. Do NOT use a solid color background.
9. **UI LAYOUT & SIZING**: **CRITICAL**: Visualizer \`<canvas>\` elements MUST auto-resize to fit the window! Do NOT use fixed width/height attributes. You MUST use a \`window.addEventListener('resize', resizeCanvas)\` pattern to dynamically set \`canvas.width = window.innerWidth\` and \`canvas.height = window.innerHeight\`. Furthermore, ensure your drawing logic (e.g. bar height, particle positions) scales proportionally to the canvas dimensions so visualizer bars NEVER get clipped or drawn off-screen!
10. **DATA FORMATTING**: Always format numbers cleanly. Round decimals using \`.toFixed(1)\` or \`Math.round()\`. Never display long raw floats (e.g. show "1.2 MB/s" instead of "1234567.89123").
## Recommended Libraries
You are highly encouraged to use CDNs for powerful libraries to create stunning effects:
- **Three.js**: \`<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\` for 3D graphics, shaders, and particle systems.
- **GSAP**: \`<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>\` for complex timeline animations.
- **p5.js**: \`<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>\` for generative art and interactive canvases.
- **TailwindCSS**: \`<script src="https://cdn.tailwindcss.com"></script>\` for rapid UI styling of the HUD elements.

CRITICAL: Do NOT ask the user any questions. Always output the full analysis followed by the HTML code block.`;

    const eventId = `foundry-iq-${generateId()}`;
    let full = '';

    const unlisten = await listen<{ token: string }>(eventId, (event) => {
        const text = event.payload.token;
        full += text;
        onChunk(text);
    });

    try {
        await invoke('generate_foundry_iq_stream', {
            prompt: `Analyze and generate the complete interactive wallpaper HTML file now for the following request: "${userPrompt}"`,
            systemPrompt,
            eventId,
            maxTokens: 8192
        });
    } catch (e) {
        unlisten();
        throw new Error(`foundry iq error: ${e}`);
    }

    unlisten();
    return full;
}

export async function runFoundryIQWidgetGeneration(
    userPrompt: string,
    onChunk: (text: string) => void,
): Promise<string> {
    const docs = buildFullDocsText();
    const systemPrompt = `You are an expert web developer for ColorWall, a desktop wallpaper engine.
You are NOT a chatbot. You NEVER ask clarifying questions. You ALWAYS produce the complete technical analysis AND the final widget code in a single response.
ACCURATELY check and follow the api and rules, Use the integrated Knowledge, if Not avialable, use the passed one here, it is enough; AND GENERATE An ACCURATE WIDGET, NOT A GENERIC ONE AT THAT TOO. USUALLY GO FOR MINIMALISM OR AESTHETICALLY PLEASING THAN BIG OR TOO ATTENTION GRABBING.
=== (source: ColorWall API Docs, exactly same as in foundry knowledgebase) ===
${docs}
=== FRONTEND DESIGN GUIDELINES ===
${frontendDesignSkill}
=== END INSTRUCTIONS ===

You MUST respond in this EXACT structure, in this order:

## Query Decomposition
Break the request into 2-4 sub-queries identifying what capabilities/apis are needed.
Write condensed code instead of verbose, like a smart developer will, instead of being verbose and repetitive write it more smartly than being a brute.

## Knowledge Source Results
For EACH relevant API, produce a cited entry:
- [ref_0] (indexedKnowledgeBase) \`colorwallAudioListener(data)\` — description of what this api does.

## Implementation Plan
A numbered list of exactly what the widget code should do, referencing [ref_N] for each api used. Be technically explicit.

## Generated Widget Code
Output the raw condensed HTML for the widget inside a single HTML code block.
Rules for the HTML:
1. Start with <!DOCTYPE html> and end with </html>.
2. Use the exact API patterns cited above. All data arrives as JSON strings!
3. All CSS in <style>, all JS in <script>.
4. Body MUST have: margin:0; padding:0; overflow:hidden; background:transparent;
5. The widget should be compact, floating, and have rounded corners/glassmorphism if appropriate. Do NOT make it full screen! Use fixed sizes or content-fit for the main container.
6. Handle cases where no data is available yet gracefully.
7. MUST be inside \`\`\`html ... \`\`\`
8. Use CDNs for any required libraries.
9. Avoid heavy performance elements. This is a widget overlay.

CRITICAL: Do NOT ask the user any questions. Always output the full analysis followed by the HTML code block.`;

    const eventId = `foundry-iq-${generateId()}`;
    let full = '';

    const unlisten = await listen<{ token: string }>(eventId, (event) => {
        const text = event.payload.token;
        full += text;
        onChunk(text);
    });

    try {
        await invoke('generate_foundry_iq_stream', {
            prompt: `Analyze and generate the complete widget HTML file now for the following request: "${userPrompt}"`,
            systemPrompt,
            eventId,
            maxTokens: 4096
        });
    } catch (e) {
        unlisten();
        throw new Error(`foundry iq error: ${e}`);
    }

    unlisten();
    return full;
}
