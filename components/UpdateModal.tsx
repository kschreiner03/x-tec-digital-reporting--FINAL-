import React, { useEffect, useState } from 'react';
import { CloseIcon } from './icons';

type UpdateStage = 'available' | 'downloading' | 'ready' | 'installing';

interface UpdateModalProps {
    onClose: () => void;
    isDownloaded: boolean;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ onClose, isDownloaded }) => {
    const [stage, setStage] = useState<UpdateStage>(isDownloaded ? 'ready' : 'available');
    const stageRef = React.useRef(stage);
    stageRef.current = stage;

    // When the download finishes while the modal is open, advance to 'ready'
    // and auto-close after a short delay so the downloading animation goes away.
    // stage is intentionally read via ref so the timer isn't cancelled by the stage change.
    useEffect(() => {
        if (!isDownloaded) return;
        const wasDownloading = stageRef.current === 'downloading';
        setStage('ready');
        if (wasDownloading) {
            const timer = setTimeout(() => onClose(), 3000);
            return () => clearTimeout(timer);
        }
    }, [isDownloaded, onClose]);

    const handleDownloadNow = () => {
        if (isDownloaded) {
            // Already downloaded — go straight to install
            setStage('installing');
            setTimeout(() => {
                window.electronAPI?.installUpdateNow?.();
            }, 1500);
        } else {
            // Download is in progress (autoUpdater downloads automatically).
            // Show progress bar and wait for the 'update-downloaded' event.
            setStage('downloading');
        }
    };

    const handleDownloadLater = () => {
        window.electronAPI?.installUpdateLater?.();
        onClose();
    };

    const handleInstallNow = () => {
        setStage('installing');
        setTimeout(() => {
            window.electronAPI?.installUpdateNow?.();
        }, 1500);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div
                className="xtec-modal-enter bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        {/* Update icon */}
                        <div className="w-10 h-10 rounded-xl bg-[#007D8C]/10 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Update Available</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">A new version is ready to install</p>
                        </div>
                    </div>
                    {stage !== 'installing' && (
                        <button
                            onClick={handleDownloadLater}
                            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <CloseIcon className="h-5 w-5" />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="px-6 py-5">
                    {stage === 'available' && (
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                            A new version of X-Tec Digital Reporting is available. Would you like to download and install it now, or update later when you close the app?
                        </p>
                    )}

                    {stage === 'downloading' && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-600 dark:text-gray-300">Downloading update...</p>
                            {/* Indeterminate progress bar */}
                            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-[#007D8C] rounded-full animate-progress-indeterminate" />
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Please wait while the update downloads.</p>
                        </div>
                    )}

                    {stage === 'ready' && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Download complete!</p>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                The update is ready to install. Click "Install Now" to restart the app, or "Later" to apply it next time you close the app.
                            </p>
                        </div>
                    )}

                    {stage === 'installing' && (
                        <div className="space-y-3 text-center py-2">
                            {/* Spinner */}
                            <div className="flex justify-center">
                                <svg className="animate-spin h-8 w-8 text-[#007D8C]" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">App will reload — please wait...</p>
                        </div>
                    )}
                </div>

                {/* Footer buttons */}
                {stage !== 'installing' && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
                        {stage === 'available' && (
                            <>
                                <button
                                    onClick={handleDownloadLater}
                                    className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2.5 px-4 rounded-lg transition-colors"
                                >
                                    Download Later
                                </button>
                                <button
                                    onClick={handleDownloadNow}
                                    className="flex-1 bg-[#007D8C] hover:bg-[#006670] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                                >
                                    Download Now
                                </button>
                            </>
                        )}

                        {stage === 'downloading' && (
                            <button
                                onClick={handleDownloadLater}
                                className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2.5 px-4 rounded-lg transition-colors"
                            >
                                Download Later
                            </button>
                        )}

                        {stage === 'ready' && (
                            <>
                                <button
                                    onClick={handleDownloadLater}
                                    className="flex-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2.5 px-4 rounded-lg transition-colors"
                                >
                                    Later
                                </button>
                                <button
                                    onClick={handleInstallNow}
                                    className="flex-1 bg-[#007D8C] hover:bg-[#006670] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                                >
                                    Install Now
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Indeterminate progress bar animation */}
            <style>{`
                @keyframes progress-indeterminate {
                    0% { transform: translateX(-100%); width: 40%; }
                    50% { transform: translateX(60%); width: 60%; }
                    100% { transform: translateX(250%); width: 40%; }
                }
                .animate-progress-indeterminate {
                    animation: progress-indeterminate 1.8s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
};

export default UpdateModal;
