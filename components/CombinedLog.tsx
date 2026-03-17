import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './Header';
import PhotoEntry from './PhotoEntry';
import type { HeaderData, PhotoData } from '../types';
import { PlusIcon, DownloadIcon, SaveIcon, FolderOpenIcon, CloseIcon, ArrowLeftIcon, FolderArrowDownIcon, DocumentDuplicateIcon, ClipboardDocumentListIcon, TrashIcon, ChevronDownIcon } from './icons';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { AppType } from '../App';
import { storeImage, retrieveImage, deleteImage, storeProject, deleteProject, deleteThumbnail, storeThumbnail, retrieveProject } from './db';
import { generateProjectThumbnail } from './thumbnailUtils';
import { safeSet } from './safeStorage';
import { SpecialCharacterPalette } from './SpecialCharacterPalette';
import ImageModal from './ImageModal';
import ActionStatusModal from './ActionStatusModal';
import { RecentProject } from './LandingPage';
import { jsPDF } from 'jspdf';
import JSZip from 'jszip';
import SafeImage, { getAssetUrl } from './SafeImage';
import { toast } from './Toast';
import { perfMark, perfMeasure } from './perf';

// --- Recent Projects Utility ---
const RECENT_PROJECTS_KEY = 'xtec_recent_projects';

interface RecentProjectMetadata {
    type: AppType;
    name: string;
    projectNumber: string;
    timestamp: number;
}

const getRecentProjects = (): RecentProjectMetadata[] => {
    try {
        const projects = localStorage.getItem(RECENT_PROJECTS_KEY);
        return projects ? JSON.parse(projects) : [];
    } catch (e) {
        console.error('Failed to parse recent projects from localStorage', e);
        return [];
    }
};

const addRecentProject = async (
    projectData: any,
    projectInfo: { type: AppType; name: string; projectNumber: string }
): Promise<number> => {
    const timestamp = Date.now();

    try {
        await storeProject(timestamp, projectData);
    } catch (e) {
        console.error('Failed to save project to IndexedDB:', e);
        return timestamp;
    }

    // Generate and store thumbnail
    try {
        const firstPhoto = projectData.photosData?.find(
            (p: any) => p.imageUrl && !p.isMap
        );
        const thumbnail = await generateProjectThumbnail({
            type: projectInfo.type,
            projectName: projectInfo.name,
            firstPhotoUrl: firstPhoto?.imageUrl || null,
        });
        await storeThumbnail(timestamp, thumbnail);
    } catch (e) {
        console.warn('Failed to generate/store thumbnail:', e);
    }

    const recentProjects = getRecentProjects();
    const identifier = `${projectInfo.type}-${projectInfo.name}-${projectInfo.projectNumber}`;

    const existingProject = recentProjects.find(
        p => `${p.type}-${p.name}-${p.projectNumber}` === identifier
    );

    const filteredProjects = recentProjects.filter(
        p => `${p.type}-${p.name}-${p.projectNumber}` !== identifier
    );

    if (existingProject) {
        try {
            await deleteProject(existingProject.timestamp);
            await deleteThumbnail(existingProject.timestamp);
        } catch (e) {
            console.error(
                `Failed to clean up old project version (${existingProject.timestamp}):`,
                e
            );
        }
    }

    const newProjectMetadata: RecentProjectMetadata = {
        ...projectInfo,
        timestamp
    };

    let updatedProjects = [newProjectMetadata, ...filteredProjects];

    const MAX_RECENT_PROJECTS_IN_LIST = 50;
    if (updatedProjects.length > MAX_RECENT_PROJECTS_IN_LIST) {
        const projectsToDelete = updatedProjects.splice(MAX_RECENT_PROJECTS_IN_LIST);
        for (const proj of projectsToDelete) {
            try {
                await deleteProject(proj.timestamp);
                await deleteThumbnail(proj.timestamp);
            } catch (e) {
                console.error(
                    `Failed to cleanup old project from list (${proj.timestamp}):`,
                    e
                );
            }
        }
    }

    safeSet(RECENT_PROJECTS_KEY, JSON.stringify(updatedProjects));

    return timestamp;
};

// Helper function to get image dimensions asynchronously (Mirroring PhotoLog)
const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = (err) => reject(err);
        img.src = url;
    });
};

const formatDateForRecentProject = (dateString: string): string => {
    if (!dateString) return '';
    try {
        const tempDate = new Date(dateString);
        if (isNaN(tempDate.getTime())) {
            return dateString; // Return original if invalid
        }
        const year = tempDate.getFullYear();
        const month = tempDate.getMonth();
        const day = tempDate.getDate();
        const utcDate = new Date(Date.UTC(year, month, day));
        
        const formattedYear = utcDate.getUTCFullYear();
        const formattedMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
        const formattedDay = String(utcDate.getUTCDate()).padStart(2, '0');

        return `${formattedYear}/${formattedMonth}/${formattedDay}`;
    } catch (e) {
        return dateString;
    }
};

const formatDateForFilename = (dateString: string): string => {
    if (!dateString) return 'NoDate';
    try {
        const tempDate = new Date(dateString);
        if (isNaN(tempDate.getTime())) {
            return dateString.replace(/[^a-z0-9]/gi, '');
        }
        const year = tempDate.getFullYear();
        const month = tempDate.getMonth();
        const day = tempDate.getDate();
        const utcDate = new Date(Date.UTC(year, month, day));
        const formattedMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
        const formattedDay = String(utcDate.getUTCDate()).padStart(2, '0');
        const formattedYear = utcDate.getUTCFullYear();
        return `${formattedMonth}-${formattedDay}-${formattedYear}`;
    } catch (e) {
        return dateString.replace(/[^a-z0-9]/gi, '');
    }
};

const PdfPreviewModal: React.FC<{ url: string; filename: string; onClose: () => void; pdfBlob?: Blob; }> = ({ url, filename, onClose, pdfBlob }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'auto';
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        };
    }, [onClose, url]);

    const handleDownload = async () => {
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.savePdf) {
            try {
                let arrayBuffer;
                if (pdfBlob) {
                    arrayBuffer = await pdfBlob.arrayBuffer();
                } else {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    arrayBuffer = await blob.arrayBuffer();
                }
                
                // @ts-ignore
                const result = await window.electronAPI.savePdf(arrayBuffer, filename);
                
                if (result.success) {
                    alert('PDF saved successfully!');
                } else if (result.error) {
                    alert(`Failed to save PDF: ${result.error}`);
                }
            } catch (e) {
                console.error("Error saving PDF via Electron:", e);
                alert("An error occurred while saving the PDF.");
            }
        } else {
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col overflow-hidden transition-colors duration-200">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">PDF Preview</h3>
                    <div className="flex items-center gap-4">
                        <button onClick={handleDownload} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <DownloadIcon />
                            <span>Download PDF</span>
                        </button>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition-colors" aria-label="Close preview">
                            <CloseIcon className="h-8 w-8" />
                        </button>
                    </div>
                </div>
                <div className="flex-grow bg-gray-200 dark:bg-gray-900 relative">
                    <iframe src={url} className="w-full h-full" style={{ border: 'none' }} title="PDF Preview" />
                </div>
            </div>
        </div>
    );
};

const ImportProjectsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onImport: (selectedProjects: RecentProject[]) => void;
    currentProjectTimestamp: number | null;
}> = ({ isOpen, onClose, onImport, currentProjectTimestamp }) => {
    const [allRecentProjects, setAllRecentProjects] = useState<RecentProject[]>([]);
    const [selectedTimestamps, setSelectedTimestamps] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (isOpen) {
            const projects = (localStorage.getItem(RECENT_PROJECTS_KEY) ? JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY)!) : []) as RecentProject[];
            const compatibleProjects = projects.filter(p =>
                (p.type === 'photoLog' || p.type === 'dfrStandard' || p.type === 'dfrSaskpower') &&
                p.timestamp !== currentProjectTimestamp
            );
            setAllRecentProjects(compatibleProjects);
            setSelectedTimestamps(new Set());
        }
    }, [isOpen, currentProjectTimestamp]);

    const handleToggleSelection = (timestamp: number) => {
        setSelectedTimestamps(prev => {
            const newSet = new Set(prev);
            if (newSet.has(timestamp)) {
                newSet.delete(timestamp);
            } else {
                newSet.add(timestamp);
            }
            return newSet;
        });
    };

    const handleConfirmImport = () => {
        const projectsToImport = allRecentProjects.filter(p => selectedTimestamps.has(p.timestamp));
        onImport(projectsToImport);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col transition-colors duration-200">
                <div className="flex justify-between items-center border-b dark:border-gray-700 pb-3 mb-4">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">Import Photos from Projects</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"><CloseIcon /></button>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                    Select projects to import photos from.
                </p>
                <div className="flex-grow overflow-y-auto border dark:border-gray-700 rounded-md p-2 bg-gray-50 dark:bg-gray-900">
                    {allRecentProjects.length > 0 ? (
                        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                            {allRecentProjects.map(p => (
                                <li key={p.timestamp} className="p-3 flex items-center">
                                    <input
                                        type="checkbox"
                                        id={`proj-${p.timestamp}`}
                                        checked={selectedTimestamps.has(p.timestamp)}
                                        onChange={() => handleToggleSelection(p.timestamp)}
                                        className="h-5 w-5 rounded border-gray-300 text-[#007D8C] focus:ring-[#007D8C]"
                                    />
                                    <label htmlFor={`proj-${p.timestamp}`} className="ml-3 flex-grow cursor-pointer">
                                        <p className="font-semibold text-gray-800 dark:text-gray-200">{p.name}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Project #: {p.projectNumber} | Last updated: {new Date(p.timestamp).toLocaleDateString()}</p>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <p>No compatible recent projects found.</p>
                            <p className="text-sm mt-2">Create and save some DFRs or Photo Logs to see them here.</p>
                        </div>
                    )}
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white text-gray-800 font-bold py-2 px-4 rounded-lg">Cancel</button>
                    <button onClick={handleConfirmImport} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg" disabled={selectedTimestamps.size === 0}>
                        Import ({selectedTimestamps.size})
                    </button>
                </div>
            </div>
        </div>
    );
};


interface CombinedLogProps {
  onBack: () => void;
  onBackDirect?: () => void;
  initialData?: any;
}

const CombinedLog: React.FC<CombinedLogProps> = ({ onBack, onBackDirect, initialData }) => {
    const [headerData, setHeaderData] = useState<HeaderData>({
        proponent: '',
        projectName: '',
        location: '',
        date: '',
        projectNumber: '',
    });

    const [photosData, setPhotosData] = useState<PhotoData[]>([]);
    const [projectTimestamp, setProjectTimestamp] = useState<number | null>(null);
    
    const [errors, setErrors] = useState(new Set<string>());
    const [showUnsupportedFileModal, setShowUnsupportedFileModal] = useState<boolean>(false);
    const [showValidationErrorModal, setShowValidationErrorModal] = useState<boolean>(false);
    const [showNoInternetModal, setShowNoInternetModal] = useState<boolean>(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; blob?: Blob } | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [showImportMenu, setShowImportMenu] = useState(false);
    const importMenuRef = useRef<HTMLDivElement>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const AUTOSAVE_KEY = 'xtec_autosave_enabled';
    const AUTOSAVE_INTERVAL_KEY = 'xtec_autosave_interval';
    const [autosaveEnabled, setAutosaveEnabled] = useState(() => localStorage.getItem(AUTOSAVE_KEY) !== 'false');
    const [autosaveIntervalMs, setAutosaveIntervalMs] = useState(() => parseInt(localStorage.getItem(AUTOSAVE_INTERVAL_KEY) || '30') * 1000);
    const [showSaveAsMenu, setShowSaveAsMenu] = useState(false);
    const saveAsMenuRef = useRef<HTMLDivElement>(null);
    const quickSaveRef = useRef<() => Promise<void>>();
    const isDirtyRef = useRef(isDirty);
    isDirtyRef.current = isDirty;
    const autosaveEnabledRef = useRef(autosaveEnabled);
    autosaveEnabledRef.current = autosaveEnabled;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const importFileInputRef = useRef<HTMLInputElement>(null);
    const isDownloadingRef = useRef(false);

    const prepareStateForRecentProjectStorage = async (
    headerData: HeaderData,
    photosData: PhotoData[]
) => {
    const photosForStorage = await Promise.all(
        photosData.map(async (photo) => {
            if (photo.imageUrl) {
                const imageId =
                    photo.imageId ||
                    `${headerData.projectNumber || 'proj'}-${photo.id}-${Date.now()}`;

                try {
                    await storeImage(imageId, photo.imageUrl);
                } catch (e) {
                    console.warn('Failed to cache image in IndexedDB', e);
                }

                return {
                    ...photo,
                    imageId,
                    imageUrl: photo.imageUrl
                };
            }

            return photo;
            })
        );
        return { headerData, photosData: photosForStorage };
    };

    const parseAndLoadProject = async (fileContent: string) => {
        try {
            const projectData = JSON.parse(fileContent);
            const { headerData: loadedHeader, photosData: loadedPhotos } = projectData;

            if (loadedHeader && loadedPhotos && Array.isArray(loadedPhotos)) {
                setHeaderData(loadedHeader);

                const hydratedPhotos = await Promise.all(
                    loadedPhotos.map(async (photo: PhotoData) => {
                        if (photo.imageId && !photo.imageUrl) {
                            const imageUrl = await retrieveImage(photo.imageId);
                            return { ...photo, imageUrl: imageUrl || null };
                        }
                        return photo;
                    })
                );
                setPhotosData(hydratedPhotos);

                const formattedDate = formatDateForRecentProject(loadedHeader.date);
                const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
                const projectName = `${loadedHeader.projectName || 'Untitled Combine Logs'}${dateSuffix}`;

                const stateForRecent = await prepareStateForRecentProjectStorage(loadedHeader, hydratedPhotos);
                const newTimestamp = await addRecentProject(stateForRecent, {
                    type: 'combinedLog',
                    name: projectName,
                    projectNumber: loadedHeader.projectNumber,
                });
                setProjectTimestamp(newTimestamp);
            } else {
                alert('Invalid project file format.');
            }
        } catch (err) {
            alert('Error parsing project file. Ensure it is a valid JSON file.');
            console.error(err);
        }
    };


    useEffect(() => {
        const loadInitialData = async () => {
            if (initialData) {
                setHeaderData(initialData.headerData || { proponent: '', projectName: '', location: '', date: '', projectNumber: '' });

                if (initialData.photosData && Array.isArray(initialData.photosData)) {
                    const hydratedPhotos = await Promise.all(
                        initialData.photosData.map(async (photo: PhotoData) => {
                            if (photo.imageId && !photo.imageUrl) {
                                const imageUrl = await retrieveImage(photo.imageId);
                                return { ...photo, imageUrl: imageUrl || null };
                            }
                            return photo;
                        })
                    );
                    setPhotosData(hydratedPhotos);
                } else {
                    setPhotosData(initialData.photosData || []);
                }

                if (initialData.timestamp) {
                    setProjectTimestamp(initialData.timestamp);
                }
            } else {
                try {
                    const settings = JSON.parse(localStorage.getItem('xtec_general_settings') || '{}');
                    if (settings.defaultProponent) {
                         setHeaderData(prev => ({ ...prev, proponent: settings.defaultProponent }));
                    }
                } catch (e) {
                    console.error("Failed to load settings", e);
                }
            }
        };
        loadInitialData();
    }, [initialData]);

    const pendingCloseRef = useRef(false);

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    useEffect(() => {
        // @ts-ignore
        const api = window.electronAPI;
        if (api?.onCloseAttempted) {
            api.removeCloseAttemptedListener?.();
            api.onCloseAttempted(() => {
                if (isDirty) {
                    pendingCloseRef.current = true;
                    setShowUnsavedModal(true);
                } else {
                    api.confirmClose();
                }
            });
        }
        return () => {
            // @ts-ignore
            window.electronAPI?.removeCloseAttemptedListener?.();
        };
    }, [isDirty]);

    const handleBack = () => {
        if (isDirty) {
            pendingCloseRef.current = false;
            setShowUnsavedModal(true);
        } else {
            onBack();
        }
    };

    const handleHeaderChange = (field: keyof HeaderData, value: string) => {
        setHeaderData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handlePhotoDataChange = (id: number, field: keyof Omit<PhotoData, 'id' | 'imageUrl' | 'imageId'>, value: string) => {
        setPhotosData(prev => prev.map(photo => photo.id === id ? { ...photo, [field]: value } : photo));
        setIsDirty(true);
    };
    
    const autoCropImage = (imageUrl: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(imageUrl);
                    return;
                }
    
                const targetAspectRatio = 4 / 3;
                const originalAspectRatio = img.width / img.height;
    
                const canvasWidth = 1024;
                const canvasHeight = 768;
    
                canvas.width = canvasWidth;
                canvas.height = canvasHeight;
    
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
    
                let drawWidth, drawHeight, drawX, drawY;
    
                if (originalAspectRatio > targetAspectRatio) {
                    drawWidth = canvas.width;
                    drawHeight = drawWidth / originalAspectRatio;
                    drawX = 0;
                    drawY = (canvas.height - drawHeight) / 2;
                } else {
                    drawHeight = canvas.height;
                    drawWidth = drawHeight * originalAspectRatio;
                    drawY = 0;
                    drawX = (canvas.width - drawWidth) / 2;
                }
    
                ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    
                resolve(canvas.toDataURL('image/jpeg'));
            };
            img.src = imageUrl;
        });
    };
    
    const handleImageChange = (id: number, file: File) => {
        const allowedTypes = ['image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            setShowUnsupportedFileModal(true);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            autoCropImage(dataUrl).then(croppedImageUrl => {
                setPhotosData(prev => prev.map(photo => photo.id === id ? { ...photo, imageUrl: croppedImageUrl } : photo));
                setIsDirty(true);
            }).catch(err => {
                console.error("Image crop failed", err);
                // Fall back to uncropped image
                setPhotosData(prev => prev.map(photo => photo.id === id ? { ...photo, imageUrl: dataUrl } : photo));
                setIsDirty(true);
            });
        };
        reader.readAsDataURL(file);
    };

    const renumberPhotos = (photos: PhotoData[]) => {
        return photos.map((photo, index) => ({ ...photo, photoNumber: String(index + 1) }));
    };

    const addPhoto = (insertAtIndex?: number) => {
        const newId = photosData.length > 0 ? Math.max(...photosData.map(p => p.id)) + 1 : 1;
        const newPhoto: PhotoData = {
            id: newId,
            photoNumber: '', 
            date: headerData.date || '',
            location: '',
            description: '',
            imageUrl: null,
            direction: '',
        };

        setPhotosData(prev => {
            let newPhotos;
            if (insertAtIndex !== undefined) {
                const insertionPoint = insertAtIndex + 1;
                newPhotos = [...prev.slice(0, insertionPoint), newPhoto, ...prev.slice(insertionPoint)];
            } else {
                newPhotos = [...prev, newPhoto];
            }
            return renumberPhotos(newPhotos);
        });
        setIsDirty(true);
    };

    const removePhoto = (id: number) => {
        setPhotosData(prev => {
            return renumberPhotos(prev.filter(photo => photo.id !== id));
        });
        setIsDirty(true);
    };

    const handlePhotoDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = photosData.findIndex(p => p.id === active.id);
            const newIndex = photosData.findIndex(p => p.id === over!.id);
            setPhotosData(renumberPhotos(arrayMove(photosData, oldIndex, newIndex)));
            setIsDirty(true);
        }
    };

    const handleImportProjects = async (selectedProjects: RecentProject[]) => {
        setIsImportModalOpen(false);
        setStatusMessage('Importing photos...');
        setShowStatusModal(true);

        try {
            const newPhotos: PhotoData[] = [];
            for (const proj of selectedProjects) {
                const projectData = await retrieveProject(proj.timestamp);
                if (projectData && projectData.photosData) {
                    const photos = projectData.photosData as PhotoData[];
                    for (const p of photos) {
                        let imageUrl: string | null | undefined = p.imageUrl;
                        if (!imageUrl && p.imageId) {
                            imageUrl = await retrieveImage(p.imageId);
                        }

                        if (imageUrl) {
                             newPhotos.push({
                                ...p,
                                id: 0, 
                                imageId: undefined, 
                                imageUrl: imageUrl
                            });
                        }
                    }
                }
            }

            setPhotosData(prev => {
                let nextId = prev.length > 0 ? Math.max(...prev.map(item => item.id)) + 1 : 1;
                const processedNewPhotos = newPhotos.map(p => ({
                    ...p,
                    id: nextId++,
                }));
                const combined = [...prev, ...processedNewPhotos];
                return renumberPhotos(combined);
            });
             
        } catch (e) {
            console.error("Import failed", e);
            alert("Failed to import some projects.");
        } finally {
            setShowStatusModal(false);
        }
    };

    const handleImportFromFiles = async () => {
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.loadMultipleProjects) {
             // @ts-ignore
            const result = await window.electronAPI.loadMultipleProjects();
            if (result.success && result.data) {
                await processImportedFiles(result.data);
            }
        } else {
            importFileInputRef.current?.click();
        }
    };

    const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const fileContents: string[] = [];
        for (let i = 0; i < files.length; i++) {
            const text = await files[i].text();
            fileContents.push(text);
        }
        
        await processImportedFiles(fileContents);
        
        if (event.target) {
            event.target.value = '';
        }
    };

    const processImportedFiles = async (fileContents: string[]) => {
        setStatusMessage('Importing photos from files...');
        setShowStatusModal(true);
        
        try {
            const newPhotos: PhotoData[] = [];
            for (const content of fileContents) {
                try {
                    const projectData = JSON.parse(content);
                    if (projectData && projectData.photosData && Array.isArray(projectData.photosData)) {
                         const photos = projectData.photosData as PhotoData[];
                         for (const p of photos) {
                            let imageUrl = p.imageUrl;
                            if (!imageUrl && p.imageId) {
                                const storedImg = await retrieveImage(p.imageId);
                                if (storedImg) imageUrl = storedImg;
                            }

                            if (imageUrl) {
                                 newPhotos.push({
                                    ...p,
                                    id: 0, 
                                    imageId: undefined, 
                                    imageUrl: imageUrl
                                });
                            }
                         }
                    }
                } catch (e) {
                    console.error("Error parsing a file", e);
                }
            }

            if (newPhotos.length > 0) {
                setPhotosData(prev => {
                    let nextId = prev.length > 0 ? Math.max(...prev.map(item => item.id)) + 1 : 1;
                    const processedNewPhotos = newPhotos.map(p => ({
                        ...p,
                        id: nextId++,
                    }));
                    const combined = [...prev, ...processedNewPhotos];
                    return renumberPhotos(combined);
                });
            } else {
                alert("No photos found in selected files. Ensure the files are valid project files with embedded images.");
            }

        } catch (e) {
            console.error("Import process failed", e);
            alert("An error occurred while importing files.");
        } finally {
            setShowStatusModal(false);
        }
    };

    const validateForm = (): boolean => {
        const newErrors = new Set<string>();
        (Object.keys(headerData) as Array<keyof HeaderData>).forEach(key => {
            if (!headerData[key]) {
                newErrors.add(key);
            }
        });
        photosData.forEach(photo => {
            const prefix = `photo-${photo.id}-`;
            if (!photo.date) newErrors.add(`${prefix}date`);
            if (!photo.location) newErrors.add(`${prefix}location`);
            if (!photo.description) newErrors.add(`${prefix}description`);
            if (!photo.imageUrl) newErrors.add(`${prefix}imageUrl`);
            if (!photo.isMap && !photo.direction) newErrors.add(`${prefix}direction`);
        });

        setErrors(newErrors);
        if (newErrors.size > 0) {
            setShowValidationErrorModal(true);
            return false;
        }
        return true;
    };

    const handleQuickSave = async () => {
        const stateForRecentProjects = await prepareStateForRecentProjectStorage(headerData, photosData);
        const formattedDate = formatDateForRecentProject(headerData.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${headerData.projectName || 'Untitled Combine Logs'}${dateSuffix}`;
        const newTimestamp = await addRecentProject(stateForRecentProjects, {
            type: 'combinedLog',
            name: projectName,
            projectNumber: headerData.projectNumber,
        });
        setProjectTimestamp(newTimestamp);
        setIsDirty(false);
        toast('Saved ✓');
    };
    quickSaveRef.current = handleQuickSave;

    const handleSaveProject = async () => {
        await handleQuickSave();
        const photosForExport = photosData.map(({ imageId, ...photo }) => photo);
        const stateForFileExport = { headerData, photosData: photosForExport };
        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const filename = `${sanitize(headerData.projectNumber) || 'project'}_${sanitize(headerData.projectName) || 'combinedlog'}.clog`;
        // @ts-ignore
        if (window.electronAPI) {
            // @ts-ignore
            await window.electronAPI.saveProject(JSON.stringify(stateForFileExport), filename);
        } else {
            const blob = new Blob([JSON.stringify(stateForFileExport)], { type: 'application/json;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        }
    };

    const addSafeLogo = async (docInstance: any, x: number, y: number, w: number, h: number) => {
        const logoUrl = await getAssetUrl("xterra-logo.jpg");
        try {
            const response = await fetch(logoUrl);
            if (!response.ok) throw new Error('Logo fetch failed');
            const blob = await response.blob();
            const reader = new FileReader();
            return new Promise<void>((resolve) => {
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    docInstance.addImage(base64data, 'JPEG', x, y, w, h);
                    resolve();
                };
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Could not load logo:", e);
            docInstance.setFontSize(10);
            docInstance.setTextColor(0,0,0);
            docInstance.text("X-TERRA", x, y + 5);
        }
    };

    const handleSavePdf = async () => {
        if (!validateForm()) return;
        const stateForRecentProjects = await prepareStateForRecentProjectStorage(headerData, photosData);
        const formattedDate = formatDateForRecentProject(headerData.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${headerData.projectName || 'Untitled Combine Logs'}${dateSuffix}`;

        await addRecentProject(stateForRecentProjects, {
            type: 'combinedLog',
            name: projectName,
            projectNumber: headerData.projectNumber,
        });

        // 🟢 EXACT PARITY WITH PHOTOLOG PDF GENERATION LOGIC
        perfMark('pdf-gen-start');
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        
        const borderMargin = 12.7;
        const contentPadding = 4;
        const contentMargin = borderMargin + contentPadding;
        const contentWidth = pageWidth - contentMargin * 2;
        
        const maxYPos = pageHeight - contentMargin;
        let pageNum = 1;

        const drawPageBorder = (docInstance: any) => {
            docInstance.setDrawColor(0, 125, 140); // Teal
            docInstance.setLineWidth(0.5);
            const startX = borderMargin;
            const endX = pageWidth - borderMargin;
            const bottomY = pageHeight - borderMargin;
            const BOTTOM_LINE_NUDGE_UP = 3; 

            docInstance.line(startX, bottomY - BOTTOM_LINE_NUDGE_UP, endX, bottomY - BOTTOM_LINE_NUDGE_UP);
        };

        const drawProjectInfoBlock = (docInstance: any, startY: number, options: { drawTopLine?: boolean, drawBottomLine?: boolean } = {}) => {
            const { drawTopLine = true, drawBottomLine = true } = options;
            const blockPaddingTop = 4;
            const blockPaddingBottom = 0; 
            let yPos = startY + blockPaddingTop;

            const drawField = (label: string, value: string, x: number, y: number, maxWidth: number): number => {
                const labelText = (label || '').toUpperCase() + ':';
                docInstance.setFontSize(12);
                docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.text(labelText, x, y);
                docInstance.setFontSize(11);
                docInstance.setFont('times', 'normal');
                const valueMaxWidth = maxWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                docInstance.text(valueLines, x + labelWidth + 2, y);
                return docInstance.getTextDimensions(valueLines).h;
            };

            const col1Fields = [
                {label: 'Proponent', value: headerData.proponent},
                {label: 'Location', value: headerData.location},
            ];
            const col2Fields = [
                {label: 'Date', value: headerData.date},
                {label: 'Project', value: headerData.projectNumber},
            ];
            const fullWidthFields = [
                {label: 'Project Name', value: headerData.projectName},
            ];
        
            const col1X = contentMargin;
            const col1MaxWidth = contentWidth * 0.55;
            const col2X = contentMargin + contentWidth * 0.60;
            const col2MaxWidth = contentWidth * 0.40;
            
            let yPos1 = yPos;
            let yPos2 = yPos;
        
            col1Fields.forEach(field => {
                const height = drawField(field.label, field.value, col1X, yPos1, col1MaxWidth);
                yPos1 += height + 1.5;
            });
            col2Fields.forEach(field => {
                const height = drawField(field.label, field.value, col2X, yPos2, col2MaxWidth);
                yPos2 += height + 1.5;
            });
            yPos = Math.max(yPos1, yPos2);
            fullWidthFields.forEach(field => {
                const height = drawField(field.label, field.value, contentMargin, yPos, contentWidth);
                yPos += height + 1.5;
            });

            const fieldsEndY = yPos;
            const blockBottomY = fieldsEndY - 1.5 + blockPaddingBottom;
            
            docInstance.setDrawColor(0, 125, 140); 
            docInstance.setLineWidth(0.5);
            if (drawTopLine) docInstance.line(borderMargin, startY, pageWidth - borderMargin, startY);
            if (drawBottomLine) docInstance.line(borderMargin, blockBottomY, pageWidth - borderMargin, blockBottomY);

            return blockBottomY;
        };
        
        const drawPhotoPageHeader = async (docInstance: any) => {
            const headerContentStartY = contentMargin;
            await addSafeLogo(docInstance, contentMargin, headerContentStartY, 40, 10);
            docInstance.setFontSize(18);
            docInstance.setFont('times', 'bold');
            docInstance.setTextColor(0, 125, 140);
            docInstance.text('PHOTOGRAPHIC LOG', pageWidth / 2, headerContentStartY + 7, { align: 'center' });
            docInstance.setTextColor(0, 0, 0);
            let yPos = headerContentStartY + 15;
            docInstance.setDrawColor(0, 125, 140);
            docInstance.setLineWidth(0.5);
            const TOP_LINE_NUDGE_UP = 1; 
            docInstance.line(borderMargin, yPos - TOP_LINE_NUDGE_UP, pageWidth - borderMargin, yPos - TOP_LINE_NUDGE_UP);
            const yAfterBlock = drawProjectInfoBlock(docInstance, yPos, { drawTopLine: false });
            return yAfterBlock + 1;
        };

        const PHOTO_WIDTH_RATIO = 0.72; 
        const PHOTO_ASPECT_RATIO = 3 / 4; 
        const PHOTO_X_NUDGE = -5;

        const calculatePhotoEntryHeight = async (docInstance: any, photo: PhotoData): Promise<number> => {
            const gap = 5;
            const availableWidth = contentWidth - gap;
            const textBlockWidth = availableWidth * 0.33;
            const imageBlockWidth = availableWidth * PHOTO_WIDTH_RATIO;
            const imageBlockHeight = imageBlockWidth * PHOTO_ASPECT_RATIO;
            
            docInstance.setFontSize(12);
            let textHeight = 0;
            const measureField = (label: string, value: string) => {
                const labelText = `${label}:`;
                docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.setFont('times', 'normal');
                const valueMaxWidth = textBlockWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                return docInstance.getTextDimensions(valueLines).h + 1.5;
            };

            textHeight += measureField(photo.isMap ? "Map" : "Photo", photo.photoNumber);
            if (!photo.isMap) textHeight += measureField("Direction", photo.direction || 'N/A');
            textHeight += measureField("Date", photo.date);
            textHeight += measureField("Location", photo.location);
            textHeight += 5;
            const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth);
            textHeight += docInstance.getTextDimensions(descLines).h;

            return Math.max(textHeight, imageBlockHeight);
        };
        
        const drawPhotoEntryText = (docInstance: any, photo: PhotoData, xStart: number, yStart: number, textBlockWidth: number) => {
            docInstance.setFontSize(12);
            docInstance.setFont('times', 'normal');
            const textMetrics = docInstance.getTextDimensions('Photo');
            const ascent = textMetrics.h * 0.75;
            let textY = yStart + ascent;

            const drawTextField = (label: string, value: string) => {
                docInstance.setFont('times', 'bold');
                const labelText = `${label}:`;
                docInstance.text(labelText, xStart, textY);
                docInstance.setFont('times', 'normal');
                const labelWidth = docInstance.getTextWidth(labelText);
                const valueMaxWidth = textBlockWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                docInstance.text(valueLines, xStart + labelWidth + 2, textY);
                textY += docInstance.getTextDimensions(valueLines).h + 1.5;
            };

            drawTextField(photo.isMap ? "Map" : "Photo", photo.photoNumber);
            if (!photo.isMap) drawTextField("Direction", photo.direction || 'N/A');
            drawTextField("Date", photo.date);
            drawTextField("Location", photo.location);
            docInstance.setFont('times', 'bold');
            docInstance.text(`Description:`, xStart, textY);
            textY += 5;
            docInstance.setFont('times', 'normal');
            const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth);
            docInstance.text(descLines, xStart, textY);
        };
        
        const drawPhotoEntry = async (docInstance: any, photo: PhotoData, yStart: number) => {
            const gap = 5;
            const availableWidth = contentWidth - gap;
            const textBlockWidth = availableWidth * 0.33;
            const imageBlockWidth = availableWidth * PHOTO_WIDTH_RATIO;
            const imageBlockHeight = imageBlockWidth * PHOTO_ASPECT_RATIO;
            const imageX = contentMargin + textBlockWidth + gap + PHOTO_X_NUDGE;

            drawPhotoEntryText(docInstance, photo, contentMargin, yStart, textBlockWidth);

            if (photo.imageUrl) {
                docInstance.addImage(photo.imageUrl, 'JPEG', imageX, yStart, imageBlockWidth, imageBlockHeight);
            }
        };

        const sitePhotos = photosData.filter(p => p.imageUrl);
        if (sitePhotos.length > 0) {
            const entryHeights = await Promise.all(sitePhotos.map(p => calculatePhotoEntryHeight(doc, p)));
            const dummyDoc = new jsPDF({ format: 'letter', unit: 'mm' });
            const yAfterHeader = await drawPhotoPageHeader(dummyDoc);
            const pageContentHeight = maxYPos - yAfterHeader;
            
            const pages: number[][] = [];
            let currentPageGroup: number[] = [];
            let currentHeight = 0;

            sitePhotos.forEach((_, i) => {
                const photoHeight = entryHeights[i];
                if (currentPageGroup.length === 0) {
                    currentPageGroup.push(i);
                    currentHeight = photoHeight;
                } else if (currentPageGroup.length === 1) {
                    if (currentHeight + photoHeight + 10 <= pageContentHeight) { 
                        currentPageGroup.push(i);
                    } else {
                        pages.push(currentPageGroup);
                        currentPageGroup = [i];
                        currentHeight = photoHeight;
                    }
                }
                
                if (currentPageGroup.length === 2) {
                    pages.push(currentPageGroup);
                    currentPageGroup = [];
                    currentHeight = 0;
                }
            });

            if (currentPageGroup.length > 0) pages.push(currentPageGroup);

            for (let i = 0; i < pages.length; i++) {
                const group = pages[i];
                if (i > 0) {
                    doc.addPage();
                    pageNum++;
                }
                
                let yPos = await drawPhotoPageHeader(doc);
                const photosOnPage = group.map(i => sitePhotos[i]);
                const heightsOnPage = group.map(i => entryHeights[i]);
                const availableHeight = maxYPos - yPos;

                if (photosOnPage.length === 1) {
                    await drawPhotoEntry(doc, photosOnPage[0], yPos);
                } else {
                    const totalContentHeight = heightsOnPage.reduce((sum, h) => sum + h, 0);
                    const tightGap = 4; 
                    const totalRemainingSpace = availableHeight - totalContentHeight - (tightGap * 2);
                    const largeGap = totalRemainingSpace > 0 ? totalRemainingSpace / 2 : 2;

                    yPos += tightGap;
                    await drawPhotoEntry(doc, photosOnPage[0], yPos);
                    yPos += heightsOnPage[0];

                    yPos += largeGap;
                    doc.setDrawColor(0, 125, 140);
                    doc.setLineWidth(0.5);
                    const TEAL_LINE_NUDGE_UP = 1; 
                    doc.line(borderMargin, yPos - TEAL_LINE_NUDGE_UP, pageWidth - borderMargin, yPos - TEAL_LINE_NUDGE_UP);

                    yPos += tightGap;
                    await drawPhotoEntry(doc, photosOnPage[1], yPos);
                }
                drawPageBorder(doc);
            }
        } else {
             await drawPhotoPageHeader(doc);
             drawPageBorder(doc);
        }  

        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const formattedFilenameDate = formatDateForFilename(headerData.date);
        const sanitizedProjectName = sanitize(headerData.projectName);
        const filename = `${sanitizedProjectName || 'project'}_${formattedFilenameDate}.pdf`;
        
        const totalPages = (doc.internal as any).getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(10);
            doc.setFont('times', 'normal');
            doc.setTextColor(0, 0, 0);
            const footerTextY = pageHeight - borderMargin + 4;
            doc.text(`Page ${i} of ${totalPages}`, pageWidth - borderMargin, footerTextY, { align: 'right' });
        }
        
        perfMark('pdf-gen-end');
        perfMeasure('PDF generation (CombinedLog)', 'pdf-gen-start', 'pdf-gen-end');
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfPreview({ url: pdfUrl, filename, blob: pdfBlob });
    };

    const handleDownloadPhotos = useCallback(async () => {
        if (isDownloadingRef.current) return;
        isDownloadingRef.current = true;
    
        try {
            setStatusMessage('Checking for photos...');
            setShowStatusModal(true);
            await new Promise(resolve => setTimeout(resolve, 100));
    
            const photosWithImages = photosData.filter(p => p.imageUrl);
    
            if (photosWithImages.length === 0) {
                setStatusMessage('No photos found to download.');
                await new Promise(resolve => setTimeout(resolve, 2000));
                setShowStatusModal(false);
                return;
            }
    
            setStatusMessage(`Preparing ${photosWithImages.length} photos...`);
            await new Promise(resolve => setTimeout(resolve, 100));
    
            const zip = new JSZip();
            let metadata = '';
            const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9_.\-]/gi, '_');
    
            for (const photo of photosWithImages) {
                const photoNumberSanitized = sanitizeFilename(photo.photoNumber);
                const filename = `${photoNumberSanitized}.jpg`;
    
                metadata += `---
File: ${filename}
Photo Number: ${photo.photoNumber}
Date: ${photo.date || 'N/A'}
Location: ${photo.location || 'N/A'}
Direction: ${photo.direction || 'N/A'}
Description: ${photo.description || 'N/A'}
---\n\n`;
    
                const response = await fetch(photo.imageUrl!);
                const blob = await response.blob();
                zip.file(filename, blob);
            }
    
            zip.file('metadata.txt', metadata);
            
            setStatusMessage('Creating zip file...');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
            const zipFilename = `${sanitize(headerData.projectNumber) || 'project'}_${sanitize(headerData.projectName) || 'combinedlog'}_Photos.zip`;
            
            // @ts-ignore
            if (window.electronAPI?.saveZipFile) {
                const buffer = await zip.generateAsync({ type: 'arraybuffer' });
                // @ts-ignore
                await window.electronAPI.saveZipFile(buffer, zipFilename);
            } else {
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.setAttribute('download', zipFilename);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            }
    
        } finally {
            setShowStatusModal(false);
            isDownloadingRef.current = false;
        }
    }, [photosData, headerData]);

    const downloadHandlerRef = useRef(handleDownloadPhotos);
    useEffect(() => {
        downloadHandlerRef.current = handleDownloadPhotos;
    }, [handleDownloadPhotos]);

    const stableListener = useCallback(() => {
        if (downloadHandlerRef.current) {
            downloadHandlerRef.current();
        }
    }, []);

    useEffect(() => {
        // @ts-ignore
        const api = window.electronAPI;
        if (api && api.onDownloadPhotos && api.removeAllDownloadPhotosListeners) {
            api.removeAllDownloadPhotosListeners();
            api.onDownloadPhotos(stableListener);
        }
        return () => {
            if (api && api.removeDownloadPhotosListener) {
                api.removeDownloadPhotosListener(stableListener);
            }
        };
    }, [stableListener]);

    // Keyboard shortcut listeners
    useEffect(() => {
        // @ts-ignore
        const api = window.electronAPI;
        if (api?.onQuickSaveShortcut) {
            api.removeQuickSaveShortcutListener?.();
            api.onQuickSaveShortcut(() => { quickSaveRef.current?.(); });
        }
        if (api?.onSaveProjectShortcut) {
            api.removeSaveProjectShortcutListener?.();
            api.onSaveProjectShortcut(() => {
                handleSaveProject();
            });
        }
        if (api?.onExportPdfShortcut) {
            api.removeExportPdfShortcutListener?.();
            api.onExportPdfShortcut(() => {
                handleSavePdf();
            });
        }
        return () => {
            api?.removeQuickSaveShortcutListener?.();
            api?.removeSaveProjectShortcutListener?.();
            api?.removeExportPdfShortcutListener?.();
        };
    }, [headerData, photosData]);

    useEffect(() => {
        const name = headerData.projectName || '';
        const num = headerData.projectNumber || '';
        const prefix = [num, name].filter(Boolean).join(' – ');
        document.title = prefix ? `${prefix} | X-TEC` : 'X-TEC Digital Reporting';
        return () => { document.title = 'X-TEC Digital Reporting'; };
    }, [headerData.projectName, headerData.projectNumber]);

    // Autosave at configured interval when dirty
    useEffect(() => {
        const interval = setInterval(() => {
            if (isDirtyRef.current && autosaveEnabledRef.current) {
                quickSaveRef.current?.();
            }
        }, autosaveIntervalMs);
        return () => clearInterval(interval);
    }, [autosaveIntervalMs]);

    useEffect(() => {
        if (!showSaveAsMenu) return;
        const handler = (e: MouseEvent) => {
            if (saveAsMenuRef.current && !saveAsMenuRef.current.contains(e.target as Node)) {
                setShowSaveAsMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showSaveAsMenu]);

    useEffect(() => {
        if (!showImportMenu) return;
        const handler = (e: MouseEvent) => {
            if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
                setShowImportMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showImportMenu]);

    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const fileContent = await file.text();
        await parseAndLoadProject(fileContent);
       
        if (event.target) {
            event.target.value = '';
        }
    };

    const handleOpenProject = async () => {
        // @ts-ignore
        if (window.electronAPI) {
            // @ts-ignore
            const fileContent = await window.electronAPI.loadProject('clog');
            if (fileContent) {
                await parseAndLoadProject(fileContent);
            }
        } else {
            fileInputRef.current?.click();
        }
    };

    const getHeaderErrors = (): Set<keyof HeaderData> => {
        const headerErrors = new Set<keyof HeaderData>();
        errors.forEach(errorKey => {
            if (!errorKey.startsWith('photo-') && Object.keys(headerData).includes(errorKey)) {
                headerErrors.add(errorKey as keyof HeaderData);
            }
        });
        return headerErrors;
    };
    
    const getPhotoErrors = (id: number): Set<keyof PhotoData> => {
        const photoErrors = new Set<keyof PhotoData>();
        errors.forEach(errorKey => {
            const prefix = `photo-${id}-`;
            if (errorKey.startsWith(prefix)) {
                photoErrors.add(errorKey.substring(prefix.length) as keyof PhotoData);
            }
        });
        return photoErrors;
    };

    return (
        <div className="bg-gray-100 dark:bg-gray-900 min-h-screen transition-colors duration-200">
            {pdfPreview && (
                <PdfPreviewModal 
                    url={pdfPreview.url} 
                    filename={pdfPreview.filename} 
                    onClose={() => setPdfPreview(null)} 
                    pdfBlob={pdfPreview.blob}
                />
            )}
            {enlargedImageUrl && (
                <ImageModal imageUrl={enlargedImageUrl} onClose={() => setEnlargedImageUrl(null)} />
            )}
            {showStatusModal && <ActionStatusModal message={statusMessage} />}
            <SpecialCharacterPalette />
            
            <ImportProjectsModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={handleImportProjects}
                currentProjectTimestamp={projectTimestamp}
            />

            <div className="sticky top-0 z-40 bg-gray-100 dark:bg-gray-900 py-2 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 md:px-8 flex flex-wrap justify-between items-center gap-2">
                    <button onClick={handleBack} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                        <ArrowLeftIcon /> <span>Home</span>
                    </button>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Autosave</span>
                            <button
                                onClick={() => { const v = !autosaveEnabled; setAutosaveEnabled(v); localStorage.setItem(AUTOSAVE_KEY, String(v)); }}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${autosaveEnabled ? 'bg-[#007D8C]' : 'bg-gray-300 dark:bg-gray-600'}`}
                                title={autosaveEnabled ? 'Autosave on — click to disable' : 'Autosave off — click to enable'}
                            >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${autosaveEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                        </div>
                        <button onClick={handleQuickSave} title="Save (Ctrl+S)" className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-semibold py-2 px-3 rounded-lg inline-flex items-center transition duration-200">
                            <SaveIcon />
                        </button>
                        {/* Hidden file inputs */}
                        <input type="file" ref={fileInputRef} onChange={handleFileSelected} style={{ display: 'none' }} accept=".clog" />
                        <input type="file" ref={importFileInputRef} onChange={handleImportFileSelected} style={{ display: 'none' }} accept=".plog,.dfr,.spdfr,.clog,.json" multiple />

                        {/* Import dropdown */}
                        <div className="relative" ref={importMenuRef}>
                            <button
                                onClick={() => setShowImportMenu(v => !v)}
                                className="border border-[#007D8C] text-[#007D8C] hover:bg-[#007D8C]/10 dark:hover:bg-[#007D8C]/10 font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                            >
                                <FolderOpenIcon /> <span>Open / Import</span>
                                <ChevronDownIcon className="h-4 w-4" />
                            </button>
                            {showImportMenu && (
                                <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[200px]">
                                    <button
                                        onClick={() => { setShowImportMenu(false); handleOpenProject(); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <FolderOpenIcon className="h-4 w-4 flex-shrink-0" /> Open Existing (.clog)
                                    </button>
                                    <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                                    <button
                                        onClick={() => { setShowImportMenu(false); setIsImportModalOpen(true); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <DocumentDuplicateIcon className="h-4 w-4 flex-shrink-0" /> Import from Recent Projects
                                    </button>
                                    <button
                                        onClick={() => { setShowImportMenu(false); handleImportFromFiles(); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <FolderArrowDownIcon className="h-4 w-4 flex-shrink-0" /> Import from Files
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Save As dropdown */}
                        <div className="relative" ref={saveAsMenuRef}>
                            <button
                                onClick={() => setShowSaveAsMenu(v => !v)}
                                className="border border-[#007D8C] text-[#007D8C] hover:bg-[#007D8C]/10 dark:hover:bg-[#007D8C]/10 font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200"
                            >
                                <span>Save As...</span>
                                <ChevronDownIcon className="h-4 w-4" />
                            </button>
                            {showSaveAsMenu && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
                                    <button
                                        onClick={() => { setShowSaveAsMenu(false); handleSaveProject(); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <SaveIcon className="h-4 w-4 flex-shrink-0" /> Project File
                                    </button>
                                    <button
                                        onClick={() => { setShowSaveAsMenu(false); handleSavePdf(); }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                    >
                                        <DownloadIcon className="h-4 w-4 flex-shrink-0" /> PDF
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="max-w-7xl mx-auto p-4 md:p-8">
                <div className="main-content">
                    <Header data={headerData} onDataChange={handleHeaderChange} errors={getHeaderErrors()} />
                    <div className="mt-8">
                      <DndContext collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
                        <SortableContext items={photosData.map(p => p.id)} strategy={verticalListSortingStrategy}>
                          {photosData.map((photo, index) => (
                             <div key={photo.id}>
                                <PhotoEntry
                                    data={photo}
                                    onDataChange={(field, value) => handlePhotoDataChange(photo.id, field, value)}
                                    onImageChange={(file) => handleImageChange(photo.id, file)}
                                    onRemove={() => removePhoto(photo.id)}
                                    onImageClick={setEnlargedImageUrl}
                                    errors={getPhotoErrors(photo.id)}
                                    showDirectionField={!photo.isMap}
                                    headerDate={headerData.date}
                                    headerLocation={headerData.location}
                                    onAutoFill={(f, val) => handlePhotoDataChange(photo.id, f, val)}
                                />
                                {index < photosData.length - 1 && (
                                     <div className="relative my-10 flex items-center justify-center">
                                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                            <div className="w-full border-t-4 border-[#007D8C]"></div>
                                        </div>
                                        <div className="relative">
                                            <button
                                                onClick={() => addPhoto(index)}
                                                className="bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-[#007D8C] font-bold py-2 px-4 rounded-full border-2 border-[#007D8C] inline-flex items-center gap-2 transition duration-200 shadow-sm"
                                            >
                                                <PlusIcon />
                                                <span>Add Photo Here</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>

                    <div className="mt-8 flex justify-center">
                        <button
                            onClick={() => addPhoto()}
                            className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-bold py-3 px-6 rounded-lg shadow-md inline-flex items-center gap-2 transition duration-200 text-lg"
                        >
                            <PlusIcon />
                            <span>Add Photo</span>
                        </button>
                    </div>
                </div>
                {photosData.length > 0 && <div className="border-t-4 border-[#007D8C] my-8" />}
                <footer className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
                    X-TES Digital Reporting v1.1.4
                </footer>
            </div>
            {showUnsupportedFileModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md transform scale-95 hover:scale-100 transition-transform duration-300">
                        <button
                            onClick={() => setShowUnsupportedFileModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <SafeImage
                            fileName="loading-error.gif"
                            alt="Unsupported file type animation"
                            className="mx-auto mb-4 w-40 h-40"
                        />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">Unsupported File Type</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Please upload a supported image file.
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                            Supported formats: <strong>JPG, PNG</strong>
                        </p>
                    </div>
                </div>
            )}
            {showValidationErrorModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md transform scale-95 hover:scale-100 transition-transform duration-300">
                        <button
                            onClick={() => setShowValidationErrorModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <SafeImage
                            fileName="loading-error.gif"
                            alt="Missing information animation"
                            className="mx-auto mb-4 w-40 h-40"
                        />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">Missing Information</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Please fill in all required fields.
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                            Missing fields are highlighted in red.
                        </p>
                    </div>
                </div>
            )}
             {showNoInternetModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md">
                        <button
                            onClick={() => setShowNoInternetModal(false)}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            aria-label="Close"
                        >
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">No Internet Connection</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            An internet connection is required to save the PDF. Please connect to the internet and try again.
                        </p>
                    </div>
                </div>
            )}

            {showUnsavedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[200]">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md">
                        <h3 className="text-xl font-bold mb-3 text-gray-800 dark:text-white">Unsaved Changes</h3>
                        <p className="text-gray-600 dark:text-gray-300 mb-6">
                            You have unsaved changes. Are you sure you want to leave? Your changes will be lost.
                        </p>
                        <div className="flex justify-center gap-3">
                            <button
                                onClick={() => setShowUnsavedModal(false)}
                                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-semibold rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowUnsavedModal(false);
                                    if (pendingCloseRef.current) {
                                        // @ts-ignore
                                        window.electronAPI?.confirmClose();
                                    } else {
                                        (onBackDirect ?? onBack)();
                                    }
                                }}
                                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition"
                            >
                                Leave Without Saving
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CombinedLog;
