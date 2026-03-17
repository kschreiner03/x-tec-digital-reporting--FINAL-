/**
 * X-TEC Performance Instrumentation
 *
 * Usage:
 *   import { perfMark, perfMeasure, perfTime, perfReport } from './perf';
 *
 * To enable:  localStorage.setItem('xtec_perf', '1')  then reload
 * To disable: localStorage.removeItem('xtec_perf')    then reload
 *
 * After running the actions you want to measure, call perfReport() in the
 * browser console to see a formatted table of all recorded timings.
 */

const ENABLED = localStorage.getItem('xtec_perf') === '1';

const LOG_STYLE = 'color:#007D8C;font-weight:bold';
const WARN_STYLE = 'color:#e05c00;font-weight:bold';
const THRESHOLD_MS = 100; // highlight anything over 100 ms

/** Named mark — pairs with perfMeasure */
export const perfMark = (name: string) => {
    if (!ENABLED) return;
    performance.mark(name);
};

/** Measure between two marks and log the result */
export const perfMeasure = (label: string, startMark: string, endMark: string) => {
    if (!ENABLED) return;
    try {
        const m = performance.measure(label, startMark, endMark);
        const style = m.duration > THRESHOLD_MS ? WARN_STYLE : LOG_STYLE;
        console.log(`%c⏱ ${label}: ${m.duration.toFixed(1)} ms`, style);
    } catch { /* marks may not exist if code path was skipped */ }
};

/** Time an async function and log its duration */
export const perfTime = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    if (!ENABLED) return fn();
    const t0 = performance.now();
    try {
        const result = await fn();
        const ms = performance.now() - t0;
        const style = ms > THRESHOLD_MS ? WARN_STYLE : LOG_STYLE;
        console.log(`%c⏱ ${label}: ${ms.toFixed(1)} ms`, style);
        return result;
    } catch (e) {
        const ms = performance.now() - t0;
        console.log(`%c⏱ ${label}: ${ms.toFixed(1)} ms (threw)`, WARN_STYLE);
        throw e;
    }
};

/** Time a synchronous function */
export const perfTimeSync = <T>(label: string, fn: () => T): T => {
    if (!ENABLED) return fn();
    const t0 = performance.now();
    const result = fn();
    const ms = performance.now() - t0;
    const style = ms > THRESHOLD_MS ? WARN_STYLE : LOG_STYLE;
    console.log(`%c⏱ ${label}: ${ms.toFixed(1)} ms`, style);
    return result;
};

/** Dump every performance entry to the console as a sorted table */
export const perfReport = () => {
    const entries = performance.getEntriesByType('measure')
        .sort((a, b) => b.duration - a.duration)
        .map(e => ({ name: e.name, 'ms': +e.duration.toFixed(1), slow: e.duration > THRESHOLD_MS }));
    console.group('%c📊 X-TEC Performance Report', LOG_STYLE);
    console.table(entries);
    console.groupEnd();
};

// Expose perfReport globally so it can be called from DevTools console
(window as any).xtecPerfReport = perfReport;

export const PERF_ENABLED = ENABLED;
