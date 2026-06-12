import LibraryGrid from './LibraryGrid';

// shows only static image wallpapers (jpg, png, gif)
export default function ImagesTab() {
    return <LibraryGrid filter="images" />;
}
