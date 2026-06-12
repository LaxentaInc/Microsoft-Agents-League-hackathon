import LibraryGrid from './LibraryGrid';

// shows only video wallpapers (mp4, webm, mkv, etc.)
export default function VideosTab() {
    return <LibraryGrid filter="videos" />;
}
