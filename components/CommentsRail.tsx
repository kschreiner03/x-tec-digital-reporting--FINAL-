import React, { useState, useMemo } from 'react';
import type { TextComment, CommentReply } from '../types';

/* ============================================================
   SIMPLE INLINE COMMENTS PANE

   - Scrolls with document (not fixed)
   - Clean theme-consistent styling
   - No laggy scroll calculations
   - Simple list-based layout
   ============================================================ */

// Get Windows username - ONLY use for NEW comments/replies
const getCurrentUsername = (): string => {
    try {
        if (typeof window === 'undefined') return 'User';
        const electronAPI = (window as any).electronAPI;
        if (electronAPI?.getUserInfo) {
            const userInfo = electronAPI.getUserInfo();
            if (userInfo?.username) {
                // Cache so ProfileAvatar can compare reliably even if API is slow
                localStorage.setItem('xtec_current_username', userInfo.username);
                return userInfo.username;
            }
        }
    } catch (error) {
        console.error('Error getting username:', error);
    }
    return localStorage.getItem('xtec_current_username') || 'User';
};

const ProfileAvatar: React.FC<{ author: string; size: 'sm' | 'md'; authorAvatar?: string }> = ({ author, size, authorAvatar }) => {
    const currentUser = getCurrentUsername();
    // Case-insensitive match — Windows usernames can vary in case between sessions.
    // For the current user, always use their live profile picture so it updates instantly.
    // For other users, use the avatar embedded in the comment (travels with the project file).
    const isMe = currentUser.toLowerCase() === author.toLowerCase();
    const avatarSrc = isMe
        ? (localStorage.getItem('xtec_profile_picture') || authorAvatar || null)
        : (authorAvatar || null);
    const dims = size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
    const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
    const bgColor = size === 'sm' ? 'bg-gray-400 dark:bg-gray-600' : 'bg-blue-500';

    if (avatarSrc) {
        return <img src={avatarSrc} alt={author} className={`${dims} rounded-full object-cover flex-shrink-0`} />;
    }
    return (
        <div className={`${dims} rounded-full ${bgColor} flex items-center justify-center text-white ${textSize} font-semibold flex-shrink-0`}>
            {author.charAt(0).toUpperCase()}
        </div>
    );
};

export interface FieldComment extends TextComment {
    fieldId: string;
    fieldLabel: string;
}

export interface CommentAnchor {
    fieldId: string;
    commentId: string;
    top: number;
    left: number;
    height: number;
}

interface CommentsRailProps {
    comments: FieldComment[];
    anchors: Map<string, CommentAnchor>;
    isCollapsed: boolean;
    onToggleCollapsed: () => void;
    onDeleteComment: (fieldId: string, commentId: string) => void;
    onResolveComment: (fieldId: string, commentId: string) => void;
    onUpdateComment: (fieldId: string, commentId: string, newText: string) => void;
    onAddReply?: (fieldId: string, commentId: string, replyText: string) => void;
    onDeleteReply?: (fieldId: string, commentId: string, replyId: string) => void;
    onHoverComment?: (commentId: string | null) => void;
    onFocusComment?: (fieldId: string, commentId: string) => void;
    contentShiftAmount: number;
    railWidth: number;
}

const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const d = new Date(date);
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

type FilterTab = 'all' | 'open' | 'resolved';

/* ============================================================
   REPLY COMPONENT
   ============================================================ */

const ReplyItem: React.FC<{
    reply: CommentReply;
    onDelete?: () => void;
}> = ({ reply, onDelete }) => {
    const currentUser = getCurrentUsername();
    const canDelete = currentUser === reply.author;

    return (
        <div className="pl-3 py-2 border-l-2 border-gray-200 dark:border-gray-600 ml-2 group/reply">
            <div className="flex items-start gap-2">
                <ProfileAvatar author={reply.author} size="sm" authorAvatar={reply.authorAvatar} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                            {reply.author}
                        </span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTimestamp(reply.timestamp)}
                        </span>
                        {canDelete && onDelete && (
                            <button
                                onClick={onDelete}
                                className="ml-auto p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30
                                           opacity-0 group-hover/reply:opacity-100 transition-opacity"
                                title="Delete reply"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed whitespace-pre-wrap">
                        {reply.text}
                    </p>
                </div>
            </div>
        </div>
    );
};

/* ============================================================
   COMMENT CARD COMPONENT
   ============================================================ */

interface CommentCardProps {
    comment: FieldComment;
    onDelete: () => void;
    onResolve: () => void;
    onUpdate: (text: string) => void;
    onAddReply?: (text: string) => void;
    onDeleteReply?: (replyId: string) => void;
    onHover?: (isHovered: boolean) => void;
    onFocus?: () => void;
}

const CommentCard: React.FC<CommentCardProps> = ({
    comment,
    onDelete,
    onResolve,
    onUpdate,
    onAddReply,
    onDeleteReply,
    onHover,
    onFocus,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(comment.text);
    const [showReply, setShowReply] = useState(false);
    const [replyText, setReplyText] = useState('');
    const currentUser = getCurrentUsername();

    const handleSave = () => {
        if (editText.trim()) {
            onUpdate(editText.trim());
        }
        setIsEditing(false);
    };

    const handleReply = () => {
        if (replyText.trim() && onAddReply) {
            onAddReply(replyText.trim());
            setReplyText('');
            setShowReply(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, action: () => void) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            action();
        }
        if (e.key === 'Escape') {
            setIsEditing(false);
            setShowReply(false);
            setEditText(comment.text);
            setReplyText('');
        }
    };

    return (
        <div
            className={`
                group rounded-lg overflow-hidden
                bg-white dark:bg-gray-800
                border border-gray-200 dark:border-gray-700
                shadow-sm hover:shadow-md transition-shadow cursor-pointer
                ${comment.resolved ? 'opacity-60' : ''}
            `}
            onMouseEnter={() => onHover?.(true)}
            onMouseLeave={() => onHover?.(false)}
        >
            <div className="p-3">
                {/* Header */}
                <div className="flex items-start gap-2 mb-2">
                    <ProfileAvatar author={comment.author} size="md" authorAvatar={comment.authorAvatar} />
                    <div className="flex-1 min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-medium truncate">
                            {comment.fieldLabel}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                {comment.author}
                            </span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                • {formatTimestamp(comment.timestamp)}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onDelete}
                        className="flex-shrink-0 p-1 rounded text-gray-400
                                   hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30
                                   opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete comment"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Comment body */}
                {isEditing ? (
                    <div className="space-y-2">
                        <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, handleSave)}
                            className="w-full text-sm p-2 border rounded bg-gray-50 dark:bg-gray-700
                                       border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100
                                       focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none resize-none"
                            rows={3}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => { setIsEditing(false); setEditText(comment.text); }}
                                className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400
                                           bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-3 py-1 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                        comment.resolved
                            ? 'text-gray-400 dark:text-gray-500 line-through'
                            : 'text-gray-700 dark:text-gray-300'
                    }`}>
                        {comment.text}
                    </p>
                )}

                {/* Replies */}
                {comment.replies && comment.replies.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-1">
                        {comment.replies.map((reply) => (
                            <ReplyItem
                                key={reply.id}
                                reply={reply}
                                onDelete={onDeleteReply ? () => onDeleteReply(reply.id) : undefined}
                            />
                        ))}
                    </div>
                )}

                {/* Reply input */}
                {showReply && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        <textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, handleReply)}
                            placeholder="Write a reply... (Enter to send)"
                            className="w-full text-sm p-2 border rounded bg-gray-50 dark:bg-gray-700
                                       border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100
                                       focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:outline-none resize-none"
                            rows={2}
                            autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => { setReplyText(''); setShowReply(false); }}
                                className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400
                                           bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReply}
                                disabled={!replyText.trim()}
                                className="px-3 py-1 text-xs font-medium text-white bg-blue-500 rounded
                                           hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Reply
                            </button>
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                {!isEditing && !showReply && (
                    <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        {onFocus && (
                            <button
                                onClick={() => {
                                    onFocus();
                                    // Trigger glow effect
                                    onHover?.(true);
                                    setTimeout(() => onHover?.(false), 2000);
                                }}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-500 dark:text-blue-400
                                           rounded hover:bg-blue-50 dark:hover:bg-blue-900/30"
                                title="Jump to text"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                Find
                            </button>
                        )}
                        {currentUser === comment.author && !comment.resolved && (
                            <button
                                onClick={() => { setIsEditing(true); setEditText(comment.text); }}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400
                                           rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                                Edit
                            </button>
                        )}
                        {!comment.resolved && onAddReply && (
                            <button
                                onClick={() => setShowReply(true)}
                                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400
                                           rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                                Reply
                            </button>
                        )}
                        <button
                            onClick={onResolve}
                            className={`ml-auto flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${
                                comment.resolved
                                    ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                                    : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30'
                            }`}
                        >
                            {comment.resolved ? (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Reopen
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Resolve
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

/* ============================================================
   MAIN COMMENTS PANE COMPONENT
   ============================================================ */

const CommentsRail: React.FC<CommentsRailProps> = ({
    comments,
    anchors,
    isCollapsed,
    onToggleCollapsed,
    onDeleteComment,
    onResolveComment,
    onUpdateComment,
    onAddReply,
    onDeleteReply,
    onHoverComment,
    onFocusComment,
    contentShiftAmount,
    railWidth,
}) => {
    const [filter, setFilter] = useState<FilterTab>('open');
    const [showFilters, setShowFilters] = useState(false);
    const [filterSection, setFilterSection] = useState('');
    const [filterUser, setFilterUser] = useState('');
    const [filterDate, setFilterDate] = useState('');

    // Validate comments
    const validComments = useMemo(() => {
        return (comments || []).filter(c =>
            c && c.id && c.fieldId &&
            typeof c.start === 'number' &&
            typeof c.end === 'number'
        );
    }, [comments]);

    // Unique section and user values for dropdowns
    const uniqueSections = useMemo(() =>
        [...new Set(validComments.map(c => c.fieldLabel))].sort(),
    [validComments]);

    const uniqueUsers = useMemo(() =>
        [...new Set(validComments.map(c => c.author))].sort(),
    [validComments]);

    // Filter by tab + section + user + date
    const filteredComments = useMemo(() => {
        let result = validComments;
        switch (filter) {
            case 'open': result = result.filter(c => !c.resolved); break;
            case 'resolved': result = result.filter(c => c.resolved); break;
        }
        if (filterSection) result = result.filter(c => c.fieldLabel === filterSection);
        if (filterUser) result = result.filter(c => c.author === filterUser);
        if (filterDate) {
            const now = new Date();
            result = result.filter(c => {
                const d = new Date(c.timestamp);
                if (filterDate === 'today') return d.toDateString() === now.toDateString();
                if (filterDate === 'week') {
                    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
                    return d >= cutoff;
                }
                if (filterDate === 'month') {
                    const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1);
                    return d >= cutoff;
                }
                return true;
            });
        }
        return result;
    }, [validComments, filter, filterSection, filterUser, filterDate]);

    // Sort by field then timestamp
    const sortedComments = useMemo(() => {
        return [...filteredComments].sort((a, b) => {
            // First by field
            if (a.fieldLabel !== b.fieldLabel) {
                return a.fieldLabel.localeCompare(b.fieldLabel);
            }
            // Then by timestamp (newest first)
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });
    }, [filteredComments]);

    const openCount = validComments.filter(c => !c.resolved).length;
    const resolvedCount = validComments.filter(c => c.resolved).length;

    if (validComments.length === 0) return null;

    if (isCollapsed) {
        return (
            <button
                onClick={onToggleCollapsed}
                className="flex flex-col items-center gap-2 px-3 py-4
                           bg-white dark:bg-gray-800 rounded-lg
                           border border-gray-200 dark:border-gray-700
                           shadow-sm hover:shadow-md transition-shadow"
                title="Show comments"
            >
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                    {openCount}
                </span>
            </button>
        );
    }

    return (
        <div
            className="flex flex-col bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            style={{ width: railWidth, minWidth: railWidth, maxHeight: 'calc(100vh - 2rem)' }}
        >
            {/* Header */}
            <div className="px-3 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Comments</h3>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setShowFilters(v => !v)}
                            className={`p-1 rounded transition-colors ${
                                showFilters || filterSection || filterUser || filterDate
                                    ? 'bg-[#007D8C]/10 text-[#007D8C]'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
                            }`}
                            title="Toggle filters"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                            </svg>
                        </button>
                        <button
                            onClick={onToggleCollapsed}
                            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Hide comments"
                        >
                            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-0.5 rounded-lg">
                    {(['all', 'open', 'resolved'] as FilterTab[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            className={`flex-1 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                                filter === tab
                                    ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            {tab === 'all' && `All (${validComments.length})`}
                            {tab === 'open' && `Open (${openCount})`}
                            {tab === 'resolved' && `Done (${resolvedCount})`}
                        </button>
                    ))}
                </div>

                {/* Section / User / Date filters */}
                {showFilters && <div className="flex gap-1 mt-2 flex-wrap">
                    {uniqueSections.length > 1 && (
                        <select
                            value={filterSection}
                            onChange={(e) => setFilterSection(e.target.value)}
                            className="flex-1 min-w-0 text-[10px] bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 text-gray-600 dark:text-gray-300 focus:outline-none focus:border-[#007D8C]"
                        >
                            <option value="">All Sections</option>
                            {uniqueSections.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    )}
                    {uniqueUsers.length > 1 && (
                        <select
                            value={filterUser}
                            onChange={(e) => setFilterUser(e.target.value)}
                            className="flex-1 min-w-0 text-[10px] bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 text-gray-600 dark:text-gray-300 focus:outline-none focus:border-[#007D8C]"
                        >
                            <option value="">All Users</option>
                            {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    )}
                    <select
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="flex-1 min-w-0 text-[10px] bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-1.5 py-1 text-gray-600 dark:text-gray-300 focus:outline-none focus:border-[#007D8C]"
                    >
                        <option value="">All Dates</option>
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                    </select>
                    {(filterSection || filterUser || filterDate) && (
                        <button
                            onClick={() => { setFilterSection(''); setFilterUser(''); setFilterDate(''); }}
                            className="px-1.5 py-1 text-[10px] text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/20 rounded"
                            title="Clear filters"
                        >
                            ✕
                        </button>
                    )}
                </div>}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {sortedComments.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                        <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        <p className="text-xs">No {filter !== 'all' ? filter : ''} comments</p>
                    </div>
                ) : (
                    sortedComments.map(comment => (
                        <CommentCard
                            key={comment.id}
                            comment={comment}
                            onDelete={() => onDeleteComment(comment.fieldId, comment.id)}
                            onResolve={() => onResolveComment(comment.fieldId, comment.id)}
                            onUpdate={(text) => onUpdateComment(comment.fieldId, comment.id, text)}
                            onAddReply={onAddReply ? (text) => onAddReply(comment.fieldId, comment.id, text) : undefined}
                            onDeleteReply={onDeleteReply ? (replyId) => onDeleteReply(comment.fieldId, comment.id, replyId) : undefined}
                            onHover={onHoverComment ? (isHovered) => onHoverComment(isHovered ? comment.id : null) : undefined}
                            onFocus={onFocusComment ? () => onFocusComment(comment.fieldId, comment.id) : undefined}
                        />
                    ))
                )}
            </div>
        </div>
    );
};

export default CommentsRail;
