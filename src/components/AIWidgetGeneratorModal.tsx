// ai wallpaper generation modal, one-pass foundry iq pipeline
import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X, Wand2, Brain, Code2, Loader2, Copy, Check } from 'lucide-react';
import { runFoundryIQWidgetGeneration } from '../services/foundryIQ';

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
    const [copied, setCopied] = React.useState(false);
    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            onClick={handleCopy}
            style={{
                background: copied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                border: '1px solid',
                borderColor: copied ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '6px 10px',
                cursor: 'pointer',
                color: copied ? '#22c55e' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
            }}
        >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : label}
        </button>
    );
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (folderPath: string) => void;
}

type Phase = 'idle' | 'generating' | 'saving' | 'done' | 'error';
type Tab = 'grounding' | 'code';

export default function AIWidgetGeneratorModal({ isOpen, onClose, onSuccess }: Props) {
    const [prompt, setPrompt] = React.useState('');
    const [phase, setPhase] = React.useState<Phase>('idle');
    const [streamText, setStreamText] = React.useState('');
    const [error, setError] = React.useState('');
    const [activeTab, setActiveTab] = React.useState<Tab>('grounding');
    const streamRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (isOpen) {
            setPrompt('');
            setPhase('idle');
            setStreamText('');
            setError('');
            setActiveTab('grounding');
        }
    }, [isOpen]);

    React.useEffect(() => {
        if (streamRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = streamRef.current;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
            if (isNearBottom) {
                streamRef.current.scrollTop = scrollHeight;
            }
        }
    }, [streamText]);

    React.useEffect(() => {
        if (streamRef.current) {
            streamRef.current.scrollTop = streamRef.current.scrollHeight;
        }
    }, [activeTab]);

    React.useEffect(() => {
        const codeIndex = streamText.indexOf('```html');
        let genLen = 0;
        if (codeIndex !== -1) {
            genLen = streamText.substring(codeIndex + 7).trim().length;
        }
        if (activeTab === 'grounding' && genLen > 10 && phase === 'generating') {
            setActiveTab('code');
        }
    }, [streamText, activeTab, phase]);

    if (!isOpen) return null;

    const isRunning = phase === 'generating' || phase === 'saving';

    // (video background fetcher removed for widgets)

    const handleGenerate = async () => {
        if (!prompt.trim() || isRunning) return;

        setPhase('generating');
        setStreamText('');
        setError('');
        setActiveTab('grounding');

        let attempts = 0;
        const maxAttempts = 3;
        let success = false;

        while (attempts < maxAttempts && !success) {
            attempts++;
            try {
                if (attempts > 1) {
                    setStreamText((prev) => prev + `\n\n[SYSTEM] Connection to foundry failed. Do you have the correct azure api in place with foundry access? (Attempt ${attempts}/${maxAttempts})\n\n`);
                }

                // single pass: foundry iq knowledge grounding + code generation
                const fullResponse = await runFoundryIQWidgetGeneration(prompt, (token) => {
                    setStreamText(prev => prev + token);
                });

                // extract HTML from the final response
                let cleanHtml = '';
                // First try to find a markdown block that actually contains HTML
                const htmlMatch = fullResponse.match(/```(?:html)?\s*(<!DOCTYPE html>[\s\S]*?)\s*```/i);
                if (htmlMatch && htmlMatch[1]) {
                    cleanHtml = htmlMatch[1].trim();
                } else {
                    // fallback: just grab everything from <!DOCTYPE html> to the end
                    const fallbackMatch = fullResponse.match(/<!DOCTYPE html>[\s\S]*/i);
                    if (fallbackMatch) {
                        cleanHtml = fallbackMatch[0].replace(/```/g, '').trim(); // strip any dangling backticks
                        // try to gracefully close if it was cut off
                        if (!cleanHtml.includes('</html>')) cleanHtml += '\n</html>';
                    }
                }

                if (cleanHtml.length < 50 || !cleanHtml.includes('<')) {
                    throw new Error('generated output does not appear to be valid html. maybe the prompt was too ambiguous?');
                }

                // switch to code tab before saving so they see it
                setActiveTab('code');

                // step 2: save via tauri backend
                setPhase('saving');
                const res: any = await invoke('save_ai_widget', {
                    prompt,
                    html: cleanHtml,
                });

                if (res.success && res.message) {
                    setStreamText(prev => prev + '\n\n[SYSTEM] HTML saved. Mhmmm Done!\n\n');
                    setPhase('done');
                    onSuccess(res.message);
                    onClose();
                    success = true;
                } else {
                    throw new Error(res.error || 'failed to save widget');
                }
            } catch (err: any) {
                console.error(`[foundry-iq] Attempt ${attempts} failed:`, err);
                if (attempts >= maxAttempts) {
                    setPhase('error');
                    setError(String(err));
                } else {
                    // reset phase back to generating for next loop iteration
                    setPhase('generating');
                }
            }
        }
    };

    // dynamically split the stream into grounding and code for the UI tabs
    let groundingText = streamText;
    let generatingText = '';
    const codeIndex = streamText.indexOf('```html');
    
    if (codeIndex !== -1) {
        groundingText = streamText.substring(0, codeIndex).trim();
        generatingText = streamText.substring(codeIndex + 7).trim(); // +7 to skip ```html
    }

    const showStream = streamText.length > 0;
    const streamContent = activeTab === 'grounding' ? groundingText : generatingText;

    return (
        <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '16px',
            width: '100%',
            height: showStream ? 'calc(100vh - 160px)' : 'auto',
            minHeight: showStream ? '600px' : 'auto',
            marginBottom: '24px',
            boxShadow: '0 32px 64px -16px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.02) inset',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'height 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                    background: 'rgba(255, 255, 255, 0.02)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ 
                            padding: '6px', 
                            background: 'rgba(15, 147, 249, 0.15)', 
                            borderRadius: '8px',
                            color: 'var(--accent)',
                            display: 'flex'
                        }}>
                            <Wand2 size={18} />
                        </div>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                            Generate Widget
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isRunning}
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)', 
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            color: 'var(--text-secondary)',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            opacity: isRunning ? 0.4 : 1, 
                            padding: '6px',
                            display: 'flex',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            if (!isRunning) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                            if (!isRunning) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{
                    display: 'flex',
                    flex: 1,
                    minHeight: 0,
                    flexDirection: showStream ? 'row' : 'column',
                }}>
                    {/* left: input */}
                    <div style={{
                        width: showStream ? '340px' : '100%',
                        flexShrink: 0,
                        padding: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        borderRight: showStream ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        background: 'rgba(0,0,0,0.1)',
                    }}>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.6 }}>
                            Describe what you want. Foundry IQ will analyze the API surface and generate the code in a single optimized pass.
                        </p>

                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="e.g. A retro wave audio visualizer with glowing grid and neon sun..."
                            disabled={isRunning}
                            style={{
                                flex: showStream ? 1 : 'none',
                                minHeight: '140px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '12px',
                                padding: '16px',
                                color: 'var(--text-primary)',
                                fontSize: '15px',
                                fontFamily: "'Inter', sans-serif",
                                lineHeight: 1.5,
                                resize: 'none',
                                outline: 'none',
                                opacity: isRunning ? 0.6 : 1,
                                boxSizing: 'border-box',
                                transition: 'border-color 0.2s, background 0.2s',
                                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                            }}
                            onFocus={(e) => { e.target.style.borderColor = 'rgba(0, 120, 212, 0.5)'; e.target.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                            onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'; e.target.style.background = 'rgba(255, 255, 255, 0.03)'; }}
                        />

                        {/* phase indicator */}
                        {isRunning && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                padding: '16px',
                                background: 'rgba(0, 120, 212, 0.05)',
                                borderRadius: '12px',
                                border: '1px solid rgba(0, 120, 212, 0.1)',
                            }}>
                                <PhaseStep
                                    icon={<Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />}
                                    label="Generating intelligence"
                                    active={phase === 'generating'}
                                    done={phase === 'saving'}
                                />
                                <PhaseStep
                                    icon={<Code2 size={15} />}
                                    label="Saving widget"
                                    active={phase === 'saving'}
                                    done={false}
                                />
                            </div>
                        )}

                        {error && (
                            <div style={{
                                padding: '14px',
                                background: 'rgba(220, 38, 38, 0.1)',
                                border: '1px solid rgba(220, 38, 38, 0.2)',
                                borderRadius: '10px',
                                color: '#fca5a5',
                                fontSize: '13px',
                                lineHeight: 1.5,
                                wordBreak: 'break-word',
                            }}>
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleGenerate}
                            disabled={isRunning || !prompt.trim()}
                            style={{
                                padding: '14px 24px',
                                background: (isRunning || !prompt.trim())
                                    ? 'rgba(255, 255, 255, 0.05)'
                                    : 'var(--accent)',
                                color: (isRunning || !prompt.trim()) ? 'rgba(255, 255, 255, 0.3)' : '#fff',
                                border: 'none',
                                borderRadius: '12px',
                                cursor: (isRunning || !prompt.trim()) ? 'not-allowed' : 'pointer',
                                fontWeight: 600,
                                fontSize: '15px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.2s',
                                boxShadow: (isRunning || !prompt.trim()) ? 'none' : '0 4px 12px rgba(0, 120, 212, 0.3)',
                            }}
                            onMouseEnter={(e) => {
                                if (!isRunning && prompt.trim()) {
                                    e.currentTarget.style.background = '#006cbe';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isRunning && prompt.trim()) {
                                    e.currentTarget.style.background = 'var(--accent)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }
                            }}
                        >
                            {isRunning ? (
                                <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Running...</>
                            ) : (
                                <><Wand2 size={16} /> Generate Widget</>
                            )}
                        </button>
                    </div>

                    {/* right: stream output */}
                    {showStream && (
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            minWidth: 0,
                            background: 'rgba(0, 0, 0, 0.4)',
                        }}>
                            {/* tab bar */}
                            <div style={{
                                display: 'flex',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                                background: 'rgba(0, 0, 0, 0.2)',
                                padding: '0 16px',
                            }}>
                                <TabButton
                                    active={activeTab === 'grounding'}
                                    label="Reasoning"
                                    icon={<Brain size={14} />}
                                    onClick={() => setActiveTab('grounding')}
                                    highlight={phase === 'generating' && activeTab !== 'grounding' && generatingText.length === 0}
                                />
                                <TabButton
                                    active={activeTab === 'code'}
                                    label="Generated Code"
                                    icon={<Code2 size={14} />}
                                    onClick={() => setActiveTab('code')}
                                    highlight={phase === 'generating' && generatingText.length > 0 && activeTab !== 'code'}
                                />
                            </div>

                            {/* stream content */}
                            <div
                                style={{
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '24px',
                                }}
                            >
                                {activeTab === 'code' ? (
                                    <div style={{
                                        position: 'relative',
                                        background: 'rgba(0, 0, 0, 0.45)',
                                        border: '1px solid rgba(255, 255, 255, 0.06)',
                                        borderRadius: '8px',
                                        padding: '14px 16px',
                                        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
                                        fontSize: '13px',
                                        lineHeight: '1.65',
                                        color: '#9cdcfe',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                    }}>
                                        <div style={{ position: 'absolute', top: '8px', right: '8px' }}>
                                            <CopyButton text={generatingText} />
                                        </div>
                                        {streamContent}
                                        {phase === 'generating' && (
                                            <span style={{
                                                display: 'inline-block',
                                                width: '8px',
                                                height: '16px',
                                                background: 'var(--accent)',
                                                marginLeft: '4px',
                                                verticalAlign: 'middle',
                                                animation: 'blink 1s step-end infinite',
                                            }} />
                                        )}
                                    </div>
                                ) : (
                                    <div
                                        ref={streamRef}
                                        style={{
                                            fontSize: '14px',
                                            lineHeight: 1.8,
                                            color: '#d4d4d4',
                                            fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {streamContent}
                                        {phase === 'generating' && (
                                            <span style={{
                                                display: 'inline-block',
                                                width: '8px',
                                                height: '16px',
                                                background: 'var(--accent)',
                                                marginLeft: '4px',
                                                verticalAlign: 'middle',
                                                animation: 'blink 1s step-end infinite',
                                            }} />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            `}</style>
        </div>
    );
}

// small helper components

function PhaseStep({ icon, label, active, done }: { icon: React.ReactNode; label: string; active: boolean; done: boolean }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            color: active ? 'var(--accent)' : done ? '#4ade80' : 'var(--text-tertiary)',
            fontWeight: active ? 600 : 500,
        }}>
            <div style={{ 
                color: active ? 'var(--accent)' : done ? '#4ade80' : 'var(--text-tertiary)',
                display: 'flex'
            }}>
                {icon}
            </div>
            <span>{label}</span>
            {done && <span style={{ color: '#4ade80', marginLeft: 'auto' }}>✓</span>}
        </div>
    );
}

function TabButton({ active, label, icon, onClick, highlight }: {
    active: boolean; label: string; icon: React.ReactNode; onClick: () => void; highlight: boolean;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '16px 20px',
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'color 0.2s',
                opacity: active ? 1 : 0.7,
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = '0.7'; }}
        >
            {highlight && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', animation: 'blink 1s step-end infinite' }} />}
            {icon}
            {label}
        </button>
    );
}
