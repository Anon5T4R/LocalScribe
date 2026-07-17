import { useSyncExternalStore } from "react";

/**
 * i18n leve da UI (padrão da suíte — ver `docs/planos/padrao-apps.md`). `pt` é
 * a fonte da verdade; `en`/`es` como `Record<MessageKey,string>` fazem o
 * compilador exigir completude. Locale num store externo (não React) pra `t()`
 * rodar fora de componente (toasts do store, prompts da IA em `lib/ai.ts`); o
 * App remonta com key={locale} no `main.tsx`.
 *
 * Inclui os prompts da IA (`ai.prompt.*`) — assim a IA responde no idioma da
 * UI (mesmo padrão do LocalCode). Nomes de idioma do ÁUDIO (`settings.lang.*`)
 * são exônimos e SÃO traduzidos (é o idioma do áudio, não o da UI).
 */

export type Locale = "pt" | "en" | "es";

export const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  en: "English",
  es: "Español",
};

const LOCALE_KEY = "localscribe.locale";

const pt = {
  "common.audioFilter": "Áudio",
  "common.no": "Não",
  "common.cancel": "Cancelar",
  "common.copy": "Copiar",

  "app.dropNothing": "Nenhum arquivo de áudio reconhecido nos itens soltos.",
  "app.dropHere": "Solte pra transcrever",

  "store.openFailed": "Não consegui abrir: {e}",
  "store.saveFailed": "Falha ao salvar: {e}",
  "store.deleteFailed": "Falha ao excluir: {e}",
  "store.noModel": "nenhum modelo de transcrição instalado — abra Modelos e baixe um",
  "store.transcriptReady": "Transcrição pronta: {name}",
  "store.jobFailed": "Falha em {name}: {e}",

  "topbar.home": "Início",
  "topbar.openAudio": "Abrir áudio",
  "topbar.models": "Modelos",
  "topbar.themeLight": "Tema claro",
  "topbar.themeDark": "Tema escuro",
  "topbar.settings": "Configurações",

  "sidebar.search": "Buscar na biblioteca…",
  "sidebar.empty": "Suas transcrições aparecem aqui.",
  "sidebar.notFound": "Nada encontrado.",
  "sidebar.hasSummary": "Tem resumo de IA",
  "sidebar.deleteConfirm": "Excluir?",
  "sidebar.yes": "Sim",
  "sidebar.deleteTitle": "Excluir transcrição",

  "home.heroTitle": "Transcreva áudio sem sair do seu computador",
  "home.heroSub":
    "Arraste arquivos pra cá ou grave do microfone. Tudo 100% offline — nada sobe pra nuvem.",
  "home.runtimeMissingPre": "Runtime de transcrição ausente (whisper-cli). Em desenvolvimento, rode",
  "home.runtimeMissingPost": "; no app instalado isso não deveria acontecer.",
  "home.openAudioTitle": "Abrir arquivos de áudio",
  "home.openAudioHint":
    "mp3, wav, m4a, ogg, flac… (áudio de vídeo mp4/mov também). Solte os arquivos em qualquer lugar da janela.",
  "home.modelLine": "Modelo de transcrição:",
  "home.noneInstalled": "nenhum instalado",
  "home.change": "trocar",
  "home.downloadModel": "baixar modelo",
  "home.queue": "Fila",
  "home.clearFinished": "Limpar concluídos",
  "home.open": "Abrir",
  "home.status.waiting": "na fila",
  "home.status.preparing": "preparando áudio…",
  "home.status.transcribing": "transcrevendo",
  "home.status.done": "pronto",
  "home.status.error": "erro",
  "home.status.cancelled": "cancelado",

  "record.title": "Gravar do microfone",
  "record.hint": "Grave uma reunião ou nota de voz e transcreva na hora.",
  "record.record": "Gravar",
  "record.recording": "Gravando",
  "record.stop": "Parar e transcrever",
  "record.discard": "Descartar",
  "record.namePrefix": "Gravação",

  "settings.title": "Configurações",
  "settings.theme": "Tema",
  "settings.themeSystem": "Seguir o sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Escuro",
  "settings.themeNature": "Natureza",
  "settings.themeDarkblue": "Azul escuro",
  "settings.themeCalmgreen": "Verde calmo",
  "settings.themePastelpink": "Rosa pastel",
  "settings.themePunkprincess": "PunkPrincess",
  "settings.language": "Idioma",
  "settings.audioLanguage": "Idioma do áudio",
  "settings.lang.auto": "Detectar automaticamente",
  "settings.lang.pt": "Português",
  "settings.lang.en": "Inglês",
  "settings.lang.es": "Espanhol",
  "settings.lang.fr": "Francês",
  "settings.lang.de": "Alemão",
  "settings.lang.it": "Italiano",
  "settings.defaultModel": "Modelo padrão",
  "settings.notInstalled": " (não instalado)",
  "settings.threads": "Threads da transcrição",
  "settings.auto": "Automático",
  "settings.keepAudio": "Guardar o áudio convertido",
  "settings.keepAudioHint": "permite reouvir o áudio na transcrição (WAV 16 kHz, ~2 MB/min)",
  "settings.ggufDir": "Pasta dos modelos .gguf (IA)",
  "settings.notConfigured": "(não configurada)",
  "settings.choose": "Escolher…",

  "models.title": "Modelos de transcrição",
  "models.intro":
    "Modelos oficiais do whisper.cpp, baixados do Hugging Face com verificação de integridade. Maior = melhor qualidade e mais lento.",
  "models.tipBase": "Pra português, comece pelo",
  "models.installed": "instalado",
  "models.remove": "Remover",
  "models.download": "Baixar",
  "models.multiTitle": "Multilíngue (português incluso)",
  "models.enTitle": "Somente inglês (um pouco melhores em inglês)",
  "models.hfTitle": "Conta do Hugging Face (opcional)",
  "models.hfIntroPre": "Se o download falhar com",
  "models.hfError403": "erro 403",
  "models.hfIntroPost":
    ", o Hugging Face está limitando downloads anônimos do seu IP. Um token gratuito de leitura resolve — ele fica guardado no cofre do sistema, nunca em arquivo.",
  "models.tokenConnected": "token conectado",
  "models.disconnect": "Desconectar",
  "models.createToken": "Criar token…",
  "models.tokenPlaceholder": "cole o token (hf_…)",
  "models.save": "Salvar",
  "models.installedToast": "Modelo {id} instalado.",
  "models.tokenSaved": "Token salvo no cofre do sistema (conta {name}).",
  "models.tokenRemoved": "Token removido.",
  "models.createTokenMsg": 'Crie o token "Read" na página que abriu, copie e cole aqui embaixo.',

  "transcript.back": "Voltar",
  "transcript.followAudio": "seguir áudio",
  "transcript.followTitle": "Rolar junto com o áudio",
  "transcript.ai": "IA",
  "transcript.deleteConfirm": "Excluir mesmo?",
  "transcript.deleteTitle": "Excluir",
  "transcript.langChip": "idioma: {lang}",

  "segments.empty": "Transcrição vazia.",
  "segments.playFrom": "Tocar a partir daqui",

  "player.empty":
    'Áudio não guardado para esta transcrição (ative "manter áudio" nas configurações).',
  "player.playPause": "Tocar/pausar (espaço)",
  "player.back10": "Voltar 10 s",
  "player.fwd10": "Avançar 10 s",
  "player.speed": "Velocidade",
  "player.unavailable": "áudio indisponível",

  "export.button": "Exportar",
  "export.prefix": "Exportar {label}",
  "export.exported": "Exportado: {path}",
  "export.textCopied": "Texto copiado.",
  "export.txt": "Texto",
  "export.txtMenu": "Texto (.txt)",
  "export.md": "Markdown",
  "export.mdMenu": "Markdown (.md) — bom pro OpenObsidian",
  "export.srt": "Legenda SRT",
  "export.srtMenu": "Legenda (.srt)",
  "export.vtt": "Legenda VTT",
  "export.vttMenu": "Legenda (.vtt)",
  "export.copyText": "Copiar texto",

  "ai.pickDirTitle": "Pasta dos modelos .gguf",
  "ai.ready": "IA pronta.",
  "ai.failed": "IA falhou: {e}",
  "ai.copied": "Copiado.",
  "ai.title": "IA local",
  "ai.port": "porta {n}",
  "ai.setupHintPre": "A IA roda 100% na sua máquina (llama.cpp). Aponte a pasta com modelos",
  "ai.setupHintPost": "e inicie.",
  "ai.changeDir": "Trocar pasta de modelos",
  "ai.chooseDir": "Escolher pasta de modelos",
  "ai.loadingModel": "Carregando modelo…",
  "ai.startAi": "Iniciar IA",
  "ai.summary": "Resumo",
  "ai.minutes": "Ata de reunião",
  "ai.topics": "Tópicos",
  "ai.stopAi": "Parar IA",
  "ai.askPlaceholder": "Pergunte algo sobre o áudio…",
  "ai.generating": "Gerando",
  "ai.kind.resumo": "resumo",
  "ai.kind.ata": "ata",
  "ai.kind.topicos": "tópicos",
  "ai.kind.pergunta": "pergunta",
  "ai.step": "passo {done} de {total}",
  "ai.saveAsSummary": "Salvar como resumo",
  "ai.savedAsSummary": "Salvo como resumo da transcrição.",
  "ai.savedSummaryLabel": "Resumo salvo",

  "ai.err.respondedStatus": "IA respondeu {status}",
  "ai.err.emptyTranscript": "transcrição vazia",
  "ai.part": "(parte {i} de {total})",
  "ai.ask.middleOmitted": "[... trecho do meio omitido ...]",
  "ai.ask.transcriptHeader": "=== TRANSCRIÇÃO ===",
  "ai.prompt.summarizeMap":
    "Você resume trechos de uma transcrição de áudio em português. Resuma o trecho em 3-5 frases, mantendo nomes, números e decisões. Não invente nada.",
  "ai.prompt.summarizeReduce":
    "Você resume transcrições de áudio em português. Escreva um resumo claro e fiel (1-3 parágrafos) a partir do conteúdo abaixo. Mantenha nomes, números e decisões. Não invente nada.",
  "ai.prompt.minutesMap":
    "Você extrai de um trecho de transcrição de reunião (português): assuntos discutidos, decisões tomadas, ações combinadas (com responsável se dito) e prazos. Responda em tópicos curtos. Não invente nada.",
  "ai.prompt.minutesReduce":
    "Você redige atas de reunião em português, em markdown, a partir do material abaixo. Estrutura: ## Resumo (2-3 frases) · ## Assuntos discutidos (tópicos) · ## Decisões (tópicos) · ## Ações e responsáveis (tópicos '- [ ] ação — responsável') · ## Pendências. Omita seções sem conteúdo. Não invente participantes, decisões nem prazos.",
  "ai.prompt.topicsMap":
    "Liste em tópicos (markdown '-') os assuntos deste trecho de transcrição, em português. Se as linhas tiverem timestamps [m:ss], inclua o timestamp de onde o assunto começa. Não invente nada.",
  "ai.prompt.topicsReduce":
    "Consolide as listas abaixo numa única lista de tópicos (markdown '-') sem repetições, em ordem cronológica, mantendo os timestamps [m:ss] quando existirem.",
  "ai.prompt.askSystem":
    "Você responde perguntas sobre a transcrição de áudio abaixo, em português, citando os timestamps [m:ss] quando ajudarem. Se a resposta não estiver na transcrição, diga isso.",
} as const;

export type MessageKey = keyof typeof pt;

const en: Record<MessageKey, string> = {
  "common.audioFilter": "Audio",
  "common.no": "No",
  "common.cancel": "Cancel",
  "common.copy": "Copy",

  "app.dropNothing": "No audio file recognized in the dropped items.",
  "app.dropHere": "Drop to transcribe",

  "store.openFailed": "Couldn't open: {e}",
  "store.saveFailed": "Failed to save: {e}",
  "store.deleteFailed": "Failed to delete: {e}",
  "store.noModel": "no transcription model installed — open Models and download one",
  "store.transcriptReady": "Transcript ready: {name}",
  "store.jobFailed": "Failed on {name}: {e}",

  "topbar.home": "Home",
  "topbar.openAudio": "Open audio",
  "topbar.models": "Models",
  "topbar.themeLight": "Light theme",
  "topbar.themeDark": "Dark theme",
  "topbar.settings": "Settings",

  "sidebar.search": "Search the library…",
  "sidebar.empty": "Your transcripts show up here.",
  "sidebar.notFound": "Nothing found.",
  "sidebar.hasSummary": "Has an AI summary",
  "sidebar.deleteConfirm": "Delete?",
  "sidebar.yes": "Yes",
  "sidebar.deleteTitle": "Delete transcript",

  "home.heroTitle": "Transcribe audio without leaving your computer",
  "home.heroSub":
    "Drag files here or record from the mic. 100% offline — nothing goes to the cloud.",
  "home.runtimeMissingPre": "Transcription runtime missing (whisper-cli). In development, run",
  "home.runtimeMissingPost": "; on the installed app this shouldn't happen.",
  "home.openAudioTitle": "Open audio files",
  "home.openAudioHint":
    "mp3, wav, m4a, ogg, flac… (audio from mp4/mov videos too). Drop files anywhere in the window.",
  "home.modelLine": "Transcription model:",
  "home.noneInstalled": "none installed",
  "home.change": "change",
  "home.downloadModel": "download model",
  "home.queue": "Queue",
  "home.clearFinished": "Clear finished",
  "home.open": "Open",
  "home.status.waiting": "queued",
  "home.status.preparing": "preparing audio…",
  "home.status.transcribing": "transcribing",
  "home.status.done": "done",
  "home.status.error": "error",
  "home.status.cancelled": "cancelled",

  "record.title": "Record from the mic",
  "record.hint": "Record a meeting or voice note and transcribe it right away.",
  "record.record": "Record",
  "record.recording": "Recording",
  "record.stop": "Stop and transcribe",
  "record.discard": "Discard",
  "record.namePrefix": "Recording",

  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.themeSystem": "Follow the system",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.themeNature": "Nature",
  "settings.themeDarkblue": "Dark blue",
  "settings.themeCalmgreen": "Calm green",
  "settings.themePastelpink": "Pastel pink",
  "settings.themePunkprincess": "PunkPrincess",
  "settings.language": "Language",
  "settings.audioLanguage": "Audio language",
  "settings.lang.auto": "Auto-detect",
  "settings.lang.pt": "Portuguese",
  "settings.lang.en": "English",
  "settings.lang.es": "Spanish",
  "settings.lang.fr": "French",
  "settings.lang.de": "German",
  "settings.lang.it": "Italian",
  "settings.defaultModel": "Default model",
  "settings.notInstalled": " (not installed)",
  "settings.threads": "Transcription threads",
  "settings.auto": "Automatic",
  "settings.keepAudio": "Keep the converted audio",
  "settings.keepAudioHint": "lets you replay the audio in the transcript (WAV 16 kHz, ~2 MB/min)",
  "settings.ggufDir": "Folder for .gguf models (AI)",
  "settings.notConfigured": "(not set)",
  "settings.choose": "Choose…",

  "models.title": "Transcription models",
  "models.intro":
    "Official whisper.cpp models, downloaded from Hugging Face with integrity checking. Bigger = better quality and slower.",
  "models.tipBase": "For Portuguese, start with",
  "models.installed": "installed",
  "models.remove": "Remove",
  "models.download": "Download",
  "models.multiTitle": "Multilingual (Portuguese included)",
  "models.enTitle": "English only (slightly better at English)",
  "models.hfTitle": "Hugging Face account (optional)",
  "models.hfIntroPre": "If the download fails with",
  "models.hfError403": "error 403",
  "models.hfIntroPost":
    ", Hugging Face is throttling anonymous downloads from your IP. A free read token fixes it — it stays in the system vault, never in a file.",
  "models.tokenConnected": "token connected",
  "models.disconnect": "Disconnect",
  "models.createToken": "Create token…",
  "models.tokenPlaceholder": "paste the token (hf_…)",
  "models.save": "Save",
  "models.installedToast": "Model {id} installed.",
  "models.tokenSaved": "Token saved in the system vault (account {name}).",
  "models.tokenRemoved": "Token removed.",
  "models.createTokenMsg": 'Create the "Read" token on the page that opened, copy it and paste it below.',

  "transcript.back": "Back",
  "transcript.followAudio": "follow audio",
  "transcript.followTitle": "Scroll along with the audio",
  "transcript.ai": "AI",
  "transcript.deleteConfirm": "Really delete?",
  "transcript.deleteTitle": "Delete",
  "transcript.langChip": "language: {lang}",

  "segments.empty": "Empty transcript.",
  "segments.playFrom": "Play from here",

  "player.empty":
    'Audio not kept for this transcript (enable "keep audio" in settings).',
  "player.playPause": "Play/pause (space)",
  "player.back10": "Back 10 s",
  "player.fwd10": "Forward 10 s",
  "player.speed": "Speed",
  "player.unavailable": "audio unavailable",

  "export.button": "Export",
  "export.prefix": "Export {label}",
  "export.exported": "Exported: {path}",
  "export.textCopied": "Text copied.",
  "export.txt": "Text",
  "export.txtMenu": "Text (.txt)",
  "export.md": "Markdown",
  "export.mdMenu": "Markdown (.md) — good for OpenObsidian",
  "export.srt": "SRT subtitles",
  "export.srtMenu": "Subtitles (.srt)",
  "export.vtt": "VTT subtitles",
  "export.vttMenu": "Subtitles (.vtt)",
  "export.copyText": "Copy text",

  "ai.pickDirTitle": "Folder for .gguf models",
  "ai.ready": "AI ready.",
  "ai.failed": "AI failed: {e}",
  "ai.copied": "Copied.",
  "ai.title": "Local AI",
  "ai.port": "port {n}",
  "ai.setupHintPre": "The AI runs 100% on your machine (llama.cpp). Point it at the folder with",
  "ai.setupHintPost": "models and start it.",
  "ai.changeDir": "Change models folder",
  "ai.chooseDir": "Choose models folder",
  "ai.loadingModel": "Loading model…",
  "ai.startAi": "Start AI",
  "ai.summary": "Summary",
  "ai.minutes": "Meeting minutes",
  "ai.topics": "Topics",
  "ai.stopAi": "Stop AI",
  "ai.askPlaceholder": "Ask something about the audio…",
  "ai.generating": "Generating",
  "ai.kind.resumo": "summary",
  "ai.kind.ata": "minutes",
  "ai.kind.topicos": "topics",
  "ai.kind.pergunta": "answer",
  "ai.step": "step {done} of {total}",
  "ai.saveAsSummary": "Save as summary",
  "ai.savedAsSummary": "Saved as the transcript's summary.",
  "ai.savedSummaryLabel": "Saved summary",

  "ai.err.respondedStatus": "AI responded {status}",
  "ai.err.emptyTranscript": "empty transcript",
  "ai.part": "(part {i} of {total})",
  "ai.ask.middleOmitted": "[... middle section omitted ...]",
  "ai.ask.transcriptHeader": "=== TRANSCRIPT ===",
  "ai.prompt.summarizeMap":
    "You summarize excerpts of an audio transcript in English. Summarize the excerpt in 3-5 sentences, keeping names, numbers and decisions. Do not make anything up.",
  "ai.prompt.summarizeReduce":
    "You summarize audio transcripts in English. Write a clear, faithful summary (1-3 paragraphs) from the content below. Keep names, numbers and decisions. Do not make anything up.",
  "ai.prompt.minutesMap":
    "From an excerpt of a meeting transcript, extract (in English): topics discussed, decisions made, agreed actions (with owner if stated) and deadlines. Answer in short bullet points. Do not make anything up.",
  "ai.prompt.minutesReduce":
    "You write meeting minutes in English, in markdown, from the material below. Structure: ## Summary (2-3 sentences) · ## Topics discussed (bullets) · ## Decisions (bullets) · ## Actions and owners (bullets '- [ ] action — owner') · ## Open items. Omit empty sections. Do not invent participants, decisions or deadlines.",
  "ai.prompt.topicsMap":
    "List the topics of this transcript excerpt as bullet points (markdown '-'), in English. If lines have [m:ss] timestamps, include the timestamp where each topic starts. Do not make anything up.",
  "ai.prompt.topicsReduce":
    "Consolidate the lists below into a single bullet list (markdown '-') with no repetitions, in chronological order, keeping the [m:ss] timestamps where present.",
  "ai.prompt.askSystem":
    "You answer questions about the audio transcript below, in English, citing the [m:ss] timestamps when they help. If the answer isn't in the transcript, say so.",
};

const es: Record<MessageKey, string> = {
  "common.audioFilter": "Audio",
  "common.no": "No",
  "common.cancel": "Cancelar",
  "common.copy": "Copiar",

  "app.dropNothing": "No se reconoció ningún archivo de audio en los elementos soltados.",
  "app.dropHere": "Suelta para transcribir",

  "store.openFailed": "No se pudo abrir: {e}",
  "store.saveFailed": "Error al guardar: {e}",
  "store.deleteFailed": "Error al eliminar: {e}",
  "store.noModel": "ningún modelo de transcripción instalado — abre Modelos y descarga uno",
  "store.transcriptReady": "Transcripción lista: {name}",
  "store.jobFailed": "Falló en {name}: {e}",

  "topbar.home": "Inicio",
  "topbar.openAudio": "Abrir audio",
  "topbar.models": "Modelos",
  "topbar.themeLight": "Tema claro",
  "topbar.themeDark": "Tema oscuro",
  "topbar.settings": "Configuración",

  "sidebar.search": "Buscar en la biblioteca…",
  "sidebar.empty": "Tus transcripciones aparecen aquí.",
  "sidebar.notFound": "Nada encontrado.",
  "sidebar.hasSummary": "Tiene resumen de IA",
  "sidebar.deleteConfirm": "¿Eliminar?",
  "sidebar.yes": "Sí",
  "sidebar.deleteTitle": "Eliminar transcripción",

  "home.heroTitle": "Transcribe audio sin salir de tu computadora",
  "home.heroSub":
    "Arrastra archivos aquí o graba del micrófono. Todo 100% offline — nada sube a la nube.",
  "home.runtimeMissingPre": "Falta el runtime de transcripción (whisper-cli). En desarrollo, ejecuta",
  "home.runtimeMissingPost": "; en la app instalada esto no debería pasar.",
  "home.openAudioTitle": "Abrir archivos de audio",
  "home.openAudioHint":
    "mp3, wav, m4a, ogg, flac… (audio de vídeos mp4/mov también). Suelta los archivos en cualquier parte de la ventana.",
  "home.modelLine": "Modelo de transcripción:",
  "home.noneInstalled": "ninguno instalado",
  "home.change": "cambiar",
  "home.downloadModel": "descargar modelo",
  "home.queue": "Cola",
  "home.clearFinished": "Limpiar terminados",
  "home.open": "Abrir",
  "home.status.waiting": "en cola",
  "home.status.preparing": "preparando audio…",
  "home.status.transcribing": "transcribiendo",
  "home.status.done": "listo",
  "home.status.error": "error",
  "home.status.cancelled": "cancelado",

  "record.title": "Grabar del micrófono",
  "record.hint": "Graba una reunión o nota de voz y transcríbela al instante.",
  "record.record": "Grabar",
  "record.recording": "Grabando",
  "record.stop": "Detener y transcribir",
  "record.discard": "Descartar",
  "record.namePrefix": "Grabación",

  "settings.title": "Configuración",
  "settings.theme": "Tema",
  "settings.themeSystem": "Seguir el sistema",
  "settings.themeLight": "Claro",
  "settings.themeDark": "Oscuro",
  "settings.themeNature": "Naturaleza",
  "settings.themeDarkblue": "Azul oscuro",
  "settings.themeCalmgreen": "Verde tranquilo",
  "settings.themePastelpink": "Rosa pastel",
  "settings.themePunkprincess": "PunkPrincess",
  "settings.language": "Idioma",
  "settings.audioLanguage": "Idioma del audio",
  "settings.lang.auto": "Detectar automáticamente",
  "settings.lang.pt": "Portugués",
  "settings.lang.en": "Inglés",
  "settings.lang.es": "Español",
  "settings.lang.fr": "Francés",
  "settings.lang.de": "Alemán",
  "settings.lang.it": "Italiano",
  "settings.defaultModel": "Modelo predeterminado",
  "settings.notInstalled": " (no instalado)",
  "settings.threads": "Hilos de transcripción",
  "settings.auto": "Automático",
  "settings.keepAudio": "Guardar el audio convertido",
  "settings.keepAudioHint": "permite reescuchar el audio en la transcripción (WAV 16 kHz, ~2 MB/min)",
  "settings.ggufDir": "Carpeta de modelos .gguf (IA)",
  "settings.notConfigured": "(no configurada)",
  "settings.choose": "Elegir…",

  "models.title": "Modelos de transcripción",
  "models.intro":
    "Modelos oficiales de whisper.cpp, descargados de Hugging Face con verificación de integridad. Más grande = mejor calidad y más lento.",
  "models.tipBase": "Para portugués, empieza por",
  "models.installed": "instalado",
  "models.remove": "Eliminar",
  "models.download": "Descargar",
  "models.multiTitle": "Multilingüe (portugués incluido)",
  "models.enTitle": "Solo inglés (un poco mejores en inglés)",
  "models.hfTitle": "Cuenta de Hugging Face (opcional)",
  "models.hfIntroPre": "Si la descarga falla con",
  "models.hfError403": "error 403",
  "models.hfIntroPost":
    ", Hugging Face está limitando las descargas anónimas de tu IP. Un token gratuito de lectura lo resuelve — queda guardado en el depósito del sistema, nunca en un archivo.",
  "models.tokenConnected": "token conectado",
  "models.disconnect": "Desconectar",
  "models.createToken": "Crear token…",
  "models.tokenPlaceholder": "pega el token (hf_…)",
  "models.save": "Guardar",
  "models.installedToast": "Modelo {id} instalado.",
  "models.tokenSaved": "Token guardado en el depósito del sistema (cuenta {name}).",
  "models.tokenRemoved": "Token eliminado.",
  "models.createTokenMsg": 'Crea el token "Read" en la página que se abrió, cópialo y pégalo aquí abajo.',

  "transcript.back": "Volver",
  "transcript.followAudio": "seguir audio",
  "transcript.followTitle": "Desplazar junto con el audio",
  "transcript.ai": "IA",
  "transcript.deleteConfirm": "¿Eliminar de verdad?",
  "transcript.deleteTitle": "Eliminar",
  "transcript.langChip": "idioma: {lang}",

  "segments.empty": "Transcripción vacía.",
  "segments.playFrom": "Reproducir desde aquí",

  "player.empty":
    'Audio no guardado para esta transcripción (activa "mantener audio" en la configuración).',
  "player.playPause": "Reproducir/pausar (espacio)",
  "player.back10": "Retroceder 10 s",
  "player.fwd10": "Avanzar 10 s",
  "player.speed": "Velocidad",
  "player.unavailable": "audio no disponible",

  "export.button": "Exportar",
  "export.prefix": "Exportar {label}",
  "export.exported": "Exportado: {path}",
  "export.textCopied": "Texto copiado.",
  "export.txt": "Texto",
  "export.txtMenu": "Texto (.txt)",
  "export.md": "Markdown",
  "export.mdMenu": "Markdown (.md) — bueno para OpenObsidian",
  "export.srt": "Subtítulos SRT",
  "export.srtMenu": "Subtítulos (.srt)",
  "export.vtt": "Subtítulos VTT",
  "export.vttMenu": "Subtítulos (.vtt)",
  "export.copyText": "Copiar texto",

  "ai.pickDirTitle": "Carpeta de modelos .gguf",
  "ai.ready": "IA lista.",
  "ai.failed": "La IA falló: {e}",
  "ai.copied": "Copiado.",
  "ai.title": "IA local",
  "ai.port": "puerto {n}",
  "ai.setupHintPre": "La IA corre 100% en tu máquina (llama.cpp). Apunta a la carpeta con modelos",
  "ai.setupHintPost": "e iníciala.",
  "ai.changeDir": "Cambiar carpeta de modelos",
  "ai.chooseDir": "Elegir carpeta de modelos",
  "ai.loadingModel": "Cargando modelo…",
  "ai.startAi": "Iniciar IA",
  "ai.summary": "Resumen",
  "ai.minutes": "Acta de reunión",
  "ai.topics": "Temas",
  "ai.stopAi": "Detener IA",
  "ai.askPlaceholder": "Pregunta algo sobre el audio…",
  "ai.generating": "Generando",
  "ai.kind.resumo": "resumen",
  "ai.kind.ata": "acta",
  "ai.kind.topicos": "temas",
  "ai.kind.pergunta": "respuesta",
  "ai.step": "paso {done} de {total}",
  "ai.saveAsSummary": "Guardar como resumen",
  "ai.savedAsSummary": "Guardado como resumen de la transcripción.",
  "ai.savedSummaryLabel": "Resumen guardado",

  "ai.err.respondedStatus": "La IA respondió {status}",
  "ai.err.emptyTranscript": "transcripción vacía",
  "ai.part": "(parte {i} de {total})",
  "ai.ask.middleOmitted": "[... sección del medio omitida ...]",
  "ai.ask.transcriptHeader": "=== TRANSCRIPCIÓN ===",
  "ai.prompt.summarizeMap":
    "Resumes fragmentos de una transcripción de audio en español. Resume el fragmento en 3-5 frases, manteniendo nombres, números y decisiones. No inventes nada.",
  "ai.prompt.summarizeReduce":
    "Resumes transcripciones de audio en español. Escribe un resumen claro y fiel (1-3 párrafos) a partir del contenido de abajo. Mantén nombres, números y decisiones. No inventes nada.",
  "ai.prompt.minutesMap":
    "De un fragmento de transcripción de reunión, extrae (en español): temas tratados, decisiones tomadas, acciones acordadas (con responsable si se dice) y plazos. Responde en viñetas cortas. No inventes nada.",
  "ai.prompt.minutesReduce":
    "Redactas actas de reunión en español, en markdown, a partir del material de abajo. Estructura: ## Resumen (2-3 frases) · ## Temas tratados (viñetas) · ## Decisiones (viñetas) · ## Acciones y responsables (viñetas '- [ ] acción — responsable') · ## Pendientes. Omite secciones sin contenido. No inventes participantes, decisiones ni plazos.",
  "ai.prompt.topicsMap":
    "Lista en viñetas (markdown '-') los temas de este fragmento de transcripción, en español. Si las líneas tienen marcas de tiempo [m:ss], incluye la marca donde empieza cada tema. No inventes nada.",
  "ai.prompt.topicsReduce":
    "Consolida las listas de abajo en una única lista de viñetas (markdown '-') sin repeticiones, en orden cronológico, manteniendo las marcas de tiempo [m:ss] cuando existan.",
  "ai.prompt.askSystem":
    "Respondes preguntas sobre la transcripción de audio de abajo, en español, citando las marcas de tiempo [m:ss] cuando ayuden. Si la respuesta no está en la transcripción, dilo.",
};

const DICTS: Record<Locale, Record<MessageKey, string>> = { pt, en, es };

/** Palpite de locale pelo idioma do sistema (só no 1º uso). */
export function detectLocale(): Locale {
  const l = (typeof navigator !== "undefined" ? navigator.language : "pt").toLowerCase();
  if (l.startsWith("en")) return "en";
  if (l.startsWith("es")) return "es";
  return "pt";
}

function loadLocale(): Locale {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(LOCALE_KEY) : null;
  return v === "pt" || v === "en" || v === "es" ? v : detectLocale();
}

let current: Locale = loadLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  if (locale === current) return;
  current = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* localStorage indisponível */
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Inscreve o componente nas trocas de locale. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}

/** Traduz uma chave, interpolando placeholders `{param}`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = DICTS[current][key] ?? pt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  }
  return msg;
}
