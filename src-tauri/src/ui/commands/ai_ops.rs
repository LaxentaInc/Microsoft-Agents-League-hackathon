use crate::core::ai::generator::save_generated_wallpaper;
use crate::data::models::WallpaperResponse;
use crate::data::scrapers::utils::chrome_145_user_agent;

#[tauri::command]
pub async fn save_ai_wallpaper(
    prompt: String,
    html: String,
) -> Result<WallpaperResponse, String> {
    match save_generated_wallpaper(&prompt, &html).await {
        Ok(folder_path) => Ok(WallpaperResponse {
            success: true,
            message: Some(folder_path),
            error: None,
        }),
        Err(e) => Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(e),
        }),
    }
}

#[tauri::command]
pub async fn download_ai_video_background(
    folder_path: String,
    video_url: String,
    referer: Option<String>,
) -> Result<WallpaperResponse, String> {
    println!("[ai_ops] Downloading background video from: {} into {}", video_url, folder_path);

    let client = reqwest::Client::builder()
        .user_agent(chrome_145_user_agent())
        .build()
        .map_err(|e| e.to_string())?;

    let mut request = client.get(&video_url);
    if let Some(ref_url) = referer {
        request = request.header("Referer", ref_url);
    }
    request = request.header("Accept", "video/*,*/*;q=0.8");
// use this query anime
    let response = request.send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("Server returned HTTP {}", response.status())),
        });
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    
    let dest_path = std::path::PathBuf::from(&folder_path).join("background.mp4");
    match std::fs::write(&dest_path, bytes) {
        Ok(_) => Ok(WallpaperResponse {
            success: true,
            message: Some("Video downloaded successfully".to_string()),
            error: None,
        }),
        Err(e) => Ok(WallpaperResponse {
            success: false,
            message: None,
            error: Some(format!("Failed to write video file: {}", e)),
        }),
    }
}
