import React from 'react';

interface ConfirmModalProps {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    onConfirm,
    onCancel,
}) => (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
        <div
            className="relative rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"
            style={{
                background: document.documentElement.classList.contains('dark')
                    ? 'rgba(28,32,36,0.98)'
                    : 'rgba(255,255,255,0.98)',
                border: document.documentElement.classList.contains('dark')
                    ? '1px solid rgba(255,255,255,0.08)'
                    : '1px solid rgba(0,0,0,0.08)',
            }}
        >
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{title}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">{message}</p>
            <div className="flex justify-end gap-3">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    {cancelLabel}
                </button>
                <button
                    onClick={onConfirm}
                    className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${
                        destructive
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-[#007D8C] hover:bg-[#006b7a]'
                    }`}
                >
                    {confirmLabel}
                </button>
            </div>
        </div>
    </div>
);

export default ConfirmModal;
