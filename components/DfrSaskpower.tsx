import React, { useState, ReactElement, useEffect, useRef, useCallback, useMemo } from 'react';
import type { DfrSaskpowerData, ChecklistOption, PhotoData, LocationActivity, ActivityBlock, TextHighlight, TextComment } from '../types';
import { DownloadIcon, SaveIcon, FolderOpenIcon, ArrowLeftIcon, PlusIcon, TrashIcon, CloseIcon, FolderArrowDownIcon, ChatBubbleLeftIcon, ZoomInIcon, ZoomOutIcon, ChevronDownIcon } from './icons';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { AppType } from '../App';
import PhotoEntry from './PhotoEntry';
import { storeImage, retrieveImage, deleteImage, storeProject, deleteProject, deleteThumbnail, storeThumbnail, retrieveProject } from './db';
import { generateProjectThumbnail } from './thumbnailUtils';
import { safeSet } from './safeStorage';
import { SpecialCharacterPalette } from './SpecialCharacterPalette';
import BulletPointEditor from './BulletPointEditor';
import ImageModal from './ImageModal';
import ActionStatusModal from './ActionStatusModal';
import CommentsRail, { FieldComment, CommentAnchor } from './CommentsRail';
import { CommentAnchorPosition } from './BulletPointEditor';
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

// --------------------
// Recent Projects List
// --------------------

const getRecentProjects = (): RecentProjectMetadata[] => {
    try {
        const projects = localStorage.getItem(RECENT_PROJECTS_KEY);
        return projects ? JSON.parse(projects) : [];
    } catch (e) {
        console.error('Failed to parse recent projects from localStorage', e);
        return [];
    }
};

// --------------------
// Add / Update Recent Project
// --------------------

const addRecentProject = async (
    projectData: any,
    projectInfo: { type: AppType; name: string; projectNumber: string }
) => {
    const timestamp = Date.now();

    /**
     * IMPORTANT:
     * Project data MUST be self-contained.
     * photosData must retain imageUrl (base64).
     * IndexedDB is optional and NOT required for correctness.
     */

    try {
        await storeProject(timestamp, projectData);
    } catch (e) {
        console.error('Failed to save project to IndexedDB:', e);
        return;
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
};

// --------------------
// Date Formatter (unchanged)
// --------------------

const formatDateForRecentProject = (dateString: string): string => {
    if (!dateString) return '';
    try {
        const tempDate = new Date(dateString);
        if (isNaN(tempDate.getTime())) return dateString;

        const year = tempDate.getFullYear();
        const month = tempDate.getMonth();
        const day = tempDate.getDate();

        const utcDate = new Date(Date.UTC(year, month, day));

        const formattedYear = utcDate.getUTCFullYear();
        const formattedMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
        const formattedDay = String(utcDate.getUTCDate()).padStart(2, '0');

        return `${formattedYear}/${formattedMonth}/${formattedDay}`;
    } catch {
        return dateString;
    }
};
// --- End Utility ---

// --- Helper Functions ---
const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = (err) => reject(err);
        img.src = url;
    });
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
            const canvasWidth = 1024;
            const canvasHeight = 768;
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const targetAspectRatio = canvasWidth / canvasHeight;
            const originalAspectRatio = img.width / img.height;
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
// --- End Helper Functions ---


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
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center z-[100] p-4" role="dialog" aria-modal="true">
            <div className="xtec-modal-enter bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col overflow-hidden">
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


// --- UI Components ---
const Section: React.FC<{ title: string; children: React.ReactNode; }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 shadow-md rounded-lg transition-colors duration-200" style={{ overflow: 'visible' }}>
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 border-b-2 border-gray-200 dark:border-gray-700 pb-2 mb-4">{title}</h2>
        <div className="space-y-4" style={{ overflow: 'visible' }}>{children}</div>
    </div>
);

const EditableField: React.FC<{ label: string; value: string; onChange: (value: string) => void; type?: string; isTextArea?: boolean; rows?: number; placeholder?: string; isInvalid?: boolean; }> = ({ label, value, onChange, type = 'text', isTextArea = false, rows = 1, placeholder = '', isInvalid = false }) => {
    const commonClasses = `block w-full p-2 border rounded-md shadow-sm focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition bg-white dark:bg-gray-700 text-black dark:text-white dark:placeholder-gray-400 ${isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`;
    const elementRef = React.useRef<HTMLInputElement & HTMLTextAreaElement>(null);

    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
            {isTextArea ? (
                <textarea
                    ref={elementRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={rows}
                    className={commonClasses}
                    placeholder={placeholder}
                    spellCheck={true}
                />
            ) : (
                <input
                    type={type}
                    ref={elementRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={commonClasses}
                    placeholder={placeholder}
                    spellCheck={true}
                />
            )}
        </div>
    );
};

const ChecklistRow: React.FC<{ label: string; value: ChecklistOption; onChange: (value: ChecklistOption) => void; isInvalid?: boolean; }> = ({ label, value, onChange, isInvalid = false }) => (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b last:border-b-0 ${isInvalid ? 'border-red-500 bg-red-50 dark:bg-red-900/20 px-2 rounded' : 'border-gray-200 dark:border-gray-700'}`}>
        <span className={`font-medium mb-2 sm:mb-0 ${isInvalid ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{label}</span>
        <div className="flex items-center space-x-6">
            {(['Yes', 'No', 'NA'] as ChecklistOption[]).map(option => (
                <label key={option} className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-300">
                    <input
                        type="radio"
                        name={label}
                        value={option}
                        checked={value === option}
                        onChange={() => onChange(option)}
                        className="h-5 w-5 text-[#007D8C] border-gray-300 focus:ring-[#006b7a]"
                    />
                    <span>{option}</span>
                </label>
            ))}
        </div>
    </div>
);

const saskPowerPlaceholders = {
    generalActivity: `08:30 - Leave Estevan to project area.
10:00 - Arrive near structure 285 on B1K. Complete X-Terra hazard assessment. Contact Davey crew and assess access options to get to structure 285.
10:30 - Meet Davey crew and review permits and hazard assessments for Davey and X-Terra. Permit outlines 30m wetland buffer for all herbicide activities (including basal bark).
10:45 - Finish spraying structure #285. Travel to structure #19.
12:30 - Arrive at Structure #19 is located in same quarter section as EM sites 17-18, but structure #19 itself is not in an AHPP area and does not require an EM (confirmed this in person). Crew completed structure #19. Travel to structures 10 and 9.
1:30 - Arrive at structures 10 and 9. Both are EM structures - crews completed herbicide application.
2:00 - Finish structures 10 and 9. All EM sites completed on B1K. Head back to Estevan.
2:30 - Arrive in Estevan. Complete DFR.`,
    equipmentOnsite: `- None`,
    weatherAndGroundConditions: `- Overcast conditions
- Wind 10–20 km/hr
- Temperatures 16–23°C
- Dry and stable ground conditions`,
    environmentalProtection: `- All applicable permit conditions were followed
- Crews remained within approved project boundaries
- Wetland buffers were identified and respected
- No environmental incidents observed`,
    wildlifeObservations: `- Red-Tailed Hawk
- Killdeer
- Western Meadowlark`,
    futureMonitoring: `- Monitoring will continue the following day
- Ongoing observation of vegetation management activities`
};

// --- Main Component ---
interface DfrSaskpowerProps {
    onBack: () => void;
    onBackDirect?: () => void;
    initialData?: any;
}

const DfrSaskpower = ({ onBack, onBackDirect, initialData }: DfrSaskpowerProps): ReactElement => {
    const [data, setData] = useState<DfrSaskpowerData>({
        proponent: 'SaskPower',
        date: '',
        location: '',
        projectName: '',
        vendorAndForeman: '',
        projectNumber: '',
        environmentalMonitor: '',
        envFileNumber: '',
        generalActivity: '',
        locationActivities: [],
        totalHoursWorked: '',
        completedTailgate: '',
        reviewedTailgate: '',
        reviewedPermits: '',
        equipmentOnsite: '',
        weatherAndGroundConditions: '',
        environmentalProtection: '',
        wildlifeObservations: '',
        futureMonitoring: '',
        comments: {},
    });
    const [photosData, setPhotosData] = useState<PhotoData[]>([]);
    const [errors, setErrors] = useState(new Set<string>());
    const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
    const [showUnsupportedFileModal, setShowUnsupportedFileModal] = useState<boolean>(false);
    const [showNoInternetModal, setShowNoInternetModal] = useState(false);
    const [showMigrationNotice, setShowMigrationNotice] = useState(false);
    const [enlargedImageUrl, setEnlargedImageUrl] = useState<string | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; blob?: Blob } | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [openComments, setOpenComments] = useState<Set<string>>(new Set());
    const [zoomLevel, setZoomLevel] = useState(100);
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
    const isDownloadingRef = useRef(false);

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 10, 150));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 10, 70));
    const handleZoomReset = () => setZoomLevel(100);

    // Comments panel state
    const [commentsCollapsed, setCommentsCollapsed] = useState(false);
    const [commentAnchors, setCommentAnchors] = useState<Map<string, CommentAnchor>>(new Map());
    const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);

    // Handler to collect anchor positions from BulletPointEditor instances
    const handleAnchorPositionsChange = useCallback((fieldId: string, anchors: CommentAnchorPosition[]) => {
        setCommentAnchors(prev => {
            // Build the updated map
            const newMap = new Map(prev);
            // Remove old anchors for this field
            for (const key of newMap.keys()) {
                if (key.startsWith(`${fieldId}:`)) {
                    newMap.delete(key);
                }
            }
            // Add new anchors
            anchors.forEach(anchor => {
                const key = `${anchor.fieldId}:${anchor.commentId}`;
                newMap.set(key, {
                    fieldId: anchor.fieldId,
                    commentId: anchor.commentId,
                    top: anchor.top,
                    left: anchor.left,
                    height: anchor.height,
                });
            });
            // Bail out (return same reference) if nothing changed — prevents re-render loop
            if (newMap.size === prev.size) {
                let changed = false;
                for (const [k, v] of newMap) {
                    const p = prev.get(k);
                    if (!p || p.top !== v.top || p.left !== v.left || p.height !== v.height) {
                        changed = true;
                        break;
                    }
                }
                if (!changed) return prev;
            }
            return newMap;
        });
    }, []);

    // Field labels for comments panel
    const fieldLabels: Record<string, string> = useMemo(() => {
        const labels: Record<string, string> = {
            generalActivity: 'General Activity',
            equipmentOnsite: 'Equipment Onsite',
            weatherAndGroundConditions: 'Weather & Ground',
            environmentalProtection: 'Environmental Protection',
            wildlifeObservations: 'Wildlife Observations',
            futureMonitoring: 'Future Monitoring',
        };
        photosData.forEach(p => {
            labels[`photo-${p.id}-description`] = `Photo ${p.photoNumber}`;
        });
        return labels;
    }, [photosData]);

    // Collect all comments from all fields into a single array
    const allComments: FieldComment[] = React.useMemo(() => {
        const comments: FieldComment[] = [];
        // Body fields
        if (data.inlineComments) {
            const fields = ['generalActivity', 'equipmentOnsite', 'weatherAndGroundConditions', 'environmentalProtection', 'wildlifeObservations', 'futureMonitoring'] as const;
            fields.forEach(field => {
                const fieldComments = data.inlineComments?.[field];
                if (fieldComments && Array.isArray(fieldComments) && fieldComments.length > 0) {
                    fieldComments.forEach(comment => {
                        // Skip null/undefined comments or those missing required fields
                        if (!comment || !comment.id || typeof comment.start !== 'number' || typeof comment.end !== 'number') {
                            return;
                        }
                        comments.push({
                            ...comment,
                            fieldId: field,
                            fieldLabel: fieldLabels[field] || field,
                        });
                    });
                }
            });
        }
        // Photo description fields
        photosData.forEach(photo => {
            if (photo.inlineComments && Array.isArray(photo.inlineComments) && photo.inlineComments.length > 0) {
                const fid = `photo-${photo.id}-description`;
                photo.inlineComments.forEach(comment => {
                    if (!comment || !comment.id || typeof comment.start !== 'number' || typeof comment.end !== 'number') return;
                    comments.push({ ...comment, fieldId: fid, fieldLabel: fieldLabels[fid] || `Photo ${photo.photoNumber}` });
                });
            }
        });
        return comments;
    }, [data.inlineComments, photosData, fieldLabels]);

    const hasAnyInlineComments = allComments.length > 0;

    // Helper: check if a fieldId belongs to a photo description
    const getPhotoIdFromFieldId = (fieldId: string): number | null => {
        const match = fieldId.match(/^photo-(\d+)-description$/);
        return match ? parseInt(match[1], 10) : null;
    };

    // Helper: get comments array for a fieldId (body field or photo)
    const getFieldComments = (fieldId: string): TextComment[] | undefined => {
        const photoId = getPhotoIdFromFieldId(fieldId);
        if (photoId !== null) {
            const photo = photosData.find(p => p.id === photoId);
            return photo?.inlineComments;
        }
        return (data.inlineComments as any)?.[fieldId];
    };

    // Helper: update comments for a fieldId (body field or photo)
    const setFieldComments = (fieldId: string, updater: (comments: TextComment[]) => TextComment[]) => {
        const photoId = getPhotoIdFromFieldId(fieldId);
        if (photoId !== null) {
            setPhotosData(prev => prev.map(p =>
                p.id === photoId ? { ...p, inlineComments: updater(p.inlineComments || []) } : p
            ));
        } else {
            setData(prev => ({
                ...prev,
                inlineComments: {
                    ...prev.inlineComments,
                    [fieldId]: updater((prev.inlineComments as any)?.[fieldId] || []),
                },
            }));
        }
        setIsDirty(true);
    };

    // Comment action handlers for CommentsRail
    const handleDeleteComment = (fieldId: string, commentId: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments => comments.filter(c => c.id !== commentId));
        }
    };

    const handleResolveComment = (fieldId: string, commentId: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments =>
                comments.map(c => c.id === commentId ? { ...c, resolved: !c.resolved } : c)
            );
        }
    };

    const handleUpdateComment = (fieldId: string, commentId: string, newText: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments =>
                comments.map(c => c.id === commentId ? { ...c, text: newText } : c)
            );
        }
    };

    // Reply handlers for CommentsRail
    const handleAddReply = (fieldId: string, commentId: string, replyText: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments =>
                comments.map(c => {
                    if (c.id === commentId) {
                        const newReply = {
                            id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
                            text: replyText,
                            author: (window as any).electronAPI?.getUserInfo?.()?.username || 'User',
                            timestamp: new Date(),
                        };
                        return { ...c, replies: [...(c.replies || []), newReply] };
                    }
                    return c;
                })
            );
        }
    };

    const handleDeleteReply = (fieldId: string, commentId: string, replyId: string) => {
        if (getFieldComments(fieldId)) {
            setFieldComments(fieldId, comments =>
                comments.map((c: TextComment) => {
                    if (c.id === commentId && c.replies) {
                        return { ...c, replies: c.replies.filter(r => r.id !== replyId) };
                    }
                    return c;
                })
            );
        }
    };

    // Focus handler - scrolls to comment in text and triggers glow
    const handleFocusComment = (fieldId: string, commentId: string) => {
        // Find the element with the comment underline
        const element = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const processLoadedData = async (projectData: any) => {
        const { photosData: loadedPhotos, ...saskpowerData } = projectData;
        
        let migrationOccurred = false;
        let finalData = { ...data, ...saskpowerData };

        const activitiesToMerge = new Set<string>();
        if (finalData.generalActivity) activitiesToMerge.add(finalData.generalActivity);
        if ((finalData as any).projectActivities) {
            activitiesToMerge.add((finalData as any).projectActivities);
            migrationOccurred = true;
        }

        const allLocationActivities: LocationActivity[] = [];
        if (finalData.locationActivities?.length) allLocationActivities.push(...finalData.locationActivities);
        if ((finalData as any).locationActivities_old?.length) {
            allLocationActivities.push(...(finalData as any).locationActivities_old);
            migrationOccurred = true;
        }
        if ((finalData as any).activityBlocks?.length) {
            for (const block of (finalData as any).activityBlocks) {
                if (block.type === 'general' && block.activities) {
                    activitiesToMerge.add(block.activities);
                } else if (block.type === 'location') {
                    allLocationActivities.push({id: block.id, location: block.location || '', activities: block.activities});
                }
            }
            migrationOccurred = true;
        }
        
        if (allLocationActivities.length > 0) {
            const locationTexts = allLocationActivities.map(
                (loc) => `--- Location: ${loc.location || 'Unspecified'} ---\n${loc.activities}`
            );
            locationTexts.forEach(text => activitiesToMerge.add(text));
            if(finalData.locationActivities?.length > 0) migrationOccurred = true;
        }

        finalData.generalActivity = Array.from(activitiesToMerge).join('\n\n');
        finalData.locationActivities = [];

        delete (finalData as any).activityBlocks;
        delete (finalData as any).projectActivities;
        delete (finalData as any).locationActivities_old;

        setData(finalData);
        
        if (migrationOccurred) {
            setShowMigrationNotice(true);
        }

        if (loadedPhotos && Array.isArray(loadedPhotos)) {
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
        } else {
            setPhotosData([]);
        }
        
        return finalData;
    };

    const parseAndLoadProject = async (fileContent: string) => {
        try {
            const projectData = JSON.parse(fileContent);
            const finalData = await processLoadedData(projectData);

            const formattedDate = formatDateForRecentProject(finalData.date);
            const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
            const projectName = `${finalData.projectName || 'Untitled SaskPower DFR'}${dateSuffix}`;

            const stateForRecent = await prepareStateForRecentProjectStorage(finalData);
            await addRecentProject(stateForRecent, { type: 'dfrSaskpower', name: projectName, projectNumber: finalData.projectNumber });
        } catch (err) {
            alert('Error parsing project file. Ensure it is a valid project file.');
            console.error(err);
        }
    }

    useEffect(() => {
        const loadInitialData = async () => {
            if (initialData) {
                await processLoadedData(initialData);
            } else {
                // Load defaults for new projects
                try {
                    const settings = JSON.parse(localStorage.getItem('xtec_general_settings') || '{}');
                    if (settings.defaultMonitor) {
                         setData(prev => ({ ...prev, environmentalMonitor: settings.defaultMonitor }));
                    }
                } catch (e) {
                    console.error("Failed to load settings", e);
                }
            }
        };
        loadInitialData();
    }, [initialData]);

    // Track whether the unsaved modal was triggered by window close vs Home button
    const pendingCloseRef = useRef(false);

    // Warn before closing browser window (non-Electron fallback)
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

    // Intercept Electron window close (X button)
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

    const handleChange = (field: keyof Omit<DfrSaskpowerData, 'comments' | 'highlights'>, value: string | ChecklistOption | TextHighlight[]) => {
        setData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handleHighlightsChange = (field: keyof Omit<DfrSaskpowerData, 'comments'>, highlights: TextHighlight[]) => {
        setData(prev => ({
            ...prev,
            highlights: {
                ...prev.highlights,
                [field]: highlights
            }
        }));
        setIsDirty(true);
    };

    const handleInlineCommentsChange = (field: keyof Omit<DfrSaskpowerData, 'comments'>, comments: TextComment[]) => {
        setData(prev => ({
            ...prev,
            inlineComments: {
                ...prev.inlineComments,
                [field]: comments
            }
        }));
        setIsDirty(true);
    };
    const toggleComment = (field: string) => {
        setOpenComments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(field)) {
                newSet.delete(field);
            } else {
                newSet.add(field);
            }
            return newSet;
        });
    };

    const handleCommentChange = (field: string, value: string) => {
        setData(prev => ({
            ...prev,
            comments: {
                ...prev.comments,
                [field]: value
            }
        }));
        setIsDirty(true);
    };

    // --- Photo Handlers ---
    const handlePhotoDataChange = (id: number, field: keyof Omit<PhotoData, 'id' | 'imageUrl' | 'imageId'>, value: string) => {
        setPhotosData(prev => prev.map(photo => photo.id === id ? { ...photo, [field]: value } : photo));
        setIsDirty(true);
    };

    const handlePhotoCommentsChange = (photoId: number, comments: TextComment[]) => {
        setPhotosData(prev => prev.map(p => p.id === photoId ? { ...p, inlineComments: comments } : p));
        setIsDirty(true);
    };

    const handlePhotoHighlightsChange = (photoId: number, highlights: TextHighlight[]) => {
        setPhotosData(prev => prev.map(p => p.id === photoId ? { ...p, highlights } : p));
        setIsDirty(true);
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
             });
        };
        reader.readAsDataURL(file);
    };

    const renumberPhotos = (photos: PhotoData[]) => {
        let photoCounter = 0;
        let mapCounter = 0;
        return photos.map((photo) => {
            if (photo.isMap) {
                 mapCounter++;
                 return { ...photo, photoNumber: `Map ${mapCounter}` };
            } else {
                photoCounter++;
                return { ...photo, photoNumber: String(photoCounter) };
            }
        });
    };

    const addPhoto = (insertAtIndex?: number) => {
        const newId = photosData.length > 0 ? Math.max(...photosData.map(p => p.id)) + 1 : 1;
        const newPhoto: PhotoData = {
            id: newId,
            photoNumber: '',
            date: '',
            location: '',
            description: '',
            imageUrl: null,
            direction: '',
            isMap: false,
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
            const photoToRemove = prev.find(p => p.id === id);
            if (photoToRemove && photoToRemove.imageId) {
                deleteImage(photoToRemove.imageId).catch(err => console.error("Failed to delete image from DB", err));
            }
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

   const prepareStateForRecentProjectStorage = async (dataToStore: DfrSaskpowerData) => {
    const photosForStorage = await Promise.all(
        photosData.map(async (photo) => {
            // Keep imageUrl embedded so Recent Projects work offline
            if (photo.imageUrl) {
                const imageId =
                    photo.imageId ||
                    `${dataToStore.projectNumber || 'proj'}-${photo.id}-${Date.now()}`;

                // IndexedDB is optional cache
                try {
                    await storeImage(imageId, photo.imageUrl);
                } catch (e) {
                    console.warn('Failed to cache image in IndexedDB', e);
                }

                return {
                    ...photo,
                    imageId,     // keep imageId
                    imageUrl: photo.imageUrl // KEEP imageUrl
                };
            }

            return photo;
            })
        );
        return { ...dataToStore, photosData: photosForStorage };
    };

    const validateForm = (): boolean => {
        const newErrors = new Set<string>();
        const requiredFields: (keyof DfrSaskpowerData)[] = [
            'date', 'location', 'projectName', 'vendorAndForeman', 
            'projectNumber', 'environmentalMonitor', 'envFileNumber', 
            'generalActivity', 'totalHoursWorked', 'equipmentOnsite', 
            'weatherAndGroundConditions', 'environmentalProtection', 
            'wildlifeObservations', 'futureMonitoring',
            'completedTailgate', 'reviewedTailgate', 'reviewedPermits'
        ];

        requiredFields.forEach(field => {
            const value = data[field];
            if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
                newErrors.add(field);
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

    const addSafeLogo = async (docInstance: any, x: number, y: number, w: number, h: number) => {
        try {
            const logoUrl = await getAssetUrl("xterra-logo.jpg");
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
                reader.onerror = () => {
                    console.error("FileReader failed to read logo");
                    resolve();
                };
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Could not load logo:", e);
            // Fallback: draw text if logo fails
            docInstance.setFontSize(10);
            docInstance.setTextColor(0,0,0);
            docInstance.text("X-TERRA", x, y + 5);
        }
    };

    const handleSavePdf = async () => {
        // Removed internet check to allow offline PDF generation
        if (!validateForm()) return;

        // Show loading indicator
        setStatusMessage('Generating PDF...');
        setShowStatusModal(true);

        // Allow UI to update before heavy processing
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
        const stateForSaving = await prepareStateForRecentProjectStorage(data);
        const formattedDate = formatDateForRecentProject(data.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${data.projectName || 'Untitled SaskPower DFR'}${dateSuffix}`;
        await addRecentProject(stateForSaving, { type: 'dfrSaskpower', name: projectName, projectNumber: data.projectNumber });

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

        // --- PDF Drawing State and Helpers ---
        let bufferedDraws: ((doc: any) => void)[] = [];
        let sectionStartYOnPage = -1;

        const flushDrawBuffer = (docInstance: any, endY: number) => {
            if (bufferedDraws.length > 0 && sectionStartYOnPage !== -1) {
                bufferedDraws.forEach(draw => draw(docInstance));
            }
            bufferedDraws = [];
            sectionStartYOnPage = -1;
        };

        const drawPageBorder = (docInstance: any) => {
            docInstance.setDrawColor(0, 125, 140);
            docInstance.setLineWidth(0.5);
            const startX = borderMargin;
            const endX = pageWidth - borderMargin;
            const bottomY = pageHeight - borderMargin;
      // Bottom line adjustments and spacing
           const BOTTOM_LINE_NUDGE_UP = 4; // mm (use 0.5–2)

            docInstance.line(
            startX,
            bottomY - BOTTOM_LINE_NUDGE_UP,
            endX,
            bottomY - BOTTOM_LINE_NUDGE_UP
);
        };
        
        const drawProjectInfoBlock = (docInstance: any, startY: number, options: { drawTopLine?: boolean, drawBottomLine?: boolean } = {}) => {
            const { drawTopLine = true, drawBottomLine = true } = options;
            const blockPaddingTop = 6;
            const blockPaddingBottom = -1;
            docInstance.setFontSize(12);
            let yPos = startY + blockPaddingTop;

            const drawField = (label: string, value: string, x: number, y: number, maxWidth: number): number => {
                const labelText = `${(label || '').toUpperCase()}:`;
                docInstance.setFont('times', 'bold');
                const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.text(labelText, x, y);
                
                docInstance.setFont('times', 'normal');
                const valueMaxWidth = maxWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth);
                docInstance.text(valueLines, x + labelWidth + 2, y);
                
                return docInstance.getTextDimensions(valueLines).h;
            };

            const col1X = contentMargin;
            const col1MaxWidth = contentWidth * 0.5 - 2;
            const col2X = contentMargin + contentWidth * 0.5 + 2;
            const col2MaxWidth = contentWidth * 0.5 - 2;
            const fieldGap = 1.5;

            // Define fields for each column
            const col1Fields = [
                { label: 'PROPONENT', value: data.proponent },
                { label: 'PROJECT', value: data.projectName },
                { label: 'LOCATION', value: data.location },
                { label: 'ENV FILE NUMBER', value: data.envFileNumber },
            ];

            const col2Fields = [
                { label: 'DATE', value: data.date },
                { label: 'X-TERRA PROJECT #', value: data.projectNumber },
                { label: 'MONITOR', value: data.environmentalMonitor },
                { label: 'VENDOR', value: data.vendorAndForeman },
            ];

            let yPos1 = yPos;
            let yPos2 = yPos;

            // Draw column 1
            col1Fields.forEach(field => {
                const height = drawField(field.label, field.value, col1X, yPos1, col1MaxWidth);
                yPos1 += height + fieldGap;
            });

            // Draw column 2
            col2Fields.forEach(field => {
                const height = drawField(field.label, field.value, col2X, yPos2, col2MaxWidth);
                yPos2 += height + fieldGap;
            });

            // Final Y position is the max of the two columns
            yPos = Math.max(yPos1, yPos2);
            
            const blockBottomY = yPos + blockPaddingBottom;
            
            docInstance.setDrawColor(0, 125, 140);
            docInstance.setLineWidth(0.5);
            if (drawTopLine) docInstance.line(borderMargin, startY, pageWidth - borderMargin, startY);
            if (drawBottomLine) docInstance.line(borderMargin, blockBottomY, pageWidth - borderMargin, blockBottomY);
            return blockBottomY;
        };
        
        const drawDfrHeader = async (docInstance: any) => {
            const headerContentStartY = contentMargin;
            // Use addSafeLogo instead of direct addImage
            await addSafeLogo(docInstance, contentMargin, headerContentStartY, 40, 10);
            
            docInstance.setFontSize(18);
            docInstance.setFont('times', 'bold');
            docInstance.setTextColor(0, 125, 140);
            docInstance.text('DAILY FIELD REPORT', pageWidth / 2, headerContentStartY + 7, { align: 'center' });
            
            docInstance.setTextColor(0, 0, 0);
            let yPos = headerContentStartY + 15;
            yPos = drawProjectInfoBlock(docInstance, yPos);
            return yPos + 4;
        };
        
        
const renderTextSection = async (
    doc: any,
    currentY: number,
    title: string,
    content: string,
    options: { spaceBefore?: number; box?: boolean; forceNewPage?: boolean } = {}
) => {
    const { spaceBefore = 4, box = false, forceNewPage = false } = options;

    if (!content || !content.trim()) return currentY;

    let y = currentY + spaceBefore;

    // -------------------------------------------------------------------
    // OPTION 2 — FORCE ENTIRE SECTION TO START ON A NEW PAGE
    // -------------------------------------------------------------------
    if (forceNewPage) {
        flushDrawBuffer(doc, y);
        drawPageBorder(doc);
        doc.addPage();
        pageNum++;
        y = await drawDfrHeader(doc);
    }

    // -------------------------------------------------------------------
    // 1. BEFORE PRINTING THE HEADER, CHECK IF THERE IS ROOM FOR HEADER + BODY
    // -------------------------------------------------------------------
    const headerHeight = doc.getTextDimensions(title).h + 6;
    const minimumBodyHeight = 12; // space for one body line

    if (y + headerHeight + minimumBodyHeight > maxYPos) {
        flushDrawBuffer(doc, y);
        drawPageBorder(doc);
        doc.addPage();
        pageNum++;

        // Redraw PDF header
        y = await drawDfrHeader(doc);
    }

    // -------------------------------------------------------------------
    // 2. PRINT SECTION TITLE (ONLY ONCE)
    // -------------------------------------------------------------------
    doc.setFont("times", "bold");
    doc.setFontSize(13);

    const titleHeight = doc.getTextDimensions(title).h;
    const titleY = y + (box ? 4 : 0);

    doc.text(title, contentMargin + (box ? 2 : 0), titleY);

    // Move down below header
    y = titleY + titleHeight + 2;

    // Track box boundaries
    let boxStartY = titleY - (box ? 4 : 0);
    let boxEndY = y;

    // -------------------------------------------------------------------
    // 3. BODY TEXT STYLING
    // -------------------------------------------------------------------
    doc.setFont("times", "normal");
    doc.setFontSize(12);

    const lines = content.split("\n");

    // -------------------------------------------------------------------
    // 4. RENDER BODY LINES WITH CORRECT PAGE BREAK LOGIC
    // -------------------------------------------------------------------
    for (const line of lines) {
        // Blank line → small spacing
        if (line.trim() === "") {
            y += 4;
            boxEndY = y;
            continue;
        }

        // Determine indent from leading spaces
        const match = line.match(/^\s*/);
        const indentSpaces = match ? match[0].length : 0;
        const indentLevel = Math.floor(indentSpaces / 2);
        const indentWidth = indentLevel * 5;

        const trimmed = line.trim();
        const isBullet = trimmed.startsWith("-");
        const textContent = isBullet ? trimmed.slice(1).trim() : trimmed;

        const maxWidth =
            contentWidth -
            indentWidth -
            (isBullet ? 5 : 0) -
            (box ? 4 : 0);

        const split = doc.splitTextToSize(textContent, maxWidth);
        const textHeight = doc.getTextDimensions(split).h + 2;

        // -------------------------------------------------------------------
        // PAGE BREAK HANDLING — CONTINUATION TEXT MUST LOOK NORMAL
        // -------------------------------------------------------------------
        if (y + textHeight > maxYPos) {
            flushDrawBuffer(doc, y);
            drawPageBorder(doc);
            doc.addPage();
            pageNum++;

            // Reset to top of new page content area
            y = await drawDfrHeader(doc);

            // RESET FONT STATE (fixes bold bleed)
            doc.setFont("times", "normal");
            doc.setFontSize(12);

            // Reset box boundary for continuation
            boxStartY = y;
        }

        // Render bullet or text
        const renderY = y;

        let textX =
            contentMargin +
            indentWidth +
            (box ? 2 : 0) +
            (isBullet ? 5 : 0);

        if (isBullet) {
            const bulletX = contentMargin + indentWidth + (box ? 2 : 0);
            doc.text("-", bulletX, renderY);
        }

        doc.text(split, textX, renderY);

        y += textHeight;
        boxEndY = y;
    }

    // -------------------------------------------------------------------
    // 5. DRAW BOX AROUND ENTIRE SECTION (IF USED)
    // -------------------------------------------------------------------
    if (box) {
        const h = boxEndY - boxStartY + 4;
        doc.setDrawColor(128, 128, 128);
        doc.setLineWidth(0.25);
        doc.rect(contentMargin, boxStartY, contentWidth, h);
    }

    return box ? y + 4 : y;
};





        
        let yPos = await drawDfrHeader(doc);
        
        yPos = await renderTextSection(doc, yPos, 'Project Activities (detailed description with timestamps):', data.generalActivity);
        flushDrawBuffer(doc, yPos);
        
        const otherTextSections = [
            { title: 'X-Terra Equipment Onsite:', content: data.equipmentOnsite },
            { title: 'Weather and Ground Conditions:', content: data.weatherAndGroundConditions },
            { title: 'Environmental Protection Measures and Mitigation:', content: data.environmentalProtection },
            { title: 'Wildlife Observations:', content: data.wildlifeObservations },
            { title: 'Future Monitoring Requirements:', content: data.futureMonitoring },
        ];
        
        for (const { title, content } of otherTextSections) {
            yPos = await renderTextSection(doc, yPos, title, content);
            flushDrawBuffer(doc, yPos);
        }

        const checklistItems = [
            { label: 'Completed/Reviewed X-Terra Tailgate:', value: data.completedTailgate },
            { label: 'Reviewed/Signed Crew Tailgate:', value: data.reviewedTailgate },
            { label: 'Reviewed Permit(s) with Crew(s):', value: data.reviewedPermits },
        ];
        
        const checklistSectionHeight = 4 + (checklistItems.length * 8) + 10;
        if (yPos + checklistSectionHeight > maxYPos) {
            drawPageBorder(doc); doc.addPage(); pageNum++; yPos = await drawDfrHeader(doc);
        }
        
        sectionStartYOnPage = yPos + 4;
        yPos += 4;
        
        checklistItems.forEach(item => { 
            const itemY = yPos;
            bufferedDraws.push(d => {
                const options: ChecklistOption[] = ['Yes', 'No', 'NA'];
                const circleRadius = 1.5; const spaceBetweenOptions = 20;
                d.setFontSize(10); d.setFont('times', 'normal'); d.text(item.label, contentMargin, itemY);
                d.setLineWidth(0.25); d.setDrawColor(0, 0, 0); d.setTextColor(0, 0, 0);
                let currentX = pageWidth - contentMargin - (options.length * spaceBetweenOptions);
                options.forEach(option => {
                    const circleY = itemY - circleRadius / 2;
                    if (option === item.value) { d.setFillColor(0, 125, 140); d.circle(currentX, circleY, circleRadius, 'FD'); }
                    else { d.circle(currentX, circleY, circleRadius, 'S'); }
                    d.text(option, currentX + circleRadius + 2, itemY);
                    currentX += spaceBetweenOptions;
                });
            });
            yPos += 8;
        });

        const hoursY = yPos + 4;
        bufferedDraws.push(d => {
            d.setFontSize(10); d.setFont('times', 'bold');
            d.text(`Total Hours Worked: ${data.totalHoursWorked}`, contentMargin, hoursY);
        });
        yPos = hoursY + doc.getTextDimensions(`Total Hours Worked: ${data.totalHoursWorked}`).h;
        flushDrawBuffer(doc, yPos);


        drawPageBorder(doc);
        
        // --- Photo Log Section ---
        const drawPhotoPageHeader = async (docInstance: any) => {
            const startY = borderMargin;
            docInstance.setDrawColor(0, 125, 140);
            docInstance.setLineWidth(0.5);
            docInstance.line(borderMargin, startY, pageWidth - borderMargin, startY);
            const yAfterBlock = drawProjectInfoBlock(docInstance, startY, { drawTopLine: false });
            return yAfterBlock + 1;
        };

        const sitePhotos = photosData.filter(p => !p.isMap && p.imageUrl);
        const mapPhotosData = photosData.filter(p => p.isMap && p.imageUrl);
        
        const calculatePhotoEntryHeight = async (docInstance: any, photo: PhotoData): Promise<number> => {
                    const gap = 5;
                    const availableWidth = contentWidth - gap;
                    const textBlockWidth = availableWidth * 0.33;
                    const imageBlockWidth = availableWidth * 0.73;
                    
                    docInstance.setFontSize(12);
                    let textHeight = 0;
                    const textMetrics = docInstance.getTextDimensions('Photo');
                    textHeight += textMetrics.h * 0.75;
                    
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
        
                    let imageH = 0;
                    if (photo.imageUrl) {
                        try {
                            const { width, height } = await getImageDimensions(photo.imageUrl);
                            imageH = height * (imageBlockWidth / width);
                        } catch (e) {
                            console.error("Could not load image for height calculation", e);
                        }
                    }
                    return Math.max(textHeight, imageH);
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
                
                 const drawPhotoEntry = async (
                          docInstance: any,
                          photo: PhotoData,
                          yStart: number
                        ) => {
                          const gap = 5;
                          const availableWidth = contentWidth - gap;
                          const textBlockWidth = availableWidth * 0.33;
                        
                          // Bigger photo (fixed size)
                          const imageBlockWidth = availableWidth * 0.73;      // wider
                          const imageBlockHeight = imageBlockWidth * (3 / 4); // 4:3 ratio
                        
                          // Shift photo slightly to the right
                          const PHOTO_X_NUDGE = -5; // mm
                          const imageX =
                            contentMargin +
                            textBlockWidth +
                            gap +
                            PHOTO_X_NUDGE;
                        
                            drawPhotoEntryText(docInstance, photo, contentMargin, yStart, textBlockWidth);
                
                            if (photo.imageUrl) {
                                const { width, height } = await getImageDimensions(photo.imageUrl);
                                const scaledHeight = height * (imageBlockWidth / width);
                                docInstance.addImage(photo.imageUrl, 'JPEG', imageX, yStart, imageBlockWidth, scaledHeight);
                            }
                        };
        
                if (sitePhotos.length > 0) {
                    setStatusMessage(`Processing ${sitePhotos.length} photo(s)...`);
                    await new Promise(resolve => setTimeout(resolve, 10));
                    const entryHeights = await Promise.all(sitePhotos.map(p => calculatePhotoEntryHeight(doc, p)));
                    const dummyDoc = new jsPDF();
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
        
                    let isFirstPhotoPage = true;
                    for (const group of pages) {
                        doc.addPage(); pageNum++;
                        isFirstPhotoPage = false;
                        
                        let yPos = await drawPhotoPageHeader(doc);
                        const photosOnPage = group.map(i => sitePhotos[i]);
                        const heightsOnPage = group.map(i => entryHeights[i]);
                        const availableHeight = maxYPos - yPos;
        
                        if (photosOnPage.length === 1) {
                            await drawPhotoEntry(doc, photosOnPage[0], yPos);
                        } else {
                            const totalContentHeight = heightsOnPage.reduce((sum, h) => sum + h, 0);
                            const tightGap = 4; // The smaller gap above photos
                            
                            const totalRemainingSpace = availableHeight - totalContentHeight - (tightGap * 2);
                            const largeGap = totalRemainingSpace > 0 ? totalRemainingSpace / 2 : 2;
        
                            // Position first photo
                            yPos += tightGap;
                            await drawPhotoEntry(doc, photosOnPage[0], yPos);
                            yPos += heightsOnPage[0];
        
                            // Position separator line
                            yPos += largeGap;
                            doc.setDrawColor(0, 125, 140); // Teal
                            doc.setLineWidth(0.5);
                            const MIDDLE_LINE_NUDGE = -2; // mm (negative = up, positive = down)
                            doc.line(
                                borderMargin,
                                yPos + MIDDLE_LINE_NUDGE,
                                pageWidth - borderMargin,
                                yPos + MIDDLE_LINE_NUDGE
                    );
                            // Position second photo
                            yPos += tightGap;
                            await drawPhotoEntry(doc, photosOnPage[1], yPos);
                        }
                        drawPageBorder(doc);
                    }
                }
        const calculateMapTextHeight = (docInstance: any, photo: PhotoData, textBlockWidth: number): number => {
            let height = 0; docInstance.setFontSize(12); docInstance.setFont('times', 'normal'); const textMetrics = docInstance.getTextDimensions('Photo'); height += textMetrics.h * 0.75;
            const measureField = (label: string, value: string) => {
                docInstance.setFont('times', 'bold'); const labelText = `${label}:`; const labelWidth = docInstance.getTextWidth(labelText);
                docInstance.setFont('times', 'normal'); const valueMaxWidth = textBlockWidth - labelWidth - 2;
                const valueLines = docInstance.splitTextToSize(value || ' ', valueMaxWidth); return docInstance.getTextDimensions(valueLines).h + 1.5;
            };
            height += measureField("Map", photo.photoNumber); height += measureField("Date", photo.date); height += measureField("Location", photo.location);
            height += 5; const descLines = docInstance.splitTextToSize(photo.description || ' ', textBlockWidth); height += docInstance.getTextDimensions(descLines).h; return height;
        };

        if (mapPhotosData.length > 0) {
            for (const map of mapPhotosData) {
                doc.addPage(); pageNum++; let yPosMap = await drawPhotoPageHeader(doc);
                const footerAndGapHeight = 25; const textBlockHeight = calculateMapTextHeight(doc, map, contentWidth);
                const availableHeightForImage = pageHeight - yPosMap - footerAndGapHeight - textBlockHeight; const availableWidthForImage = contentWidth; let yPosAfterImage = yPosMap;
                if (map.imageUrl) {
                    const { width: imgW, height: imgH } = await getImageDimensions(map.imageUrl);
                    const ratio = Math.min(availableWidthForImage / imgW, availableHeightForImage / imgH);
                    const drawWidth = imgW * ratio; const drawHeight = imgH * ratio; const drawX = contentMargin + (availableWidthForImage - drawWidth) / 2;
                    doc.addImage(map.imageUrl, 'JPEG', drawX, yPosMap, drawWidth, drawHeight); yPosAfterImage = yPosMap + drawHeight + 8;
                }
                drawPhotoEntryText(doc, map, contentMargin, yPosAfterImage, contentWidth); drawPageBorder(doc);
            }
        }

        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const filename = `${sanitize(data.projectNumber) || 'project'}_SaskPower_DFR.pdf`;
        const totalPages = (doc.internal as any).getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i); doc.setFontSize(10); doc.setFont('times', 'normal'); doc.setTextColor(0, 0, 0);
            const footerTextY = pageHeight - borderMargin + 4; doc.text(`Page ${i} of ${totalPages}`, pageWidth - borderMargin, footerTextY, { align: 'right' });
        }
        
        perfMark('pdf-gen-end');
        perfMeasure('PDF generation (DfrSaskpower)', 'pdf-gen-start', 'pdf-gen-end');
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        setPdfPreview({ url: pdfUrl, filename, blob: pdfBlob });
        } finally {
            setShowStatusModal(false);
        }
    };

    const handleQuickSave = async () => {
        const stateForRecentProjects = await prepareStateForRecentProjectStorage(data);
        const formattedDate = formatDateForRecentProject(data.date);
        const dateSuffix = formattedDate ? ` - ${formattedDate}` : '';
        const projectName = `${data.projectName || 'Untitled SaskPower DFR'}${dateSuffix}`;
        await addRecentProject(stateForRecentProjects, { type: 'dfrSaskpower', name: projectName, projectNumber: data.projectNumber });
        setIsDirty(false);
        toast('Saved ✓');
    };
    quickSaveRef.current = handleQuickSave;

    const handleSaveProject = async () => {
        await handleQuickSave();
        const photosForExport = photosData.map(({ imageId, ...photo }) => photo);
        const stateForFileExport = { ...data, photosData: photosForExport };
        const sanitize = (name: string) => name.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const formattedFilenameDate = formatDateForFilename(data.date);
        const sanitizedProjectName = sanitize(data.projectName);
        const filename = `${sanitizedProjectName || 'project'}_${formattedFilenameDate}.spdfr`;
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
            const zipFilename = `${sanitize(data.projectNumber) || 'project'}_${sanitize(data.projectName) || 'saskpower-dfr'}_Photos.zip`;
            
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
    }, [photosData, data]);

    // Create a ref to hold the latest handler function.
    const downloadHandlerRef = useRef(handleDownloadPhotos);
    useEffect(() => {
        downloadHandlerRef.current = handleDownloadPhotos;
    }, [handleDownloadPhotos]);

    // Create a stable listener function that always calls the latest handler from the ref.
    const stableListener = useCallback(() => {
        if (downloadHandlerRef.current) {
            downloadHandlerRef.current();
        }
    }, []);

    // Effect to add and remove the stable listener.
    useEffect(() => {
        const api = window.electronAPI;
        if (api && api.onDownloadPhotos && api.removeAllDownloadPhotosListeners) {
            // On mount, defensively remove any lingering listeners. This ensures that only
            // this active component instance reacts to the download command from the main menu.
            api.removeAllDownloadPhotosListeners();
            
            // Then, add the listener for this specific component instance.
            api.onDownloadPhotos(stableListener);
        }
        
        return () => {
            // On unmount, clean up the listener we added to prevent memory leaks.
            if (api && api.removeDownloadPhotosListener) {
                api.removeDownloadPhotosListener(stableListener);
            }
        };
    }, [stableListener]); // stableListener is memoized, so this effect runs once on mount/unmount.

    // Keyboard shortcut listeners
    useEffect(() => {
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
    }, [data, photosData]);

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
        const name = data.projectName || '';
        const num = data.projectNumber || '';
        const prefix = [num, name].filter(Boolean).join(' – ');
        document.title = prefix ? `${prefix} | X-TEC` : 'X-TEC Digital Reporting';
        return () => { document.title = 'X-TEC Digital Reporting'; };
    }, [data.projectName, data.projectNumber]);

    const handleOpenProject = async () => {
        // @ts-ignore
        if (window.electronAPI) {
            // @ts-ignore
            const fileContent = await window.electronAPI.loadProject('spdfr');
            if (fileContent) {
                await parseAndLoadProject(fileContent);
            }
        } else {
            fileInputRef.current?.click();
        }
    };
    
    const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const fileContent = await file.text();
        await parseAndLoadProject(fileContent);
        if (event.target) {
            event.target.value = '';
        }
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

            {/* Flex container: content + comments side by side, scroll together */}
            <div className="flex justify-center gap-2 lg:gap-4 p-2 sm:p-4 lg:p-6 xl:p-8">
                {/* Main content column - scales down on laptops to fit comments */}
                <div className="flex-1 min-w-0 max-w-[1400px]">
                {showMigrationNotice && (
                    <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-6 rounded-md shadow-sm" role="alert">
                        <div className="flex">
                            <div className="py-1">
                                <svg className="fill-current h-6 w-6 text-blue-500 mr-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z"/></svg>
                            </div>
                            <div>
                                <p className="font-bold">Project format updated</p>
                                <p className="text-sm">This project was opened in an older format and has been automatically updated. Please save the project to keep these changes.</p>
                            </div>
                            <button onClick={() => setShowMigrationNotice(false)} className="ml-auto -mx-1.5 -my-1.5 bg-blue-100 text-blue-500 rounded-lg focus:ring-2 focus:ring-blue-400 p-1.5 hover:bg-blue-200 inline-flex h-8 w-8" aria-label="Dismiss">
                                <span className="sr-only">Dismiss</span>
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                            </button>
                        </div>
                    </div>
                )}
                <div className="sticky top-0 z-40 bg-gray-100 dark:bg-gray-900 py-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                        <button onClick={handleBack} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                            <ArrowLeftIcon /> <span>Home</span>
                        </button>
                        <div className="flex flex-wrap justify-end gap-2">
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
                            <button onClick={handleOpenProject} className="border border-[#007D8C] text-[#007D8C] hover:bg-[#007D8C]/10 dark:hover:bg-[#007D8C]/10 font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                                <FolderOpenIcon /> <span>Open Project</span>
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileSelected} style={{ display: 'none' }} accept=".spdfr" />
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
                            {/* @ts-ignore */}
                            {!window.electronAPI && (
                                <button onClick={handleDownloadPhotos} className="border border-[#007D8C] text-[#007D8C] hover:bg-[#007D8C]/10 dark:hover:bg-[#007D8C]/10 font-semibold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition duration-200">
                                    <FolderArrowDownIcon /> <span>Download Photos</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center justify-end gap-1 mb-4">
                    <button onClick={handleZoomOut} className="p-1.5 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition" title="Zoom out">
                        <ZoomOutIcon className="h-4 w-4" />
                    </button>
                    <button onClick={handleZoomReset} className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition min-w-[3rem]" title="Reset zoom">
                        {zoomLevel}%
                    </button>
                    <button onClick={handleZoomIn} className="p-1.5 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition" title="Zoom in">
                        <ZoomInIcon className="h-4 w-4" />
                    </button>
                </div>

                <div className="main-content space-y-8" style={{ overflow: 'visible', transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left', width: `${10000 / zoomLevel}%` }}>
                    {/* Header Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 shadow-md rounded-lg transition-colors duration-200" style={{ overflow: 'visible' }}>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] md:items-center pb-4 gap-4">
                            <div className="flex justify-center md:justify-start">
                                <SafeImage fileName="xterra-logo.png" alt="X-TERRA Logo" className="h-14 w-auto dark:hidden" />
                                <SafeImage fileName="xterra-white.png" alt="X-TERRA Logo" className="h-14 w-auto hidden dark:block" />
                            </div>
                            <h1 className="font-extrabold text-[#007D8C] tracking-wider text-center whitespace-nowrap text-4xl">
                                DAILY FIELD REPORT
                            </h1>
                            <div></div>
                        </div>
                        <div className="border-t-4 border-[#007D8C] mb-4"></div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             {/* Col 1 */}
                            <div className="space-y-4">
                                <EditableField label="PROPONENT" value={data.proponent} onChange={(v) => handleChange('proponent', v)} isInvalid={errors.has('proponent')} />
                                <EditableField label="PROJECT" value={data.projectName} onChange={(v) => handleChange('projectName', v)} isInvalid={errors.has('projectName')} />
                                <EditableField label="LOCATION" value={data.location} onChange={(v) => handleChange('location', v)} isTextArea isInvalid={errors.has('location')} />
                                <EditableField label="ENV FILE NUMBER" value={data.envFileNumber} onChange={(v) => handleChange('envFileNumber', v)} isInvalid={errors.has('envFileNumber')} />
                            </div>
                            {/* Col 2 */}
                             <div className="space-y-4">
                                <EditableField label="DATE" value={data.date} onChange={(v) => handleChange('date', v)} placeholder="Month Day, Year" isInvalid={errors.has('date')} />
                                <EditableField label="X-TERRA PROJECT #" value={data.projectNumber} onChange={(v) => handleChange('projectNumber', v)} isInvalid={errors.has('projectNumber')} />
                                <EditableField label="MONITOR" value={data.environmentalMonitor} onChange={(v) => handleChange('environmentalMonitor', v)} isInvalid={errors.has('environmentalMonitor')} />
                                <EditableField label="VENDOR & FOREMAN" value={data.vendorAndForeman} onChange={(v) => handleChange('vendorAndForeman', v)} isInvalid={errors.has('vendorAndForeman')} />
                            </div>
                        </div>
                    </div>

                    {/* Project Activities */}
                    <Section title="Project Activities">
                         <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Project Activities (detailed description with timestamps)</label>
                             <button onClick={() => toggleComment('generalActivity')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('generalActivity') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                            </button>
                        </div>
                         {openComments.has('generalActivity') && (
                            <textarea value={data.comments?.generalActivity || ''} onChange={(e) => handleCommentChange('generalActivity', e.target.value)} placeholder="Add a comment for editing purposes..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 text-gray-900 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" spellCheck={true} />
                        )}
                        <BulletPointEditor label="" fieldId="generalActivity" value={data.generalActivity} highlights={data.highlights?.generalActivity} inlineComments={data.inlineComments?.generalActivity} onChange={(v) => handleChange('generalActivity', v)} onHighlightsChange={(h) => handleHighlightsChange('generalActivity', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('generalActivity', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('generalActivity', a)} hoveredCommentId={hoveredCommentId} rows={15} placeholder={saskPowerPlaceholders.generalActivity} isInvalid={errors.has('generalActivity')} />
                    </Section>

                    {/* Equipment & Conditions */}
                    <Section title="Equipment and Conditions">
                        <div className="space-y-4">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">X-Terra Equipment Onsite</label>
                                     <button onClick={() => toggleComment('equipmentOnsite')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('equipmentOnsite') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('equipmentOnsite') && (
                                    <textarea value={data.comments?.equipmentOnsite || ''} onChange={(e) => handleCommentChange('equipmentOnsite', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 text-gray-900 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="equipmentOnsite" value={data.equipmentOnsite} highlights={data.highlights?.equipmentOnsite} inlineComments={data.inlineComments?.equipmentOnsite} onChange={(v) => handleChange('equipmentOnsite', v)} onHighlightsChange={(h) => handleHighlightsChange('equipmentOnsite', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('equipmentOnsite', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('equipmentOnsite', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.equipmentOnsite} isInvalid={errors.has('equipmentOnsite')} />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Weather and Ground Conditions</label>
                                     <button onClick={() => toggleComment('weatherAndGroundConditions')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('weatherAndGroundConditions') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('weatherAndGroundConditions') && (
                                    <textarea value={data.comments?.weatherAndGroundConditions || ''} onChange={(e) => handleCommentChange('weatherAndGroundConditions', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 text-gray-900 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="weatherAndGroundConditions" value={data.weatherAndGroundConditions} highlights={data.highlights?.weatherAndGroundConditions} inlineComments={data.inlineComments?.weatherAndGroundConditions} onChange={(v) => handleChange('weatherAndGroundConditions', v)} onHighlightsChange={(h) => handleHighlightsChange('weatherAndGroundConditions', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('weatherAndGroundConditions', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('weatherAndGroundConditions', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.weatherAndGroundConditions} isInvalid={errors.has('weatherAndGroundConditions')} />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Environmental Protection Measures and Mitigation</label>
                                     <button onClick={() => toggleComment('environmentalProtection')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('environmentalProtection') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('environmentalProtection') && (
                                    <textarea value={data.comments?.environmentalProtection || ''} onChange={(e) => handleCommentChange('environmentalProtection', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 text-gray-900 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="environmentalProtection" value={data.environmentalProtection} highlights={data.highlights?.environmentalProtection} inlineComments={data.inlineComments?.environmentalProtection} onChange={(v) => handleChange('environmentalProtection', v)} onHighlightsChange={(h) => handleHighlightsChange('environmentalProtection', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('environmentalProtection', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('environmentalProtection', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.environmentalProtection} isInvalid={errors.has('environmentalProtection')} />
                            </div>
                            
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Wildlife Observations</label>
                                     <button onClick={() => toggleComment('wildlifeObservations')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('wildlifeObservations') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('wildlifeObservations') && (
                                    <textarea value={data.comments?.wildlifeObservations || ''} onChange={(e) => handleCommentChange('wildlifeObservations', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 text-gray-900 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="wildlifeObservations" value={data.wildlifeObservations} highlights={data.highlights?.wildlifeObservations} inlineComments={data.inlineComments?.wildlifeObservations} onChange={(v) => handleChange('wildlifeObservations', v)} onHighlightsChange={(h) => handleHighlightsChange('wildlifeObservations', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('wildlifeObservations', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('wildlifeObservations', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.wildlifeObservations} isInvalid={errors.has('wildlifeObservations')} />
                            </div>

                             <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Future Monitoring Requirements</label>
                                     <button onClick={() => toggleComment('futureMonitoring')} title="Toggle comment" className={`p-1 rounded-full ${openComments.has('futureMonitoring') ? 'bg-yellow-200 text-yellow-800' : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'}`}>
                                        <ChatBubbleLeftIcon className="h-5 w-5 text-black dark:text-yellow-400" />
                                    </button>
                                </div>
                                {openComments.has('futureMonitoring') && (
                                    <textarea value={data.comments?.futureMonitoring || ''} onChange={(e) => handleCommentChange('futureMonitoring', e.target.value)} placeholder="Add a comment..." rows={2} className="block w-full p-2 border border-yellow-300 bg-yellow-50 text-gray-900 rounded-md shadow-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition mb-2" spellCheck={true} />
                                )}
                                <BulletPointEditor label="" fieldId="futureMonitoring" value={data.futureMonitoring} highlights={data.highlights?.futureMonitoring} inlineComments={data.inlineComments?.futureMonitoring} onChange={(v) => handleChange('futureMonitoring', v)} onHighlightsChange={(h) => handleHighlightsChange('futureMonitoring', h)} onInlineCommentsChange={(c) => handleInlineCommentsChange('futureMonitoring', c)} onAnchorPositionsChange={(a) => handleAnchorPositionsChange('futureMonitoring', a)} hoveredCommentId={hoveredCommentId} rows={3} placeholder={saskPowerPlaceholders.futureMonitoring} isInvalid={errors.has('futureMonitoring')} />
                            </div>
                        </div>
                    </Section>

                    {/* Checklists & Hours */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <Section title="Daily Checklists">
                             <div className="space-y-0">
                                <ChecklistRow label="Completed/Reviewed X-Terra Tailgate" value={data.completedTailgate} onChange={(v) => handleChange('completedTailgate', v)} isInvalid={errors.has('completedTailgate')} />
                                <ChecklistRow label="Reviewed/Signed Crew Tailgate" value={data.reviewedTailgate} onChange={(v) => handleChange('reviewedTailgate', v)} isInvalid={errors.has('reviewedTailgate')} />
                                <ChecklistRow label="Reviewed Permit(s) with Crew(s)" value={data.reviewedPermits} onChange={(v) => handleChange('reviewedPermits', v)} isInvalid={errors.has('reviewedPermits')} />
                            </div>
                        </Section>
                        
                         <Section title="Total Hours">
                            <EditableField label="Total Hours Worked" value={data.totalHoursWorked} onChange={(v) => handleChange('totalHoursWorked', v)} placeholder="e.g., 10.5" isInvalid={errors.has('totalHoursWorked')} />
                        </Section>
                    </div>

                    <div className="border-t-4 border-[#007D8C] my-10" />

                    <h2 className="text-3xl font-bold text-gray-700 dark:text-white text-center">Photographic Log</h2>
                    
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
                                    headerDate={data.date}
                                    headerLocation={data.location}
                                    onAutoFill={(f, val) => handlePhotoDataChange(photo.id, f, val)}
                                    inlineComments={photo.inlineComments}
                                    onInlineCommentsChange={(comments) => handlePhotoCommentsChange(photo.id, comments)}
                                    highlights={photo.highlights}
                                    onHighlightsChange={(highlights) => handlePhotoHighlightsChange(photo.id, highlights)}
                                    onAnchorPositionsChange={(anchors) => handleAnchorPositionsChange(`photo-${photo.id}-description`, anchors)}
                                    hoveredCommentId={hoveredCommentId}
                                />
                                {index < photosData.length - 1 && (
                                     <div className="relative my-6 flex items-center justify-center">
                                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                            <div className="w-full border-t-2 border-gray-300 dark:border-gray-600"></div>
                                        </div>
                                        <div className="relative">
                                            <button
                                                onClick={() => addPhoto(index)}
                                                className="bg-white hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 text-[#007D8C] font-bold py-2 px-4 rounded-full border border-gray-300 dark:border-gray-600 inline-flex items-center gap-2 transition duration-200 shadow-sm"
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

                    <div className="mt-8 flex justify-center gap-4">
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

                {/* Comments pane - hidden on small screens, visible on laptops+ */}
                {hasAnyInlineComments && (
                    <div className="hidden lg:block flex-shrink-0 sticky top-4 self-start">
                        <CommentsRail
                            comments={allComments}
                            anchors={commentAnchors}
                            isCollapsed={commentsCollapsed}
                            onToggleCollapsed={() => setCommentsCollapsed(!commentsCollapsed)}
                            onDeleteComment={handleDeleteComment}
                            onResolveComment={handleResolveComment}
                            onUpdateComment={handleUpdateComment}
                            onAddReply={handleAddReply}
                            onDeleteReply={handleDeleteReply}
                            onHoverComment={setHoveredCommentId}
                            onFocusComment={handleFocusComment}
                            contentShiftAmount={160}
                            railWidth={300}
                        />
                    </div>
                )}
            </div>

            {/* Modals */}
             {showUnsupportedFileModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md transform scale-95 hover:scale-100 transition-transform duration-300">
                        <button onClick={() => setShowUnsupportedFileModal(false)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <SafeImage fileName="loading-error.gif" alt="Unsupported file type" className="mx-auto mb-4 w-40 h-40" />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">Unsupported File Type</h3>
                        <p className="text-gray-600 dark:text-gray-300">Please upload a supported image file (JPG, PNG).</p>
                    </div>
                </div>
            )}
            {showValidationErrorModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 transition-opacity duration-300">
                    <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md transform scale-95 hover:scale-100 transition-transform duration-300">
                        <button onClick={() => setShowValidationErrorModal(false)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                            <CloseIcon className="h-6 w-6" />
                        </button>
                        <SafeImage fileName="loading-error.gif" alt="Missing info" className="mx-auto mb-4 w-40 h-40" />
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">Missing Information</h3>
                        <p className="text-gray-600 dark:text-gray-300">Please fill in all required fields (highlighted in red).</p>
                    </div>
                </div>
            )}
            {showNoInternetModal && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
                     <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-2xl text-center relative max-w-md">
                        <button onClick={() => setShowNoInternetModal(false)} className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><CloseIcon className="h-6 w-6" /></button>
                        <h3 className="text-2xl font-bold mb-2 text-gray-800 dark:text-white">No Internet Connection</h3>
                        <p className="text-gray-600 dark:text-gray-300">Internet is required for PDF generation.</p>
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

export default DfrSaskpower;