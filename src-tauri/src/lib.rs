use std::{
    collections::HashMap,
    fs,
    sync::{Arc, RwLock},
    time::{Duration, Instant},
};

use anyhow::anyhow;
use feed_rs::model::Entry;
use serde::{Deserialize, Serialize};
use tauri::State;

const FEED_CACHE_TTL: Duration = Duration::from_secs(60 * 10);

#[derive(Clone, Debug, Serialize, Deserialize)]
struct FeedListItem {
    id: String,
    name: String,
    url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ApiFeedEntry {
    title: String,
    description: Option<String>,
    links: Vec<String>,
    thumbnails: Vec<String>,
    published: Option<String>,
    updated: Option<String>,
}

#[derive(Clone)]
struct AppState {
    cache: Arc<RwLock<HashMap<String, CachedFeedEntries>>>,
}

#[derive(Clone)]
struct CachedFeedEntries {
    entries: Vec<ApiFeedEntry>,
    fetched_at: Instant,
}

#[derive(Debug, Serialize)]
struct RefetchResponse {
    refreshed: Vec<String>,
    failed: Vec<String>,
}

impl From<Entry> for ApiFeedEntry {
    fn from(entry: Entry) -> Self {
        Self {
            title: entry
                .title
                .as_ref()
                .map(|title| title.content.to_string())
                .unwrap_or_default(),
            description: entry
                .summary
                .as_ref()
                .map(|summary| summary.content.clone()),
            links: entry.links.iter().map(|link| link.href.clone()).collect(),
            thumbnails: entry
                .media
                .iter()
                .flat_map(|media| media.thumbnails.iter())
                .map(|thumbnail| thumbnail.image.uri.clone())
                .collect(),
            published: entry.published.map(|date| date.to_rfc2822()),
            updated: entry.updated.map(|date| date.to_rfc2822()),
        }
    }
}

fn get_feed_list() -> anyhow::Result<Vec<FeedListItem>> {
    let content = fs::read_to_string("../feeds.json")?;
    let feed_list = serde_json::from_str(&content)?;
    Ok(feed_list)
}

fn find_feed_by_id(id: &str) -> anyhow::Result<FeedListItem> {
    let feeds = get_feed_list()?;
    let feed = feeds
        .into_iter()
        .find(|feed| feed.id == id)
        .ok_or(anyhow!("failed to find feed"))?;
    Ok(feed)
}

fn fetch_feed_entries(url: &str) -> anyhow::Result<Vec<Entry>> {
    let content = reqwest::blocking::get(url)?.bytes()?;
    let feed = feed_rs::parser::parse(&content[..])?;
    Ok(feed.entries)
}

fn refresh_feed_entries(
    state: &AppState,
    feed: &FeedListItem,
) -> anyhow::Result<Vec<ApiFeedEntry>> {
    let entries = fetch_feed_entries(&feed.url)?
        .into_iter()
        .map(ApiFeedEntry::from)
        .collect::<Vec<_>>();

    let mut cache = state.cache.write().unwrap();
    cache.insert(
        feed.id.clone(),
        CachedFeedEntries {
            entries: entries.clone(),
            fetched_at: Instant::now(),
        },
    );

    Ok(entries)
}

fn is_cache_fresh(cached: &CachedFeedEntries) -> bool {
    cached.fetched_at.elapsed() < FEED_CACHE_TTL
}

#[tauri::command]
fn get_feeds() -> Vec<FeedListItem> {
    get_feed_list().unwrap_or(Vec::new())
}

#[tauri::command]
fn get_entries(state: State<AppState>, id: String) -> Vec<ApiFeedEntry> {
    let Ok(feed) = find_feed_by_id(&id) else {
        return Vec::new();
    };

    if let Some(entries) = {
        let cache = state.cache.read().unwrap();
        cache
            .get(&feed.id)
            .filter(|cached| is_cache_fresh(cached))
            .map(|cached| cached.entries.clone())
    } {
        return entries;
    }

    refresh_feed_entries(&state, &feed).unwrap_or(Vec::new())
}

#[tauri::command]
fn refetch(state: State<AppState>) -> Option<RefetchResponse> {
    let feeds = get_feed_list().ok()?;
    let mut refreshed = Vec::new();
    let mut failed = Vec::new();

    for feed in feeds {
        match refresh_feed_entries(&state, &feed) {
            Ok(_) => refreshed.push(feed.id),
            Err(_) => failed.push(feed.id),
        }
    }

    Some(RefetchResponse { refreshed, failed })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        cache: Arc::new(RwLock::new(HashMap::new())),
    };

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_feeds, get_entries, refetch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
