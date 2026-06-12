// Library exports for the ColorWall application
// Re-exports the modular structure for external use

pub mod core;
pub mod data;
pub mod platform;
pub mod ui;
pub mod utils;

// Re-export commonly used types for convenience
pub use data::models;
pub use data::scrapers;
