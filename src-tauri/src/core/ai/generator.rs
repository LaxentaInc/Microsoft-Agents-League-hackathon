pub async fn save_generated_wallpaper(
    prompt: &str,
    generated_html: &str,
) -> Result<String, String> {
    println!("[ai] Saving generated wallpaper...");

    let app_data = crate::data::storage::get_app_data_dir()
        .map_err(|e| e.to_string())?;
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
        
    let folder_name = format!("ai_generated_{}", timestamp);
    let folder_path = app_data.join("interactive").join(&folder_name);
    
    std::fs::create_dir_all(&folder_path).map_err(|e| format!("Failed to create folder: {}", e))?;
    
    let html_path = folder_path.join("index.html");
    std::fs::write(&html_path, generated_html).map_err(|e| format!("Failed to write index.html: {}", e))?;
    
    // Create a project.json
    let project_json = serde_json::json!({
        "title": format!("AI Generated: {}", prompt.chars().take(30).collect::<String>()),
        "description": format!("Prompt: {}", prompt),
        "author": "Foundry IQ",
        "type": "web",
        "file": "index.html",
        "properties": {}
    });
    
    let json_path = folder_path.join("project.json");
    std::fs::write(&json_path, serde_json::to_string_pretty(&project_json).unwrap())
        .map_err(|e| format!("Failed to write project.json: {}", e))?;

    println!("[ai] Wallpaper successfully saved to {:?}", folder_path);
    
    Ok(folder_path.to_string_lossy().to_string())
}
