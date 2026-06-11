// tag cache storage manager -? uhh accumulates tags from konchan
// i added it in hurry for the hackathon, the whole code is like this, i can't be too perfect cz i don't 
// have too much time, forgive me ;c
// basically lemme explain
// this took me a hour of random javascript parsing to understand
// that konchan just loads everything in our god damn local storage
// then i think i will do the same, so we can get matching tags on searches :)
// so user's can search konchan for good wallpapers, other sources are also good but some
// currently are using cloudflare and yes i will be have to do cf spoofing if they continue
// using cf protections, have fun!
use crate::data::models::tags::{Tag, TagCache};
use crate::data::storage::get_app_data_dir;
use std::fs;
use std::path::PathBuf;

pub struct TagCacheManager {
    cache_path: PathBuf,
}

impl TagCacheManager {
    pub fn new(filename: &str) -> Result<Self, String> {
        let app_data_dir = get_app_data_dir()?;
        let cache_path = app_data_dir.join(filename);
        println!(
            "[TAG_CACHE] Initialized - persistent cache location: {}",
            cache_path.display()
        );
        Ok(Self { cache_path })
    }

    /// Load tags from disk
    pub fn load(&self) -> Result<TagCache, String> {
        if !self.cache_path.exists() {
            return Ok(TagCache::default());
        }

        let data = fs::read_to_string(&self.cache_path).map_err(|e| e.to_string())?;
        let cache: TagCache = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        Ok(cache)
    }

    /// Save tags to disk using atomic rename
    pub fn save(&self, cache: &TagCache) -> Result<(), String> {
        let data = serde_json::to_string_pretty(cache).map_err(|e| e.to_string())?;
        let id: u32 = rand::random();
        let temp_path = self.cache_path.with_extension(format!("tmp.{}", id));
        fs::write(&temp_path, &data).map_err(|e| e.to_string())?;
        // Atomic replace on Windows/Linux
        fs::rename(&temp_path, &self.cache_path).map_err(|e| {
            let _ = fs::remove_file(&temp_path);
            e.to_string()
        })?;
        Ok(())
    }

    /// Add new tags to cache (accumulative)
    pub fn add_tags(&self, new_tags: Vec<Tag>) -> Result<(), String> {
        let mut cache = self.load()?;
        let initial_count = cache.tags.len();
        let mut added_count = 0;
        let mut updated_count = 0;

        println!(
            "[TAG_CACHE] Adding {} tags to cache (current cache size: {})",
            new_tags.len(),
            initial_count
        );
        println!("[TAG_CACHE] Cache location: {}", self.cache_path.display());

        for tag in new_tags {
            // Only update if new tag has higher count or doesn't exist
            if let Some(existing) = cache.tags.get(&tag.name) {
                if tag.count.unwrap_or(0) > existing.count.unwrap_or(0) {
                    cache.tags.insert(tag.name.clone(), tag);
                    updated_count += 1;
                }
            } else {
                cache.tags.insert(tag.name.clone(), tag.clone());
                added_count += 1;
                // Log first few new tags as examples
                if added_count <= 5 {
                    println!(
                        "[TAG_CACHE] Added new tag: '{}' (type: {:?}, count: {:?})",
                        tag.name, tag.tag_type, tag.count
                    );
                }
            }
        }

        // Update timestamp
        cache.last_updated = Some(chrono::Utc::now().to_rfc3339());
        self.save(&cache)?;

        let final_count = cache.tags.len();
        println!(
            "[TAG_CACHE] Cache update complete: {} added, {} updated, {} total tags (was {}, now {})",
            added_count,
            updated_count,
            final_count,
            initial_count,
            final_count
        );

        Ok(())
    }

    /// Search cached tags with prefix matching
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<Tag>, String> {
        let cache = self.load()?;
        let query_lower = query.to_lowercase();

        let mut results: Vec<Tag> = cache
            .tags
            .values()
            .filter(|tag| tag.name.to_lowercase().starts_with(&query_lower))
            .cloned()
            .collect();

        // Sort by popularity (count), then alphabetically
        results.sort_by(|a, b| {
            let count_cmp = b.count.unwrap_or(0).cmp(&a.count.unwrap_or(0));
            if count_cmp == std::cmp::Ordering::Equal {
                a.name.cmp(&b.name)
            } else {
                count_cmp
            }
        });

        results.truncate(limit);
        Ok(results)
    }

    /// Get total cached tag count
    pub fn get_tag_count(&self) -> Result<usize, String> {
        let cache = self.load()?;
        Ok(cache.tags.len())
    }
}
