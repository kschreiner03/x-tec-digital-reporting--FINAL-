
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StandardDfrIcon, CameraIcon, SaskPowerIcon, SearchIcon, FolderOpenIcon, EllipsisVerticalIcon, DocumentDuplicateIcon } from './icons';
import ConfirmModal from './ConfirmModal';
import { AppType } from '../App';
import { deleteImage, deleteProject, deleteThumbnail, retrieveProject } from './db';
import SafeImage, { getAssetUrl } from './SafeImage';
import WhatsNewModal from './WhatsNewModal';
import { safeSet } from './safeStorage';

// Photo contest credits — only contest-winning photos get credit overlays
const PHOTO_CREDITS: Record<string, { photographer: string; caption: string }> = {
    // Add entries here as contest photos are added to the preset wallpapers
    // e.g. 'wallpaper/contest-2026.jpg': { photographer: 'Sarah Jimmy – Thunderchild FN', caption: '2026 X-TEC Photo Contest Winner' },
};

const PhotoCredit: React.FC<{ fileName: string | null }> = ({ fileName }) => {
    if (!fileName) return null;
    const credit = PHOTO_CREDITS[fileName];
    if (!credit) return null;
    return (
        <div className="fixed bottom-6 right-6 z-10 landing-fade-in text-right pointer-events-none select-none">
            <p className="text-xs text-white font-medium drop-shadow-md">{credit.caption}</p>
            <p className="text-[11px] text-white/80 drop-shadow-md">Photo: {credit.photographer}</p>
        </div>
    );
};

export type ProjectStatus = 'draft' | 'review' | 'final' | 'submitted';

export interface RecentProject {
    type: AppType;
    name: string;
    projectNumber: string;
    timestamp: number; // Used as project ID
    folder?: string;
    status?: ProjectStatus;
}

interface LandingPageProps {
  onSelectApp: (app: AppType) => void;
  onOpenProject: (project: RecentProject) => void;
  showWhatsNew: boolean;
  onCloseWhatsNew: () => void;
}

const RECENT_PROJECTS_KEY = 'xtec_recent_projects';
const MAX_RECENT_PROJECTS = 10;
const DISPLAY_SCALE_KEY = 'xtec_display_scale';

function getAutoScale(): number {
    // Use physical screen resolution for detection — more reliable than viewport height
    const h = window.screen.height * window.devicePixelRatio;
    if (h < 800)  return 0.60;
    if (h < 900)  return 0.65;
    if (h < 1000) return 0.72;
    if (h < 1080) return 0.78;
    if (h < 1200) return 0.84;
    if (h < 1440) return 0.90;
    if (h < 2160) return 1.00;
    return 1.08; // 4K+
}

function getEffectiveScale(stored: string | null): number {
    if (!stored || stored === 'auto') return getAutoScale();
    const n = parseFloat(stored);
    return isNaN(n) ? getAutoScale() : n;
}


const VALID_APP_TYPES = new Set<string>(['photoLog', 'dfrSaskpower', 'dfrStandard', 'combinedLog']);

const isValidProject = (obj: unknown): obj is RecentProject =>
    typeof obj === 'object' && obj !== null &&
    typeof (obj as Record<string, unknown>).timestamp === 'number' &&
    typeof (obj as Record<string, unknown>).name === 'string' &&
    typeof (obj as Record<string, unknown>).projectNumber === 'string' &&
    VALID_APP_TYPES.has((obj as Record<string, unknown>).type as string);

const getRecentProjects = (): RecentProject[] => {
    try {
        const projects = localStorage.getItem(RECENT_PROJECTS_KEY);
        if (!projects) return [];
        const parsed = JSON.parse(projects);
        return Array.isArray(parsed) ? parsed.filter(isValidProject) : [];
    } catch (e) {
        console.error("Failed to parse recent projects from localStorage", e);
        return [];
    }
};

const getReportTypeName = (type: AppType): string => {
    switch (type) {
        case 'photoLog':
            return 'Photographic Log';
        case 'dfrStandard':
            return 'Daily Field Report';
        case 'dfrSaskpower':
            return 'Sask Power Daily Field Report';
        case 'combinedLog':
            return 'Combine Logs';
        default:
            return 'Report';
    }
};


const AppSelectionCard: React.FC<{ title: string; description: string; icon: React.ReactNode; onClick: () => void; keepIconColor?: boolean; isDark?: boolean; }> = ({ title, description, icon, onClick, isDark }) => (
    <button
        onClick={onClick}
        className="p-3 sm:p-4 md:p-6 flex flex-col items-center text-center group h-full backdrop-blur-sm border border-[#007D8C] rounded-2xl xtec-card"
        style={isDark
            ? { background: 'rgba(28,32,36,0.75)', boxShadow: '0 0 24px rgba(0,125,140,0.10)' }
            : { background: 'rgba(255,255,255,0.75)', boxShadow: '0 0 24px rgba(0,125,140,0.18)' }
        }
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
        aria-label={`Select ${title}`}
    >
        <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl xtec-card-icon flex items-center justify-center mb-2 sm:mb-3 md:mb-4">
            <div className="text-[#007D8C] text-2xl">
                {icon}
            </div>
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1 group-hover:text-[#007D8C] transition-colors duration-200">{title}</h3>
        <p className="text-gray-600 dark:text-slate-300 text-xs leading-relaxed">{description}</p>
    </button>
);

const LandingPage: React.FC<LandingPageProps> = ({ onSelectApp, onOpenProject, showWhatsNew, onCloseWhatsNew }) => {
    const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [openMenuTimestamp, setOpenMenuTimestamp] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<RecentProject | null>(null);

    const [presetBgUrl, setPresetBgUrl] = useState<string | null>(null);
    const bgPosition = 'center 85%';
    const [recentCollapsed, setRecentCollapsed] = useState(true);
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
    const [displayScale, setDisplayScale] = useState<number>(() => getEffectiveScale(localStorage.getItem(DISPLAY_SCALE_KEY)));

    useEffect(() => {
        const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const handler = () => setDisplayScale(getEffectiveScale(localStorage.getItem(DISPLAY_SCALE_KEY)));
        window.addEventListener('xtec-display-scale-changed', handler);
        return () => window.removeEventListener('xtec-display-scale-changed', handler);
    }, []);

    useEffect(() => {
        // One-time cleanup: purge fake projects that were seeded during development
        if (!localStorage.getItem('xtec_fake_seed_cleared_v1')) {
            localStorage.removeItem(RECENT_PROJECTS_KEY);
            localStorage.setItem('xtec_fake_seed_cleared_v1', '1');
        }
        setRecentProjects(getRecentProjects());

        // Load preset wallpaper
        const savedPreset = localStorage.getItem('xtec_landing_photo_preset');
        if (savedPreset) {
            getAssetUrl(savedPreset).then(url => setPresetBgUrl(url));
        }

        // Initialize spell check languages from saved settings
        const initSpellCheck = async () => {
            const electronAPI = (window as any).electronAPI;
            const savedLanguages = localStorage.getItem('xtec_spellcheck_languages');
            if (savedLanguages && electronAPI?.setSpellCheckLanguages) {
                try {
                    const languages = JSON.parse(savedLanguages);
                    if (Array.isArray(languages) && languages.length > 0) {
                        await electronAPI.setSpellCheckLanguages(languages);
                    }
                } catch (e) {
                    console.error("Failed to initialize spell check languages", e);
                }
            }
        };
        initSpellCheck();

        // Listen for background photo changes from Settings
        const handleBgPhotoChanged = () => {
            const preset = localStorage.getItem('xtec_landing_photo_preset');
            if (preset) {
                getAssetUrl(preset).then(url => setPresetBgUrl(url));
            } else {
                setPresetBgUrl(null);
            }
        };
        window.addEventListener('xtec-bg-photo-changed', handleBgPhotoChanged);

        return () => {
            window.removeEventListener('xtec-bg-photo-changed', handleBgPhotoChanged);
        };
    }, []);

    // Close context menu when clicking outside
    useEffect(() => {
        if (!openMenuTimestamp) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenuTimestamp(null);
                setMenuPosition(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [openMenuTimestamp]);

    const handleToggleMenu = (e: React.MouseEvent<HTMLButtonElement>, timestamp: number) => {
        e.stopPropagation();
        if (openMenuTimestamp === timestamp) {
            setOpenMenuTimestamp(null);
            setMenuPosition(null);
        } else {
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
            setOpenMenuTimestamp(timestamp);
        }
    };


    const bgImgStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: bgPosition,
    };

    const filteredProjects = useMemo(() => {
        if (!searchTerm) {
            return recentProjects;
        }
        return recentProjects.filter(p =>
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.projectNumber.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, recentProjects]);

    const handleRemoveFromRecent = (timestamp: number) => {
        const updatedProjects = recentProjects.filter(p => p.timestamp !== timestamp);
        safeSet(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
        setRecentProjects(updatedProjects);
        setOpenMenuTimestamp(null);
    };

    const handleDeleteProject = (projectToDelete: RecentProject) => {
        setOpenMenuTimestamp(null);
        setMenuPosition(null);
        setConfirmDelete(projectToDelete);
    };

    const confirmDeleteProject = async (projectToDelete: RecentProject) => {
        setConfirmDelete(null);

        const updatedProjects = recentProjects.filter(p => p.timestamp !== projectToDelete.timestamp);
        safeSet(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));
        setRecentProjects(updatedProjects);

        try {
            const projectData = await retrieveProject(projectToDelete.timestamp);
            if (projectData?.photosData && Array.isArray(projectData.photosData)) {
                for (const photo of projectData.photosData) {
                    if (photo.imageId) {
                        await deleteImage(photo.imageId);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to retrieve project data for image deletion:", e);
        }

        try {
            await deleteProject(projectToDelete.timestamp);
        } catch(e) {
            console.error("Failed to delete project from DB:", e);
        }

        try {
            await deleteThumbnail(projectToDelete.timestamp);
        } catch(e) {
            console.error("Failed to delete thumbnail from DB:", e);
        }

        setOpenMenuTimestamp(null);
    };

    const projectsToShow = filteredProjects;


    return (
        <div className="relative h-screen overflow-hidden transition-colors duration-200 flex flex-col bg-white dark:bg-[#1a1a1a]">
            {/* Full-page background wallpaper */}
            {(() => {
                const activeSrc = presetBgUrl;
                const blurStyle = { filter: 'blur(24px) saturate(1.2)', transform: 'scale(1.15)', opacity: 0.5 };

                if (activeSrc) {
                    return (
                        <>
                            {/* Blurred fill layer */}
                            <img src={activeSrc} alt="" aria-hidden="true" className="fixed top-0 left-0 w-screen h-screen object-cover pointer-events-none" style={blurStyle} />
                            {/* Main image with slow zoom */}
                            <div className="fixed inset-0 landing-bg-zoom pointer-events-none overflow-hidden">
                                <img src={activeSrc} alt="Landing background" className="saturate-150 opacity-85 dark:opacity-70 transition-opacity duration-1000" style={bgImgStyle} />
                            </div>
                        </>
                    );
                }
                // Default: landscape.jpg via SafeImage
                return (
                    <>
                        <SafeImage fileName="landscape.jpg" alt="" className="fixed top-0 left-0 w-screen h-screen object-cover pointer-events-none" style={blurStyle} />
                        <div className="fixed inset-0 landing-bg-zoom pointer-events-none overflow-hidden">
                            <SafeImage fileName="landscape.jpg" alt="Oil field landscape" className="saturate-150 opacity-85 dark:opacity-70" style={bgImgStyle} />
                        </div>
                    </>
                );
            })()}
            {/* Bottom dark gradient overlay */}
            <div className="fixed inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none z-[1]" />
            {/* Subtle teal brand wash */}
            <div className="fixed inset-0 bg-[#007D8C]/[0.08] pointer-events-none z-[1]" />
            {/* Dark mode: extra full-width dark veil so the blur area outside the panel doesn't stand out */}
            <div className="hidden dark:block fixed inset-0 bg-black/35 pointer-events-none z-[1]" />
            {/* Photo credit overlay (contest photos only) */}
            <PhotoCredit fileName={localStorage.getItem('xtec_landing_photo_preset')} />
            {/* Invisible anchor for the menu bar */}
            <div className="h-0 w-full absolute top-0 left-0 z-0" />
            <main className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 relative z-10 flex-1 min-h-0 flex flex-col py-8 sm:py-10 lg:py-14 justify-end overflow-y-auto" style={{ zoom: displayScale }}>
                <div
                    className="rounded-3xl p-5 sm:p-6 md:p-8 lg:p-10 flex flex-col backdrop-blur-xl dark:backdrop-blur-none"
                    style={isDark ? {
                        background: 'linear-gradient(180deg, rgba(24,28,32,0.92) 0%, rgba(18,22,26,0.95) 100%)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 32px rgba(0,0,0,0.30)',
                    } : {
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(249,250,251,0.82) 100%)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                    }}
                >
                    <div className="text-center pb-4 sm:pb-6 md:pb-8 flex-shrink-0">
                        <div className="w-[10rem] sm:w-[12rem] md:w-[14rem] h-auto mx-auto mb-3 sm:mb-4 relative aspect-[14/4.375]">
                            <SafeImage
                                fileName="xterra-logo.png"
                                alt="X-TERRA Logo"
                                className="absolute inset-0 w-full h-full object-contain dark:hidden"
                            />
                            <SafeImage
                                fileName="xterra-white.png"
                                alt="X-TERRA Logo"
                                className="absolute inset-0 w-full h-full object-contain hidden dark:block"
                            />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-slate-200 bg-clip-text text-transparent md:text-4xl tracking-tight">
                            Create a New Report
                        </h1>
                        <p className="mt-2 text-sm text-gray-600 dark:text-slate-300 max-w-lg mx-auto">
                            Select a report type to begin a new project.
                        </p>
                        <div style={{ width: 80, height: 2, background: 'linear-gradient(90deg, #007D8C, rgba(0,125,140,0.25))', margin: '10px auto 0', borderRadius: 1 }} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
                        <div className="h-full">
                            <AppSelectionCard
                                title="Photo Log"
                                description="Create and edit photographic logs."
                                icon={<CameraIcon className="h-7 w-7" />}
                                onClick={() => onSelectApp('photoLog')}
                                isDark={isDark}
                            />
                        </div>
                        <div className="h-full">
                            <AppSelectionCard
                                title="Daily Field Report"
                                description="Standard DFR for project documentation."
                                icon={<StandardDfrIcon className="h-7 w-7" />}
                                onClick={() => onSelectApp('dfrStandard')}
                                isDark={isDark}
                            />
                        </div>
                        <div className="h-full">
                            <AppSelectionCard
                                title="SaskPower DFR"
                                description="DFR tailored for SaskPower projects."
                                icon={<SaskPowerIcon className="h-7 w-7" />}
                                onClick={() => onSelectApp('dfrSaskpower')}
                                keepIconColor
                                isDark={isDark}
                            />
                        </div>
                        <div className="h-full">
                            <AppSelectionCard
                                title="Combine Logs"
                                description="Merge photos from multiple reports."
                                icon={<DocumentDuplicateIcon className="h-7 w-7" />}
                                onClick={() => onSelectApp('combinedLog')}
                                isDark={isDark}
                            />
                        </div>
                    </div>

                    {/* Recent Projects - collapsible section */}
                    <div className="mt-4 pt-4 sm:mt-6 sm:pt-6 lg:mt-8 lg:pt-8 border-t border-gray-200/70 dark:border-white/10 flex flex-col">
                        <div className="flex items-center justify-between mb-2 flex-shrink-0">
                            <button
                                onClick={() => {
                                    const next = !recentCollapsed;
                                    setRecentCollapsed(next);
                                    localStorage.setItem('recentCollapsed', String(next));
                                }}
                                className="flex items-center gap-2 group"
                            >
                                <svg
                                    className={`h-5 w-5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${recentCollapsed ? '-rotate-90' : 'rotate-0'}`}
                                    fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                                <h2 className="text-lg font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-slate-200 bg-clip-text text-transparent group-hover:from-[#007D8C] group-hover:to-[#007D8C] transition-colors">
                                    Recent Projects
                                </h2>
                            </button>
                            {!recentCollapsed && filteredProjects.length > MAX_RECENT_PROJECTS && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                    {filteredProjects.length} projects
                                </span>
                            )}
                        </div>

                        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${recentCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
                        <div className="overflow-hidden">
                        <div className="mb-3 mt-2">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                    <SearchIcon className="text-gray-400 dark:text-gray-500 h-4 w-4" />
                                </div>
                                <input
                                    type="search"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search by project name or number..."
                                    className="block w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1e1e1e] border border-gray-200 dark:border-[#3d3d3d] rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#777] text-sm leading-5 outline-none focus:border-[#007D8C]/50 focus:ring-2 focus:ring-[#007D8C]/50"
                                />
                            </div>
                        </div>

                        <div className="overflow-y-auto rounded-lg border border-[#007D8C]/40" style={{ maxHeight: '256px', ...(isDark ? { background: 'rgba(28,32,36,0.75)', boxShadow: '0 0 32px rgba(0,125,140,0.10)' } : { background: 'rgba(255,255,255,0.75)', boxShadow: '0 0 32px rgba(0,125,140,0.18)' }) }}>
                        {filteredProjects.length > 0 ? (
                            <ul>
                                {projectsToShow.map((project, i) => (
                                    <li key={project.timestamp} className="relative group xtec-project-row">
                                        {i > 0 && <div className="mx-4 border-t border-gray-100 dark:border-[#3d3d3d]" />}
                                        <button onClick={() => onOpenProject(project)} className="w-full text-left block hover:bg-[#007D8C]/10 dark:hover:bg-[#007D8C]/10 focus:outline-none focus:bg-[#007D8C]/10 transition duration-150 ease-in-out pr-14 border-b border-[#007D8C]/20 last:border-b-0">
                                            <div className="px-4 py-3 sm:px-5 flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-[#073d44] flex items-center justify-center flex-shrink-0">
                                                    <FolderOpenIcon className="h-5 w-5 text-[#007D8C]" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 dark:text-white truncate">
                                                        {project.name || 'Untitled Project'}
                                                    </p>
                                                    <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500 flex flex-wrap items-center gap-x-1.5">
                                                        <span className="font-medium text-[#007D8C] bg-teal-50 dark:bg-[#073d44] px-1.5 py-0.5 rounded-md text-[11px]">{getReportTypeName(project.type)}</span>
                                                        <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">&middot;</span>
                                                        <span className="hidden sm:inline">#{project.projectNumber || 'N/A'}</span>
                                                        <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">&middot;</span>
                                                        <span className="hidden sm:inline">{new Date(project.timestamp).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                                <svg className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                </svg>
                                            </div>
                                        </button>
                                        <div className="absolute top-1/2 right-3 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                            <button
                                                onClick={(e) => handleToggleMenu(e, project.timestamp)}
                                                className="p-1.5 text-gray-500 dark:text-[#aaa] hover:text-[#007D8C] dark:hover:text-[#007D8C] rounded-lg hover:bg-blue-50 dark:hover:bg-[#363636] focus:outline-none transition-all duration-200"
                                                aria-haspopup="true"
                                                aria-expanded={openMenuTimestamp === project.timestamp}
                                            >
                                                <EllipsisVerticalIcon className="h-5 w-5" />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="text-center py-12 px-6">
                                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-200 to-gray-100 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center mx-auto mb-3">
                                    <FolderOpenIcon className="h-6 w-6 text-gray-400 dark:text-slate-400" />
                                </div>
                                <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-300">
                                    {searchTerm ? 'No matching projects' : 'No Recent Projects'}
                                </h3>
                                <p className="mt-1 text-xs text-gray-400 dark:text-slate-400">
                                    {searchTerm ? 'Try adjusting your search.' : 'Projects you save or open will appear here.'}
                                </p>
                            </div>
                        )}
                        </div>
                        </div>
                        </div>
                    </div>
                </div>
            </main>
            {/* Fixed-position context menu — renders outside scroll/overflow containers so it's never clipped */}
            {openMenuTimestamp !== null && menuPosition && (() => {
                const project = recentProjects.find(p => p.timestamp === openMenuTimestamp);
                if (!project) return null;
                return (
                    <div
                        ref={menuRef}
                        className="fixed z-[200] w-52 bg-white dark:bg-[#2b2b2b] border border-gray-200 dark:border-[#3d3d3d] rounded-xl shadow-xl overflow-hidden"
                        style={{ top: menuPosition.top, right: menuPosition.right }}
                    >
                        <div role="menu" aria-orientation="vertical">
                            <button
                                onClick={() => handleRemoveFromRecent(project.timestamp)}
                                className="w-full text-left block px-4 py-2.5 text-sm text-gray-700 dark:text-white hover:bg-blue-50 dark:hover:bg-[#363636] hover:text-gray-900 dark:hover:text-white transition-colors"
                                role="menuitem"
                            >
                                Remove from recent
                            </button>
                            <div className="mx-3 border-t border-gray-200 dark:border-[#3d3d3d]" />
                            <button
                                onClick={() => handleDeleteProject(project)}
                                className="w-full text-left block px-4 py-2.5 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                role="menuitem"
                            >
                                Delete permanently
                            </button>
                        </div>
                    </div>
                );
            })()}
            {confirmDelete && (
                <ConfirmModal
                    title="Delete project?"
                    message={`"${confirmDelete.name || 'Untitled Project'}" will be permanently deleted and cannot be recovered.`}
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => confirmDeleteProject(confirmDelete)}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
            {showWhatsNew && (
                <WhatsNewModal onClose={onCloseWhatsNew} />
            )}
        </div>
    );
};

export default LandingPage;

