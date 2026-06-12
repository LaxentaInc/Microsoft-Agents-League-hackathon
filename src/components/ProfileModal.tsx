import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, User } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNameChanged?: (newName: string) => void;
}

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
};

const modalVariants = {
    hidden: { scale: 0.98, opacity: 0 },
    visible: { scale: 1, opacity: 1 },
    exit: { scale: 0.98, opacity: 0 }
};

export default function ProfileModal({ isOpen, onClose, onNameChanged }: ProfileModalProps) {
    const [displayName, setDisplayName] = React.useState('');
    const [systemName, setSystemName] = React.useState('');
    const [saving, setSaving] = React.useState(false);

    React.useEffect(() => {
        if (isOpen) {
            loadProfile();
        }
    }, [isOpen]);

    const loadProfile = async () => {
        try {
            const sysName: string = await invoke('get_username');
            const result: any = await invoke('get_settings');
            if (result.success && result.settings) {
                setDisplayName(result.settings.displayName || '');
                setSystemName(result.settings.displayName || sysName);
            } else {
                setSystemName(sysName);
            }
        } catch (error) {
            console.error('Failed to load profile:', error);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const result: any = await invoke('get_settings');
            if (result.success && result.settings) {
                const settings = result.settings;
                settings.displayName = displayName.trim() || null;

                const saveResult: any = await invoke('save_settings', { settings });
                if (saveResult.success) {
                    if (onNameChanged) {
                        onNameChanged(displayName.trim() || systemName);
                    }
                    onClose();
                }
            }
        } catch (error) {
            console.error('Failed to save profile:', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        variants={backdropVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 bg-black/40 backdrop-blur-md"
                        onClick={onClose}
                    />

                    <motion.div
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                        className="relative w-full max-w-md overflow-hidden rounded-xl"
                        style={{
                            background: 'rgba(28, 28, 32, 0.95)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                        }}
                    >
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-6">
                                <div
                                    style={{
                                        width: '56px',
                                        height: '56px',
                                        borderRadius: '50%',
                                        background: 'rgba(59, 130, 246, 0.15)',
                                        border: '1px solid rgba(59, 130, 246, 0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <User size={28} color="rgba(59, 130, 246, 0.8)" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-white">
                                        {systemName || 'User'}
                                    </h2>
                                    <p className="text-gray-400 text-sm">Hmm? Manage your username and stuff!</p>
                                </div>
                            </div>

                            <div className="mb-7">
                                <label className="block text-sm font-medium text-gray-300 mb-2">
                                    Display Name :D
                                </label>
                                <input
                                    type="text"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                    placeholder={systemName || "Enter display name..."}
                                    maxLength={30}
                                    className="w-full px-4 py-2.5 text-sm rounded-lg outline-none transition-colors duration-150"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1.5px solid rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = 'rgba(59, 130, 246, 0.5)'}
                                    onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Leave empty to use your system username! unless it's MY-PC lmao
                                </p>
                            </div>

                            <div className="flex items-center justify-right gap-3">
                                {/* <button
                                    onClick={onClose}
                                    disabled={saving}
                                    className="px-5 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-150 disabled:opacity-50 rounded-lg"
                                    style={{
                                        border: '1px solid rgba(255, 255, 255, 0.1)'
                                    }}
                                >
                                    Cancel
                                </button> */}
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-5 py-2 text-sm font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    style={{
                                        background: saving ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.15)',
                                        border: '1px solid rgba(59, 130, 246, 0.4)',
                                        color: '#60a5fa'
                                    }}
                                    onMouseEnter={(e) => !saving && (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)')}
                                    onMouseLeave={(e) => !saving && (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)')}
                                >
                                    {saving ? (
                                        <>
                                            <div
                                                style={{
                                                    width: '14px',
                                                    height: '14px',
                                                    border: '2px solid rgba(96, 165, 250, 0.3)',
                                                    borderTop: '2px solid #60a5fa',
                                                    borderRadius: '50%',
                                                    animation: 'spin 0.8s linear infinite',
                                                }}
                                            />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save size={14} />
                                            Save
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={onClose}
                                    disabled={saving}
                                    className="px-5 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-150 disabled:opacity-50 rounded-lg"
                                    style={{
                                        border: '1px solid rgba(255, 255, 255, 0.1)'
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}