import React, { useState, useEffect, lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import LandingPage, { RecentProject } from './components/LandingPage';
import SettingsModal from './components/SettingsModal';
// import IogcLeaseAudit from './components/IogcLeaseAudit'; // Hidden for now
import { retrieveProject } from './components/db';

const PhotoLog   = lazy(() => import('./components/PhotoLog'));
const DfrStandard  = lazy(() => import('./components/DfrStandard'));
const DfrSaskpower = lazy(() => import('./components/DfrSaskpower'));
const CombinedLog  = lazy(() => import('./components/CombinedLog'));
import UpdateModal from './components/UpdateModal';
import { shouldShowWhatsNew } from './components/WhatsNewModal';
import { ToastContainer, toast } from './components/Toast';
import { getAssetUrl } from './components/SafeImage';
import { perfMark, PERF_ENABLED } from './components/perf';

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
    // Evaluated once per session — not re-checked on every LandingPage mount
    const [showWhatsNew, setShowWhatsNew] = useState(() => shouldShowWhatsNew());
    // View-transition animation state
    const [isExiting, setIsExiting] = useState(false);
    const [landingReturning, setLandingReturning] = useState(false);

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
        }
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
        }
    };
    
    const handleBackToHome = () => {
        setIsExiting(true);
        // Actual navigation happens in onAnimationEnd — no hardcoded timer needed
    };

    // Skip exit animation — used when navigating from a confirmation dialog
    const handleBackDirect = () => {
        setSelectedApp(null);
        setProjectToOpen(null);
        setLandingReturning(true);
    };

    const handleExitAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
        // Guard against child animation events bubbling up
        if (e.animationName !== 'xtec-report-exit-kf') return;
        setSelectedApp(null);
        setProjectToOpen(null);
        setIsExiting(false);
        setLandingReturning(true);
    };

    return (
        <>
            <ToastContainer />
            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
            {showUpdateModal && (
                <UpdateModal
                    isDownloaded={isUpdateDownloaded}
                    onClose={() => setShowUpdateModal(false)}
                />
            )}
            {!selectedApp ? (
                <div
                    className={landingReturning ? 'xtec-landing-return' : ''}
                    onAnimationEnd={landingReturning ? () => setLandingReturning(false) : undefined}
                >
                    <LandingPage onSelectApp={handleSelectApp} onOpenProject={handleOpenProject} showWhatsNew={showWhatsNew} onCloseWhatsNew={() => setShowWhatsNew(false)} />
                </div>
            ) : (
                <div
                    className={isExiting ? 'xtec-report-exit' : 'xtec-report-enter'}
                    onAnimationEnd={isExiting ? handleExitAnimationEnd : undefined}
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
                                // case 'iogcLeaseAudit':
                                //     return <IogcLeaseAudit onBack={handleBackToHome} initialData={projectToOpen} />;
                                default:
                                    return <LandingPage onSelectApp={handleSelectApp} onOpenProject={handleOpenProject} />;
                            }
                        })()}
                    </Suspense>
                </div>
            )}
        </>
    );
};

export default App;
