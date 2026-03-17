import React, { useState, useEffect, useRef, useCallback, ReactElement } from 'react';
import type { IogcLeaseAuditData, IogcCoverData, IogcSectionA, IogcSectionB, IogcSectionC, IogcSectionD, IogcSectionE } from '../types';
import { DownloadIcon, SaveIcon, FolderOpenIcon, ArrowLeftIcon, CloseIcon, ZoomInIcon, ZoomOutIcon } from './icons';
import { AppType } from '../App';
import { storeProject, deleteProject, deleteThumbnail, storeThumbnail } from './db';
import { generateProjectThumbnail } from './thumbnailUtils';
import ActionStatusModal from './ActionStatusModal';
import { IogcCoverSection, IogcSectionAPanel, IogcSectionBPanel, IogcSectionCPanel, IogcSectionDPanel, IogcSectionEPanel } from './iogc/IogcSections';
import { generateIogcPdf } from './iogc/IogcPdfGenerator';

// ─── Recent Projects Utility ───────────────────────────────────────

const RECENT_PROJECTS_KEY = 'xtec_recent_projects';
interface RecentProjectMetadata { type: AppType; name: string; projectNumber: string; timestamp: number; }

const getRecentProjects = (): RecentProjectMetadata[] => {
    try { return JSON.parse(localStorage.getItem(RECENT_PROJECTS_KEY) || '[]'); }
    catch { return []; }
};

const addRecentProject = async (projectData: any, info: { type: AppType; name: string; projectNumber: string }) => {
    const timestamp = Date.now();
    try { await storeProject(timestamp, projectData); } catch (e) { console.error('Failed to save project:', e); return; }
    try {
        const firstPhoto = projectData.photosData?.find((p: any) => p.imageUrl && !p.isMap);
        const thumbnail = await generateProjectThumbnail({ type: info.type, projectName: info.name, firstPhotoUrl: firstPhoto?.imageUrl || null });
        await storeThumbnail(timestamp, thumbnail);
    } catch (e) { console.warn('Thumbnail failed:', e); }

    const projects = getRecentProjects();
    const id = `${info.type}-${info.name}-${info.projectNumber}`;
    const existing = projects.find(p => `${p.type}-${p.name}-${p.projectNumber}` === id);
    const filtered = projects.filter(p => `${p.type}-${p.name}-${p.projectNumber}` !== id);
    if (existing) { try { await deleteProject(existing.timestamp); await deleteThumbnail(existing.timestamp); } catch {} }
    let updated = [{ ...info, timestamp }, ...filtered];
    if (updated.length > 50) {
        for (const p of updated.splice(50)) { try { await deleteProject(p.timestamp); await deleteThumbnail(p.timestamp); } catch {} }
    }
    try { localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated)); } catch {}
};

// ─── Helpers ───────────────────────────────────────────────────────

const formatDateForRecentProject = (s: string): string => {
    if (!s) return '';
    try { const d = new Date(s); if (isNaN(d.getTime())) return s; const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); return `${u.getUTCFullYear()}/${String(u.getUTCMonth()+1).padStart(2,'0')}/${String(u.getUTCDate()).padStart(2,'0')}`; } catch { return s; }
};
const formatDateForFilename = (s: string): string => {
    if (!s) return 'NoDate';
    try { const d = new Date(s); if (isNaN(d.getTime())) return s.replace(/[^a-z0-9]/gi,''); const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); return `${String(u.getUTCMonth()+1).padStart(2,'0')}-${String(u.getUTCDate()).padStart(2,'0')}-${u.getUTCFullYear()}`; } catch { return s.replace(/[^a-z0-9]/gi,''); }
};
// ─── PDF Preview Modal ─────────────────────────────────────────────

const PdfPreviewModal: React.FC<{ url: string; filename: string; onClose: () => void; pdfBlob?: Blob }> = ({ url, filename, onClose, pdfBlob }) => {
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h); document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', h); document.body.style.overflow = 'auto'; if (url?.startsWith('blob:')) URL.revokeObjectURL(url); };
    }, [onClose, url]);
    const handleDownload = async () => {
        // @ts-ignore
        if (window.electronAPI?.savePdf) {
            try {
                const ab = pdfBlob ? await pdfBlob.arrayBuffer() : await (await fetch(url)).blob().then(b => b.arrayBuffer());
                // @ts-ignore
                const r = await window.electronAPI.savePdf(ab, filename);
                if (r.success) alert('PDF saved successfully!'); else if (r.error) alert(`Failed: ${r.error}`);
            } catch { alert('Error saving PDF.'); }
        } else {
            const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-[100] p-4" role="dialog" aria-modal="true">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full h-full flex flex-col overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white">PDF Preview</h3>
                    <div className="flex items-center gap-4">
                        <button onClick={handleDownload} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition"><DownloadIcon /><span>Download PDF</span></button>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white transition-colors"><CloseIcon className="h-8 w-8" /></button>
                    </div>
                </div>
                <div className="flex-grow bg-gray-200 dark:bg-gray-900 relative">
                    <iframe src={url} className="w-full h-full" style={{ border: 'none' }} title="PDF Preview" />
                </div>
            </div>
        </div>
    );
};

// ─── Initial State ─────────────────────────────────────────────────

const emptyCover: IogcCoverData = {
    iogcFileNumber: '', legalLocation: '', province: '', reserveNameNumber: '', lesseeName: '',
    wellSpudDate: '', siteStatus: '', siteTypes: [], gasFlags: [], auditDate: '',
    auditType: '', copySentToFirstNation: '', reportAddressesFacilities: '', reportAddressesVegetation: '',
    reportAddressesHousekeeping: '', reportAddressesProtection: '', reportAddressesSummary: '',
    reportAddressesTermsReview: '', attachTermsLetter: '', attachSiteSketch: '', attachSitePhotos: '',
    attachFollowUp: '', complianceStatus: '', recommendationsIncluded: '', complianceDescriptionIncluded: '',
    declarationName: '', declarationDesignation: '', declarationDate: '',
};

const emptySectionA: IogcSectionA = {
    q1EnvMonitorRequired: '', q1MonitorName: '', q1MonitorCompany: '', q1StartConstructionDate: '',
    q1ConstructionMethod: '', q1ConstructionMethodOther: '', q1SoilHandling: '', q1SoilHandlingExplain: '',
    q1SpudDate: '', q1Setbacks: '', q1FederalDept: '', q1Comments: '',
    q2FnLiaison: '', q2LiaisonName: '', q2CulturalSites: '', q2Comments: '',
    q3WildlifeSurvey: '', q3Comments: '', q4AdditionalMitigation: '', q4Comments: '',
    q5FenceAlterations: '', q5Comments: '', q6WaterWellTesting: '', q6ResultsIncluded: '', q6Comments: '',
    q7WasteLocation: '', q7ReserveLocation: '', q7ComplianceWithRegs: '', q7MudType: '', q7SumpType: '',
    q7DisposalMethods: [], q7RemoteSumpOS: '', q7Comments: '',
    q8LandsprayOnReserve: '', q8ReportAttached: '', q8MeetsCriteria: '',
    q9TimberMethods: [], q9FnNotification: '',
    q10ProgressiveReclamation: '', q10SlopesContoured: '', q10SoilsRespread: '', q10VegetationMethod: '',
    q10CertifiedSeed: '', q10VegetationEstablishment: '', q10Comments: '',
    q11ConstructionCleanup: '', q11Comments: '',
};

const emptySectionB: IogcSectionB = {
    q12WeedList: '', q12Comments: '', q13VegetationStatus: '', q13StressedVegetation: '',
    q13BareSpots: '', q13Comments: '', q14WeedMonitoringPlan: '', q14WeedControlStrategies: '',
    q14OngoingInspections: '', q14CompliantWithRegs: '', q14Comments: '',
};

const emptySectionC: IogcSectionC = {
    q15Activity: '', q15Comments: '', q16Landuse: '', q16AccessRoadConditions: '', q16Comments: '',
    q17LowSpotsSlumping: '', q17Rutting: '', q17LeaseAccessibility: '', q17Comments: '',
    q18Traffic: '', q18Comments: '', q19LeaseBermCondition: '', q19Comments: '',
    q20FlareStack: '', q20Comments: '', q21OdourDetection: '', q21Comments: '',
    q22UnusedEquipmentRemoved: '', q22FelledTreesRemoved: '', q22Comments: '',
    q23GarbageDebris: '', q23Comments: '', q24ReportedComplaints: '', q24Investigated: '', q24Comments: '',
    q25Drainage: '', q25Ponding: '', q25AquaticVegetation: '', q25Comments: '',
    q26PumpOff: '', q26Frequency: '', q26Erosion: '', q26Comments: '',
    q27ErosionControl: '', q27Comments: '', q28Waterbodies: '', q28Distance: '', q28Area: '',
    q28Buffer: '', q28Mitigation: '', q28Comments: '',
    q29PermitsAuthorization: '', q29OngoingPermits: '', q29Comments: '',
};

const emptySectionD: IogcSectionD = {
    q30Signage: '', q30Visible: '', q30Legible: '', q30Hotline: '', q30Comments: '',
    q31Fencing: '', q31HumanRestriction: '', q31LivestockRestriction: '', q31Maintained: '',
    q31TexasGateCondition: '', q31Comments: '', q32Culverts: '', q32ProperlyInstalled: '',
    q32CorrectSize: '', q32ProperlyMaintained: '', q32Comments: '',
    q33SurfaceCasingVent: '', q33OpenClosed: '', q33Clearance: '', q33Comments: '',
    q34WellheadValves: '', q34BullPlugs: '', q34Comments: '',
    q35ChemicalStorage: '', q35Sealed: '', q35Whmis: '', q35Msds: '', q35Comments: '',
    q36Tanks: '', q36InGoodRepair: '', q36Comments: '',
    q37ReportableSpills: '', q37SpillDate: '', q37Substance: '', q37Volume: '', q37Notified: '', q37Comments: '',
    q38SurfaceStaining: '', q38OnSite: '', q38OffSite: '', q38Comments: '',
    q39Erp: '', q39ErpInPlace: '', q39Comments: '', q40ErpExercise: '', q40Date: '', q40Comments: '',
    q41ExcavationHazards: '', q41Comments: '',
};

const emptySectionE: IogcSectionE = {
    q42IogcTerms: '', q42Comments: '', q43OtherRegulations: '', q43Comments: '',
    q44SummaryNonCompliance: '', q45NonComplianceFollowUp: '', q46OverallCompliance: '', q46Comments: '',
};

const emptyData: IogcLeaseAuditData = {
    projectNumber: '', surfaceLeaseOS: '', proponent: '', projectName: '', location: '', date: '',
    reportWrittenBy: '', professionalSignOff: '', followUpDate: '', reportDate: '',
    cover: emptyCover, sectionA: emptySectionA, sectionB: emptySectionB,
    sectionC: emptySectionC, sectionD: emptySectionD, sectionE: emptySectionE,
};

// ─── Main Component ────────────────────────────────────────────────

interface Props { onBack: () => void; initialData?: any; }

const IogcLeaseAudit = ({ onBack, initialData }: Props): ReactElement => {
    const [data, setData] = useState<IogcLeaseAuditData>(emptyData);
    const [errors, setErrors] = useState(new Set<string>());
    const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
    const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; blob?: Blob } | null>(null);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [zoomLevel, setZoomLevel] = useState(100);
    const [isDirty, setIsDirty] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingCloseRef = useRef(false);

    // ─── Handlers ──────────────────────────────────────────────────

    const handleTopChange = (field: string, value: string) => {
        setData(prev => ({ ...prev, [field]: value }));
        setIsDirty(true);
    };

    const handleSectionChange = <T extends keyof IogcLeaseAuditData>(section: T, field: string, value: any) => {
        setData(prev => ({ ...prev, [section]: { ...(prev[section] as any), [field]: value } }));
        setIsDirty(true);
    };

    const handleToggleArray = <T extends keyof IogcLeaseAuditData>(section: T, field: string, item: string) => {
        setData(prev => {
            const sectionData = prev[section] as any;
            const arr: string[] = sectionData[field] || [];
            const updated = arr.includes(item) ? arr.filter((x: string) => x !== item) : [...arr, item];
            return { ...prev, [section]: { ...sectionData, [field]: updated } };
        });
        setIsDirty(true);
    };

    // ─── Load / Save ───────────────────────────────────────────────

    const processLoadedData = (projectData: any) => {
        setData({ ...emptyData, ...projectData });
    };

    const prepareStateForStorage = () => ({ ...data });

    const parseAndLoadProject = async (content: string) => {
        try {
            const pd = JSON.parse(content);
            processLoadedData(pd);
            const state = prepareStateForStorage();
            const fd = formatDateForRecentProject(pd.cover?.auditDate || pd.date);
            const name = `${pd.projectName || 'Untitled IOGC Audit'}${fd ? ` - ${fd}` : ''}`;
            await addRecentProject(state, { type: 'iogcLeaseAudit', name, projectNumber: pd.projectNumber });
        } catch { alert('Error parsing project file.'); }
    };

    useEffect(() => {
        if (initialData) { processLoadedData(initialData); }
        else {
            try {
                const settings = JSON.parse(localStorage.getItem('xtec_general_settings') || '{}');
                if (settings.defaultMonitor) setData(prev => ({ ...prev, reportWrittenBy: settings.defaultMonitor }));
            } catch {}
        }
    }, [initialData]);

    // ─── Unsaved changes protection ────────────────────────────────

    useEffect(() => {
        const h = (e: BeforeUnloadEvent) => { if (isDirty) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [isDirty]);

    useEffect(() => {
        // @ts-ignore
        const api = window.electronAPI;
        if (api?.onCloseAttempted) {
            api.removeCloseAttemptedListener?.();
            api.onCloseAttempted(() => { if (isDirty) { pendingCloseRef.current = true; setShowUnsavedModal(true); } else { api.confirmClose(); } });
        }
        return () => { // @ts-ignore
            window.electronAPI?.removeCloseAttemptedListener?.(); };
    }, [isDirty]);

    const handleBack = () => { if (isDirty) { pendingCloseRef.current = false; setShowUnsavedModal(true); } else { onBack(); } };

    // ─── Validation ────────────────────────────────────────────────

    const validateForm = (): boolean => {
        const errs = new Set<string>();
        if (!data.cover.iogcFileNumber.trim()) errs.add('cover.iogcFileNumber');
        if (!data.cover.legalLocation.trim()) errs.add('cover.legalLocation');
        if (!data.cover.lesseeName.trim()) errs.add('cover.lesseeName');
        if (!data.cover.auditDate.trim()) errs.add('cover.auditDate');
        if (!data.cover.auditType) errs.add('cover.auditType');
        if (!data.projectNumber.trim()) errs.add('projectNumber');
        if (!data.sectionE.q46OverallCompliance) errs.add('sectionE.q46OverallCompliance');
        setErrors(errs);
        if (errs.size > 0) { setShowValidationErrorModal(true); return false; }
        return true;
    };

    // ─── Save / Export ─────────────────────────────────────────────

    const handleSaveProject = async () => {
        const state = prepareStateForStorage();
        const fd = formatDateForRecentProject(data.cover.auditDate || data.date);
        const name = `${data.projectName || 'Untitled IOGC Audit'}${fd ? ` - ${fd}` : ''}`;
        await addRecentProject(state, { type: 'iogcLeaseAudit', name, projectNumber: data.projectNumber });

        const exportData = { ...data };
        const sanitize = (n: string) => n.replace(/[^a-z0-9_]/gi, '-').toLowerCase();
        const filename = `${sanitize(data.projectName) || 'project'}_${formatDateForFilename(data.cover.auditDate)}.iogc`;
        // @ts-ignore
        if (window.electronAPI) { // @ts-ignore
            await window.electronAPI.saveProject(JSON.stringify(exportData), filename);
        } else {
            const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
        }
        setIsDirty(false);
    };

    const handleSavePdf = async () => {
        if (!validateForm()) return;
        setStatusMessage('Generating PDF...'); setShowStatusModal(true);
        await new Promise(r => setTimeout(r, 50));
        try {
            const state = prepareStateForStorage();
            const fd = formatDateForRecentProject(data.cover.auditDate || data.date);
            const name = `${data.projectName || 'Untitled IOGC Audit'}${fd ? ` - ${fd}` : ''}`;
            await addRecentProject(state, { type: 'iogcLeaseAudit', name, projectNumber: data.projectNumber });

            const { blob, filename } = await generateIogcPdf(data, setStatusMessage);
            const pdfUrl = URL.createObjectURL(blob);
            setPdfPreview({ url: pdfUrl, filename, blob });
        } finally { setShowStatusModal(false); }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const api = window.electronAPI;
        if (api?.onSaveProjectShortcut) { api.removeSaveProjectShortcutListener?.(); api.onSaveProjectShortcut(() => handleSaveProject()); }
        if (api?.onExportPdfShortcut) { api.removeExportPdfShortcutListener?.(); api.onExportPdfShortcut(() => handleSavePdf()); }
        return () => { api?.removeSaveProjectShortcutListener?.(); api?.removeExportPdfShortcutListener?.(); };
    }, [data]);

    const handleOpenProject = async () => {
        // @ts-ignore
        if (window.electronAPI) { const c = await window.electronAPI.loadProject('iogc'); if (c) await parseAndLoadProject(c); }
        else { fileInputRef.current?.click(); }
    };
    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; if (!f) return;
        await parseAndLoadProject(await f.text());
        if (e.target) e.target.value = '';
    };

    // ─── Render ────────────────────────────────────────────────────

    return (
        <div className="bg-gray-100 dark:bg-gray-900 min-h-screen transition-colors duration-200">
            {pdfPreview && <PdfPreviewModal url={pdfPreview.url} filename={pdfPreview.filename} onClose={() => setPdfPreview(null)} pdfBlob={pdfPreview.blob} />}
            {showStatusModal && <ActionStatusModal message={statusMessage} />}

            <div className="flex justify-center p-2 sm:p-4 lg:p-6 xl:p-8">
                <div className="flex-1 min-w-0 max-w-[1400px]">
                    {/* Toolbar */}
                    <div className="sticky top-0 z-40 bg-gray-100 dark:bg-gray-900 py-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                            <button onClick={handleBack} className="bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition"><ArrowLeftIcon /> <span>Home</span></button>
                            <div className="flex flex-wrap justify-end gap-2">
                                <button onClick={handleOpenProject} className="bg-gray-600 hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition"><FolderOpenIcon /> <span>Open Project</span></button>
                                <input type="file" ref={fileInputRef} onChange={handleFileSelected} style={{ display: 'none' }} accept=".iogc" />
                                <button onClick={handleSaveProject} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition"><SaveIcon /> <span>Save Project</span></button>
                                <button onClick={handleSavePdf} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg inline-flex items-center gap-2 transition"><DownloadIcon /> <span>Save to PDF</span></button>
                            </div>
                        </div>
                    </div>

                    {/* Zoom */}
                    <div className="flex items-center justify-end gap-1 mb-4">
                        <button onClick={() => setZoomLevel(z => Math.max(z - 10, 70))} className="p-1.5 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition" title="Zoom out"><ZoomOutIcon className="h-4 w-4" /></button>
                        <button onClick={() => setZoomLevel(100)} className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition min-w-[3rem]" title="Reset zoom">{zoomLevel}%</button>
                        <button onClick={() => setZoomLevel(z => Math.min(z + 10, 150))} className="p-1.5 rounded-md bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition" title="Zoom in"><ZoomInIcon className="h-4 w-4" /></button>
                    </div>

                    <div className="main-content space-y-8" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left', width: `${10000 / zoomLevel}%` }}>
                        {/* Cover */}
                        <IogcCoverSection
                            cover={data.cover}
                            topLevel={data}
                            onChange={(f, v) => handleSectionChange('cover', f as string, v)}
                            onTopChange={handleTopChange}
                            onToggleArray={(f, item) => handleToggleArray('cover', f as string, item)}
                            errors={errors}
                        />

                        {/* Section A - only for 1st Year */}
                        {data.cover.auditType === '1st Year' && (
                            <IogcSectionAPanel
                                data={data.sectionA}
                                onChange={(f, v) => handleSectionChange('sectionA', f as string, v)}
                                onToggleArray={(f, item) => handleToggleArray('sectionA', f as string, item)}
                            />
                        )}

                        {/* Section B */}
                        <IogcSectionBPanel data={data.sectionB} onChange={(f, v) => handleSectionChange('sectionB', f as string, v)} />

                        {/* Section C */}
                        <IogcSectionCPanel data={data.sectionC} onChange={(f, v) => handleSectionChange('sectionC', f as string, v)} />

                        {/* Section D */}
                        <IogcSectionDPanel data={data.sectionD} onChange={(f, v) => handleSectionChange('sectionD', f as string, v)} />

                        {/* Section E */}
                        <IogcSectionEPanel data={data.sectionE} onChange={(f, v) => handleSectionChange('sectionE', f as string, v)} errors={errors} />
                    </div>
                </div>
            </div>

            {/* Modals */}
            {showValidationErrorModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md">
                        <h3 className="text-lg font-bold text-red-600 mb-2">Validation Error</h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-4">Please fill in all required fields before exporting to PDF. Required fields are highlighted in red.</p>
                        <button onClick={() => setShowValidationErrorModal(false)} className="bg-[#007D8C] hover:bg-[#006b7a] text-white font-bold py-2 px-4 rounded-lg transition">OK</button>
                    </div>
                </div>
            )}
            {showUnsavedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Unsaved Changes</h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-4">You have unsaved changes. Are you sure you want to leave?</p>
                        <div className="flex gap-3">
                            <button onClick={() => { setShowUnsavedModal(false); setIsDirty(false); if (pendingCloseRef.current) { // @ts-ignore
                                window.electronAPI?.confirmClose(); } else { onBack(); } }} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition">Leave Without Saving</button>
                            <button onClick={() => setShowUnsavedModal(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default IogcLeaseAudit;
