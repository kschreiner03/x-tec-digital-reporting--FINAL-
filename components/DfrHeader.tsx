import React, { useRef, useLayoutEffect, useEffect } from 'react';
import type { DfrHeaderData } from '../types';
import SafeImage from './SafeImage';

interface HeaderProps {
    data: DfrHeaderData;
    onDataChange: (field: keyof DfrHeaderData, value: string) => void;
    isPrintable?: boolean;
    errors?: Set<keyof DfrHeaderData>;
    placeholders?: Partial<DfrHeaderData>;
    isPhotologHeader?: boolean;
}


const XterraLogo: React.FC<{ isPrintable?: boolean }> = ({ isPrintable = false }) => (
    <div className="flex items-center">
        <SafeImage
            fileName="xterra-logo.png"
            alt="X-TERRA Logo"
            className={isPrintable ? "h-10 w-auto" : "h-14 w-auto dark:hidden"}
        />
        <SafeImage
            fileName="xterra-white.png"
            alt="X-TERRA Logo"
            className={isPrintable ? "h-10 w-auto" : "h-14 w-auto hidden dark:block"}
        />
    </div>
);

const SelectableLabelField: React.FC<{ 
    labelType: string; 
    value: string; 
    onLabelChange: (value: string) => void; 
    onValueChange: (value: string) => void;
    isPrintable?: boolean;
    isInvalid?: boolean;
    placeholder?: string;
}> = ({ labelType, value, onLabelChange, onValueChange, isPrintable = false, isInvalid = false, placeholder = '' }) => {
    
    const options = ["IOCG Lease #", "Disposition #", "ENV File #", "License #", "WSA File #"];

    if (isPrintable) {
        return (
            <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-black flex-shrink-0 whitespace-nowrap">{labelType}:</span>
                <span className="text-base font-normal text-black break-words">{value || '\u00A0'}</span>
            </div>
        );
    }
    
    const selectClasses = `p-1 border-b-2 focus:outline-none focus:border-[#007D8C] transition duration-200 bg-transparent text-base font-bold text-black dark:text-gray-200 dark:bg-gray-800 ${isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`;
    const inputClasses = `p-1 w-full border-b-2 focus:outline-none focus:border-[#007D8C] transition duration-200 bg-transparent text-base font-normal text-black dark:text-gray-100 min-w-0 ${isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`;

    return (
        <div className="flex items-baseline gap-2">
             <select value={labelType} onChange={(e) => onLabelChange(e.target.value)} className={selectClasses}>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <input 
                type="text" 
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                className={inputClasses}
                placeholder={placeholder}
                spellCheck={true}
            />
        </div>
    );
};

const EditableField: React.FC<{ 
    label: string; 
    value: string; 
    onChange: (value: string) => void; 
    isPrintable?: boolean; 
    isInvalid?: boolean; 
    isTextArea?: boolean; 
    placeholder?: string; 
}> = ({ label, value, onChange, isPrintable = false, isInvalid = false, isTextArea = false, placeholder = '' }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useLayoutEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'inherit';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [value]);
    
    if (isPrintable) {
        return (
            <div className="flex items-baseline gap-1">
                <span className="text-base font-bold text-black flex-shrink-0 whitespace-nowrap">{label}:</span>
                <span className="text-base font-normal text-black break-words">{value || '\u00A0'}</span>
            </div>
        );
    }

    const commonInputClasses = `p-1 w-full border-b-2 focus:outline-none focus:border-[#007D8C] transition duration-200 bg-transparent text-base font-normal text-black dark:text-gray-100 min-w-0 ${isInvalid ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`;
    const labelClasses = "text-base font-bold text-black dark:text-gray-200 flex-shrink-0 whitespace-nowrap";

    if (isTextArea) {
        return (
            <div className="flex items-start gap-2">
                <label className={`${labelClasses} pt-1`}>{label}:</label>
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={1}
                    className={`${commonInputClasses} resize-none overflow-hidden`}
                    placeholder={placeholder}
                    spellCheck={true}
                />
            </div>
        );
    }

    return (
        <div className="flex items-baseline gap-2">
            <label className={labelClasses}>{label}:</label>
            <input 
                ref={inputRef}
                type="text" 
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={commonInputClasses}
                placeholder={placeholder}
                spellCheck={true}
            />
        </div>
    );
};

export const DfrHeader: React.FC<HeaderProps> = ({ data, onDataChange, isPrintable = false, errors, placeholders, isPhotologHeader = false }) => {
    return (
        <div className={`bg-white dark:bg-gray-800 transition-colors duration-200 ${isPrintable ? 'p-0 shadow-none' : 'p-6 shadow-md rounded-lg'}`}>
            <div className={`grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] md:items-center pb-4 gap-4`}>
                <div className="flex justify-center md:justify-start">
                    <XterraLogo isPrintable={isPrintable} />
                </div>
                <h1 className={`font-extrabold text-[#007D8C] tracking-wider text-center whitespace-nowrap ${isPrintable ? 'text-2xl' : 'text-4xl'}`}>
                    {/* FIX: Conditionally render title based on isPhotologHeader prop */}
                    {isPhotologHeader ? 'PHOTOGRAPHIC LOG' : 'DAILY FIELD REPORT'}
                </h1>
                <div></div>
            </div>
            
            <div className="border-t-4 border-[#007D8C]"></div>
            
            <div className={`bg-white dark:bg-gray-800 transition-colors duration-200 ${isPrintable ? 'py-2' : 'pt-4'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    <div className="flex flex-col gap-y-2">
                        <EditableField label="DATE" value={data.date} onChange={(v) => onDataChange('date', v)} isPrintable={isPrintable} isInvalid={errors?.has('date')} placeholder="October 1, 2025" />
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="PROPONENT" value={data.proponent} onChange={(v) => onDataChange('proponent', v)} isPrintable={isPrintable} isInvalid={errors?.has('proponent')} placeholder={placeholders?.proponent} />
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="LOCATION" value={data.location} onChange={(v) => onDataChange('location', v)} isPrintable={isPrintable} isInvalid={errors?.has('location')} isTextArea placeholder={placeholders?.location}/>
                    </div>

                    <div className="flex flex-col gap-y-2">
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="Project #" value={data.projectNumber} onChange={(v) => onDataChange('projectNumber', v)} isPrintable={isPrintable} isInvalid={errors?.has('projectNumber')} placeholder={placeholders?.projectNumber} />
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="MONITOR" value={data.monitor} onChange={(v) => onDataChange('monitor', v)} isPrintable={isPrintable} isInvalid={errors?.has('monitor')} placeholder={placeholders?.monitor} />
                        <SelectableLabelField
                            labelType={data.envFileType}
                            value={data.envFileValue}
                            onLabelChange={(v) => onDataChange('envFileType', v)}
                            onValueChange={(v) => onDataChange('envFileValue', v)}
                            isPrintable={isPrintable}
                            isInvalid={errors?.has('envFileValue')}
                            // FIX: Use optional chaining to safely access placeholder properties.
                            placeholder={placeholders?.envFileValue}
                        />
                    </div>

                    <div className="md:col-span-2">
                        {/* FIX: Use optional chaining to safely access placeholder properties. */}
                        <EditableField label="PROJECT NAME" value={data.projectName} onChange={(v) => onDataChange('projectName', v)} isPrintable={isPrintable} isInvalid={errors?.has('projectName')} isTextArea placeholder={placeholders?.projectName} />
                    </div>
                </div>
            </div>
            
            <div className={`border-t-4 border-[#007D8C] ${isPrintable ? '' : 'mt-2'}`}></div>
        </div>
    );
};