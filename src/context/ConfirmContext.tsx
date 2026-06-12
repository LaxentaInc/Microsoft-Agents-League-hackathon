import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ConfirmModal from '../components/confirmMod';

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
}

interface AlertOptions {
    title: string;
    message: string;
    buttonText?: string;
    isDanger?: boolean;
}

interface ConfirmContextType {
    showConfirm: (options: ConfirmOptions) => Promise<boolean>;
    showAlert: (options: AlertOptions) => Promise<void>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export const useConfirm = () => {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
    return ctx;
};

export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [modalProps, setModalProps] = useState<{
        title: string;
        message: string;
        confirmText: string;
        cancelText: string;
        isDanger: boolean;
        hideConfirm: boolean;
    }>({
        title: '',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        isDanger: false,
        hideConfirm: false,
    });

    // resolver ref to resolve the promise when user clicks confirm/cancel
    const resolverRef = useRef<((value: boolean) => void) | null>(null);

    const showConfirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            resolverRef.current = resolve;
            setModalProps({
                title: options.title,
                message: options.message,
                confirmText: options.confirmText || 'Confirm',
                cancelText: options.cancelText || 'Cancel',
                isDanger: options.isDanger ?? false,
                hideConfirm: false,
            });
            setIsOpen(true);
        });
    }, []);

    const showAlert = useCallback((options: AlertOptions): Promise<void> => {
        return new Promise((resolve) => {
            resolverRef.current = () => resolve();
            setModalProps({
                title: options.title,
                message: options.message,
                confirmText: options.buttonText || 'OK',
                cancelText: '',
                isDanger: options.isDanger ?? false,
                hideConfirm: false,
            });
            setIsOpen(true);
        });
    }, []);

    const handleConfirm = useCallback(() => {
        setIsOpen(false);
        resolverRef.current?.(true);
        resolverRef.current = null;
    }, []);

    const handleCancel = useCallback(() => {
        setIsOpen(false);
        resolverRef.current?.(false);
        resolverRef.current = null;
    }, []);

    return (
        <ConfirmContext.Provider value={{ showConfirm, showAlert }}>
            {children}
            <ConfirmModal
                isOpen={isOpen}
                title={modalProps.title}
                message={modalProps.message}
                confirmText={modalProps.confirmText}
                cancelText={modalProps.cancelText || 'Cancel'}
                isDanger={modalProps.isDanger}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </ConfirmContext.Provider>
    );
};
