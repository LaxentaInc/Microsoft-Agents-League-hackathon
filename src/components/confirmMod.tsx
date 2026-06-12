import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    isLoading?: boolean;
    hideButtons?: boolean;
    noBlur?: boolean;
    onConfirm?: () => void;
    onCancel: () => void;
}

const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
};

const modalVariants = {
    hidden: {
        scale: 0.96,
        opacity: 0,
        y: 8
    },
    visible: {
        scale: 1,
        opacity: 1,
        y: 0
    },
    exit: {
        scale: 0.96,
        opacity: 0,
        y: 8
    }
};

const transition = {
    duration: 0.15,
    ease: [0.4, 0, 0.2, 1] as const // easing for smooth motion (cubic-bezier)
};

const ConfirmModal: React.FC<ConfirmModalProps> = React.memo(({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDanger = false,
    isLoading = false,
    hideButtons = false,
    noBlur = false,
    onConfirm,
    onCancel
}) => {
    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        variants={backdropVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={transition}
                        className={`absolute inset-0 bg-black/40 ${!noBlur ? 'backdrop-blur-md' : ''}`}
                        onClick={onCancel}
                    />

                    <motion.div
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        transition={transition}
                        className="relative w-full max-w-md overflow-hidden rounded-2xl"
                        style={{
                            background: 'rgba(22, 22, 24, 0.98)',
                            backdropFilter: noBlur ? 'none' : 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                    >
                        <div className="p-6">
                            <div className="flex items-start gap-4 mb-6">
                                <AlertTriangle
                                    className="w-6 h-6 flex-shrink-0 mt-0.5"
                                    style={{ color: isDanger ? '#ef4444' : '#3b82f6' }}
                                />
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
                                    <p className="text-gray-300 text-sm leading-relaxed opacity-70">
                                        {message}
                                    </p>
                                </div>
                            </div>

                            {!hideButtons && (
                                <div className="flex items-center justify-start gap-3 pl-10">
                                    <button
                                        onClick={onConfirm || onCancel}
                                        disabled={isLoading}
                                        className="px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{
                                            background: isDanger
                                                ? 'rgba(239, 68, 68, 0.16)'
                                                : 'rgba(59, 130, 246, 0.15)',
                                            border: `1px solid ${isDanger ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
                                            color: isDanger ? '#ef4444' : '#3b82f6'
                                        }}
                                    >
                                        {isLoading ? 'Processing...' : confirmText}
                                    </button>
                                    <button
                                        onClick={onCancel}
                                        disabled={isLoading}
                                        className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-all duration-100 disabled:opacity-50 rounded-lg"
                                        style={{
                                            border: '1px solid rgba(255, 255, 255, 0.15)'
                                        }}
                                    >
                                        {cancelText}
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
});

ConfirmModal.displayName = 'ConfirmModal';

export default ConfirmModal;
