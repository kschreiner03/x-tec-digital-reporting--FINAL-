/**
 * safeStorage — localStorage helpers with quota-error detection.
 *
 * localStorage writes silently fail (or throw) when the browser/Electron
 * storage quota is exceeded. All writes should go through `safeSet` so the
 * user is informed rather than losing data without explanation.
 */

function isQuotaError(e: unknown): boolean {
    if (!(e instanceof DOMException)) return false;
    // Standard code (22) and non-standard name both used across browsers / Electron
    return e.code === 22 || e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/**
 * Write a value to localStorage.
 * @returns `true` on success, `false` if the write failed.
 *          Shows a user-visible alert on quota errors.
 */
export function safeSet(key: string, value: string): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (isQuotaError(e)) {
            console.error(`[safeStorage] Quota exceeded writing "${key}"`, e);
            alert(
                'Storage is full. Your recent projects list could not be saved.\n\n' +
                'To free up space, go to Settings → Data Management and clear old project data.'
            );
        } else {
            console.error(`[safeStorage] Failed to write "${key}"`, e);
        }
        return false;
    }
}

/**
 * Read and JSON-parse a value from localStorage.
 * Returns `fallback` if the key is missing or the value is not valid JSON.
 */
export function safeGet<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}
