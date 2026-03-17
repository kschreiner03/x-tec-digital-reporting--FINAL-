
import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, TrashIcon } from './icons';
import { clearDatabase } from './db';
import { useTheme } from './ThemeContext';
import SafeImage, { getAssetUrl } from './SafeImage';
import ConfirmModal from './ConfirmModal';
import { toast } from './Toast';

interface SettingsModalProps {
    onClose: () => void;
}

// Common spell check language options
const SPELL_CHECK_LANGUAGES = [
    { code: 'en-US', name: 'English (US)' },
    { code: 'en-CA', name: 'English (Canada)' },
    { code: 'en-GB', name: 'English (UK)' },
    { code: 'en-AU', name: 'English (Australia)' },
    { code: 'fr-FR', name: 'French (France)' },
    { code: 'fr-CA', name: 'French (Canada)' },
    { code: 'es-ES', name: 'Spanish (Spain)' },
    { code: 'es-MX', name: 'Spanish (Mexico)' },
    { code: 'de-DE', name: 'German' },
    { code: 'pt-BR', name: 'Portuguese (Brazil)' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'nl-NL', name: 'Dutch' },
];

const LANDING_PHOTO_PRESET_KEY = 'xtec_landing_photo_preset';

interface PresetWallpaper {
    fileName: string;
    label: string;
}

const PRESET_WALLPAPERS: PresetWallpaper[] = [
    { fileName: 'landscape.JPG', label: 'Oil Field' },
    { fileName: 'bison1.jpg', label: 'Bison' },
    { fileName: 'wallpaper/116911439_10223823748248481_4788712539515562122_o - Copy.jpg', label: 'Lake Sunset' },
    { fileName: 'wallpaper/bison rock - Copy.jpg', label: 'Prairie' },
    { fileName: 'wallpaper/Breeding Bird Surveys_CL.jpg', label: 'Yellow Warbler' },
    { fileName: 'wallpaper/common nighthawk - Copy.JPG', label: 'Nighthawk' },
    { fileName: 'wallpaper/DJI_0041.JPG', label: 'Aerial' },
    { fileName: 'wallpaper/IMG_0009_CL.jpg', label: 'Wildflowers' },
    { fileName: 'wallpaper/IMG_0283.JPG', label: 'Sinkhole' },
    { fileName: 'wallpaper/Owl.jpg', label: 'Great Grey Owl' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('general');
    // Pre-resolve all wallpaper URLs immediately on mount so images are ready by the time
    // the entrance animation finishes (160ms). Uses the SafeImage module cache on re-opens.
    const [wallpaperUrls, setWallpaperUrls] = useState<Record<string, string>>({});
    useEffect(() => {
        Promise.all(
            PRESET_WALLPAPERS.map(p => getAssetUrl(p.fileName).then(url => [p.fileName, url] as const))
        ).then(entries => setWallpaperUrls(Object.fromEntries(entries)));
    }, []);
    const [usageEstimate, setUsageEstimate] = useState<string | null>(null);
    const [quotaEstimate, setQuotaEstimate] = useState<string | null>(null);
    const [isClearing, setIsClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [defaults, setDefaults] = useState({ defaultProponent: '', defaultMonitor: '' });
    const [spellCheckLanguages, setSpellCheckLanguages] = useState<string[]>(['en-US', 'en-CA']);
    const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
    const [spellCheckSaved, setSpellCheckSaved] = useState(false);
    const AUTOSAVE_INTERVAL_KEY = 'xtec_autosave_interval';
    const [autosaveInterval, setAutosaveInterval] = useState<number>(() => parseInt(localStorage.getItem(AUTOSAVE_INTERVAL_KEY) || '30'));
    const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
    const [profilePicture, setProfilePicture] = useState<string | null>(() => localStorage.getItem('xtec_profile_picture'));
    const [username, setUsername] = useState('User');
    const profileInputRef = useRef<HTMLInputElement>(null);
    const { theme, setTheme } = useTheme();

    const hasActivePhoto = !!selectedPreset;

    useEffect(() => {
        const checkStorage = async () => {
            if (navigator.storage && navigator.storage.estimate) {
                try {
                    const estimate = await navigator.storage.estimate();
                    
                    // Check type explicitly because 0 is a valid number but falsy in boolean checks
                    if (typeof estimate.usage === 'number') {
                        setUsageEstimate((estimate.usage / (1024 * 1024)).toFixed(2));
                    } else {
                        setUsageEstimate('Unknown');
                    }

                    if (typeof estimate.quota === 'number') {
                        setQuotaEstimate((estimate.quota / (1024 * 1024)).toFixed(2));
                    }
                } catch (error) {
                    console.error("Failed to estimate storage:", error);
                    setUsageEstimate('Error');
                }
            } else {
                setUsageEstimate('N/A');
            }
        };
        checkStorage();

        // Load username
        try {
            const electronAPI = (window as any).electronAPI;
            if (electronAPI?.getUserInfo) {
                const info = electronAPI.getUserInfo();
                if (info?.username) setUsername(info.username);
            }
        } catch (e) { /* ignore */ }

        // Load defaults
        try {
            const savedSettings = localStorage.getItem('xtec_general_settings');
            if (savedSettings) {
                setDefaults(JSON.parse(savedSettings));
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        }

        // Load saved preset wallpaper
        const savedPreset = localStorage.getItem(LANDING_PHOTO_PRESET_KEY);
        if (savedPreset) {
            setSelectedPreset(savedPreset);
        }

        // Load spell check languages
        const loadSpellCheckSettings = async () => {
            const electronAPI = (window as any).electronAPI;

            // First, try to load saved preferences from localStorage
            const savedLanguages = localStorage.getItem('xtec_spellcheck_languages');
            if (savedLanguages && electronAPI?.setSpellCheckLanguages) {
                try {
                    const languages = JSON.parse(savedLanguages);
                    if (Array.isArray(languages) && languages.length > 0) {
                        await electronAPI.setSpellCheckLanguages(languages);
                        setSpellCheckLanguages(languages);
                    }
                } catch (e) {
                    console.error("Failed to restore spell check languages", e);
                }
            } else if (electronAPI?.getSpellCheckLanguages) {
                // Fall back to getting current languages from Electron
                try {
                    const result = await electronAPI.getSpellCheckLanguages();
                    if (result.success && result.languages) {
                        setSpellCheckLanguages(result.languages);
                    }
                } catch (e) {
                    console.error("Failed to load spell check languages", e);
                }
            }

            // Load available languages
            if (electronAPI?.getAvailableSpellCheckLanguages) {
                try {
                    const result = await electronAPI.getAvailableSpellCheckLanguages();
                    if (result.success && result.languages) {
                        setAvailableLanguages(result.languages);
                    }
                } catch (e) {
                    console.error("Failed to load available spell check languages", e);
                }
            }
        };
        loadSpellCheckSettings();
    }, []);

    const handleClearData = () => setShowClearConfirm(true);

    const confirmClearData = async () => {
        setShowClearConfirm(false);
        setIsClearing(true);
        try {
            await clearDatabase();
            localStorage.removeItem('xtec_recent_projects');
            toast('Storage cleared. Reloading…', 'success');
            setTimeout(() => window.location.reload(), 1200);
        } catch (e) {
            console.error("Failed to clear storage:", e);
            toast('An error occurred while clearing storage. Please restart the app manually.', 'error');
            setIsClearing(false);
        }
    };

    const handleDefaultChange = (field: string, value: string) => {
        const newDefaults = { ...defaults, [field]: value };
        setDefaults(newDefaults);
        localStorage.setItem('xtec_general_settings', JSON.stringify(newDefaults));
    };

    const handleAutosaveIntervalChange = (seconds: number) => {
        setAutosaveInterval(seconds);
        localStorage.setItem(AUTOSAVE_INTERVAL_KEY, String(seconds));
    };

    const handleProfilePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            // Resize to 128x128 to keep localStorage small
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d')!;
                const size = Math.min(img.width, img.height);
                const sx = (img.width - size) / 2;
                const sy = (img.height - size) / 2;
                ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
                const resized = canvas.toDataURL('image/jpeg', 0.85);
                localStorage.setItem('xtec_profile_picture', resized);
                setProfilePicture(resized);
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
        if (profileInputRef.current) profileInputRef.current.value = '';
    };

    const handleRemoveProfilePicture = () => {
        localStorage.removeItem('xtec_profile_picture');
        setProfilePicture(null);
    };

    const handleRemoveLandingPhoto = () => {
        localStorage.removeItem(LANDING_PHOTO_PRESET_KEY);
        // Clean up any legacy custom photo / position / zoom keys
        localStorage.removeItem('xtec_landing_photo');
        localStorage.removeItem('xtec_landing_photo_position');
        localStorage.removeItem('xtec_landing_photo_zoom');
        setSelectedPreset(null);
    };

    const handleSelectPreset = (preset: PresetWallpaper) => {
        setSelectedPreset(preset.fileName);
        localStorage.setItem(LANDING_PHOTO_PRESET_KEY, preset.fileName);
        window.dispatchEvent(new CustomEvent('xtec-bg-photo-changed'));
    };

    const handleSpellCheckLanguageChange = async (langCode: string) => {
        console.log("Changing spell check language to:", langCode);
        const electronAPI = (window as any).electronAPI;
        if (!electronAPI?.setSpellCheckLanguages) {
            console.error("electronAPI.setSpellCheckLanguages not available");
            alert("Spell check API not available. Please restart the application.");
            return;
        }

        const newLanguages = [langCode];

        try {
            console.log("Calling setSpellCheckLanguages with:", newLanguages);
            const result = await electronAPI.setSpellCheckLanguages(newLanguages);
            console.log("setSpellCheckLanguages result:", result);
            if (result.success) {
                setSpellCheckLanguages(newLanguages);
                // Save to localStorage for persistence across sessions
                localStorage.setItem('xtec_spellcheck_languages', JSON.stringify(newLanguages));
                // Show saved indicator
                setSpellCheckSaved(true);
                setTimeout(() => setSpellCheckSaved(false), 2000);
                console.log("Spell check language changed successfully to:", langCode);
            } else {
                console.error("Failed to set spell check language:", result.error);
                alert("Failed to change spell check language. The language dictionary may not be available.");
            }
        } catch (e) {
            console.error("Failed to set spell check language", e);
            alert("Error changing spell check language: " + (e as Error).message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="xtec-modal-enter bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl h-[600px] flex flex-col overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Settings</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition-colors" aria-label="Close settings">
                        <CloseIcon className="h-8 w-8" />
                    </button>
                </div>
                <div className="flex flex-grow overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-1/4 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-4">
                        <nav className="space-y-2">
                            <button
                                onClick={() => setActiveTab('general')}
                                className={`w-full text-left px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'general' ? 'bg-[#007D8C] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                            >
                                General
                            </button>
                             <button
                                onClick={() => setActiveTab('data')}
                                className={`w-full text-left px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'data' ? 'bg-[#007D8C] text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'}`}
                            >
                                Data Management
                            </button>
                        </nav>
                    </div>

                    {/* Content Area */}
                    <div className="w-3/4 p-8 overflow-y-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                        {activeTab === 'general' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Profile</h3>
                                    <div className="flex items-center gap-5">
                                        <div className="relative group">
                                            {profilePicture ? (
                                                <img
                                                    src={profilePicture}
                                                    alt="Profile"
                                                    className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                                                />
                                            ) : (
                                                <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-xl font-bold border-2 border-gray-200 dark:border-gray-600">
                                                    {username.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-base font-medium text-gray-800 dark:text-gray-200">{username}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Displayed on comments and replies.</p>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => profileInputRef.current?.click()}
                                                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                >
                                                    {profilePicture ? 'Change Photo' : 'Upload Photo'}
                                                </button>
                                                {profilePicture && (
                                                    <button
                                                        onClick={handleRemoveProfilePicture}
                                                        className="px-3 py-1.5 text-xs font-medium rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>
                                            <input
                                                ref={profileInputRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handleProfilePictureUpload}
                                                className="hidden"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Appearance</h3>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="block text-base font-medium text-gray-700 dark:text-gray-300">Theme</span>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Choose your preferred appearance.</span>
                                        </div>
                                        <select
                                            value={theme}
                                            onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
                                            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#007D8C]"
                                        >
                                            <option value="light">Light</option>
                                            <option value="dark">Dark</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Landing Page Background</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                        Choose a preset wallpaper for the landing page background.
                                    </p>

                                    {/* Preset wallpaper grid */}
                                    <div className="grid grid-cols-5 gap-2 mb-3">
                                        {PRESET_WALLPAPERS.map((preset) => {
                                            const isSelected = selectedPreset === preset.fileName;
                                            return (
                                                <button
                                                    key={preset.fileName}
                                                    onClick={() => handleSelectPreset(preset)}
                                                    className={`relative rounded-lg overflow-hidden border-2 transition-[border-color,box-shadow] duration-150 group focus:outline-none ${
                                                        isSelected
                                                            ? 'border-[#007D8C] ring-1 ring-[#007D8C]/30'
                                                            : 'border-gray-200 dark:border-gray-600 hover:border-[#007D8C]/40'
                                                    }`}
                                                    style={{ aspectRatio: '16/9' }}
                                                    title={preset.label}
                                                >
                                                    {wallpaperUrls[preset.fileName] && (
                                                        <img
                                                            src={wallpaperUrls[preset.fileName]}
                                                            alt={preset.label}
                                                            className="w-full h-full object-cover"
                                                            draggable={false}
                                                        />
                                                    )}
                                                    <div className={`absolute inset-0 flex items-end justify-center pb-1 bg-gradient-to-t from-black/50 to-transparent ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                                                        <span className="text-[10px] font-medium text-white drop-shadow-sm">{preset.label}</span>
                                                    </div>
                                                    {isSelected && (
                                                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#007D8C] flex items-center justify-center">
                                                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {hasActivePhoto && (
                                        <button
                                            onClick={() => {
                                                handleRemoveLandingPhoto();
                                                window.dispatchEvent(new CustomEvent('xtec-bg-photo-changed'));
                                            }}
                                            className="text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
                                        >
                                            Reset to Default
                                        </button>
                                    )}
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Spell Check</h3>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <span className="block text-base font-medium text-gray-700 dark:text-gray-300">Language</span>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Select the language for spell checking.</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {spellCheckSaved && (
                                                <span className="text-sm text-green-600 dark:text-green-400 font-medium">Saved!</span>
                                            )}
                                            <select
                                                value={spellCheckLanguages[0] || 'en-US'}
                                                onChange={(e) => handleSpellCheckLanguageChange(e.target.value)}
                                                className="w-48 p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition cursor-pointer"
                                            >
                                                {SPELL_CHECK_LANGUAGES.map((lang) => {
                                                    const isAvailable = availableLanguages.length === 0 || availableLanguages.includes(lang.code);
                                                    return (
                                                        <option
                                                            key={lang.code}
                                                            value={lang.code}
                                                            disabled={!isAvailable}
                                                        >
                                                            {lang.name}{!isAvailable ? ' (unavailable)' : ''}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                        Changes apply to new text. Restart the app if spell check doesn't update.
                                    </p>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Auto-Save</h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="block text-base font-medium text-gray-700 dark:text-gray-300">Save Interval</span>
                                                <span className="text-sm text-gray-500 dark:text-gray-400">How often to auto-save while a report has unsaved changes.</span>
                                            </div>
                                            <select
                                                value={autosaveInterval}
                                                onChange={(e) => handleAutosaveIntervalChange(parseInt(e.target.value))}
                                                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#007D8C]"
                                            >
                                                <option value={15}>15 seconds</option>
                                                <option value={30}>30 seconds</option>
                                                <option value={60}>1 minute</option>
                                                <option value={120}>2 minutes</option>
                                                <option value={300}>5 minutes</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Default Values</h3>
                                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                                        Enter values here to automatically pre-fill new reports. This saves you from typing the same information every time.
                                    </p>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Default Proponent</label>
                                            <input 
                                                type="text" 
                                                value={defaults.defaultProponent}
                                                onChange={(e) => handleDefaultChange('defaultProponent', e.target.value)}
                                                className="w-full p-2 border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition-[border-color,box-shadow]"
                                                placeholder="e.g., Cenovus, CNRL"
                                            />
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used in Photo Logs and Standard DFRs.</p>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Default Monitor Name</label>
                                            <input 
                                                type="text" 
                                                value={defaults.defaultMonitor}
                                                onChange={(e) => handleDefaultChange('defaultMonitor', e.target.value)}
                                                className="w-full p-2 border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition-[border-color,box-shadow]"
                                                placeholder="e.g., John Doe"
                                            />
                                             <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Used in DFRs.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'data' && (
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b dark:border-gray-700 pb-2">Storage & Data</h3>
                                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                                        The application stores your recent projects and photos locally in this browser to allow for quick access and offline capability. 
                                        If you are running low on disk space or experiencing performance issues, you can clear this data.
                                    </p>
                                    
                                    <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 p-4 mb-6">
                                        <div className="flex">
                                            <div className="flex-shrink-0">
                                                <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <div className="ml-3">
                                                <p className="text-sm text-blue-700 dark:text-blue-300">
                                                    Current Estimated Usage: <strong>{usageEstimate !== null ? `${usageEstimate} MB` : 'Calculating...'}</strong>
                                                    {quotaEstimate && ` / ${quotaEstimate} MB available`}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t dark:border-gray-700 pt-6">
                                    <h4 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Danger Zone</h4>
                                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                        <h5 className="font-bold text-red-800 dark:text-red-300 mb-1">Clear All Local Data</h5>
                                        <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                                            This action will delete all projects from the "Recent Projects" list and remove all cached photos from the application's internal database.
                                            <br/><br/>
                                            <strong>Note:</strong> This will NOT delete any <code>.plog</code>, <code>.dfr</code>, or <code>.spdfr</code> files you have manually saved to your computer's hard drive.
                                        </p>
                                        <button
                                            onClick={handleClearData}
                                            disabled={isClearing}
                                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                                        >
                                            {isClearing ? (
                                                 <span>Clearing...</span>
                                            ) : (
                                                <>
                                                    <TrashIcon className="h-5 w-5" />
                                                    <span>Clear Recent Projects & Photos</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {showClearConfirm && (
                <ConfirmModal
                    title="Clear all data?"
                    message="All recent projects and photos will be permanently deleted. Files already saved to your computer will NOT be affected. This action cannot be undone."
                    confirmLabel="Clear All"
                    destructive
                    onConfirm={confirmClearData}
                    onCancel={() => setShowClearConfirm(false)}
                />
            )}
        </div>
    );
};

export default SettingsModal;
