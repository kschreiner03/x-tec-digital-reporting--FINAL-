import React from 'react';
import { CloseIcon } from './icons';

const APP_VERSION = '1.1.4';
const LAST_SEEN_VERSION_KEY = 'xtec_last_seen_version';

interface ReleaseNote {
    version: string;
    date: string;
    highlights: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
    {
        version: '1.1.4',
        date: 'February 2026',
        highlights: [
            'Preset wallpapers — choose a background photo for the landing page from the Settings menu',
            'Inline comments — select any text in a report to add anchored comments, replies, and resolutions',
            'Unsaved changes warning — you will now be prompted before leaving a report with unsaved work',
            'Auto-save — reports are automatically saved to Recent Projects at a configurable interval (Settings → Auto-Save)',
            'Spell check with 12 language options including French, Spanish, German, and more',
            'Text highlighting with 5 colors (Yellow, Green, Blue, Pink, Orange)',
            'Drag-to-reorder photos using grip handles',
            'Various bug fixes and performance improvements',
        ],
    },
];

/**
 * Only show What's New after an actual update has completed —
 * i.e. when a previous version was stored and differs from the current one.
 * On a fresh install (no stored version) we skip the popup and just record the version.
 */
export function shouldShowWhatsNew(): boolean {
    const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    if (lastSeen === null) {
        // First install — store the version silently, don't show popup
        localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
        return false;
    }
    return lastSeen !== APP_VERSION;
}

export function dismissWhatsNew(): void {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
}

interface WhatsNewModalProps {
    onClose: () => void;
}

const WhatsNewModal: React.FC<WhatsNewModalProps> = ({ onClose }) => {
    const handleClose = () => {
        dismissWhatsNew();
        onClose();
    };

    const currentRelease = RELEASE_NOTES.find(r => r.version === APP_VERSION);

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleClose}>
            <div
                className="xtec-modal-enter bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">What's New</h2>
                        {currentRelease && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">v{currentRelease.version} — {currentRelease.date}</p>
                        )}
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4 overflow-y-auto flex-1">

                    {/* Photo contest notification */}
                    <div className="mb-5 rounded-xl bg-[#007D8C]/10 border border-[#007D8C]/30 px-4 py-3">
                        <p className="text-sm font-semibold text-[#007D8C] dark:text-[#00bcd4]">📸 Coming This Field Season</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                            A photo contest is coming — each month's winning field photos will be featured directly in the app. Stay tuned!
                        </p>
                    </div>

                    {/* Feature list */}
                    {currentRelease ? (
                        <ul className="space-y-2">
                            {currentRelease.highlights.map((item, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    <span className="text-[#007D8C] mt-0.5 flex-shrink-0">&#x2022;</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">This update includes bug fixes and improvements.</p>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={handleClose}
                        className="w-full bg-[#007D8C] hover:bg-[#006670] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WhatsNewModal;
