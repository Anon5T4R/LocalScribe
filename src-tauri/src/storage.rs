//! Painel "Dados e armazenamento": mede o que o LocalScribe ocupa em disco e
//! oferece limpezas CIRÚRGICAS.
//!
//! Regra central deste módulo: o TEXTO da transcrição é o artefato caro — é a
//! saída de um trabalho longo que o usuário não consegue refazer de graça (o
//! áudio original pode nem existir mais). Por isso NENHUMA limpeza daqui apaga
//! transcrição, resumo ou notas. O que este módulo libera é só o reobtenível:
//! o WAV convertido (o arquivo ORIGINAL do usuário nunca é tocado — só mexemos
//! dentro de `app_data/audio`), os modelos ggml (baixáveis de novo) e o lixo
//! temporário. Não existe botão de "apagar tudo" de propósito.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use tauri::{Manager, State};

use crate::db::{self, Db};

/// Resultado de qualquer limpeza — sempre em arquivos E bytes, porque o painel
/// precisa dizer quanto liberou, não só quantas coisas sumiram.
#[derive(serde::Serialize, Clone, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Freed {
    pub files: u64,
    pub bytes: u64,
}

/// (bytes, arquivos) do primeiro nível de uma pasta. Não recursa porque as três
/// pastas do app são planas (`audio/`, `models/`, o temp) — recursar só
/// convidaria a contar coisa que não é nossa.
pub fn dir_stats(dir: &Path) -> (u64, u64) {
    let mut bytes = 0u64;
    let mut files = 0u64;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    bytes += meta.len();
                    files += 1;
                }
            }
        }
    }
    (bytes, files)
}

fn file_len(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// Apaga a lista e soma o que saiu (só conta o que o remove_file confirmou).
fn remove_all(paths: &[PathBuf]) -> Freed {
    let mut freed = Freed::default();
    for path in paths {
        let len = file_len(path);
        if std::fs::remove_file(path).is_ok() {
            freed.files += 1;
            freed.bytes += len;
        }
    }
    freed
}

// ---------------------------------------------------------------------------
// áudio
// ---------------------------------------------------------------------------

/// Nomes de arquivo de áudio que alguma transcrição ainda referencia.
///
/// Compara pelo NOME, não pelo caminho inteiro: o `audio_path` foi gravado com
/// o app_data da máquina/instalação da época, e um caminho antigo faria um
/// arquivo vivo parecer órfão — apagaríamos o áudio de uma transcrição real.
fn referenced_audio(conn: &Connection) -> rusqlite::Result<HashSet<String>> {
    let mut stmt = conn.prepare("SELECT audio_path FROM transcripts WHERE audio_path <> ''")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let mut set = HashSet::new();
    for path in rows {
        if let Some(name) = Path::new(&path?).file_name() {
            set.insert(name.to_string_lossy().to_lowercase());
        }
    }
    Ok(set)
}

/// WAVs em `app_data/audio` que nenhuma transcrição referencia — sobra de
/// transcrição cancelada, de erro no meio ou de linha apagada em versão antiga.
pub fn orphan_audio(conn: &Connection, audio_dir: &Path) -> rusqlite::Result<Vec<PathBuf>> {
    let used = referenced_audio(conn)?;
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(audio_dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
            if !used.contains(&name) {
                out.push(path);
            }
        }
    }
    Ok(out)
}

/// Apaga só o áudio que ninguém referencia. Nenhuma transcrição perde o som.
pub fn clear_orphan_audio(conn: &Connection, audio_dir: &Path) -> rusqlite::Result<Freed> {
    Ok(remove_all(&orphan_audio(conn, audio_dir)?))
}

/// Apaga TODO o áudio convertido de `app_data/audio` e zera o `audio_path` das
/// transcrições. O texto, o resumo e as notas ficam — só o botão de reouvir some.
///
/// Zera o banco ANTES de apagar os arquivos de propósito: se a remoção falhar no
/// meio, sobram órfãos (que a limpeza de órfãos recolhe depois), e nunca uma
/// linha apontando pra um arquivo que não existe mais — esse é o estado que
/// quebraria o player.
pub fn clear_all_audio(conn: &Connection, audio_dir: &Path) -> rusqlite::Result<Freed> {
    conn.execute("UPDATE transcripts SET audio_path = '' WHERE audio_path <> ''", [])?;
    let mut paths = Vec::new();
    if let Ok(rd) = std::fs::read_dir(audio_dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.is_file() {
                paths.push(path);
            }
        }
    }
    Ok(remove_all(&paths))
}

// ---------------------------------------------------------------------------
// modelos
// ---------------------------------------------------------------------------

/// Extrai o id do modelo do nome do arquivo (`ggml-small.en.bin` -> `small.en`).
/// Só reconhece esse padrão: qualquer outro arquivo na pasta não é nosso e não
/// entra em lista de exclusão nenhuma.
fn model_id_of(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?;
    name.strip_prefix("ggml-")?.strip_suffix(".bin").map(|s| s.to_string())
}

/// Modelos instalados que nenhuma transcrição usou e que não estão em `keep`
/// (o `keep` carrega o modelo padrão das configurações — apagá-lo deixaria o
/// app sem conseguir transcrever no próximo clique).
pub fn unused_models(
    conn: &Connection,
    models_dir: &Path,
    keep: &[String],
) -> rusqlite::Result<Vec<PathBuf>> {
    let mut used: HashSet<String> = HashSet::new();
    {
        let mut stmt = conn.prepare("SELECT DISTINCT model FROM transcripts WHERE model <> ''")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        for id in rows {
            used.insert(id?);
        }
    }
    used.extend(keep.iter().filter(|k| !k.is_empty()).cloned());

    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(models_dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            match model_id_of(&path) {
                Some(id) if !used.contains(&id) => out.push(path),
                _ => {}
            }
        }
    }
    Ok(out)
}

pub fn clear_unused_models(
    conn: &Connection,
    models_dir: &Path,
    keep: &[String],
) -> rusqlite::Result<Freed> {
    Ok(remove_all(&unused_models(conn, models_dir, keep)?))
}

// ---------------------------------------------------------------------------
// temporários
// ---------------------------------------------------------------------------

pub fn temp_dir() -> PathBuf {
    std::env::temp_dir().join("localscribe")
}

/// Apaga os arquivos de `%TEMP%/localscribe` (os JSON que o whisper-cli cospe e
/// que ficam pra trás quando o app é fechado no meio). Não apaga a pasta: o
/// pipeline a recria, e remover só arquivos evita levar junto algo em uso.
pub fn clear_temp(dir: &Path) -> Freed {
    let mut paths = Vec::new();
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            let path = entry.path();
            if path.is_file() {
                paths.push(path);
            }
        }
    }
    remove_all(&paths)
}

// ---------------------------------------------------------------------------
// comandos
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    /// Pasta de dados do app (onde moram scribe.db, audio/ e models/).
    dir: String,
    /// Banco em bytes (scribe.db + WAL + SHM) — aqui mora o texto.
    db_bytes: u64,
    transcripts: i64,
    with_summary: i64,
    /// Transcrições que ainda têm áudio anexado (dá pra reouvir).
    with_audio: i64,
    audio_bytes: u64,
    audio_files: u64,
    orphan_audio_bytes: u64,
    orphan_audio_files: u64,
    models_bytes: u64,
    models_count: u64,
    unused_models_bytes: u64,
    unused_models_count: u64,
    temp_bytes: u64,
    temp_files: u64,
}

fn audio_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("audio"))
}

fn models_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("models"))
}

/// Mede tudo o que o app guarda. `keepModels` são ids que nunca contam como
/// não usados (a UI manda o modelo padrão).
#[tauri::command(async)]
pub fn storage_info(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    keep_models: Vec<String>,
) -> Result<StorageInfo, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let audio = dir.join("audio");
    let models = dir.join("models");

    let db_bytes = ["scribe.db", "scribe.db-wal", "scribe.db-shm"]
        .iter()
        .filter_map(|name| std::fs::metadata(dir.join(name)).ok())
        .map(|m| m.len())
        .sum();

    let (audio_bytes, audio_files) = dir_stats(&audio);
    let (models_bytes, models_count) = dir_stats(&models);
    let (temp_bytes, temp_files) = dir_stats(&temp_dir());

    let (transcripts, with_summary, with_audio) = db::with_conn(&db, |conn| {
        conn.query_row(
            "SELECT COUNT(*),
                    SUM(length(summary) > 0),
                    SUM(audio_path <> '')
             FROM transcripts",
            [],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, Option<i64>>(1)?.unwrap_or(0),
                    r.get::<_, Option<i64>>(2)?.unwrap_or(0),
                ))
            },
        )
    })?;

    let orphans = db::with_conn(&db, |conn| orphan_audio(conn, &audio))?;
    let unused = db::with_conn(&db, |conn| unused_models(conn, &models, &keep_models))?;

    Ok(StorageInfo {
        dir: dir.to_string_lossy().into_owned(),
        db_bytes,
        transcripts,
        with_summary,
        with_audio,
        audio_bytes,
        audio_files,
        orphan_audio_bytes: orphans.iter().map(|p| file_len(p)).sum(),
        orphan_audio_files: orphans.len() as u64,
        models_bytes,
        models_count,
        unused_models_bytes: unused.iter().map(|p| file_len(p)).sum(),
        unused_models_count: unused.len() as u64,
        temp_bytes,
        temp_files,
    })
}

/// Só o áudio que nenhuma transcrição referencia.
#[tauri::command(async)]
pub fn storage_clear_orphan_audio(app: tauri::AppHandle, db: State<'_, Db>) -> Result<Freed, String> {
    let dir = audio_dir(&app)?;
    db::with_conn(&db, |conn| clear_orphan_audio(conn, &dir))
}

/// Todo o áudio convertido; textos, resumos e notas ficam.
#[tauri::command(async)]
pub fn storage_clear_all_audio(app: tauri::AppHandle, db: State<'_, Db>) -> Result<Freed, String> {
    let dir = audio_dir(&app)?;
    db::with_conn(&db, |conn| clear_all_audio(conn, &dir))
}

/// Modelos ggml que nenhuma transcrição usou (e nunca o modelo padrão).
#[tauri::command(async)]
pub fn storage_clear_unused_models(
    app: tauri::AppHandle,
    db: State<'_, Db>,
    keep_models: Vec<String>,
) -> Result<Freed, String> {
    let dir = models_dir(&app)?;
    db::with_conn(&db, |conn| clear_unused_models(conn, &dir, &keep_models))
}

#[tauri::command(async)]
pub fn storage_clear_temp() -> Result<Freed, String> {
    Ok(clear_temp(&temp_dir()))
}

// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static SEQ: AtomicU32 = AtomicU32::new(0);

    /// Pasta temporária exclusiva por teste (os testes rodam em paralelo).
    fn tmp(tag: &str) -> PathBuf {
        let n = SEQ.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("localscribe-storage-{}-{}", tag, n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        db::init_schema(&conn).unwrap();
        conn
    }

    fn write(dir: &Path, name: &str, bytes: usize) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, vec![b'x'; bytes]).unwrap();
        path
    }

    /// Insere uma transcrição com texto de verdade nos campos que importam.
    fn insert(conn: &Connection, id: &str, audio: &str, model: &str) {
        conn.execute(
            "INSERT INTO transcripts
               (id, title, source_path, audio_path, duration_ms, language, model,
                created_ms, segments, peaks, summary, notes)
             VALUES (?1, ?2, '/orig/some.mp3', ?3, 1000, 'pt', ?4, 1,
                     ?5, '[]', ?6, ?7)",
            rusqlite::params![
                id,
                format!("titulo {}", id),
                audio,
                model,
                format!(r#"[{{"start":0,"end":1000,"text":"texto de {}"}}]"#, id),
                format!("resumo de {}", id),
                format!("notas de {}", id),
            ],
        )
        .unwrap();
    }

    /// (segments, summary, notes, title) — o conteúdo que jamais pode sumir.
    fn texto(conn: &Connection, id: &str) -> (String, String, String, String) {
        conn.query_row(
            "SELECT segments, summary, notes, title FROM transcripts WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .unwrap()
    }

    #[test]
    fn orfaos_sao_so_os_que_ninguem_referencia() {
        let dir = tmp("orfaos");
        let conn = test_conn();
        // O caminho no banco é de OUTRA instalação de propósito: a comparação é
        // por nome, então o a.wav daqui tem de continuar sendo "referenciado".
        insert(&conn, "t1", "C:/AppData/antigo/audio/a.wav", "base");
        write(&dir, "a.wav", 100);
        write(&dir, "b.wav", 40);
        write(&dir, "c.wav", 60);

        let freed = clear_orphan_audio(&conn, &dir).unwrap();
        assert_eq!(freed, Freed { files: 2, bytes: 100 });
        assert!(dir.join("a.wav").exists(), "áudio referenciado foi apagado");
        assert!(!dir.join("b.wav").exists());
        assert!(!dir.join("c.wav").exists());

        // O banco não foi tocado.
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM transcripts", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
        let (seg, sum, notas, _) = texto(&conn, "t1");
        assert!(seg.contains("texto de t1") && sum == "resumo de t1" && notas == "notas de t1");
        let audio: String = conn
            .query_row("SELECT audio_path FROM transcripts WHERE id='t1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(audio, "C:/AppData/antigo/audio/a.wav");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn limpar_todo_o_audio_preserva_o_texto() {
        let dir = tmp("todo-audio");
        let conn = test_conn();
        insert(&conn, "t1", &dir.join("a.wav").to_string_lossy(), "base");
        insert(&conn, "t2", &dir.join("b.wav").to_string_lossy(), "small");
        insert(&conn, "t3", "", "base"); // já estava sem áudio
        write(&dir, "a.wav", 500);
        write(&dir, "b.wav", 300);

        let antes: Vec<_> = ["t1", "t2", "t3"].iter().map(|id| texto(&conn, id)).collect();

        let freed = clear_all_audio(&conn, &dir).unwrap();
        assert_eq!(freed, Freed { files: 2, bytes: 800 });
        assert_eq!(dir_stats(&dir), (0, 0));

        // Nada de transcrição foi apagado e o texto está byte a byte igual.
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM transcripts", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 3);
        let depois: Vec<_> = ["t1", "t2", "t3"].iter().map(|id| texto(&conn, id)).collect();
        assert_eq!(antes, depois);

        // O source_path (arquivo ORIGINAL do usuário) continua registrado, e o
        // audio_path zerou — nenhuma linha aponta pra arquivo inexistente.
        let (src, aud): (String, String) = conn
            .query_row("SELECT source_path, audio_path FROM transcripts WHERE id='t1'", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(src, "/orig/some.mp3");
        assert_eq!(aud, "");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn modelos_usados_e_o_padrao_sobrevivem() {
        let dir = tmp("modelos");
        let conn = test_conn();
        insert(&conn, "t1", "", "small.en"); // usado por uma transcrição
        write(&dir, "ggml-small.en.bin", 466);
        write(&dir, "ggml-base.bin", 142); // é o padrão (vai no keep)
        write(&dir, "ggml-tiny.bin", 75); // ninguém usa
        write(&dir, "leia-me.txt", 10); // não é nosso: nem olhamos

        let keep = vec!["base".to_string()];
        let alvo = unused_models(&conn, &dir, &keep).unwrap();
        assert_eq!(alvo.len(), 1);

        let freed = clear_unused_models(&conn, &dir, &keep).unwrap();
        assert_eq!(freed, Freed { files: 1, bytes: 75 });
        assert!(dir.join("ggml-small.en.bin").exists(), "modelo em uso foi apagado");
        assert!(dir.join("ggml-base.bin").exists(), "modelo padrão foi apagado");
        assert!(dir.join("leia-me.txt").exists(), "mexemos em arquivo que não é nosso");
        assert!(!dir.join("ggml-tiny.bin").exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn keep_vazio_nao_vira_curinga() {
        let dir = tmp("keep-vazio");
        let conn = test_conn();
        write(&dir, "ggml-tiny.bin", 75);
        // String vazia (settings sem modelo padrão) não pode "proteger" nada
        // nem casar com id nenhum.
        let freed = clear_unused_models(&conn, &dir, &["".to_string()]).unwrap();
        assert_eq!(freed, Freed { files: 1, bytes: 75 });
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn temp_limpa_arquivos_e_mantem_a_pasta() {
        let dir = tmp("temp");
        write(&dir, "job1.json", 20);
        write(&dir, "job2.json", 30);
        let sub = dir.join("sub");
        std::fs::create_dir_all(&sub).unwrap();

        let freed = clear_temp(&dir);
        assert_eq!(freed, Freed { files: 2, bytes: 50 });
        assert!(dir.exists(), "a pasta some e o próximo job quebra");
        assert!(sub.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pastas_inexistentes_nao_sao_erro() {
        let conn = test_conn();
        let nada = std::env::temp_dir().join("localscribe-nao-existe-mesmo");
        assert_eq!(dir_stats(&nada), (0, 0));
        assert_eq!(clear_temp(&nada), Freed::default());
        assert_eq!(clear_orphan_audio(&conn, &nada).unwrap(), Freed::default());
        assert_eq!(clear_all_audio(&conn, &nada).unwrap(), Freed::default());
        assert_eq!(clear_unused_models(&conn, &nada, &[]).unwrap(), Freed::default());
    }

    #[test]
    fn dir_stats_ignora_subpastas() {
        let dir = tmp("stats");
        write(&dir, "a.bin", 10);
        write(&dir, "b.bin", 25);
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        write(&dir.join("sub"), "c.bin", 999);
        assert_eq!(dir_stats(&dir), (35, 2));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
