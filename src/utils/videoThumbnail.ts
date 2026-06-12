// generates a thumbnail for a local video file by capturing the first frame
// uses a hidden <video> + <canvas> approach, one at a time to avoid cpu spikes
// thumbnails are cached in IndexedDB so they persist across sessions

const DB_NAME = 'cw_vidthumb_db';
const STORE_NAME = 'thumbs';
const THUMB_WIDTH = 1280;
const THUMB_HEIGHT = Math.round(THUMB_WIDTH * (9 / 16)); // enforce 16:9 horizontal ratio

// in-flight promise to serialize thumbnail generation (one at a time)
let queue: Promise<void> = Promise.resolve();

let dbPromise: Promise<IDBDatabase> | null = null;
function getDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                req.result.createObjectStore(STORE_NAME);
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    return dbPromise;
}

export async function getCachedThumbnail(videoPath: string): Promise<string | null> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(videoPath);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null; // idb failed
    }
}

async function setCachedThumbnail(videoPath: string, dataUrl: string): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(dataUrl, videoPath);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch {
        // ignore errors if idb fails
    }
}

export async function generateImageThumbnail(imgSrc: string, originalPath: string): Promise<string | null> {
    const cached = await getCachedThumbnail(originalPath);
    if (cached) return cached;

    const result = new Promise<string | null>((resolve) => {
        queue = queue.then(() => new Promise<void>(async (done) => {
            const cached2 = await getCachedThumbnail(originalPath);
            if (cached2) {
                resolve(cached2);
                return done();
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';
            let resolved = false;

            const cleanup = () => {
                img.src = '';
                done();
            };

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                    cleanup();
                }
            }, 5000);

            img.onload = async () => {
                if (resolved) return;
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = THUMB_WIDTH;
                    canvas.height = THUMB_HEIGHT;

                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        const canvasAspect = THUMB_WIDTH / THUMB_HEIGHT;
                        const imgAspect = img.width / img.height;
                        let sWidth = img.width;
                        let sHeight = img.height;
                        let sx = 0;
                        let sy = 0;

                        if (imgAspect > canvasAspect) {
                            sWidth = img.height * canvasAspect;
                            sx = (img.width - sWidth) / 2;
                        } else {
                            sHeight = img.width / canvasAspect;
                            sy = (img.height - sHeight) / 2;
                        }

                        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
                        const dataUrl = canvas.toDataURL('image/webp', 0.65);

                        if (dataUrl && dataUrl.length > 100) {
                            await setCachedThumbnail(originalPath, dataUrl);
                            resolved = true;
                            clearTimeout(timeout);
                            resolve(dataUrl);
                        } else {
                            resolved = true;
                            clearTimeout(timeout);
                            resolve(null);
                        }
                    } else {
                        resolved = true;
                        clearTimeout(timeout);
                        resolve(null);
                    }
                } catch (e) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(null);
                }
                cleanup();
            };

            img.onerror = () => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(null);
                }
                cleanup();
            };

            img.src = imgSrc;
        }));
    });

    return result;
}

export async function generateVideoThumbnail(videoSrc: string, originalPath: string): Promise<string | null> {
    // check cache first
    const cached = await getCachedThumbnail(originalPath);
    if (cached) return cached;

    // queue it so only one video loads at a time
    const result = new Promise<string | null>((resolve) => {
        queue = queue.then(() => new Promise<void>(async (done) => {
            // double-check cache (might have been generated while queued)
            const cached2 = await getCachedThumbnail(originalPath);
            if (cached2) {
                resolve(cached2);
                done();
                return;
            }

            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.preload = 'auto';
            video.muted = true;
            video.playsInline = true;

            let resolved = false;
            const cleanup = () => {
                video.removeAttribute('src');
                video.load(); // release resources
                done();
            };

            const timeout = setTimeout(() => {
                if (!resolved) {
                    console.log('[vidthumb] timeout for', originalPath);
                    resolved = true;
                    resolve(null);
                    cleanup();
                }
            }, 10000); // 10s max per video

            video.onloadeddata = () => {
                console.log('[vidthumb] loaded data for', originalPath, 'duration:', video.duration);
                // seek to 1 second (or 10% if short)
                video.currentTime = Math.min(1, video.duration * 0.1);
            };

            video.onseeked = async () => {
                if (resolved) return;
                console.log('[vidthumb] seeked for', originalPath, video.videoWidth, 'x', video.videoHeight);
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = THUMB_WIDTH;
                    canvas.height = THUMB_HEIGHT;

                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        // math for object-fit: cover on canvas context
                        const canvasAspect = THUMB_WIDTH / THUMB_HEIGHT;
                        const videoAspect = video.videoWidth / video.videoHeight;
                        let sWidth = video.videoWidth;
                        let sHeight = video.videoHeight;
                        let sx = 0;
                        let sy = 0;

                        if (videoAspect > canvasAspect) {
                            sWidth = video.videoHeight * canvasAspect;
                            sx = (video.videoWidth - sWidth) / 2;
                        } else {
                            sHeight = video.videoWidth / canvasAspect;
                            sy = (video.videoHeight - sHeight) / 2;
                        }

                        ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);
                        const dataUrl = canvas.toDataURL('image/webp', 0.9);

                        if (dataUrl && dataUrl.length > 100) {
                            // cache it permanently
                            await setCachedThumbnail(originalPath, dataUrl);
                            console.log('[vidthumb] generated thumb for', originalPath, 'size:', dataUrl.length);
                            resolved = true;
                            clearTimeout(timeout);
                            resolve(dataUrl);
                        } else {
                            console.log('[vidthumb] canvas produced empty data for', originalPath);
                            resolved = true;
                            clearTimeout(timeout);
                            resolve(null);
                        }
                    } else {
                        resolved = true;
                        clearTimeout(timeout);
                        resolve(null);
                    }
                } catch (e) {
                    console.error('[vidthumb] canvas error for', originalPath, e);
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(null);
                }
                cleanup();
            };

            video.onerror = (e) => {
                console.error('[vidthumb] video load error for', originalPath, e);
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    resolve(null);
                }
                cleanup();
            };

            video.src = videoSrc;
        }));
    });

    return result;
}
