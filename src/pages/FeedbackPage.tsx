import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Send, Image as ImageIcon, FileText, CheckCircle2, MessageSquare } from 'lucide-react';
import { useConfirm } from '../context/ConfirmContext';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
// implement on site soon! or this will not work Ughhhhh the deadline is so soon :<
// a lot of foundry work is left in widgets too :< pray i do not forget this XD
 interface FeedbackItem {
    id: string;
    username: string;
    text: string;
    images: string[];
    logFiles: { name: string; content: string }[];
    appVersion: string | null;
    source: 'App' | 'Web';
    createdAt: string;
    replies: any[];
}

interface FeedbackGroup {
    username: string;
    source: string;
    items: FeedbackItem[];
}

export default function FeedbackPage() {
    const [text, setText] = useState('');
    const [images, setImages] = useState<File[]>([]);
    const [logFiles, setLogFiles] = useState<File[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [username, setUsername] = useState('Anonymous User');
    const [appVersion, setAppVersion] = useState('');
    const [deviceId, setDeviceId] = useState('');
    
    // Feed State
    const [feedData, setFeedData] = useState<FeedbackGroup[]>([]);
    const [feedLoading, setFeedLoading] = useState(true);
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [replyingSubmitting, setReplyingSubmitting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const logInputRef = useRef<HTMLInputElement>(null);
    const { showAlert } = useConfirm();

    useEffect(() => {
        loadUserData();
    }, []);

    const loadUserData = async () => {
        try {
            const version = await getVersion();
            setAppVersion(version);

            let locallyStoredId = localStorage.getItem('cw_device_id');
            if (!locallyStoredId) {
                locallyStoredId = crypto.randomUUID();
                localStorage.setItem('cw_device_id', locallyStoredId);
            }
            setDeviceId(locallyStoredId);

            let sysName: string = await invoke('get_username');
            const result: any = await invoke('get_settings');
            
            if (result.success && result.settings && result.settings.displayName) {
                sysName = result.settings.displayName;
            }
            setUsername(sysName);
            
            fetchFeed(locallyStoredId, sysName);

        } catch (error) {
            console.error('Failed to load user data:', error);
        }
    };

    const fetchFeed = async (did: string, uname: string) => {
        try {
            setFeedLoading(true);
            const res = await fetch(`https://www.colorwall.xyz/api/feedback/me?deviceId=${encodeURIComponent(did)}&username=${encodeURIComponent(uname)}`);
            const data = await res.json();
            if (data.success) {
                const groups: FeedbackGroup[] = [];
                let currentGroup: FeedbackGroup | null = null;
                for (const item of data.data) {
                    if (!currentGroup) {
                        currentGroup = { username: item.username, source: item.source, items: [item] };
                    } else {
                        const timeDiff = new Date(currentGroup.items[currentGroup.items.length - 1].createdAt).getTime() - new Date(item.createdAt).getTime();
                        if (
                            item.username === currentGroup.username &&
                            item.source === currentGroup.source &&
                            timeDiff < 60 * 60 * 1000 // 1 hour
                        ) {
                            currentGroup.items.push(item);
                        } else {
                            groups.push(currentGroup);
                            currentGroup = { username: item.username, source: item.source, items: [item] };
                        }
                    }
                }
                if (currentGroup) groups.push(currentGroup);
                setFeedData(groups);
            }
        } catch (e) {
            console.error('Failed to fetch user feed', e);
        } finally {
            setFeedLoading(false);
        }
    };

    const submitReply = async (threadId: string) => {
        if (!replyText.trim()) return;
        setReplyingSubmitting(true);
        try {
            const res = await fetch('https://www.colorwall.xyz/api/feedback/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threadId, username, text: replyText.trim() })
            });
            const data = await res.json();
            if (data.success && data.reply) {
                setFeedData(prev => prev.map(group => {
                    const threadIndex = group.items.findIndex(item => item.id === threadId);
                    if (threadIndex === 0) {
                        const newItems = [...group.items];
                        newItems[0] = { ...newItems[0], replies: [...(newItems[0].replies || []), data.reply] };
                        return { ...group, items: newItems };
                    }
                    return group;
                }));
                setReplyText('');
                setReplyingTo(null);
            } else {
                showAlert({ title: 'Reply Failed', message: data.error || 'Server error', isDanger: true });
            }
        } catch (e: any) {
            showAlert({ title: 'Reply Failed', message: e.message || 'Server error', isDanger: true });
        } finally {
            setReplyingSubmitting(false);
        }
    };

    const processImage = (file: File): Promise<File> => {
        return new Promise((resolve) => {
            const img = new window.Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_DIM = 1920;
                
                if (width > MAX_DIM || height > MAX_DIM) {
                    const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                    width *= ratio;
                    height *= ratio;
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(file);
                
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) return resolve(file);
                        const newName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
                        resolve(new File([blob], newName, { type: 'image/webp' }));
                    },
                    'image/webp',
                    0.8
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(file);
            };
            img.src = url;
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        
        const newFiles = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
        
        if (images.length + newFiles.length > 2) {
            showAlert({ title: 'Too Many Images', message: 'You can only upload up to 2 images per report.' });
            return;
        }

        const processed = await Promise.all(newFiles.map(processImage));
        
        const valid = processed.filter(file => {
             if (file.size > 2 * 1024 * 1024) {
                 showAlert({ title: 'File Too Large', message: `Image ${file.name} is too large even after compression.`, isDanger: true });
                 return false;
             }
             return true;
        });

        setImages(prev => [...prev, ...valid]);
    };

    const handleLogChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        
        const newFiles = Array.from(e.target.files);
        const validFiles = newFiles.filter(file => {
            if (!file.name.endsWith('.txt')) {
                showAlert({ title: 'Invalid File', message: `File ${file.name} is not a .txt file.`, isDanger: true });
                return false;
            }
            // Temporarily ignore sizes here, because we truncate on submit!
            return true;
        });

        if (logFiles.length + validFiles.length > 5) {
            showAlert({ title: 'Too Many Logs', message: 'You can only upload up to 5 log files per report.' });
            return;
        }

        setLogFiles(prev => [...prev, ...validFiles]);
    };

    const removeLog = (index: number) => {
        setLogFiles(prev => prev.filter((_, i) => i !== index));
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!text.trim() && images.length === 0 && logFiles.length === 0) {
            showAlert({ title: 'Empty Report', message: 'Please provide some details, images, or log files before submitting.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('text', text);
            formData.append('source', 'App');
            if (deviceId) formData.append('deviceId', deviceId);
            
            if (appVersion) {
                formData.append('appVersion', appVersion);
            }
            
            images.forEach((file) => {
                formData.append('images', file);
            });
            
            for (const file of logFiles) {
                const MAX_LOG_SIZE = 500 * 1024; // 500KB
                if (file.size > MAX_LOG_SIZE) {
                    const textContent = await file.text();
                    const truncatedText = textContent.slice(-MAX_LOG_SIZE);
                    const finalContent = `[...LOG TRUNCATED FOR SIZE...]\n${truncatedText}`;
                    formData.append('logFiles', new File([finalContent], file.name, { type: 'text/plain' }));
                } else {
                    formData.append('logFiles', file);
                }
            }

            const API_URL = 'https://www.colorwall.xyz/api/feedback';

            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData
            });

            const data = await response.json().catch(() => null);

            if (!response.ok) {
                // If we get 429 without JSON, it's just raw Rate Limit
                if (response.status === 429) {
                    throw new Error(data?.error || 'You are submitting too fast. Please wait 30 minutes.');
                }
                throw new Error(data?.error || `Failed to submit feedback (${response.status})`);
            }

            showAlert({ title: 'Sent!', message: 'Thank you for your feedback. Our team will review it shortly.' });
            setText('');
            setImages([]);
            setLogFiles([]);
            fetchFeed(deviceId, username);
        } catch (error: any) {
            console.error('Feedback error:', error);
            showAlert({ title: 'Submission Failed', message: error.message, isDanger: true });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ padding: '40px 60px', maxWidth: '800px' }}>
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
                style={{ marginBottom: '40px' }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
                    {/* <Bug size={32} color="rgba(59, 130, 246, 0.8)" /> */}
                    <div>
                        <h1 style={{ 
                            fontSize: '44px', 
                            fontWeight: 800, 
                            fontFamily: "'Inter', sans-serif",
                            backgroundImage: 'linear-gradient(90deg, #fff 0%, #0078d4 50%, #fff 100%)', 
                            backgroundSize: '200% 100%',
                            WebkitBackgroundClip: 'text', 
                            WebkitTextFillColor: 'transparent', 
                            marginBottom: '4px', 
                            letterSpacing: '-0.02em',
                            lineHeight: 1.2
                        }}>
                            Feedback & Bug Reports
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '16px', fontWeight: 500 }}>
                            Help us improve ColorWall by reporting bugs or requesting new features.
                        </p>
                    </div>
                </div>
            </motion.div>

            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '32px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '24px'
                }}
            >
                <div>
                    <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                        Description
                    </label>
                    <textarea
                        style={{
                            width: '100%',
                            height: '160px',
                            background: 'rgba(0, 0, 0, 0.2)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            padding: '16px',
                            color: 'white',
                            fontSize: '15px',
                            fontWeight: 500,
                            outline: 'none',
                            resize: 'none',
                            fontFamily: 'inherit',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'}
                        onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                        placeholder="Please describe exactly what happened or what feature you would like to see..."
                        value={text}
                        maxLength={2000}
                        onChange={(e) => setText(e.target.value)}
                    />
                    <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                        {text.length}/2000
                    </div>
                </div>

                <div>
                    <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                        Attachments (Optional)
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                        {images.map((file, idx) => (
                            <div key={idx} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={URL.createObjectURL(file)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <button
                                    onClick={() => removeImage(idx)}
                                    style={{
                                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', opacity: 0, transition: 'opacity 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                                >
                                    <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>Remove</span>
                                </button>
                            </div>
                        ))}
                        
                        {logFiles.map((file, idx) => (
                            <div key={`log-${idx}`} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', overflow: 'hidden' }}>
                                <FileText size={24} style={{ marginBottom: '8px' }} />
                                <span style={{ fontSize: '10px', padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
                                    {file.name}
                                </span>
                                <button
                                    onClick={() => removeLog(idx)}
                                    style={{
                                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', opacity: 0, transition: 'opacity 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}
                                >
                                    <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>Remove</span>
                                </button>
                            </div>
                        ))}
                        
                        {images.length < 2 && (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                style={{ width: '80px', height: '80px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px dashed rgba(255, 255, 255, 0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.2s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; e.currentTarget.style.color = 'white'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                            >
                                <ImageIcon size={24} style={{ marginBottom: '6px' }} />
                                <span style={{ fontSize: '11px' }}>Add Image</span>
                            </button>
                        )}
                        
                        {logFiles.length < 5 && (
                            <button
                                onClick={() => logInputRef.current?.click()}
                                style={{ width: '80px', height: '80px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.03)', border: '1px dashed rgba(255, 255, 255, 0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.2s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; e.currentTarget.style.color = 'white'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                            >
                                <FileText size={24} style={{ marginBottom: '6px' }} />
                                <span style={{ fontSize: '11px' }}>Add Log</span>
                            </button>
                        )}
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" multiple style={{ display: 'none' }} />
                    <input type="file" ref={logInputRef} onChange={handleLogChange} accept=".txt,text/plain" multiple style={{ display: 'none' }} />
                </div>

                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '24px' }}>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                        <CheckCircle2 size={16} />
                        Submitting as <strong>{username}</strong> {appVersion && `(v${appVersion})`}
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || (!text.trim() && images.length === 0 && logFiles.length === 0)}
                        style={{
                            padding: '12px 24px',
                            background: isSubmitting || (!text.trim() && images.length === 0 && logFiles.length === 0) ? 'rgba(59, 130, 246, 0.3)' : 'var(--accent)',
                            borderRadius: '12px',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: isSubmitting || (!text.trim() && images.length === 0 && logFiles.length === 0) ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background 0.2s',
                            border: 'none'
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <RefreshCw size={16} style={{ animation: 'spin 1.5s linear infinite' }} />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send size={16} />
                                Submit Feedback
                            </>
                        )}
                    </button>
                </div>
            </motion.div>

            {/* My Feed Section */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                style={{ marginTop: '40px' }}
            >
                <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>My Threads</h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, marginBottom: '24px' }}>
                    View and reply to threads submitted from this device.
                </p>

                {feedLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                        <RefreshCw size={24} style={{ animation: 'spin 1.5s linear infinite', margin: '0 auto 12px' }} />
                        Syncing your threads...
                    </div>
                ) : feedData.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        You haven't submitted any feedback yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {feedData.map((group) => {
                            const mainItem = group.items[0];
                            return (
                                <div key={mainItem.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div>
                                            <div style={{ color: 'white', fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>{group.username}</div>
                                            <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', fontFamily: 'monospace' }}>
                                                {new Date(mainItem.createdAt).toLocaleString()} · {mainItem.appVersion ? `v${mainItem.appVersion}` : 'App'}
                                            </div>
                                        </div>
                                        <div style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                                            {group.source.toUpperCase()}
                                        </div>
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                                        {mainItem.text}
                                    </div>

                                    {mainItem.images && mainItem.images.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                                            {mainItem.images.map((imgUrl: string, i: number) => (
                                                <a key={i} href={imgUrl} target="_blank" rel="noreferrer" style={{ display: 'block', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={imgUrl} style={{ width: '120px', height: '120px', objectFit: 'cover' }} alt="attachment" />
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    {mainItem.logFiles && mainItem.logFiles.length > 0 && (
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                                            {mainItem.logFiles.map((log: any, i: number) => (
                                                <div key={i} style={{ padding: '8px 12px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', fontSize: '11px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <FileText size={14} />
                                                    {log.name}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {group.items.length > 1 && (
                                        <details style={{ marginTop: '16px' }}>
                                            <summary style={{ cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '12px', fontWeight: 600 }}>
                                                Show {group.items.length - 1} previous updates...
                                            </summary>
                                            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '16px', paddingLeft: '12px', borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                                                {group.items.slice(1).map((subItem) => (
                                                    <div key={subItem.id}>
                                                        <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '4px', fontFamily: 'monospace' }}>{new Date(subItem.createdAt).toLocaleString()}</div>
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontWeight: 500 }}>{subItem.text}</div>
                                                        
                                                        {subItem.images && subItem.images.length > 0 && (
                                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                                                                {subItem.images.map((imgUrl: string, i: number) => (
                                                                    <a key={i} href={imgUrl} target="_blank" rel="noreferrer" style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img src={imgUrl} style={{ width: '80px', height: '80px', objectFit: 'cover' }} alt="attachment sub" />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </details>
                                    )}

                                    {/* Replies */}
                                    {mainItem.replies && mainItem.replies.length > 0 && (
                                        <div style={{ marginTop: '20px', marginLeft: '16px', paddingLeft: '16px', borderLeft: '2px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {mainItem.replies.map((reply: any) => (
                                                <div key={reply.id} style={{ display: 'flex', gap: '12px' }}>
                                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px', color: '#60a5fa' }}>
                                                        {reply.username[0].toUpperCase()}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                            <span style={{ color: 'white', fontWeight: 600, fontSize: '13px' }}>{reply.username}</span>
                                                            <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>{new Date(reply.createdAt).toLocaleDateString()}</span>
                                                        </div>
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
                                                            {reply.text}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Reply Input Area */}
                                    <div style={{ marginTop: '20px' }}>
                                        {replyingTo === mainItem.id ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <textarea
                                                    style={{ width: '100%', height: '80px', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '12px', padding: '12px', color: 'white', fontSize: '13px', outline: 'none', resize: 'none' }}
                                                    placeholder="Write a reply..."
                                                    value={replyText}
                                                    onChange={(e) => setReplyText(e.target.value)}
                                                    autoFocus
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    <button onClick={() => { setReplyingTo(null); setReplyText(''); }} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                                                        Cancel
                                                    </button>
                                                    <button 
                                                        onClick={() => submitReply(mainItem.id)} 
                                                        disabled={!replyText.trim() || replyingSubmitting}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '8px', cursor: !replyText.trim() || replyingSubmitting ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 600, opacity: !replyText.trim() || replyingSubmitting ? 0.5 : 1 }}
                                                    >
                                                        {replyingSubmitting ? <RefreshCw size={14} style={{ animation: 'spin 1.5s linear infinite' }}/> : <Send size={14} />}
                                                        Submit
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => setReplyingTo(mainItem.id)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                                onMouseEnter={(e) => e.currentTarget.style.color = '#60a5fa'}
                                                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-tertiary)'}
                                            >
                                                <MessageSquare size={14} />
                                                Reply to thread
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
