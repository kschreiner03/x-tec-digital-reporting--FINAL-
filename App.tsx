import React, { useState, useEffect, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TooltipProvider } from './components/Tooltip';
import ReactDOM from 'react-dom/client';
import LandingPage, { RecentProject } from './components/LandingPage';
import SettingsModal from './components/SettingsModal';
import { retrieveProject } from './components/db';

const PhotoLog   = lazy(() => import('./components/PhotoLog'));
const DfrStandard  = lazy(() => import('./components/DfrStandard'));
const DfrSaskpower = lazy(() => import('./components/DfrSaskpower'));
const CombinedLog  = lazy(() => import('./components/CombinedLog'));
const IogcLeaseAudit = lazy(() => import('./components/IogcLeaseAudit'));
import UpdateModal from './components/UpdateModal';
import { shouldShowWhatsNew } from './components/WhatsNewModal';
import { ToastContainer, toast } from './components/Toast';
import PackageProjectModal from './components/PackageProjectModal';
import OpenPackageModal from './components/OpenPackageModal';
import MediaWidget from './components/MediaWidget';
import { getAssetUrl } from './components/SafeImage';
import { perfMark } from './components/perf';

perfMark('app-module-loaded');

// Pre-warm the SafeImage URL cache at startup so Settings wallpaper thumbnails load instantly.
const WALLPAPER_FILENAMES = [
    'landscape.JPG', 'bison1.jpg',
    'wallpaper/116911439_10223823748248481_4788712539515562122_o - Copy.jpg',
    'wallpaper/bison rock - Copy.jpg', 'wallpaper/Breeding Bird Surveys_CL.jpg',
    'wallpaper/common nighthawk - Copy.JPG', 'wallpaper/DJI_0041.JPG',
    'wallpaper/IMG_0009_CL.jpg', 'wallpaper/IMG_0283.JPG', 'wallpaper/Owl.jpg',
];
WALLPAPER_FILENAMES.forEach(f => getAssetUrl(f));

export type AppType = 'photoLog' | 'dfrSaskpower' | 'dfrStandard' | 'combinedLog' | 'iogcLeaseAudit';

const App: React.FC = () => {
    const [selectedApp, setSelectedApp] = useState<AppType | null>(null);
    const [projectToOpen, setProjectToOpen] = useState<any>(null);
    const [isUpdateDownloaded, setIsUpdateDownloaded] = useState(false);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showPackageModal, setShowPackageModal] = useState(false);
    const [openPackageZipData, setOpenPackageZipData] = useState<ArrayBuffer | null>(null);
    const [isLoadingProject, setIsLoadingProject] = useState(false);
    // Evaluated once per session — not re-checked on every LandingPage mount
    const [showWhatsNew, setShowWhatsNew] = useState(() => shouldShowWhatsNew());
    const loadProjectFromFileContent = (content: string, path: string) => {
        try {
            if (content.trim().startsWith('%PDF')) {
                alert("You are trying to open a PDF file. Please open the editable project file (e.g., .plog, .dfr, .spdfr).");
                return;
            }
            const projectData = JSON.parse(content);
            const ext = path.split('.').pop();
            let type: AppType | null = null;

            if (ext === 'plog') type = 'photoLog';
            else if (ext === 'dfr') type = 'dfrStandard';
            else if (ext === 'spdfr') type = 'dfrSaskpower';
            else if (ext === 'clog') type = 'combinedLog';
            else if (ext === 'iogc') type = 'iogcLeaseAudit';

            if (type) {
                setProjectToOpen(projectData);
                setSelectedApp(type);
            } else {
                alert('Could not determine project type from file extension.');
            }
        } catch (e) {
            console.error("Failed to parse project data:", e);
            alert("Could not open the project. The file may be corrupt or not a valid project file.");
        }
    };

    useEffect(() => {
        const t = setTimeout(() => toast('X-TEC Digital Reporting is ready'), 600);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        perfMark('app-render-complete');
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.onOpenFile) {
            // @ts-ignore
            window.electronAPI.onOpenFile(async (filePath: string) => {
                // @ts-ignore
                const result = await window.electronAPI.readFile(filePath);
                if (result.success && result.data) {
                    loadProjectFromFileContent(result.data, result.path);
                } else {
                    alert(`Failed to read the file: ${result.error}`);
                }
            });
        }
        
        // @ts-ignore
        if (window.electronAPI?.onUpdateAvailable) {
            // @ts-ignore
            window.electronAPI.onUpdateAvailable(() => {
                setShowUpdateModal(true);
            });
        }

        // @ts-ignore
        if (window.electronAPI?.onUpdateDownloaded) {
            // @ts-ignore
            window.electronAPI.onUpdateDownloaded(() => {
                setIsUpdateDownloaded(true);
            });
        }
        
        // @ts-ignore
        if (window.electronAPI?.onOpenSettings) {
            // @ts-ignore
            window.electronAPI.onOpenSettings(() => {
                setShowSettings(true);
            });
        }

        // @ts-ignore
        if (window.electronAPI?.onPackageProject) {
            // @ts-ignore
            window.electronAPI.onPackageProject(() => {
                setShowPackageModal(true);
            });
        }

        // @ts-ignore
        if (window.electronAPI?.onOpenPackage) {
            // @ts-ignore
            window.electronAPI.onOpenPackage(async () => {
                // @ts-ignore
                const result = await window.electronAPI?.openPackageFile?.();
                if (result?.success && result.data) {
                    // Convert base64 → ArrayBuffer
                    const binary = atob(result.data);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    setOpenPackageZipData(bytes.buffer);
                }
            });
        }

        return () => {
             // @ts-ignore
            if (window.electronAPI?.removeUpdateAvailableListener) {
                // @ts-ignore
                window.electronAPI.removeUpdateAvailableListener();
            }
            // @ts-ignore
            if (window.electronAPI?.removeUpdateDownloadedListener) {
                // @ts-ignore
                window.electronAPI.removeUpdateDownloadedListener();
            }
            // @ts-ignore
             if (window.electronAPI?.removeOpenSettingsListener) {
                // @ts-ignore
                window.electronAPI.removeOpenSettingsListener();
            }
            // @ts-ignore
            window.electronAPI?.removePackageProjectListener?.();
            // @ts-ignore
            window.electronAPI?.removeOpenPackageListener?.();
        }
    }, []);

    // Prefetch lazy report chunks after mount so they're cached when the user navigates
    useEffect(() => {
        const t = setTimeout(() => {
            import('./components/PhotoLog');
            import('./components/DfrStandard');
            import('./components/DfrSaskpower');
            import('./components/CombinedLog');
            import('./components/IogcLeaseAudit');
        }, 1000);
        return () => clearTimeout(t);
    }, []);

    // When on landing page (no report open), allow window close immediately
    useEffect(() => {
        if (!selectedApp) {
            // @ts-ignore
            const api = window.electronAPI;
            if (api?.onCloseAttempted) {
                api.removeCloseAttemptedListener?.();
                api.onCloseAttempted(() => {
                    api.confirmClose();
                });
            }
            return () => {
                // @ts-ignore
                window.electronAPI?.removeCloseAttemptedListener?.();
            };
        }
    }, [selectedApp]);


    const handleSelectApp = (app: AppType) => {
        setProjectToOpen(null);
        setSelectedApp(app);
    };

    const handleOpenProject = async (project: RecentProject) => {
        setIsLoadingProject(true);
        try {
            const projectData = await retrieveProject(project.timestamp);
            if (!projectData) {
                throw new Error("Project data not found in the database.");
            }
            // Pass the timestamp along with the project data so the component knows its own ID
            setProjectToOpen({ ...projectData, timestamp: project.timestamp });
            setSelectedApp(project.type);
        } catch (e) {
            console.error("Failed to load project data:", e);
            toast("Could not open the project. The file may be corrupt or missing from the database.", "error");
        } finally {
            setIsLoadingProject(false);
        }
    };
    
    const handleBackToHome = () => {
        setSelectedApp(null);
        setProjectToOpen(null);
    };

    const handleBackDirect = () => {
        setSelectedApp(null);
        setProjectToOpen(null);
    };

    const handleImportProject = (project: RecentProject) => {
        setOpenPackageZipData(null);
        handleOpenProject(project);
    };

    return (
        <TooltipProvider>
            <ToastContainer
                position="bottom-right"
                richColors
                duration={2800}
                style={{ '--success-bg': '#007D8C', '--success-border': '#007D8C', '--success-text': '#ffffff' } as React.CSSProperties}
            />
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
            {showPackageModal && <PackageProjectModal onClose={() => setShowPackageModal(false)} />}
            {openPackageZipData && <OpenPackageModal zipData={openPackageZipData} onClose={() => setOpenPackageZipData(null)} onImportProject={handleImportProject} />}
            {showUpdateModal && (
                <UpdateModal
                    isDownloaded={isUpdateDownloaded}
                    onClose={() => setShowUpdateModal(false)}
                />
            )}
            <AnimatePresence mode="wait">
                {!selectedApp ? (
                    <motion.div
                        key="landing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                    >
                        <LandingPage onSelectApp={handleSelectApp} onOpenProject={handleOpenProject} showWhatsNew={showWhatsNew} onCloseWhatsNew={() => setShowWhatsNew(false)} />
                    </motion.div>
                ) : (
                    <motion.div
                        key={selectedApp}
                        initial={projectToOpen?.autoPdfExport ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.1 }}
                        style={projectToOpen?.autoPdfExport ? { visibility: 'hidden', position: 'absolute', pointerEvents: 'none' } : undefined}
                    >
                        <Suspense fallback={null}>
                            {(() => {
                                switch (selectedApp) {
                                    case 'photoLog':
                                        return <PhotoLog onBack={handleBackToHome} onBackDirect={handleBackDirect} initialData={projectToOpen} />;
                                    case 'dfrSaskpower':
                                        return <DfrSaskpower onBack={handleBackToHome} onBackDirect={handleBackDirect} initialData={projectToOpen} />;
                                    case 'dfrStandard':
                                        return <DfrStandard onBack={handleBackToHome} onBackDirect={handleBackDirect} initialData={projectToOpen} />;
                                    case 'combinedLog':
                                        return <CombinedLog onBack={handleBackToHome} onBackDirect={handleBackDirect} initialData={projectToOpen} />;
                                    case 'iogcLeaseAudit':
                                        return <IogcLeaseAudit onBack={handleBackToHome} initialData={projectToOpen} />;
                                    default:
                                        return <LandingPage onSelectApp={handleSelectApp} onOpenProject={handleOpenProject} showWhatsNew={false} onCloseWhatsNew={() => {}} />;
                                }
                            })()}
                        </Suspense>
                    </motion.div>
                )}
            </AnimatePresence>
            {isLoadingProject && (
                <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                        <div className="h-10 w-10 rounded-full border-4 border-[#007D8C] border-t-transparent animate-spin" />
                        <p className="text-base font-semibold text-gray-800 dark:text-white">Opening project...</p>
                    </div>
                </div>
            )}
            {projectToOpen?.autoPdfExport && selectedApp && (
                <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 flex flex-col items-center gap-4 shadow-2xl">
                        <div className="h-10 w-10 rounded-full border-4 border-[#007D8C] border-t-transparent animate-spin" />
                        <p className="text-base font-semibold text-gray-800 dark:text-white">Generating PDF...</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">A save dialog will appear shortly.</p>
                    </div>
                </div>
            )}
            <MediaWidget />
        </TooltipProvider>
    );
};

export default App;
