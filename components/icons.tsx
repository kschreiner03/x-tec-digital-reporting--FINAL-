import {
  Plus,
  Trash2,
  Camera,
  ArrowUp,
  ArrowDown,
  Download,
  X,
  Save,
  FolderOpen,
  FolderDown,
  FileText,
  ClipboardList,
  ArrowLeft,
  Search,
  MoreVertical,
  Maximize,
  Eye,
  Pencil,
  Copy,
  MessageSquare,
  Zap,
  ZoomIn,
  ZoomOut,
  GripVertical,
  ChevronDown
} from "lucide-react";

/* ============================================================
                       ICON EXPORTS
   ============================================================ */

export const PlusIcon = (p: any) => (
  <Plus strokeWidth={1.25} {...p} />
);

export const TrashIcon = (p: any) => (
  <X strokeWidth={1.25} {...p} />
);

export const CameraIcon = (p: any) => (
  <Camera strokeWidth={1.25} color="#007D8C" {...p} />
);

export const ArrowUpIcon = (p: any) => (
  <ArrowUp strokeWidth={1.25} {...p} />
);

export const ArrowDownIcon = (p: any) => (
  <ArrowDown strokeWidth={1.25} {...p} />
);

export const DownloadIcon = (p: any) => (
  <Download strokeWidth={1.25} color="#ffffffff" {...p} />
);

export const CloseIcon = (p: any) => (
  <X strokeWidth={1.25} {...p} />
);

/* ============================================================
        SAVE ICON — CUSTOM MODIFIED VERSION USING LUCIDE
   ============================================================ */

export const SaveIcon = (p: any) => (
  <Save strokeWidth={1.25} color="#ffffffff" {...p} />
);

export const FolderOpenIcon = (p: any) => (
  <FolderOpen strokeWidth={1.25}  {...p} />
);

export const FolderArrowDownIcon = (p: any) => (
  <FolderDown strokeWidth={1.25} {...p} />
);

export const DocumentTextIcon = (p: any) => (
  <FileText strokeWidth={1.25} color="#007D8C" {...p} />
);

export const ClipboardDocumentListIcon = (p: any) => (
  <ClipboardList strokeWidth={1.25} color="#007D8C" {...p} />
);

export const ArrowLeftIcon = (p: any) => (
  <ArrowLeft strokeWidth={1.25} color="#007D8C" {...p} />
);

export const SearchIcon = (p: any) => (
  <Search strokeWidth={1.25} color="#007D8C" {...p} />
);

export const EllipsisVerticalIcon = (p: any) => (
  <MoreVertical strokeWidth={1.25} {...p} />
);

export const ArrowsPointingOutIcon = (p: any) => (
  <Maximize strokeWidth={1.25} {...p} />
);

export const EyeIcon = (p: any) => (
  <Eye strokeWidth={1.25} color="#007D8C" {...p} />
);

export const PencilSquareIcon = (p: any) => (
  <Pencil strokeWidth={1.25} color="#007D8C" {...p} />
);

export const DocumentDuplicateIcon = (p: any) => (
  <Copy strokeWidth={1.25}  {...p} />
);

export const ChatBubbleLeftIcon = (p: any) => (
  <MessageSquare strokeWidth={1.25} {...p} />
);

/* ============================================================
      SASKPOWER ICON — LUCIDE LIGHTNING BOLT
   ============================================================ */
export const SaskPowerIcon = (p: any) => (
  <Zap strokeWidth={1.25} color="#FF6700" {...p} />
);
import { ClipboardCheck } from "lucide-react";

export const StandardDfrIcon = (p: any) => (
  <ClipboardCheck strokeWidth={1.25} color="#007D8C" {...p} />
);

export const ZoomInIcon = (p: any) => (
  <ZoomIn strokeWidth={1.25} {...p} />
);

export const ZoomOutIcon = (p: any) => (
  <ZoomOut strokeWidth={1.25} {...p} />
);

export const GripVerticalIcon = (p: any) => (
  <GripVertical strokeWidth={1.25} {...p} />
);

export const ChevronDownIcon = (p: any) => (
  <ChevronDown strokeWidth={2} {...p} />
);
