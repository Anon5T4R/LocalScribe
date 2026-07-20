//! Biblioteca de transcrições em SQLite (app_data/scribe.db). Transcript não é
//! "documento com arquivo próprio": fica tudo na base, como no LocalAgenda.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use tauri::{Manager, State};

#[derive(Default, Clone)]
pub struct Db(pub Arc<Mutex<Option<Connection>>>);

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn open(app: &tauri::AppHandle, db: &Db) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("app_data indisponível: {}", e))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("criar app_data: {}", e))?;
    let conn = Connection::open(dir.join("scribe.db")).map_err(|e| e.to_string())?;
    init_schema(&conn).map_err(|e| e.to_string())?;
    *db.0.lock().map_err(|_| "lock do banco")? = Some(conn);
    Ok(())
}

/// Esquema separado do `open` pra que os testes montem um banco em memória
/// idêntico ao real sem precisar de um AppHandle do Tauri.
pub(crate) fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         CREATE TABLE IF NOT EXISTS transcripts (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            source_path TEXT NOT NULL DEFAULT '',
            audio_path TEXT NOT NULL DEFAULT '',
            duration_ms INTEGER NOT NULL DEFAULT 0,
            language TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            created_ms INTEGER NOT NULL,
            segments TEXT NOT NULL DEFAULT '[]',
            peaks TEXT NOT NULL DEFAULT '[]',
            summary TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT ''
         );
         CREATE INDEX IF NOT EXISTS idx_transcripts_created ON transcripts(created_ms DESC);
         CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         INSERT OR IGNORE INTO settings(key, value) VALUES ('schema_version', '1');",
    )
}

pub(crate) fn with_conn<T>(
    db: &Db,
    f: impl FnOnce(&Connection) -> Result<T, rusqlite::Error>,
) -> Result<T, String> {
    let guard = db.0.lock().map_err(|_| "lock do banco")?;
    let conn = guard.as_ref().ok_or("banco não aberto")?;
    f(conn).map_err(|e| e.to_string())
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub source_path: String,
    #[serde(default)]
    pub audio_path: String,
    #[serde(default)]
    pub duration_ms: i64,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub created_ms: i64,
    #[serde(default)]
    pub segments: serde_json::Value,
    #[serde(default)]
    pub peaks: serde_json::Value,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub notes: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptMeta {
    pub id: String,
    pub title: String,
    pub source_path: String,
    pub duration_ms: i64,
    pub language: String,
    pub model: String,
    pub created_ms: i64,
    pub has_summary: bool,
}

/// Lista só os metadados (a lista da biblioteca não precisa dos segmentos).
#[tauri::command(async)]
pub fn transcripts_list(db: State<'_, Db>) -> Result<Vec<TranscriptMeta>, String> {
    with_conn(&db, |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, source_path, duration_ms, language, model, created_ms,
                    length(summary) > 0
             FROM transcripts ORDER BY created_ms DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(TranscriptMeta {
                id: r.get(0)?,
                title: r.get(1)?,
                source_path: r.get(2)?,
                duration_ms: r.get(3)?,
                language: r.get(4)?,
                model: r.get(5)?,
                created_ms: r.get(6)?,
                has_summary: r.get(7)?,
            })
        })?;
        rows.collect()
    })
}

#[tauri::command(async)]
pub fn transcript_get(db: State<'_, Db>, id: String) -> Result<Transcript, String> {
    with_conn(&db, |conn| {
        conn.query_row(
            "SELECT id, title, source_path, audio_path, duration_ms, language, model,
                    created_ms, segments, peaks, summary, notes
             FROM transcripts WHERE id = ?1",
            [&id],
            |r| {
                let segments: String = r.get(8)?;
                let peaks: String = r.get(9)?;
                Ok(Transcript {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    source_path: r.get(2)?,
                    audio_path: r.get(3)?,
                    duration_ms: r.get(4)?,
                    language: r.get(5)?,
                    model: r.get(6)?,
                    created_ms: r.get(7)?,
                    segments: serde_json::from_str(&segments).unwrap_or(serde_json::json!([])),
                    peaks: serde_json::from_str(&peaks).unwrap_or(serde_json::json!([])),
                    summary: r.get(10)?,
                    notes: r.get(11)?,
                })
            },
        )
    })
}

#[tauri::command(async)]
pub fn transcript_save(db: State<'_, Db>, t: Transcript) -> Result<(), String> {
    let created = if t.created_ms > 0 { t.created_ms } else { now_ms() };
    with_conn(&db, |conn| {
        conn.execute(
            "INSERT INTO transcripts
               (id, title, source_path, audio_path, duration_ms, language, model,
                created_ms, segments, peaks, summary, notes)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
             ON CONFLICT(id) DO UPDATE SET
               title=?2, source_path=?3, audio_path=?4, duration_ms=?5, language=?6,
               model=?7, segments=?9, peaks=?10, summary=?11, notes=?12",
            rusqlite::params![
                t.id,
                t.title,
                t.source_path,
                t.audio_path,
                t.duration_ms,
                t.language,
                t.model,
                created,
                t.segments.to_string(),
                t.peaks.to_string(),
                t.summary,
                t.notes
            ],
        )?;
        Ok(())
    })
}

/// Apaga a transcrição; o WAV convertido só sai do disco se estiver na pasta
/// de áudio do app (nunca tocamos no arquivo original do usuário).
#[tauri::command(async)]
pub fn transcript_delete(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    id: String,
) -> Result<(), String> {
    let audio_path: Option<String> = with_conn(&db, |conn| {
        conn.query_row("SELECT audio_path FROM transcripts WHERE id = ?1", [&id], |r| r.get(0))
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other),
            })
    })?;
    with_conn(&db, |conn| {
        conn.execute("DELETE FROM transcripts WHERE id = ?1", [&id])?;
        Ok(())
    })?;
    if let Some(path) = audio_path {
        if !path.is_empty() {
            if let Ok(app_dir) = app.path().app_data_dir() {
                let audio_dir: PathBuf = app_dir.join("audio");
                let p = PathBuf::from(&path);
                if p.starts_with(&audio_dir) {
                    let _ = std::fs::remove_file(&p);
                }
            }
        }
    }
    Ok(())
}

/// Configurações do app: um JSON único (o front modela; aqui só persiste).
#[tauri::command(async)]
pub fn settings_get(db: State<'_, Db>) -> Result<String, String> {
    with_conn(&db, |conn| {
        conn.query_row("SELECT value FROM settings WHERE key = 'app'", [], |r| r.get(0))
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok("{}".to_string()),
                other => Err(other),
            })
    })
}

#[tauri::command(async)]
pub fn settings_set(db: State<'_, Db>, value: String) -> Result<(), String> {
    with_conn(&db, |conn| {
        conn.execute(
            "INSERT INTO settings(key, value) VALUES ('app', ?1)
             ON CONFLICT(key) DO UPDATE SET value = ?1",
            [&value],
        )?;
        Ok(())
    })
}
