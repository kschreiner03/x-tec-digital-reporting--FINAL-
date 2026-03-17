import React, { useState, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
}

let _nextId = 0;

/** Call this from anywhere — no React context needed. */
export const toast = (message: string, type: ToastType = 'success') => {
    window.dispatchEvent(
        new CustomEvent('xtec-toast', { detail: { id: ++_nextId, message, type } })
    );
};

const ICONS: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: 'i',
};

const COLORS: Record<ToastType, string> = {
    success: 'bg-[#007D8C]',
    error: 'bg-red-500',
    info: 'bg-gray-700 dark:bg-gray-600',
};

const DURATION_MS = 2800;

export const ToastContainer: React.FC = () => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    useEffect(() => {
        const handler = (e: Event) => {
            const { id, message, type } = (e as CustomEvent<ToastItem>).detail;
            setToasts(prev => [...prev, { id, message, type }]);
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, DURATION_MS);
        };
        window.addEventListener('xtec-toast', handler);
        return () => window.removeEventListener('xtec-toast', handler);
    }, []);

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[600] flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div
                    key={t.id}
                    className={`xtec-toast flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium text-white max-w-xs ${COLORS[t.type]}`}
                >
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {ICONS[t.type]}
                    </span>
                    {t.message}
                </div>
            ))}
        </div>
    );
};
