export interface HeaderData {
  proponent: string;
  projectName: string;
  location: string;
  date: string;
  projectNumber: string;
}

export interface DfrHeaderData extends HeaderData {
    monitor: string;
    envFile?: string; // For backward compatibility
    envFileType: string;
    envFileValue: string;
}

export interface DfrTextData {
    projectActivities: string;
    communication: string;
    weatherAndGroundConditions: string;
    environmentalProtection: string;
    wildlifeObservations: string;
    furtherRestoration: string;
}

// --- New DFR Structure Types ---
export interface LocationActivity {
    id: number;
    location: string;
    activities: string;
    comment?: string;
    highlights?: {
        activities?: TextHighlight[];
    };
    inlineComments?: {
        activities?: TextComment[];
    };
}

export type ActivityBlockType = 'location' | 'general';

// Kept for backward compatibility migration from mixed-type arrays
export interface ActivityBlock {
    id: number;
    type: ActivityBlockType;
    location?: string;
    activities: string;
}

export interface TextHighlight {
    start: number;
    end: number;
    color: string; // hex color code e.g., '#FFFF00'
}

/**
 * Comment Reply - CRITICAL: author MUST be preserved on save/load
 * Only use getCurrentUsername() for NEW replies, never overwrite stored author
 */
export interface CommentReply {
    id: string;
    text: string;
    author: string;        // PRESERVED: Never overwrite on load
    authorAvatar?: string; // Base64 data URL, embedded at creation time
    timestamp: Date;       // Serialized as ISO string in JSON
}

/**
 * Text Comment (anchored to specific text range)
 * CRITICAL: author MUST be preserved on save/load
 * Only use getCurrentUsername() for NEW comments, never overwrite stored author
 */
export interface TextComment {
    id: string;
    start: number;         // Character index in text
    end: number;           // Character index in text
    text: string;          // Comment body
    suggestedText?: string; // Optional text suggestion
    author: string;        // PRESERVED: Never overwrite on load
    authorAvatar?: string; // Base64 data URL, embedded at creation time
    timestamp: Date;       // Serialized as ISO string in JSON
    resolved: boolean;
    replies?: CommentReply[];
}

/**
 * Comment Thread - Alternative structure for field-level comments
 * Can be used for simpler comment systems not anchored to text ranges
 */
export interface CommentThread {
    id: string;
    anchorId: string;      // Field ID this comment is attached to
    author: string;        // PRESERVED: Never overwrite on load
    createdAt: number;     // Unix timestamp
    body: string;
    resolved?: boolean;
    replies: CommentReply[];
}

export interface DfrStandardBodyData {
    generalActivity: string;
    locationActivities: LocationActivity[];

    // Old fields for migration logic
    activityBlocks?: ActivityBlock[];
    projectActivities?: string; 

    communication: string;
    weatherAndGroundConditions: string;
    environmentalProtection: string;
    wildlifeObservations: string;
    furtherRestoration: string;
    comments?: { [key: string]: string };
    
    // Highlights (not exported to PDF)
    highlights?: {
        generalActivity?: TextHighlight[];
        communication?: TextHighlight[];
        weatherAndGroundConditions?: TextHighlight[];
        environmentalProtection?: TextHighlight[];
        wildlifeObservations?: TextHighlight[];
        furtherRestoration?: TextHighlight[];
    };

    // Inline comments (not exported to PDF)
    inlineComments?: {
        generalActivity?: TextComment[];
        communication?: TextComment[];
        weatherAndGroundConditions?: TextComment[];
        environmentalProtection?: TextComment[];
        wildlifeObservations?: TextComment[];
        furtherRestoration?: TextComment[];
    };
}

export interface PhotoData {
  id: number;
  photoNumber: string;
  date: string;
  location: string;
  description: string;
  imageUrl: string | null;
  imageFile?: File;
  imageId?: string;
  direction?: string;
  isMap?: boolean;
  inlineComments?: TextComment[];
  highlights?: TextHighlight[];
}

// --- SaskPower DFR Types ---
export type ChecklistOption = 'Yes' | 'No' | 'NA' | '';

export interface DfrSaskpowerData {
    proponent: string;
    date: string;
    location: string;
    projectName: string;
    vendorAndForeman: string;
    projectNumber: string; // X-Terra Project Number
    environmentalMonitor: string;
    envFileNumber: string;
    
    generalActivity: string;
    locationActivities: LocationActivity[];

    // Old fields for migration logic
    activityBlocks?: ActivityBlock[];
    projectActivities?: string; 
    locationActivities_old?: LocationActivity[]; // Another legacy format

    totalHoursWorked: string;
    
    completedTailgate: ChecklistOption;
    reviewedTailgate: ChecklistOption;
    reviewedPermits: ChecklistOption;
    
    equipmentOnsite: string;
    weatherAndGroundConditions: string;
    environmentalProtection: string;
    wildlifeObservations: string;
    futureMonitoring: string;
    comments?: { [key: string]: string };
    
    // Highlights (not exported to PDF)
    highlights?: {
        generalActivity?: TextHighlight[];
        equipmentOnsite?: TextHighlight[];
        weatherAndGroundConditions?: TextHighlight[];
        environmentalProtection?: TextHighlight[];
        wildlifeObservations?: TextHighlight[];
        futureMonitoring?: TextHighlight[];
    };

    // Inline comments (not exported to PDF)
    inlineComments?: {
        generalActivity?: TextComment[];
        equipmentOnsite?: TextComment[];
        weatherAndGroundConditions?: TextComment[];
        environmentalProtection?: TextComment[];
        wildlifeObservations?: TextComment[];
        futureMonitoring?: TextComment[];
    };
}