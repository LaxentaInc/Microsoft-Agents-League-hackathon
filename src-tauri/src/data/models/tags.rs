// Tag models for autocomplete system
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    pub tag_type: TagType,
    pub count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TagType {
    General,
    Artist,
    Copyright,
    Character,
    Circle,
    Style,
}

impl TagType {
    #[allow(dead_code)]
    pub fn from_konachan_type(type_str: &str) -> Self {
        match type_str.to_lowercase().as_str() {
            "general" | "tag" | "0" => TagType::General,
            "artist" | "1" => TagType::Artist,
            "copyright" | "series" | "3" => TagType::Copyright,
            "character" | "4" => TagType::Character,
            "circle" | "2" => TagType::Circle,
            "style" | "5" => TagType::Style,
            _ => TagType::General,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct TagCache {
    pub tags: HashMap<String, Tag>,
    pub last_updated: Option<String>,
}
