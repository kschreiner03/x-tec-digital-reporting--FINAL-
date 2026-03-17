import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CloseIcon, FolderOpenIcon, SearchIcon, TrashIcon, SaveIcon, DownloadIcon, DocumentDuplicateIcon } from './icons';
import { AppType } from '../App';
import { RecentProject, ProjectStatus } from './LandingPage';
import { deleteImage, deleteProject, deleteThumbnail, retrieveProject, retrieveThumbnail, storeProject, storeThumbnail } from './db';
import { safeSet } from './safeStorage';
import ConfirmModal from './ConfirmModal';
import { toast } from './Toast';

const RECENT_PROJECTS_KEY = 'xtec_recent_projects';
const FOLDERS_KEY = 'xtec_project_folders';

const EXT_MAP: Record<AppType, string> = {
    photoLog: 'plog',
    dfrStandard: 'dfr',
    dfrSaskpower: 'spdfr',
    combinedLog: 'clog',
};

interface ProjectsViewProps {
    onClose: () => void;
    onOpenProject: (project: RecentProject) => void;
}

const getRecentProjects = (): RecentProject[] => {
    try {
        const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
};

const saveProjects = (projects: RecentProject[]) => {
    safeSet(RECENT_PROJECTS_KEY, JSON.stringify(projects));
};

const getFolders = (): string[] => {
    try {
        const raw = localStorage.getItem(FOLDERS_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
};

const saveFolders = (folders: string[]) => {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
};

const getReportTypeName = (type: AppType): string => {
    switch (type) {
        case 'photoLog': return 'Photo Log';
        case 'dfrStandard': return 'Daily Field Report';
        case 'dfrSaskpower': return 'SaskPower DFR';
        case 'combinedLog': return 'Combined Log';
        default: return 'Report';
    }
};

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
    draft:     { label: 'Draft',     className: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
    review:    { label: 'In Review', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
    final:     { label: 'Final',     className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
    submitted: { label: 'Submitted', className: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
};

const ProjectsView: React.FC<ProjectsViewProps> = ({ onClose, onOpenProject }) => {
    const [projects, setProjects] = useState<RecentProject[]>([]);
    const [folders, setFolders] = useState<string[]>([]);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
    const [confirmDelete, setConfirmDelete] = useState<RecentProject | null>(null);
    const [contextMenu, setContextMenu] = useState<{ project: RecentProject; x: number; y: number } | null>(null);
    const [contextSubmenu, setContextSubmenu] = useState<'folder' | 'status' | null>(null);
    const [newFolderInput, setNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [exporting, setExporting] = useState<number | null>(null);
    const newFolderRef = useRef<HTMLInputElement>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loaded = getRecentProjects();
        setProjects(loaded);
        setFolders(getFolders());
        loaded.forEach(async (p) => {
            try {
                const thumb = await retrieveThumbnail(p.timestamp);
                if (thumb) setThumbnails(prev => ({ ...prev, [p.timestamp]: thumb }));
            } catch { /* no thumbnail */ }
        });
    }, []);

    useEffect(() => {
        if (newFolderInput) newFolderRef.current?.focus();
    }, [newFolderInput]);

    useEffect(() => {
        if (!contextMenu) return;
        const handler = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
                setContextSubmenu(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [contextMenu]);

    const filteredProjects = useMemo(() => {
        let list = projects;
        if (selectedFolder !== null) {
            list = selectedFolder === ''
                ? list.filter(p => !p.folder)
                : list.filter(p => p.folder === selectedFolder);
        }
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter(p =>
                p.name.toLowerCase().includes(term) ||
                p.projectNumber.toLowerCase().includes(term)
            );
        }
        return list;
    }, [projects, selectedFolder, searchTerm]);

    const folderCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const p of projects) {
            if (p.folder) counts[p.folder] = (counts[p.folder] || 0) + 1;
        }
        return counts;
    }, [projects]);

    const updateProjects = (updated: RecentProject[]) => {
        setProjects(updated);
        saveProjects(updated);
    };

    const handleCreateFolder = () => {
        const name = newFolderName.trim();
        if (!name || folders.includes(name)) { setNewFolderInput(false); setNewFolderName(''); return; }
        const updated = [...folders, name];
        setFolders(updated);
        saveFolders(updated);
        setNewFolderInput(false);
        setNewFolderName('');
        setSelectedFolder(name);
    };

    const handleDeleteFolder = (folder: string) => {
        updateProjects(projects.map(p => p.folder === folder ? { ...p, folder: undefined } : p));
        const updated = folders.filter(f => f !== folder);
        setFolders(updated);
        saveFolders(updated);
        if (selectedFolder === folder) setSelectedFolder(null);
    };

    const handleMoveToFolder = (project: RecentProject, folder: string | undefined) => {
        updateProjects(projects.map(p => p.timestamp === project.timestamp ? { ...p, folder } : p));
        setContextMenu(null); setContextSubmenu(null);
    };

    const handleSetStatus = (project: RecentProject, status: ProjectStatus | undefined) => {
        updateProjects(projects.map(p => p.timestamp === project.timestamp ? { ...p, status } : p));
        setContextMenu(null); setContextSubmenu(null);
    };

    const handleDeleteProject = async (project: RecentProject) => {
        setConfirmDelete(null);
        updateProjects(projects.filter(p => p.timestamp !== project.timestamp));
        try {
            const data = await retrieveProject(project.timestamp);
            if (data?.photosData) {
                for (const photo of data.photosData) {
                    if (photo.imageId) await deleteImage(photo.imageId);
                }
            }
        } catch { /* ignore */ }
        try { await deleteProject(project.timestamp); } catch { /* ignore */ }
        try { await deleteThumbnail(project.timestamp); } catch { /* ignore */ }
    };

    const handleDuplicate = async (project: RecentProject) => {
        setContextMenu(null); setContextSubmenu(null);
        try {
            const data = await retrieveProject(project.timestamp);
            if (!data) { toast('Could not duplicate — project data not found.', 'error'); return; }
            const newTimestamp = Date.now();
            await storeProject(newTimestamp, data);
            const thumb = thumbnails[project.timestamp];
            if (thumb) {
                await storeThumbnail(newTimestamp, thumb);
                setThumbnails(prev => ({ ...prev, [newTimestamp]: thumb }));
            }
            const duplicate: RecentProject = {
                ...project,
                name: project.name ? `${project.name} (Copy)` : 'Copy',
                timestamp: newTimestamp,
                status: 'draft',
            };
            const updated = [duplicate, ...projects];
            updateProjects(updated);
            toast('Project duplicated.', 'success');
        } catch (e) {
            toast('Failed to duplicate project.', 'error');
        }
    };

    const handleExportFile = async (project: RecentProject) => {
        setContextMenu(null); setContextSubmenu(null);
        setExporting(project.timestamp);
        try {
            const data = await retrieveProject(project.timestamp);
            if (!data) { toast('Could not export — project data not found.', 'error'); return; }
            const photosForExport = data.photosData
                ? data.photosData.map(({ imageId, ...rest }: any) => rest)
                : data.photosData;
            const exportData = { ...data, photosData: photosForExport };
            const ext = EXT_MAP[project.type] || 'json';
            const filename = `${project.projectNumber || project.name || 'project'}_${project.name || ''}.${ext}`.replace(/\s+/g, '_');
            const json = JSON.stringify(exportData);
            // @ts-ignore
            if (window.electronAPI?.saveProject) {
                // @ts-ignore
                await window.electronAPI.saveProject(json, filename);
            } else {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename; a.click();
                URL.revokeObjectURL(url);
            }
            toast('Project exported.', 'success');
        } catch {
            toast('Failed to export project.', 'error');
        } finally {
            setExporting(null);
        }
    };

    const handleContextMenu = (e: React.MouseEvent, project: RecentProject) => {
        e.preventDefault();
        const x = Math.min(e.clientX, window.innerWidth - 230);
        const y = Math.min(e.clientY, window.innerHeight - 320);
        setContextMenu({ project, x, y });
        setContextSubmenu(null);
    };

    const typeColor: Record<AppType, string> = {
        photoLog: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        dfrStandard: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
        dfrSaskpower: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
        combinedLog: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900 xtec-modal-enter">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <FolderOpenIcon className="h-6 w-6 text-[#007D8C]" />
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Projects</h1>
                    <span className="text-sm text-gray-400 dark:text-gray-500">{projects.length} total</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="search"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search projects..."
                            className="pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#007D8C]/50 w-56"
                        />
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-colors">
                        <CloseIcon className="h-7 w-7" />
                    </button>
                </div>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Sidebar */}
                <div className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col">
                    <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                        {/* All Projects */}
                        <SidebarBtn icon={<ListIcon />} label="All Projects" count={projects.length} active={selectedFolder === null} onClick={() => setSelectedFolder(null)} />
                        {/* Unfiled */}
                        <SidebarBtn icon={<FileIcon />} label="Unfiled" count={projects.filter(p => !p.folder).length} active={selectedFolder === ''} onClick={() => setSelectedFolder('')} />

                        {folders.length > 0 && (
                            <div className="pt-2">
                                <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">Folders</p>
                                {folders.map(folder => (
                                    <div key={folder} className="group relative">
                                        <SidebarBtn icon={<FolderIcon />} label={folder} count={folderCounts[folder] || 0} active={selectedFolder === folder} onClick={() => setSelectedFolder(folder)} />
                                        <button
                                            onClick={() => handleDeleteFolder(folder)}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                            title="Delete folder"
                                        >
                                            <TrashIcon className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </nav>
                    {/* New folder */}
                    <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                        {newFolderInput ? (
                            <input
                                ref={newFolderRef}
                                type="text"
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setNewFolderInput(false); setNewFolderName(''); } }}
                                onBlur={handleCreateFolder}
                                placeholder="Folder name..."
                                className="w-full text-sm px-2 py-1.5 rounded-lg border border-[#007D8C] bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none"
                            />
                        ) : (
                            <button
                                onClick={() => setNewFolderInput(true)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#007D8C] hover:bg-[#007D8C]/10 rounded-lg transition-colors font-medium"
                            >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg>
                                New Folder
                            </button>
                        )}
                    </div>
                </div>

                {/* Main content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {filteredProjects.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                                <FolderOpenIcon className="h-8 w-8 text-gray-400" />
                            </div>
                            <h3 className="text-base font-semibold text-gray-600 dark:text-gray-300">
                                {searchTerm ? 'No matching projects' : selectedFolder ? `No projects in "${selectedFolder}"` : selectedFolder === '' ? 'No unfiled projects' : 'No projects yet'}
                            </h3>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                                {searchTerm ? 'Try a different search term.' : 'Right-click a project to move it to a folder, duplicate it, or export it.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredProjects.map(project => (
                                <div
                                    key={project.timestamp}
                                    onContextMenu={e => handleContextMenu(e, project)}
                                    onClick={() => onOpenProject(project)}
                                    className="group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-[#007D8C]/40 transition-all duration-150 cursor-pointer flex flex-col"
                                >
                                    {/* Thumbnail */}
                                    <div className="h-32 bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 relative">
                                        {thumbnails[project.timestamp] ? (
                                            <img src={thumbnails[project.timestamp]} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <FolderOpenIcon className="h-10 w-10 text-gray-300 dark:text-gray-600" />
                                        )}
                                        {exporting === project.timestamp && (
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                <span className="text-white text-xs font-medium">Exporting...</span>
                                            </div>
                                        )}
                                        {project.status && (
                                            <span className={`absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${STATUS_CONFIG[project.status].className}`}>
                                                {STATUS_CONFIG[project.status].label}
                                            </span>
                                        )}
                                    </div>
                                    {/* Info */}
                                    <div className="p-3 flex flex-col flex-1">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{project.name || 'Untitled Project'}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">#{project.projectNumber || 'N/A'}</p>
                                        <div className="mt-2 flex items-center justify-between">
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${typeColor[project.type]}`}>{getReportTypeName(project.type)}</span>
                                            <span className="text-[10px] text-gray-400">{new Date(project.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        {project.folder && (
                                            <div className="mt-1.5 flex items-center gap-1">
                                                <FolderIcon className="h-3 w-3 text-[#007D8C]" />
                                                <span className="text-[10px] text-[#007D8C] font-medium truncate">{project.folder}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute inset-0 bg-[#007D8C]/0 group-hover:bg-[#007D8C]/5 transition-colors pointer-events-none rounded-xl" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Context menu */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[200] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-visible w-52"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 truncate">{contextMenu.project.name || 'Untitled'}</p>
                    </div>

                    <CtxBtn icon={<FolderOpenIcon className="h-4 w-4" />} label="Open" onClick={() => { onOpenProject(contextMenu.project); setContextMenu(null); }} />
                    <CtxBtn icon={<DocumentDuplicateIcon className="h-4 w-4" />} label="Duplicate" onClick={() => handleDuplicate(contextMenu.project)} />
                    <CtxBtn icon={<SaveIcon className="h-4 w-4" />} label="Export Project File" onClick={() => handleExportFile(contextMenu.project)} />

                    <div className="border-t border-gray-100 dark:border-gray-700" />

                    {/* Move to folder */}
                    <div className="relative">
                        <button
                            onClick={() => setContextSubmenu(contextSubmenu === 'folder' ? null : 'folder')}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
                        >
                            <span className="flex items-center gap-2"><FolderIcon className="h-4 w-4" /> Move to Folder</span>
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                        {contextSubmenu === 'folder' && (
                            <div className="absolute left-full top-0 ml-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
                                {contextMenu.project.folder && (
                                    <button onClick={() => handleMoveToFolder(contextMenu.project, undefined)} className="w-full text-left px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        Remove from folder
                                    </button>
                                )}
                                {folders.length === 0 && <p className="px-4 py-2 text-xs text-gray-400 italic">No folders yet.</p>}
                                {folders.map(folder => (
                                    <button key={folder} onClick={() => handleMoveToFolder(contextMenu.project, folder)} className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 ${contextMenu.project.folder === folder ? 'text-[#007D8C] font-medium' : 'text-gray-700 dark:text-gray-200'}`}>
                                        <span className="truncate">{folder}</span>
                                        {contextMenu.project.folder === folder && <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Set status */}
                    <div className="relative">
                        <button
                            onClick={() => setContextSubmenu(contextSubmenu === 'status' ? null : 'status')}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between"
                        >
                            <span className="flex items-center gap-2">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Set Status
                            </span>
                            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                        {contextSubmenu === 'status' && (
                            <div className="absolute left-full top-0 ml-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
                                {contextMenu.project.status && (
                                    <button onClick={() => handleSetStatus(contextMenu.project, undefined)} className="w-full text-left px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2">
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                        Clear status
                                    </button>
                                )}
                                {(Object.entries(STATUS_CONFIG) as [ProjectStatus, { label: string; className: string }][]).map(([key, cfg]) => (
                                    <button key={key} onClick={() => handleSetStatus(contextMenu.project, key)} className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${contextMenu.project.status === key ? 'font-semibold' : 'text-gray-700 dark:text-gray-200'}`}>
                                        <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${cfg.className}`}>{cfg.label}</span>
                                        {contextMenu.project.status === key && <svg className="h-3.5 w-3.5 text-[#007D8C]" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-gray-100 dark:border-gray-700" />
                    <CtxBtn icon={<TrashIcon className="h-4 w-4" />} label="Delete permanently" destructive onClick={() => { setConfirmDelete(contextMenu.project); setContextMenu(null); }} />
                </div>
            )}

            {confirmDelete && (
                <ConfirmModal
                    title="Delete project?"
                    message={`"${confirmDelete.name || 'Untitled Project'}" will be permanently deleted and cannot be recovered.`}
                    confirmLabel="Delete"
                    destructive
                    onConfirm={() => handleDeleteProject(confirmDelete)}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </div>
    );
};

// --- Small reusable sub-components ---

const SidebarBtn: React.FC<{ icon: React.ReactNode; label: string; count: number; active: boolean; onClick: () => void }> = ({ icon, label, count, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between transition-colors ${active ? 'bg-[#007D8C] text-white' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
    >
        <span className="flex items-center gap-2 truncate">{icon}<span className="truncate">{label}</span></span>
        <span className={`text-xs rounded-full px-1.5 py-0.5 flex-shrink-0 ${active ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>{count}</span>
    </button>
);

const CtxBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }> = ({ icon, label, onClick, destructive }) => (
    <button
        onClick={onClick}
        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${destructive ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
    >
        {icon} {label}
    </button>
);

const ListIcon = () => (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
);

const FileIcon = () => (
    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
);

const FolderIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4 flex-shrink-0' }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
);

export default ProjectsView;
