import React from 'react';
import type {
    IogcLeaseAuditData, IogcCoverData, IogcSectionA, IogcSectionB,
    IogcSectionC, IogcSectionD, IogcSectionE,
    YesNo, YesNoNA, IncludedOption, ComplianceOption, ConditionRating,
    ConditionRatingNA, SiteStatus, AuditType, ConstructionMethod
} from '../../types';

// ─── Shared UI Primitives ──────────────────────────────────────────

export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-gray-800 p-6 shadow-md rounded-lg transition-colors duration-200">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 border-b-2 border-gray-200 dark:border-gray-700 pb-2 mb-4">{title}</h2>
        <div className="space-y-4">{children}</div>
    </div>
);

export const EditableField: React.FC<{
    label: string; value: string; onChange: (v: string) => void;
    type?: string; isTextArea?: boolean; rows?: number; placeholder?: string; isInvalid?: boolean;
}> = ({ label, value, onChange, type = 'text', isTextArea = false, rows = 1, placeholder = '', isInvalid = false }) => {
    const cls = `block w-full p-2 border rounded-md shadow-sm focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition bg-white dark:bg-gray-700 text-black dark:text-white dark:placeholder-gray-400 ${isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`;
    return (
        <div>
            {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}
            {isTextArea ? (
                <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} className={cls} placeholder={placeholder} spellCheck />
            ) : (
                <input type={type} value={value} onChange={e => onChange(e.target.value)} className={cls} placeholder={placeholder} spellCheck />
            )}
        </div>
    );
};

export const RadioGroup: React.FC<{
    label: string; options: string[]; value: string; onChange: (v: string) => void; isInvalid?: boolean;
}> = ({ label, options, value, onChange, isInvalid = false }) => (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between py-2 border-b last:border-b-0 ${isInvalid ? 'border-red-500 bg-red-50 dark:bg-red-900/20 px-2 rounded' : 'border-gray-200 dark:border-gray-700'}`}>
        <span className={`font-medium mb-2 sm:mb-0 ${isInvalid ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{label}</span>
        <div className="flex items-center flex-wrap gap-x-5 gap-y-1">
            {options.map(opt => (
                <label key={opt} className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-300">
                    <input type="radio" name={label} value={opt} checked={value === opt} onChange={() => onChange(opt)} className="h-5 w-5 text-[#007D8C] border-gray-300 focus:ring-[#006b7a]" />
                    <span className="text-sm">{opt}</span>
                </label>
            ))}
        </div>
    </div>
);

export const MultiCheckbox: React.FC<{
    label: string; options: string[]; selected: string[]; onToggle: (item: string) => void;
}> = ({ label, options, selected, onToggle }) => (
    <div className="py-2">
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</span>
        <div className="flex flex-wrap gap-3">
            {options.map(opt => (
                <label key={opt} className="flex items-center space-x-2 cursor-pointer text-gray-600 dark:text-gray-300">
                    <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} className="h-4 w-4 text-[#007D8C] border-gray-300 rounded focus:ring-[#006b7a]" />
                    <span className="text-sm">{opt}</span>
                </label>
            ))}
        </div>
    </div>
);

const QuestionBlock: React.FC<{ num: string; label: string; children: React.ReactNode }> = ({ num, label, children }) => (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <div className="flex items-start gap-2">
            <span className="bg-[#007D8C] text-white text-xs font-bold px-2 py-1 rounded min-w-[2rem] text-center">{num}</span>
            <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">{label}</span>
        </div>
        <div className="pl-2 space-y-3">{children}</div>
    </div>
);

// ─── Type helpers ──────────────────────────────────────────────────

type SectionHandler<T> = (field: keyof T, value: any) => void;
type ArrayToggler<T> = (field: keyof T, item: string) => void;

// ─── Cover Section ─────────────────────────────────────────────────

const SITE_TYPES = ['Well Site', 'Pipeline', 'Battery', 'Compressor', 'Road', 'Other'];
const GAS_FLAGS = ['H2S', 'SO2', 'Other'];

interface CoverProps {
    cover: IogcCoverData;
    topLevel: Pick<IogcLeaseAuditData, 'projectNumber' | 'surfaceLeaseOS' | 'proponent' | 'projectName' | 'location' | 'date' | 'reportWrittenBy' | 'professionalSignOff' | 'followUpDate' | 'reportDate'>;
    onChange: SectionHandler<IogcCoverData>;
    onTopChange: (field: string, value: string) => void;
    onToggleArray: ArrayToggler<IogcCoverData>;
    errors: Set<string>;
}

export const IogcCoverSection: React.FC<CoverProps> = ({ cover, topLevel, onChange, onTopChange, onToggleArray, errors }) => (
    <Section title="IOGC Surface Lease Environmental Audit">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <EditableField label="IOGC File Number" value={cover.iogcFileNumber} onChange={v => onChange('iogcFileNumber', v)} isInvalid={errors.has('cover.iogcFileNumber')} />
                <EditableField label="Legal Location" value={cover.legalLocation} onChange={v => onChange('legalLocation', v)} isInvalid={errors.has('cover.legalLocation')} />
                <EditableField label="Province" value={cover.province} onChange={v => onChange('province', v)} />
                <EditableField label="Reserve Name & Number" value={cover.reserveNameNumber} onChange={v => onChange('reserveNameNumber', v)} />
                <EditableField label="Lessee Name" value={cover.lesseeName} onChange={v => onChange('lesseeName', v)} isInvalid={errors.has('cover.lesseeName')} />
                <EditableField label="Well Spud Date" value={cover.wellSpudDate} onChange={v => onChange('wellSpudDate', v)} />
            </div>
            <div className="space-y-4">
                <EditableField label="X-Terra Project Number" value={topLevel.projectNumber} onChange={v => onTopChange('projectNumber', v)} isInvalid={errors.has('projectNumber')} />
                <EditableField label="Surface Lease / OS Number" value={topLevel.surfaceLeaseOS} onChange={v => onTopChange('surfaceLeaseOS', v)} />
                <EditableField label="Proponent / Client" value={topLevel.proponent} onChange={v => onTopChange('proponent', v)} />
                <EditableField label="Project Name" value={topLevel.projectName} onChange={v => onTopChange('projectName', v)} />
                <EditableField label="Location" value={topLevel.location} onChange={v => onTopChange('location', v)} isTextArea />
                <EditableField label="Audit Date" value={cover.auditDate} onChange={v => onChange('auditDate', v)} isInvalid={errors.has('cover.auditDate')} placeholder="Month Day, Year" />
            </div>
        </div>

        <RadioGroup label="Site Status" options={['Active', 'Suspended', 'Abandoned', 'Active Reclamation', 'Not Built'] as SiteStatus[]} value={cover.siteStatus} onChange={v => onChange('siteStatus', v)} />
        <MultiCheckbox label="Type of Site" options={SITE_TYPES} selected={cover.siteTypes} onToggle={item => onToggleArray('siteTypes', item)} />
        <MultiCheckbox label="Gas Flags" options={GAS_FLAGS} selected={cover.gasFlags} onToggle={item => onToggleArray('gasFlags', item)} />
        <RadioGroup label="Audit Type" options={['1st Year', '2nd Year (Pipeline)', '3 Year', '5 Year', '10 Year (Pipeline)'] as AuditType[]} value={cover.auditType} onChange={v => onChange('auditType', v)} isInvalid={errors.has('cover.auditType')} />

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Report Addresses</h3>
            <div className="space-y-1">
                <RadioGroup label="Facilities" options={['Included', 'Not Included']} value={cover.reportAddressesFacilities} onChange={v => onChange('reportAddressesFacilities', v)} />
                <RadioGroup label="Vegetation" options={['Included', 'Not Included']} value={cover.reportAddressesVegetation} onChange={v => onChange('reportAddressesVegetation', v)} />
                <RadioGroup label="Housekeeping" options={['Included', 'Not Included']} value={cover.reportAddressesHousekeeping} onChange={v => onChange('reportAddressesHousekeeping', v)} />
                <RadioGroup label="Protection" options={['Included', 'Not Included']} value={cover.reportAddressesProtection} onChange={v => onChange('reportAddressesProtection', v)} />
                <RadioGroup label="Summary" options={['Included', 'Not Included']} value={cover.reportAddressesSummary} onChange={v => onChange('reportAddressesSummary', v)} />
                <RadioGroup label="Terms Review" options={['Included', 'Not Included']} value={cover.reportAddressesTermsReview} onChange={v => onChange('reportAddressesTermsReview', v)} />
            </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Attachments</h3>
            <div className="space-y-1">
                <RadioGroup label="Terms/Conditions Letter" options={['Included', 'Not Included']} value={cover.attachTermsLetter} onChange={v => onChange('attachTermsLetter', v)} />
                <RadioGroup label="Site Sketch" options={['Included', 'Not Included']} value={cover.attachSiteSketch} onChange={v => onChange('attachSiteSketch', v)} />
                <RadioGroup label="Site Photos" options={['Included', 'Not Included']} value={cover.attachSitePhotos} onChange={v => onChange('attachSitePhotos', v)} />
                <RadioGroup label="Follow-Up Report" options={['Included', 'Not Included']} value={cover.attachFollowUp} onChange={v => onChange('attachFollowUp', v)} />
            </div>
        </div>

        <RadioGroup label="Copy Sent to First Nation" options={['Yes', 'No']} value={cover.copySentToFirstNation} onChange={v => onChange('copySentToFirstNation', v)} />
        <RadioGroup label="Compliance Status" options={['In Compliance', 'Not in Compliance']} value={cover.complianceStatus} onChange={v => onChange('complianceStatus', v)} />
        <RadioGroup label="Recommendations Included" options={['Included', 'Not Included']} value={cover.recommendationsIncluded} onChange={v => onChange('recommendationsIncluded', v)} />
        <RadioGroup label="Compliance Description Included" options={['Included', 'Not Included']} value={cover.complianceDescriptionIncluded} onChange={v => onChange('complianceDescriptionIncluded', v)} />

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Professional Declaration</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <EditableField label="Name" value={cover.declarationName} onChange={v => onChange('declarationName', v)} />
                <EditableField label="Designation" value={cover.declarationDesignation} onChange={v => onChange('declarationDesignation', v)} />
                <EditableField label="Date" value={cover.declarationDate} onChange={v => onChange('declarationDate', v)} />
            </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-3">Report Info</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EditableField label="Report Written By" value={topLevel.reportWrittenBy} onChange={v => onTopChange('reportWrittenBy', v)} />
                <EditableField label="Professional Sign-Off" value={topLevel.professionalSignOff} onChange={v => onTopChange('professionalSignOff', v)} />
                <EditableField label="Report Date" value={topLevel.reportDate} onChange={v => onTopChange('reportDate', v)} />
                <EditableField label="Follow-Up Date" value={topLevel.followUpDate} onChange={v => onTopChange('followUpDate', v)} />
            </div>
        </div>
    </Section>
);

// ─── Section A: First Year Requirements (Q1-Q11) ──────────────────

interface SectionAProps {
    data: IogcSectionA;
    onChange: SectionHandler<IogcSectionA>;
    onToggleArray: ArrayToggler<IogcSectionA>;
}

export const IogcSectionAPanel: React.FC<SectionAProps> = ({ data, onChange, onToggleArray }) => (
    <Section title="Section A: First Year Environmental Audit Requirements">
        <p className="text-sm text-blue-600 dark:text-blue-400 italic mb-2">This section applies only to 1st Year audits.</p>

        <QuestionBlock num="Q1" label="Was an environmental monitor required and utilized during construction?">
            <RadioGroup label="Environmental Monitor Required" options={['Yes', 'No']} value={data.q1EnvMonitorRequired} onChange={v => onChange('q1EnvMonitorRequired', v)} />
            <EditableField label="Monitor Name" value={data.q1MonitorName} onChange={v => onChange('q1MonitorName', v)} />
            <EditableField label="Monitor Company" value={data.q1MonitorCompany} onChange={v => onChange('q1MonitorCompany', v)} />
            <EditableField label="Start of Construction Date" value={data.q1StartConstructionDate} onChange={v => onChange('q1StartConstructionDate', v)} />
            <RadioGroup label="Construction Method" options={['Single lift', 'Two-lift', 'Minimal Disturbance', 'Other']} value={data.q1ConstructionMethod} onChange={v => onChange('q1ConstructionMethod', v)} />
            {data.q1ConstructionMethod === 'Other' && (
                <EditableField label="Other Method (specify)" value={data.q1ConstructionMethodOther} onChange={v => onChange('q1ConstructionMethodOther', v)} />
            )}
            <RadioGroup label="Soil Handling" options={['Satisfactory', 'Unsatisfactory']} value={data.q1SoilHandling} onChange={v => onChange('q1SoilHandling', v)} />
            {data.q1SoilHandling === 'Unsatisfactory' && (
                <EditableField label="Explain" value={data.q1SoilHandlingExplain} onChange={v => onChange('q1SoilHandlingExplain', v)} isTextArea rows={2} />
            )}
            <EditableField label="Spud Date" value={data.q1SpudDate} onChange={v => onChange('q1SpudDate', v)} />
            <EditableField label="Setbacks (from buildings, water bodies, etc.)" value={data.q1Setbacks} onChange={v => onChange('q1Setbacks', v)} isTextArea rows={2} />
            <EditableField label="Federal Department" value={data.q1FederalDept} onChange={v => onChange('q1FederalDept', v)} />
            <EditableField label="Comments" value={data.q1Comments} onChange={v => onChange('q1Comments', v)} isTextArea rows={3} />
        </QuestionBlock>

        <QuestionBlock num="Q2" label="Was there a First Nation liaison present during construction?">
            <RadioGroup label="FN Liaison Present" options={['Yes', 'No']} value={data.q2FnLiaison} onChange={v => onChange('q2FnLiaison', v)} />
            <EditableField label="Liaison Name" value={data.q2LiaisonName} onChange={v => onChange('q2LiaisonName', v)} />
            <EditableField label="Cultural/Heritage Sites" value={data.q2CulturalSites} onChange={v => onChange('q2CulturalSites', v)} isTextArea rows={2} />
            <EditableField label="Comments" value={data.q2Comments} onChange={v => onChange('q2Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q3" label="Was a wildlife survey conducted?">
            <RadioGroup label="Wildlife Survey" options={['Yes', 'No']} value={data.q3WildlifeSurvey} onChange={v => onChange('q3WildlifeSurvey', v)} />
            <EditableField label="Comments" value={data.q3Comments} onChange={v => onChange('q3Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q4" label="Were any additional mitigation measures required?">
            <RadioGroup label="Additional Mitigation" options={['Yes', 'No']} value={data.q4AdditionalMitigation} onChange={v => onChange('q4AdditionalMitigation', v)} />
            <EditableField label="Comments" value={data.q4Comments} onChange={v => onChange('q4Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q5" label="Were any fences altered or removed?">
            <RadioGroup label="Fence Alterations" options={['Yes', 'No']} value={data.q5FenceAlterations} onChange={v => onChange('q5FenceAlterations', v)} />
            <EditableField label="Comments" value={data.q5Comments} onChange={v => onChange('q5Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q6" label="Was water well testing conducted?">
            <RadioGroup label="Water Well Testing" options={['Yes', 'No']} value={data.q6WaterWellTesting} onChange={v => onChange('q6WaterWellTesting', v)} />
            <RadioGroup label="Results Included" options={['Yes', 'No']} value={data.q6ResultsIncluded} onChange={v => onChange('q6ResultsIncluded', v)} />
            <EditableField label="Comments" value={data.q6Comments} onChange={v => onChange('q6Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q7" label="Drilling waste disposal">
            <RadioGroup label="Waste Location" options={['On-site', 'Off-site']} value={data.q7WasteLocation} onChange={v => onChange('q7WasteLocation', v)} />
            <RadioGroup label="Reserve Location" options={['On-Reserve', 'Off-Reserve']} value={data.q7ReserveLocation} onChange={v => onChange('q7ReserveLocation', v)} />
            <RadioGroup label="Compliance with Regulations" options={['Yes', 'No']} value={data.q7ComplianceWithRegs} onChange={v => onChange('q7ComplianceWithRegs', v)} />
            <EditableField label="Mud Type" value={data.q7MudType} onChange={v => onChange('q7MudType', v)} />
            <EditableField label="Sump Type" value={data.q7SumpType} onChange={v => onChange('q7SumpType', v)} />
            <MultiCheckbox label="Disposal Methods" options={['Land Treatment', 'Sump', 'Remote Sump', 'Third-Party Disposal', 'Other']} selected={data.q7DisposalMethods} onToggle={item => onToggleArray('q7DisposalMethods', item)} />
            <EditableField label="Remote Sump OS" value={data.q7RemoteSumpOS} onChange={v => onChange('q7RemoteSumpOS', v)} />
            <EditableField label="Comments" value={data.q7Comments} onChange={v => onChange('q7Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q8" label="Was landspraying conducted on reserve?">
            <RadioGroup label="Landspray on Reserve" options={['Yes', 'No', 'NA']} value={data.q8LandsprayOnReserve} onChange={v => onChange('q8LandsprayOnReserve', v)} />
            <RadioGroup label="Report Attached" options={['Yes', 'No', 'NA']} value={data.q8ReportAttached} onChange={v => onChange('q8ReportAttached', v)} />
            <RadioGroup label="Meets Criteria" options={['Yes', 'No', 'NA']} value={data.q8MeetsCriteria} onChange={v => onChange('q8MeetsCriteria', v)} />
        </QuestionBlock>

        <QuestionBlock num="Q9" label="Timber management and salvage">
            <MultiCheckbox label="Timber Methods" options={['Burn', 'Chip', 'Deck', 'Spread', 'Other']} selected={data.q9TimberMethods} onToggle={item => onToggleArray('q9TimberMethods', item)} />
            <RadioGroup label="First Nation Notification" options={['Yes', 'No', 'NA']} value={data.q9FnNotification} onChange={v => onChange('q9FnNotification', v)} />
        </QuestionBlock>

        <QuestionBlock num="Q10" label="Progressive reclamation">
            <RadioGroup label="Progressive Reclamation" options={['Yes', 'No']} value={data.q10ProgressiveReclamation} onChange={v => onChange('q10ProgressiveReclamation', v)} />
            <RadioGroup label="Slopes Contoured" options={['Yes', 'No']} value={data.q10SlopesContoured} onChange={v => onChange('q10SlopesContoured', v)} />
            <RadioGroup label="Soils Respread" options={['Yes', 'No']} value={data.q10SoilsRespread} onChange={v => onChange('q10SoilsRespread', v)} />
            <EditableField label="Vegetation Method" value={data.q10VegetationMethod} onChange={v => onChange('q10VegetationMethod', v)} />
            <RadioGroup label="Certified Seed" options={['Yes', 'No']} value={data.q10CertifiedSeed} onChange={v => onChange('q10CertifiedSeed', v)} />
            <RadioGroup label="Vegetation Establishment" options={['Excellent', 'Good', 'Fair', 'Poor']} value={data.q10VegetationEstablishment} onChange={v => onChange('q10VegetationEstablishment', v)} />
            <EditableField label="Comments" value={data.q10Comments} onChange={v => onChange('q10Comments', v)} isTextArea rows={3} />
        </QuestionBlock>

        <QuestionBlock num="Q11" label="Has construction cleanup been completed?">
            <RadioGroup label="Construction Cleanup" options={['Yes', 'No', 'NA']} value={data.q11ConstructionCleanup} onChange={v => onChange('q11ConstructionCleanup', v)} />
            <EditableField label="Comments" value={data.q11Comments} onChange={v => onChange('q11Comments', v)} isTextArea rows={2} />
        </QuestionBlock>
    </Section>
);

// ─── Section B: Vegetation Monitoring (Q12-Q14) ───────────────────

interface SectionBProps { data: IogcSectionB; onChange: SectionHandler<IogcSectionB>; }

export const IogcSectionBPanel: React.FC<SectionBProps> = ({ data, onChange }) => (
    <Section title="Section B: Vegetation Monitoring">
        <QuestionBlock num="Q12" label="Weed species identified on site">
            <EditableField label="Weed List" value={data.q12WeedList} onChange={v => onChange('q12WeedList', v)} isTextArea rows={3} placeholder="List weed species found..." />
            <EditableField label="Comments" value={data.q12Comments} onChange={v => onChange('q12Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q13" label="What is the general status of vegetation?">
            <RadioGroup label="Vegetation Status" options={['Excellent', 'Good', 'Fair', 'Poor']} value={data.q13VegetationStatus} onChange={v => onChange('q13VegetationStatus', v)} />
            <RadioGroup label="Stressed Vegetation" options={['Yes', 'No']} value={data.q13StressedVegetation} onChange={v => onChange('q13StressedVegetation', v)} />
            <RadioGroup label="Bare Spots" options={['Yes', 'No']} value={data.q13BareSpots} onChange={v => onChange('q13BareSpots', v)} />
            <EditableField label="Comments" value={data.q13Comments} onChange={v => onChange('q13Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q14" label="Weed monitoring and control plan">
            <RadioGroup label="Weed Monitoring Plan" options={['Yes', 'No']} value={data.q14WeedMonitoringPlan} onChange={v => onChange('q14WeedMonitoringPlan', v)} />
            <EditableField label="Weed Control Strategies" value={data.q14WeedControlStrategies} onChange={v => onChange('q14WeedControlStrategies', v)} isTextArea rows={2} />
            <RadioGroup label="Ongoing Inspections" options={['Yes', 'No']} value={data.q14OngoingInspections} onChange={v => onChange('q14OngoingInspections', v)} />
            <RadioGroup label="Compliant with Regulations" options={['Yes', 'No']} value={data.q14CompliantWithRegs} onChange={v => onChange('q14CompliantWithRegs', v)} />
            <EditableField label="Comments" value={data.q14Comments} onChange={v => onChange('q14Comments', v)} isTextArea rows={2} />
        </QuestionBlock>
    </Section>
);

// ─── Section C: General Housekeeping (Q15-Q29) ────────────────────

interface SectionCProps { data: IogcSectionC; onChange: SectionHandler<IogcSectionC>; }

export const IogcSectionCPanel: React.FC<SectionCProps> = ({ data, onChange }) => (
    <Section title="Section C: General Housekeeping and Maintenance">
        <QuestionBlock num="Q15" label="Is the well/facility active, suspended, or abandoned?">
            <RadioGroup label="Activity Status" options={['Active', 'Suspended', 'Abandoned']} value={data.q15Activity} onChange={v => onChange('q15Activity', v)} />
            <EditableField label="Comments" value={data.q15Comments} onChange={v => onChange('q15Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q16" label="Land use and access road conditions">
            <EditableField label="Land Use" value={data.q16Landuse} onChange={v => onChange('q16Landuse', v)} isTextArea rows={2} />
            <EditableField label="Access Road Conditions" value={data.q16AccessRoadConditions} onChange={v => onChange('q16AccessRoadConditions', v)} isTextArea rows={2} />
            <EditableField label="Comments" value={data.q16Comments} onChange={v => onChange('q16Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q17" label="Low spots, slumping, and rutting">
            <RadioGroup label="Low Spots / Slumping" options={['Yes', 'No']} value={data.q17LowSpotsSlumping} onChange={v => onChange('q17LowSpotsSlumping', v)} />
            <RadioGroup label="Rutting" options={['Yes', 'No']} value={data.q17Rutting} onChange={v => onChange('q17Rutting', v)} />
            <EditableField label="Lease Accessibility" value={data.q17LeaseAccessibility} onChange={v => onChange('q17LeaseAccessibility', v)} />
            <EditableField label="Comments" value={data.q17Comments} onChange={v => onChange('q17Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q18" label="Traffic on lease access">
            <EditableField label="Traffic Description" value={data.q18Traffic} onChange={v => onChange('q18Traffic', v)} isTextArea rows={2} />
            <EditableField label="Comments" value={data.q18Comments} onChange={v => onChange('q18Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q19" label="Lease berm condition">
            <RadioGroup label="Berm Condition" options={['Excellent', 'Good', 'Fair', 'Poor', 'NA']} value={data.q19LeaseBermCondition} onChange={v => onChange('q19LeaseBermCondition', v)} />
            <EditableField label="Comments" value={data.q19Comments} onChange={v => onChange('q19Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q20" label="Flare stack condition">
            <EditableField label="Flare Stack" value={data.q20FlareStack} onChange={v => onChange('q20FlareStack', v)} isTextArea rows={2} />
            <EditableField label="Comments" value={data.q20Comments} onChange={v => onChange('q20Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q21" label="Odour detection">
            <RadioGroup label="Odour Detected" options={['Yes', 'No']} value={data.q21OdourDetection} onChange={v => onChange('q21OdourDetection', v)} />
            <EditableField label="Comments" value={data.q21Comments} onChange={v => onChange('q21Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q22" label="Unused equipment and felled trees">
            <RadioGroup label="Unused Equipment Removed" options={['Yes', 'No', 'NA']} value={data.q22UnusedEquipmentRemoved} onChange={v => onChange('q22UnusedEquipmentRemoved', v)} />
            <RadioGroup label="Felled Trees Removed" options={['Yes', 'No', 'NA']} value={data.q22FelledTreesRemoved} onChange={v => onChange('q22FelledTreesRemoved', v)} />
            <EditableField label="Comments" value={data.q22Comments} onChange={v => onChange('q22Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q23" label="Garbage and debris">
            <RadioGroup label="Garbage/Debris Condition" options={['Excellent', 'Good', 'Fair', 'Poor']} value={data.q23GarbageDebris} onChange={v => onChange('q23GarbageDebris', v)} />
            <EditableField label="Comments" value={data.q23Comments} onChange={v => onChange('q23Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q24" label="Reported complaints">
            <RadioGroup label="Complaints Reported" options={['Yes', 'No']} value={data.q24ReportedComplaints} onChange={v => onChange('q24ReportedComplaints', v)} />
            <EditableField label="Investigated By" value={data.q24Investigated} onChange={v => onChange('q24Investigated', v)} />
            <EditableField label="Comments" value={data.q24Comments} onChange={v => onChange('q24Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q25" label="Drainage">
            <RadioGroup label="Drainage Condition" options={['Excellent', 'Good', 'Fair', 'Poor']} value={data.q25Drainage} onChange={v => onChange('q25Drainage', v)} />
            <RadioGroup label="Ponding" options={['Yes', 'No']} value={data.q25Ponding} onChange={v => onChange('q25Ponding', v)} />
            <RadioGroup label="Aquatic Vegetation" options={['Yes', 'No']} value={data.q25AquaticVegetation} onChange={v => onChange('q25AquaticVegetation', v)} />
            <EditableField label="Comments" value={data.q25Comments} onChange={v => onChange('q25Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q26" label="Pump-off water">
            <EditableField label="Pump-Off Description" value={data.q26PumpOff} onChange={v => onChange('q26PumpOff', v)} isTextArea rows={2} />
            <EditableField label="Frequency" value={data.q26Frequency} onChange={v => onChange('q26Frequency', v)} />
            <RadioGroup label="Erosion" options={['Yes', 'No']} value={data.q26Erosion} onChange={v => onChange('q26Erosion', v)} />
            <EditableField label="Comments" value={data.q26Comments} onChange={v => onChange('q26Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q27" label="Erosion control measures">
            <EditableField label="Erosion Control" value={data.q27ErosionControl} onChange={v => onChange('q27ErosionControl', v)} isTextArea rows={2} />
            <EditableField label="Comments" value={data.q27Comments} onChange={v => onChange('q27Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q28" label="Waterbodies in proximity">
            <RadioGroup label="Waterbodies Present" options={['Yes', 'No']} value={data.q28Waterbodies} onChange={v => onChange('q28Waterbodies', v)} />
            <EditableField label="Distance" value={data.q28Distance} onChange={v => onChange('q28Distance', v)} />
            <EditableField label="Area" value={data.q28Area} onChange={v => onChange('q28Area', v)} />
            <EditableField label="Buffer" value={data.q28Buffer} onChange={v => onChange('q28Buffer', v)} />
            <EditableField label="Mitigation" value={data.q28Mitigation} onChange={v => onChange('q28Mitigation', v)} isTextArea rows={2} />
            <EditableField label="Comments" value={data.q28Comments} onChange={v => onChange('q28Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q29" label="Permits and authorization">
            <EditableField label="Permits / Authorization" value={data.q29PermitsAuthorization} onChange={v => onChange('q29PermitsAuthorization', v)} isTextArea rows={2} />
            <RadioGroup label="Ongoing Permits Required" options={['Yes', 'No']} value={data.q29OngoingPermits} onChange={v => onChange('q29OngoingPermits', v)} />
            <EditableField label="Comments" value={data.q29Comments} onChange={v => onChange('q29Comments', v)} isTextArea rows={2} />
        </QuestionBlock>
    </Section>
);

// ─── Section D: Environmental Protection (Q30-Q41) ────────────────

interface SectionDProps { data: IogcSectionD; onChange: SectionHandler<IogcSectionD>; }

export const IogcSectionDPanel: React.FC<SectionDProps> = ({ data, onChange }) => (
    <Section title="Section D: Environmental Protection">
        <QuestionBlock num="Q30" label="Signage">
            <RadioGroup label="Signage Compliance" options={['Compliant', 'Non-Compliant']} value={data.q30Signage} onChange={v => onChange('q30Signage', v)} />
            <RadioGroup label="Visible" options={['Yes', 'No']} value={data.q30Visible} onChange={v => onChange('q30Visible', v)} />
            <RadioGroup label="Legible" options={['Yes', 'No']} value={data.q30Legible} onChange={v => onChange('q30Legible', v)} />
            <RadioGroup label="Hotline Posted" options={['Yes', 'No']} value={data.q30Hotline} onChange={v => onChange('q30Hotline', v)} />
            <EditableField label="Comments" value={data.q30Comments} onChange={v => onChange('q30Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q31" label="Fencing">
            <RadioGroup label="Fencing Present" options={['Yes', 'No']} value={data.q31Fencing} onChange={v => onChange('q31Fencing', v)} />
            <EditableField label="Human Restriction" value={data.q31HumanRestriction} onChange={v => onChange('q31HumanRestriction', v)} />
            <EditableField label="Livestock Restriction" value={data.q31LivestockRestriction} onChange={v => onChange('q31LivestockRestriction', v)} />
            <RadioGroup label="Maintained" options={['Yes', 'No']} value={data.q31Maintained} onChange={v => onChange('q31Maintained', v)} />
            <EditableField label="Texas Gate Condition" value={data.q31TexasGateCondition} onChange={v => onChange('q31TexasGateCondition', v)} />
            <EditableField label="Comments" value={data.q31Comments} onChange={v => onChange('q31Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q32" label="Culverts">
            <RadioGroup label="Culverts Present" options={['Yes', 'No']} value={data.q32Culverts} onChange={v => onChange('q32Culverts', v)} />
            <RadioGroup label="Properly Installed" options={['Yes', 'No', 'NA']} value={data.q32ProperlyInstalled} onChange={v => onChange('q32ProperlyInstalled', v)} />
            <RadioGroup label="Correct Size" options={['Yes', 'No', 'NA']} value={data.q32CorrectSize} onChange={v => onChange('q32CorrectSize', v)} />
            <RadioGroup label="Properly Maintained" options={['Yes', 'No', 'NA']} value={data.q32ProperlyMaintained} onChange={v => onChange('q32ProperlyMaintained', v)} />
            <EditableField label="Comments" value={data.q32Comments} onChange={v => onChange('q32Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q33" label="Surface casing vent">
            <RadioGroup label="Surface Casing Vent" options={['Yes', 'No', 'NA']} value={data.q33SurfaceCasingVent} onChange={v => onChange('q33SurfaceCasingVent', v)} />
            <RadioGroup label="Open / Closed" options={['Open', 'Closed', 'NA']} value={data.q33OpenClosed} onChange={v => onChange('q33OpenClosed', v)} />
            <RadioGroup label="Clearance" options={['Yes', 'No', 'NA']} value={data.q33Clearance} onChange={v => onChange('q33Clearance', v)} />
            <EditableField label="Comments" value={data.q33Comments} onChange={v => onChange('q33Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q34" label="Wellhead valves">
            <EditableField label="Wellhead Valves Description" value={data.q34WellheadValves} onChange={v => onChange('q34WellheadValves', v)} isTextArea rows={2} />
            <RadioGroup label="Bull Plugs" options={['Yes', 'No', 'NA']} value={data.q34BullPlugs} onChange={v => onChange('q34BullPlugs', v)} />
            <EditableField label="Comments" value={data.q34Comments} onChange={v => onChange('q34Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q35" label="Chemical storage">
            <RadioGroup label="Chemical Storage" options={['Yes', 'No', 'NA']} value={data.q35ChemicalStorage} onChange={v => onChange('q35ChemicalStorage', v)} />
            <RadioGroup label="Sealed" options={['Yes', 'No', 'NA']} value={data.q35Sealed} onChange={v => onChange('q35Sealed', v)} />
            <RadioGroup label="WHMIS Labels" options={['Yes', 'No', 'NA']} value={data.q35Whmis} onChange={v => onChange('q35Whmis', v)} />
            <RadioGroup label="MSDS Available" options={['Yes', 'No', 'NA']} value={data.q35Msds} onChange={v => onChange('q35Msds', v)} />
            <EditableField label="Comments" value={data.q35Comments} onChange={v => onChange('q35Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q36" label="Tanks">
            <RadioGroup label="Tanks Present" options={['Yes', 'No', 'NA']} value={data.q36Tanks} onChange={v => onChange('q36Tanks', v)} />
            <RadioGroup label="In Good Repair" options={['Yes', 'No', 'NA']} value={data.q36InGoodRepair} onChange={v => onChange('q36InGoodRepair', v)} />
            <EditableField label="Comments" value={data.q36Comments} onChange={v => onChange('q36Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q37" label="Reportable spills">
            <RadioGroup label="Reportable Spills" options={['Yes', 'No']} value={data.q37ReportableSpills} onChange={v => onChange('q37ReportableSpills', v)} />
            {data.q37ReportableSpills === 'Yes' && (
                <>
                    <EditableField label="Spill Date" value={data.q37SpillDate} onChange={v => onChange('q37SpillDate', v)} />
                    <EditableField label="Substance" value={data.q37Substance} onChange={v => onChange('q37Substance', v)} />
                    <EditableField label="Volume" value={data.q37Volume} onChange={v => onChange('q37Volume', v)} />
                    <EditableField label="Notified" value={data.q37Notified} onChange={v => onChange('q37Notified', v)} />
                </>
            )}
            <EditableField label="Comments" value={data.q37Comments} onChange={v => onChange('q37Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q38" label="Surface staining">
            <RadioGroup label="Surface Staining" options={['Yes', 'No']} value={data.q38SurfaceStaining} onChange={v => onChange('q38SurfaceStaining', v)} />
            <RadioGroup label="On-Site" options={['Yes', 'No']} value={data.q38OnSite} onChange={v => onChange('q38OnSite', v)} />
            <RadioGroup label="Off-Site" options={['Yes', 'No']} value={data.q38OffSite} onChange={v => onChange('q38OffSite', v)} />
            <EditableField label="Comments" value={data.q38Comments} onChange={v => onChange('q38Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q39" label="Emergency Response Plan (ERP)">
            <RadioGroup label="ERP Compliance" options={['Compliant', 'Non-Compliant']} value={data.q39Erp} onChange={v => onChange('q39Erp', v)} />
            <RadioGroup label="ERP in Place" options={['Yes', 'No']} value={data.q39ErpInPlace} onChange={v => onChange('q39ErpInPlace', v)} />
            <EditableField label="Comments" value={data.q39Comments} onChange={v => onChange('q39Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q40" label="ERP exercise">
            <EditableField label="ERP Exercise Description" value={data.q40ErpExercise} onChange={v => onChange('q40ErpExercise', v)} isTextArea rows={2} />
            <EditableField label="Date" value={data.q40Date} onChange={v => onChange('q40Date', v)} />
            <EditableField label="Comments" value={data.q40Comments} onChange={v => onChange('q40Comments', v)} isTextArea rows={2} />
        </QuestionBlock>

        <QuestionBlock num="Q41" label="Excavation hazards">
            <RadioGroup label="Excavation Hazards" options={['Yes', 'No']} value={data.q41ExcavationHazards} onChange={v => onChange('q41ExcavationHazards', v)} />
            <EditableField label="Comments" value={data.q41Comments} onChange={v => onChange('q41Comments', v)} isTextArea rows={2} />
        </QuestionBlock>
    </Section>
);

// ─── Section E: Summary (Q42-Q46) ─────────────────────────────────

interface SectionEProps { data: IogcSectionE; onChange: SectionHandler<IogcSectionE>; errors: Set<string>; }

export const IogcSectionEPanel: React.FC<SectionEProps> = ({ data, onChange, errors }) => (
    <Section title="Section E: Overall Summary and Compliance">
        <QuestionBlock num="Q42" label="Are IOGC terms and conditions being met?">
            <RadioGroup label="IOGC Terms Compliance" options={['In Compliance', 'Not in Compliance']} value={data.q42IogcTerms} onChange={v => onChange('q42IogcTerms', v)} />
            <EditableField label="Comments" value={data.q42Comments} onChange={v => onChange('q42Comments', v)} isTextArea rows={3} />
        </QuestionBlock>

        <QuestionBlock num="Q43" label="Are other regulations being met?">
            <RadioGroup label="Other Regulations" options={['In Compliance', 'Not in Compliance']} value={data.q43OtherRegulations} onChange={v => onChange('q43OtherRegulations', v)} />
            <EditableField label="Comments" value={data.q43Comments} onChange={v => onChange('q43Comments', v)} isTextArea rows={3} />
        </QuestionBlock>

        <QuestionBlock num="Q44" label="Summary of non-compliance items">
            <EditableField label="Non-Compliance Summary" value={data.q44SummaryNonCompliance} onChange={v => onChange('q44SummaryNonCompliance', v)} isTextArea rows={4} />
        </QuestionBlock>

        <QuestionBlock num="Q45" label="Non-compliance follow-up actions">
            <EditableField label="Follow-Up Actions" value={data.q45NonComplianceFollowUp} onChange={v => onChange('q45NonComplianceFollowUp', v)} isTextArea rows={4} />
        </QuestionBlock>

        <QuestionBlock num="Q46" label="Overall compliance status">
            <RadioGroup label="Overall Compliance" options={['In Compliance', 'Not in Compliance']} value={data.q46OverallCompliance} onChange={v => onChange('q46OverallCompliance', v)} isInvalid={errors.has('sectionE.q46OverallCompliance')} />
            <EditableField label="Comments" value={data.q46Comments} onChange={v => onChange('q46Comments', v)} isTextArea rows={3} />
        </QuestionBlock>
    </Section>
);
