use crate::data::scrapers::utils::build_chrome_client;
use crate::data::storage::get_app_data_dir;
use futures_util::StreamExt;
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct HomepageAssetResponse {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

fn get_homepage_dir() -> Result<PathBuf, String> {
    let base = get_app_data_dir()?;
    let dir = base.join("homepage");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create homepage directory: {}", e))?;
    Ok(dir)
}

#[tauri::command]
pub async fn download_homepage_asset(
    url: String,
    filename: String,
) -> Result<HomepageAssetResponse, String> {
    let homepage_dir = match get_homepage_dir() {
        Ok(d) => d,
        Err(e) => {
            return Ok(HomepageAssetResponse {
                success: false,
                path: None,
                error: Some(e),
            });
        }
    };

    let file_path = homepage_dir.join(&filename);

    if file_path.exists() {
        let meta = std::fs::metadata(&file_path);
        if let Ok(m) = meta {
            if m.len() > 0 {
                println!("[homepage] asset already exists: {:?}", file_path);
                return Ok(HomepageAssetResponse {
                    success: true,
                    path: Some(file_path.to_string_lossy().to_string()),
                    error: None,
                });
            }
        }
    }

    println!("[homepage] downloading asset from: {}", url);

    let client = match build_chrome_client() {
        Ok(c) => c,
        Err(e) => {
            return Ok(HomepageAssetResponse {
                success: false,
                path: None,
                error: Some(format!("failed to build http client: {}", e)),
            });
        }
    };

    let response = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            return Ok(HomepageAssetResponse {
                success: false,
                path: None,
                error: Some(format!("failed to fetch asset: {}", e)),
            });
        }
    };

    if !response.status().is_success() {
        return Ok(HomepageAssetResponse {
            success: false,
            path: None,
            error: Some(format!("server returned: {}", response.status())),
        });
    }

    let total = response.content_length().unwrap_or(0);
    println!("[homepage] downloading {} bytes...", total);

    // stream to a temp file then rename for atomicity
    let temp_path = file_path.with_extension("tmp");
    let mut file = match std::fs::File::create(&temp_path) {
        Ok(f) => f,
        Err(e) => {
            return Ok(HomepageAssetResponse {
                success: false,
                path: None,
                error: Some(format!("failed to create temp file: {}", e)),
            });
        }
    };

    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let _ = std::fs::remove_file(&temp_path);
                return Ok(HomepageAssetResponse {
                    success: false,
                    path: None,
                    error: Some(format!("download stream error: {}", e)),
                });
            }
        };
        use std::io::Write;
        if let Err(e) = file.write_all(&chunk) {
            let _ = std::fs::remove_file(&temp_path);
            return Ok(HomepageAssetResponse {
                success: false,
                path: None,
                error: Some(format!("failed to write chunk: {}", e)),
            });
        }
        downloaded += chunk.len() as u64;
    }

    // flush and rename
    {
        use std::io::Write;
        let _ = file.flush();
    }
    drop(file);

    if let Err(e) = std::fs::rename(&temp_path, &file_path) {
        let _ = std::fs::remove_file(&temp_path);
        return Ok(HomepageAssetResponse {
            success: false,
            path: None,
            error: Some(format!("failed to finalize file: {}", e)),
        });
    }

    println!(
        "[homepage] asset downloaded: {:?} ({} bytes)",
        file_path, downloaded
    );

    Ok(HomepageAssetResponse {
        success: true,
        path: Some(file_path.to_string_lossy().to_string()),
        error: None,
    })
}
