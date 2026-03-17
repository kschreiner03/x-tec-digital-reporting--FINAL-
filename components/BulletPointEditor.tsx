import React, { useRef, useState, useEffect } from 'react';
import { TextHighlight, TextComment } from '../types';

// Get Windows username
const getCurrentUsername = () => {
    try {
        if (typeof window === 'undefined') return 'User';

        const electronAPI = (window as any).electronAPI;

        // Use the exposed getUserInfo method
        if (electronAPI?.getUserInfo) {
            const userInfo = electronAPI.getUserInfo();
            if (userInfo?.username) {
                return userInfo.username;
            }
        }

        // Fallback: log for debugging
        console.warn('Unable to get username. ElectronAPI available:', !!electronAPI);

    } catch (error) {
        console.error('Error getting username:', error);
    }

    return 'User';
};

// Adjust highlight/comment ranges after a text edit so they track the correct characters.
// Ranges that fall entirely within deleted text are removed; ranges before/after the
// change are shifted; ranges that overlap the change boundary are clamped.
function adjustRangesForEdit<T extends { start: number; end: number }>(
    oldValue: string,
    newValue: string,
    ranges: T[]
): T[] {
    if (ranges.length === 0) return ranges;

    // Find the bounds of the changed region by comparing old and new from both ends
    let changeStart = 0;
    while (changeStart < oldValue.length && changeStart < newValue.length &&
           oldValue[changeStart] === newValue[changeStart]) {
        changeStart++;
    }
    let oldEnd = oldValue.length;
    let newEnd = newValue.length;
    while (oldEnd > changeStart && newEnd > changeStart &&
           oldValue[oldEnd - 1] === newValue[newEnd - 1]) {
        oldEnd--;
        newEnd--;
    }

    const deletedLength = oldEnd - changeStart;
    const insertedLength = newEnd - changeStart;

    return ranges.reduce<T[]>((acc, range) => {
        const { start, end } = range;
        if (end <= changeStart) {
            // Entirely before change — unchanged
            acc.push(range);
        } else if (start >= oldEnd) {
            // Entirely after change — shift by net delta
            acc.push({ ...range, start: start - deletedLength + insertedLength, end: end - deletedLength + insertedLength });
        } else {
            // Overlaps the changed region — clamp to what survives
            const newStart = start < changeStart ? start : changeStart + insertedLength;
            const newRangeEnd = end > oldEnd ? end - deletedLength + insertedLength : changeStart + insertedLength;
            if (newRangeEnd > newStart) {
                acc.push({ ...range, start: newStart, end: newRangeEnd });
            }
            // Range was entirely inside deleted text — drop it
        }
        return acc;
    }, []);
}

// Add animations
const animationStyle = `
  @keyframes spinIn {
    from {
      opacity: 0;
      transform: rotateX(-90deg);
    }
    to {
      opacity: 1;
      transform: rotateX(0);
    }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .toolbar-animate {
    animation: spinIn 0.4s ease-out;
  }

  .comment-card-animate {
    animation: slideIn 0.3s ease-out;
  }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = animationStyle;
if (typeof document !== 'undefined' && !document.getElementById('bullet-point-editor-styles')) {
  styleSheet.id = 'bullet-point-editor-styles';
  document.head.appendChild(styleSheet);
}

// Stable empty array — used as default for inlineComments prop to prevent
// a new array reference on every render (which would cause an infinite effect loop).
const EMPTY_COMMENTS: TextComment[] = [];

// Anchor position for comment alignment
export interface CommentAnchorPosition {
    fieldId: string;
    commentId: string;
    top: number;
    left: number;
    height: number;
}

interface BulletPointEditorProps {
    label: string;
    fieldId: string; // Unique identifier for this field
    value: string;
    onChange: (value: string) => void;
    rows?: number;
    placeholder?: string;
    isInvalid?: boolean;
    highlights?: TextHighlight[];
    onHighlightsChange?: (highlights: TextHighlight[]) => void;
    inlineComments?: TextComment[];
    onInlineCommentsChange?: (comments: TextComment[]) => void;
    onAnchorPositionsChange?: (anchors: CommentAnchorPosition[]) => void;
    hoveredCommentId?: string | null;
}

const BulletPointEditor: React.FC<BulletPointEditorProps> = ({
    label, fieldId, value, onChange, placeholder, rows = 3, isInvalid = false,
    highlights = [], onHighlightsChange,
    inlineComments = EMPTY_COMMENTS, onInlineCommentsChange,
    onAnchorPositionsChange,
    hoveredCommentId
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const underlineRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
    const commentInputRef = useRef<HTMLInputElement>(null);
    // Stable ref for the anchor callback — avoids including an inline arrow function
    // in the effect dependency array, which would cause an infinite re-render loop.
    const onAnchorPositionsChangeRef = useRef(onAnchorPositionsChange);
    useEffect(() => { onAnchorPositionsChangeRef.current = onAnchorPositionsChange; });
    const [selection, setSelection] = useState({ start: 0, end: 0 });
    const [newCommentText, setNewCommentText] = useState('');
    const [currentUsername] = useState(() => getCurrentUsername());
    const [localHoveredCommentId, setLocalHoveredCommentId] = useState<string | null>(null);
    const [darkMode, setDarkMode] = useState(false);

    // Dropdown menu state
    const [showMenu, setShowMenu] = useState(false);
    const [showCommentInput, setShowCommentInput] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Combine external hover (from CommentsRail) with local hover (from text)
    const activeHoveredCommentId = hoveredCommentId || localHoveredCommentId;

    const colors = [
        { hex: '#FFFF00', name: 'Yellow' },
        { hex: '#00FF00', name: 'Green' },
        { hex: '#0099FF', name: 'Blue' },
        { hex: '#FF00FF', name: 'Pink' },
        { hex: '#FF6600', name: 'Orange' }
    ];

    // Professional comment colors - Light mode
    const commentColorsLight = [
        '#E3F2FD', // Light Blue
        '#E8F5E9', // Light Green
        '#FFF3E0', // Light Orange
        '#FCE4EC', // Light Pink
        '#F3E5F5', // Light Purple
        '#E0F2F1', // Light Teal
        '#FFF9C4', // Light Yellow
        '#FFEBEE', // Light Red
    ];

    // Professional comment colors - Dark mode
    const commentColorsDark = [
        'rgba(33, 150, 243, 0.2)',  // Blue
        'rgba(76, 175, 80, 0.2)',   // Green
        'rgba(255, 152, 0, 0.2)',   // Orange
        'rgba(233, 30, 99, 0.2)',   // Pink
        'rgba(156, 39, 176, 0.2)',  // Purple
        'rgba(0, 150, 136, 0.2)',   // Teal
        'rgba(255, 193, 7, 0.2)',   // Yellow
        'rgba(244, 67, 54, 0.2)',   // Red
    ];

    const commentBorderColors = [
        '#2196F3', // Blue
        '#4CAF50', // Green
        '#FF9800', // Orange
        '#E91E63', // Pink
        '#9C27B0', // Purple
        '#009688', // Teal
        '#FFC107', // Yellow
        '#F44336', // Red
    ];

    const getCommentColor = (commentId: string): string => {
        const index = inlineComments.findIndex(c => c.id === commentId);
        const colors = darkMode ? commentColorsDark : commentColorsLight;
        return colors[index % colors.length];
    };

    const getCommentBorderColor = (commentId: string): string => {
        const index = inlineComments.findIndex(c => c.id === commentId);
        return commentBorderColors[index % commentBorderColors.length];
    };

    const addComment = (text: string) => {
        if (!text.trim() || selection.start === selection.end || !onInlineCommentsChange) return;

        // Ensure selection is within bounds of the value
        const clampedStart = Math.max(0, Math.min(selection.start, value.length));
        const clampedEnd = Math.max(0, Math.min(selection.end, value.length));

        if (clampedStart >= clampedEnd) return;

        const newComment: TextComment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            start: clampedStart,
            end: clampedEnd,
            text: text.trim(),
            author: currentUsername,
            authorAvatar: localStorage.getItem('xtec_profile_picture') || undefined,
            timestamp: new Date(),
            resolved: false,
        };

        // Ensure inlineComments is an array before spreading
        const currentComments = Array.isArray(inlineComments) ? inlineComments : [];
        const updatedComments = [...currentComments, newComment];
        onInlineCommentsChange(updatedComments);
        setNewCommentText('');
        setSelection({ start: 0, end: 0 });
    };

    const resolveAllComments = () => {
        // Mark all unresolved comments as resolved
        if (!onInlineCommentsChange) return;
        const updatedComments = inlineComments.map((c) => ({ ...c, resolved: true }));
        onInlineCommentsChange(updatedComments);
    };

    const adjustHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = scrollHeight + 'px';
        }
    };

    // Applies a text change and keeps highlight/comment positions in sync
    const applyTextChange = (oldText: string, newText: string) => {
        if (onHighlightsChange && highlights.length > 0) {
            onHighlightsChange(adjustRangesForEdit(oldText, newText, highlights));
        }
        if (onInlineCommentsChange && inlineComments.length > 0) {
            onInlineCommentsChange(adjustRangesForEdit(oldText, newText, inlineComments));
        }
        onChange(newText);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget;
        const { selectionStart, selectionEnd, value: text } = textarea;

        const lineStartIndex = text.lastIndexOf('\n', selectionStart - 1) + 1;
        let lineEndIndex = text.indexOf('\n', selectionStart);
        if (lineEndIndex === -1) lineEndIndex = text.length;

        const currentLine = text.substring(lineStartIndex, lineEndIndex);

        if (e.key === 'Tab') {
            e.preventDefault();

            if (e.shiftKey) {
                if (currentLine.startsWith('  ')) {
                    const newText = text.substring(0, lineStartIndex) + text.substring(lineStartIndex + 2);
                    applyTextChange(text, newText);
                    setTimeout(() => {
                        textarea.selectionStart = Math.max(lineStartIndex, selectionStart - 2);
                        textarea.selectionEnd = Math.max(lineStartIndex, selectionEnd - 2);
                    }, 0);
                }
            } else {
                const newText = text.substring(0, lineStartIndex) + '  ' + text.substring(lineStartIndex);
                applyTextChange(text, newText);
                setTimeout(() => {
                    textarea.selectionStart = selectionStart + 2;
                    textarea.selectionEnd = selectionEnd + 2;
                }, 0);
            }

        } else if (e.key === 'Enter') {
            e.preventDefault();

            const indentMatch = currentLine.match(/^\s*/);
            const currentIndent = indentMatch ? indentMatch[0] : '';

            if (currentLine.trim() === '-') {
                if (currentIndent.length >= 2) {
                    const newIndent = currentIndent.substring(0, currentIndent.length - 2);
                    const newText = text.substring(0, lineStartIndex) + newIndent + '- ' + text.substring(lineEndIndex);
                    applyTextChange(text, newText);
                    setTimeout(() => {
                        const newCursorPos = lineStartIndex + newIndent.length + 2;
                        textarea.selectionStart = textarea.selectionEnd = newCursorPos;
                    }, 0);
                } else {
                    const newText = text.substring(0, lineStartIndex) + text.substring(lineEndIndex);
                    applyTextChange(text, newText);
                    setTimeout(() => {
                        textarea.selectionStart = textarea.selectionEnd = lineStartIndex;
                    }, 0);
                }
            } else {
                const newLine = '\n' + currentIndent + '- ';
                const newText = text.substring(0, selectionStart) + newLine + text.substring(selectionEnd);
                applyTextChange(text, newText);
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = selectionStart + newLine.length;
                }, 0);
            }
        }
    };

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        if (e.currentTarget.value.trim() === '') {
            onChange('- ');
        }
    };

    const handleSelectionChange = () => {
        if (textareaRef.current) {
            const start = textareaRef.current.selectionStart;
            const end = textareaRef.current.selectionEnd;
            setSelection({ start, end });
        }
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        adjustHeight();
    }, [value]);

    // Listen for theme changes
    useEffect(() => {
        const checkDarkMode = () => {
            if (typeof window === 'undefined') return false;
            return document.documentElement.classList.contains('dark') ||
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
        };

        const updateTheme = () => {
            setDarkMode(checkDarkMode());
        };

        // Initial check
        updateTheme();

        // Listen for class changes on document element
        const observer = new MutationObserver(updateTheme);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        });

        // Listen for system theme changes
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => updateTheme();
        mediaQuery.addEventListener('change', handleChange);

        return () => {
            observer.disconnect();
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, []);

    // Report anchor positions for comment alignment
    // CRITICAL: Positions must be VIEWPORT-RELATIVE (getBoundingClientRect values)
    // NOT document-relative. This prevents drift during scroll.
    useEffect(() => {
        if (!fieldId) return;

        const reportPositions = () => {
            if (!onAnchorPositionsChangeRef.current) return;
            try {
                const anchors: CommentAnchorPosition[] = [];

                inlineComments.forEach(comment => {
                    if (!comment || !comment.id || comment.resolved) return;
                    const underlineEl = underlineRefs.current.get(comment.id);
                    if (underlineEl) {
                        const rect = underlineEl.getBoundingClientRect();
                        // VIEWPORT-RELATIVE: Do NOT add window.scrollY
                        // This is the key to preventing drift
                        anchors.push({
                            fieldId,
                            commentId: comment.id,
                            top: rect.top,      // Viewport Y
                            left: rect.right,   // Viewport X (right edge)
                            height: rect.height,
                        });
                    }
                });

                onAnchorPositionsChangeRef.current(anchors);
            } catch (error) {
                console.error('Error reporting anchor positions:', error);
            }
        };

        // Report on every scroll frame for perfect tracking
        let rafId: number | null = null;
        const handleUpdate = () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(reportPositions);
        };

        // Use capture phase to catch scroll events early
        window.addEventListener('scroll', handleUpdate, { capture: true, passive: true });
        window.addEventListener('resize', handleUpdate, { passive: true });

        // Observe container for layout changes
        const resizeObserver = new ResizeObserver(handleUpdate);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        // Initial report
        reportPositions();

        return () => {
            window.removeEventListener('scroll', handleUpdate, { capture: true });
            window.removeEventListener('resize', handleUpdate);
            resizeObserver.disconnect();
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [fieldId, inlineComments]); // onAnchorPositionsChange accessed via ref to prevent infinite loop

    const applyHighlight = (color: string) => {
        if (selection.start !== selection.end && onHighlightsChange) {
            const newHighlight: TextHighlight = {
                start: selection.start,
                end: selection.end,
                color,
            };
            const updatedHighlights = [...highlights, newHighlight];
            onHighlightsChange(updatedHighlights);
        }
    };

    const removeHighlightsInSelection = () => {
        if (selection.start !== selection.end && onHighlightsChange) {
            const updated = highlights.filter(
                h => !(h.start < selection.end && h.end > selection.start)
            );
            onHighlightsChange(updated);
        }
    };

    const buildHighlightedContent = () => {
        if (!highlights || highlights.length === 0) {
            return [{ text: value, highlight: null }];
        }

        const segments: Array<{ text: string; highlight: string | null }> = [];
        let lastIndex = 0;
        const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);

        sortedHighlights.forEach((h) => {
            const segStart = Math.max(h.start, lastIndex);
            if (segStart >= h.end) return; // fully inside a previous highlight, skip
            if (segStart > lastIndex) {
                segments.push({ text: value.substring(lastIndex, segStart), highlight: null });
            }
            segments.push({ text: value.substring(segStart, h.end), highlight: h.color });
            lastIndex = h.end;
        });

        if (lastIndex < value.length) {
            segments.push({ text: value.substring(lastIndex), highlight: null });
        }

        return segments;
    };

    const buildCommentedContent = () => {
        // Only show underlines for unresolved comments
        // Filter out any invalid comments (null, missing id, or invalid positions)
        const activeComments = (inlineComments || []).filter(c =>
            c &&
            !c.resolved &&
            c.id &&
            typeof c.start === 'number' &&
            typeof c.end === 'number' &&
            c.start >= 0 &&
            c.end >= c.start
        );

        if (!activeComments || activeComments.length === 0) {
            return [{ text: value, commentId: null, commentIds: [] }];
        }

        // Clamp comment positions to valid range and collect all breakpoints
        const breakpoints = new Set<number>([0, value.length]);
        activeComments.forEach(comment => {
            // Clamp positions to valid range
            const clampedStart = Math.max(0, Math.min(comment.start, value.length));
            const clampedEnd = Math.max(0, Math.min(comment.end, value.length));
            if (clampedStart < clampedEnd) {
                breakpoints.add(clampedStart);
                breakpoints.add(clampedEnd);
            }
        });

        // Sort breakpoints
        const sortedBreakpoints = Array.from(breakpoints).sort((a, b) => a - b);

        // Build segments between consecutive breakpoints
        const segments: Array<{ text: string; commentId: string | null; commentIds: string[] }> = [];

        for (let i = 0; i < sortedBreakpoints.length - 1; i++) {
            const start = sortedBreakpoints[i];
            const end = sortedBreakpoints[i + 1];
            const text = value.substring(start, end);

            // Find all comments that apply to this segment (using clamped positions)
            const applicableComments = activeComments.filter(comment => {
                const clampedStart = Math.max(0, Math.min(comment.start, value.length));
                const clampedEnd = Math.max(0, Math.min(comment.end, value.length));
                return clampedStart <= start && clampedEnd >= end;
            });

            if (applicableComments.length > 0) {
                // Use the first comment's ID for primary styling
                // Store all comment IDs for potential future use
                segments.push({
                    text,
                    commentId: applicableComments[0].id,
                    commentIds: applicableComments.map(c => c.id)
                });
            } else {
                segments.push({
                    text,
                    commentId: null,
                    commentIds: []
                });
            }
        }

        return segments;
    };

    return (
        <div ref={containerRef} className="transition-all duration-300">
            {/* Label */}
            {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>}

            {/* Dropdown menu trigger - small and unobtrusive */}
            {(onHighlightsChange || onInlineCommentsChange) && (
                <div className="relative inline-block mb-1" ref={menuRef}>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowMenu(!showMenu)}
                        className={`p-1 rounded text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${showMenu ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' : ''}`}
                        title="Edit options"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                    </button>

                    {/* Dropdown menu */}
                    {showMenu && (
                        <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 py-1 z-50 min-w-[160px]">
                            {/* Highlight section */}
                            {onHighlightsChange && (
                                <>
                                    <div className="px-3 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                        Highlight
                                    </div>
                                    {selection.start !== selection.end ? (
                                        <div className="px-2 py-1 flex gap-1 items-center">
                                            {colors.map((color) => (
                                                <button
                                                    key={color.hex}
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => {
                                                        applyHighlight(color.hex);
                                                        setShowMenu(false);
                                                    }}
                                                    title={color.name}
                                                    className="w-5 h-5 rounded border border-gray-300 dark:border-gray-500 hover:scale-110 transition-transform"
                                                    style={{ backgroundColor: color.hex }}
                                                />
                                            ))}
                                            <button
                                                type="button"
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    removeHighlightsInSelection();
                                                    setShowMenu(false);
                                                }}
                                                title="Remove highlight"
                                                className="w-5 h-5 rounded border border-gray-300 dark:border-gray-500 hover:scale-110 transition-transform flex items-center justify-center bg-white dark:bg-gray-700 text-gray-400 dark:text-gray-400 text-xs leading-none"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                                            Select text first
                                        </div>
                                    )}
                                    {highlights.length > 0 && (
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                onHighlightsChange([]);
                                                setShowMenu(false);
                                            }}
                                            className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                        >
                                            Clear all ({highlights.length})
                                        </button>
                                    )}
                                </>
                            )}

                            {/* Divider */}
                            {onHighlightsChange && onInlineCommentsChange && (
                                <div className="my-1 border-t border-gray-200 dark:border-gray-600" />
                            )}

                            {/* Comment section */}
                            {onInlineCommentsChange && (
                                <>
                                    <div className="px-3 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                        Comment
                                    </div>
                                    {selection.start !== selection.end ? (
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setShowCommentInput(true);
                                                setShowMenu(false);
                                                setTimeout(() => commentInputRef.current?.focus(), 50);
                                            }}
                                            className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        >
                                            Add comment...
                                        </button>
                                    ) : (
                                        <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 italic">
                                            Select text first
                                        </div>
                                    )}
                                    {inlineComments.filter(c => !c.resolved).length > 0 && (
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                resolveAllComments();
                                                setShowMenu(false);
                                            }}
                                            className="w-full px-3 py-1.5 text-left text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30"
                                        >
                                            Resolve all ({inlineComments.filter(c => !c.resolved).length})
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Comment input - appears below buttons when active */}
            {showCommentInput && selection.start !== selection.end && (
                <div className="flex gap-1 mb-1 items-center">
                    <input
                        ref={commentInputRef}
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && newCommentText.trim()) {
                                addComment(newCommentText);
                                setShowCommentInput(false);
                            } else if (e.key === 'Escape') {
                                setShowCommentInput(false);
                                setNewCommentText('');
                            }
                        }}
                        placeholder="Type comment, press Enter..."
                        className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-black dark:text-white focus:ring-1 focus:ring-blue-400 focus:outline-none"
                    />
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            if (newCommentText.trim()) {
                                addComment(newCommentText);
                                setShowCommentInput(false);
                            }
                        }}
                        disabled={!newCommentText.trim()}
                        className="px-2 py-1 text-xs font-medium bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
                    >
                        Add
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                            setShowCommentInput(false);
                            setNewCommentText('');
                        }}
                        className="px-1.5 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Textarea with overlays - always full width */}
            <div className="w-full" style={{ position: 'relative' }}>
                        {/* Highlight background layer */}
                        {highlights && highlights.length > 0 && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    padding: '0.5rem',
                                    fontFamily: 'Calibri, sans-serif',
                                    fontSize: '1rem',
                                    lineHeight: '1.5',
                                    whiteSpace: 'pre-wrap',
                                    wordWrap: 'break-word',
                                    color: 'transparent',
                                    pointerEvents: 'none',
                                    backgroundColor: 'transparent',
                                    zIndex: 1,
                                    border: '1px solid transparent',
                                    overflow: 'hidden',
                                }}
                            >
                                {buildHighlightedContent().map((segment, idx) =>
                                    segment.highlight ? (
                                        <span
                                            key={idx}
                                            style={{
                                                backgroundColor: segment.highlight,
                                                opacity: darkMode ? 0.75 : 0.4,
                                                borderRadius: '2px',
                                            }}
                                        >
                                            {segment.text}
                                        </span>
                                    ) : (
                                        <span key={idx}>{segment.text}</span>
                                    )
                                )}
                            </div>
                        )}

                        {/* Selection highlight layer */}
                        {selection.start !== selection.end && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    padding: '0.5rem',
                                    fontFamily: 'Calibri, sans-serif',
                                    fontSize: '1rem',
                                    lineHeight: '1.5',
                                    whiteSpace: 'pre-wrap',
                                    wordWrap: 'break-word',
                                    color: 'transparent',
                                    pointerEvents: 'none',
                                    backgroundColor: 'transparent',
                                    zIndex: 2,
                                    border: '1px solid transparent',
                                    overflow: 'hidden',
                                }}
                            >
                                <span>{value.substring(0, selection.start)}</span>
                                <span
                                    className="selection-highlight"
                                    style={{
                                        backgroundColor: darkMode ? 'rgba(33, 150, 243, 0.3)' : '#B4D7FF',
                                        borderRadius: '2px',
                                        boxShadow: darkMode
                                            ? '0 0 0 2px rgba(33, 150, 243, 0.4)'
                                            : '0 0 0 2px rgba(33, 150, 243, 0.3)',
                                    }}
                                >
                                    {value.substring(selection.start, selection.end)}
                                </span>
                                <span>{value.substring(selection.end)}</span>
                            </div>
                        )}

                        {/* Comment underline layer (only for unresolved comments) */}
                        {inlineComments && inlineComments.some(c => !c.resolved) && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    padding: '0.5rem',
                                    fontFamily: 'Calibri, sans-serif',
                                    fontSize: '1rem',
                                    lineHeight: '1.5',
                                    whiteSpace: 'pre-wrap',
                                    wordWrap: 'break-word',
                                    color: 'transparent',
                                    pointerEvents: 'none',
                                    backgroundColor: 'transparent',
                                    zIndex: 3,
                                    border: '1px solid transparent',
                                    overflow: 'hidden',
                                }}
                            >
                                {buildCommentedContent().map((segment, idx) =>
                                    segment.commentId ? (
                                        <span
                                            key={idx}
                                            data-comment-id={segment.commentId}
                                            ref={(el) => {
                                                if (el && segment.commentId) {
                                                    underlineRefs.current.set(segment.commentId, el);
                                                }
                                            }}
                                            onMouseEnter={() => setLocalHoveredCommentId(segment.commentId)}
                                            onMouseLeave={() => setLocalHoveredCommentId(null)}
                                            style={{
                                                backgroundColor: activeHoveredCommentId === segment.commentId
                                                    ? getCommentColor(segment.commentId)
                                                    : 'transparent',
                                                borderBottom: `2px solid ${getCommentBorderColor(segment.commentId)}`,
                                                borderRadius: '2px',
                                                cursor: 'pointer',
                                                pointerEvents: 'all',
                                                boxShadow: activeHoveredCommentId === segment.commentId
                                                    ? `0 0 8px 2px ${getCommentBorderColor(segment.commentId)}`
                                                    : 'none',
                                                transition: 'box-shadow 0.2s ease, background-color 0.2s ease',
                                            }}
                                        >
                                            {segment.text}
                                        </span>
                                    ) : (
                                        <span key={idx}>{segment.text}</span>
                                    )
                                )}
                            </div>
                        )}

                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => {
                                applyTextChange(value, e.target.value);
                                adjustHeight();
                            }}
                            onFocus={handleFocus}
                            onKeyDown={handleKeyDown}
                            onMouseUp={handleSelectionChange}
                            onKeyUp={handleSelectionChange}
                            placeholder={placeholder}
                            className={`block w-full p-2 border rounded-md shadow-sm focus:ring-2 focus:ring-[#007D8C] focus:border-[#007D8C] transition-all text-black dark:text-white dark:placeholder-gray-400 relative z-10 resize-none ${
                                isInvalid ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 dark:border-gray-600'
                            }`}
                            spellCheck={true}
                            style={{
                                minHeight: `${rows * 1.5}rem`,
                                overflow: 'hidden',
                                fontFamily: 'Calibri, sans-serif',
                                backgroundColor: 'transparent',
                            }}
                        />
                    </div>

{/* Comments panel is now rendered at page level in DfrStandard/DfrSaskpower */}
        </div>
    );
};

export default BulletPointEditor;
