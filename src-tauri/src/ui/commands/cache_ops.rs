use crate::data::models::*;
use crate::data::storage::get_cache_dir;

#[tauri::command]
pub async fn get_cache_size() -> Result<CacheSizeResponse, String> {
    let cache_dir = match get_cache_dir() {
        Ok(dir) => dir,
        Err(_) => {
            return Ok(CacheSizeResponse {
                success: true,
                size_mb: "0".to_string(),
                file_count: 0,
            });
        }
    };

    let mut total_size: u64 = 0;
    let mut file_count = 0;

    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    total_size += metadata.len();
                    file_count += 1;
                }
            }
        }
    }

    let size_mb = format!("{:.2}", total_size as f64 / 1_048_576.0);

    Ok(CacheSizeResponse {
        success: true,
        size_mb,
        file_count,
    })
}

#[tauri::command]
pub async fn clear_cache() -> Result<ClearCacheResponse, String> {
    let cache_dir = match get_cache_dir() {
        Ok(dir) => dir,
        Err(e) => {
            return Err(format!("failed to get cache directory: {}", e));
        }
    };

    let mut files_deleted = 0;

    if let Ok(entries) = std::fs::read_dir(&cache_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file()
                    && std::fs::remove_file(entry.path()).is_ok() {
                        files_deleted += 1;
                    }
            }
        }
    }

    Ok(ClearCacheResponse {
        success: true,
        files_deleted,
    })
}
