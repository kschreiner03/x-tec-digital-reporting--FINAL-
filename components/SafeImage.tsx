
import React, { useState, useEffect } from 'react';
import { perfTime } from './perf';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
    fileName: string;
}

// Module-level cache — IPC round-trip happens once per filename per session.
// Stores the Promise so concurrent requests for the same file share one IPC call.
const _urlCache = new Map<string, Promise<string>>();

const resolveAssetUrl = (fileName: string): Promise<string> => {
    if (_urlCache.has(fileName)) return _urlCache.get(fileName)!;
    const p = (async () => {
        // @ts-ignore
        if (window.electronAPI?.getAssetPath) {
            // @ts-ignore
            return await perfTime(`IPC getAssetPath: ${fileName}`, () => window.electronAPI.getAssetPath(fileName));
        }
        const encoded = fileName.replace(/\\/g, '/').split('/').map(s => encodeURIComponent(s)).join('/');
        return `./assets/${encoded}`;
    })();
    _urlCache.set(fileName, p);
    return p;
};

const SafeImage: React.FC<SafeImageProps> = ({ fileName, ...props }) => {
    const [src, setSrc] = useState<string>('');

    useEffect(() => {
        let isMounted = true;
        resolveAssetUrl(fileName)
            .then(url => { if (isMounted) setSrc(url); })
            .catch(() => {});
        return () => { isMounted = false; };
    }, [fileName]);

    if (!src) return null;

    return <img src={src} {...props} />;
};

export const getAssetUrl = (fileName: string): Promise<string> => resolveAssetUrl(fileName);

export default SafeImage;