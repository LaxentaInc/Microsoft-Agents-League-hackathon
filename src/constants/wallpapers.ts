import { WallpaperSourceOption } from '../types/wallpaper';

export const API_BASE_URL = 'https://pic.re';
export const DEFAULT_FETCH_COUNT = 10;
export const MAX_INPUT_LENGTH = 100;
export const UNLOAD_THRESHOLD = 5;

export const SOURCE_OPTIONS: Array<{ value: WallpaperSourceOption; label: string }> = [
  { value: 'all', label: 'All Sources' },
  { value: 'wallhaven', label: 'WallHaven' },
  { value: 'moewalls', label: 'MoeWalls' },
  { value: 'wallpaperflare', label: 'WallpaperFlare' },
  { value: 'wallpapersclan', label: 'Wallpapers Clan' },
  { value: 'motionbgs', label: 'Live Wallpapers' },
  { value: 'wallpaperwaifu', label: 'WallpaperWaifu' },
  { value: 'konachan', label: 'Konachan' },
  { value: 'wallpaper_archive', label: 'Wallpaper Archive' },
];
