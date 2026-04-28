# Jira Time Tracker

Tool desktop Windows che gira in tray, prompta periodicamente su che task si sta lavorando, salva il tempo in un DB SQLite locale e permette di registrare i worklog su Jira.

## Funzionalità

- Prompt periodico (intervallo configurabile) per scegliere il task corrente
- "Ignora" → assegna il tempo all'ultimo task (disabilitato se non c'è un ultimo task)
- "Skip" → il tempo non viene contato
- Recupero automatico dei task assegnati e non chiusi via API Jira
- Dashboard con riepilogo per task, preview dei worklog aggregati per consecutività, modifica durata/commento
- Sincronizzazione verso Jira con anti-doppi (`synced_to_jira` + `jira_worklog_id`)
- Avvio automatico con Windows, esecuzione minimizzata in tray
- DB locale in `%APPDATA%\jira-time-tracker\jira-tracker.db`

## Setup sviluppo

```bash
npm install
npm start
```

Al primo avvio si apre la finestra **Settings**: inserire workspace URL (es. `azienda.atlassian.net`), email e API token Atlassian. Premere **Test connection** per validare, poi **Salva**.

## Build installer (Windows)

```bash
npm run build:win
```

Output in `dist/`.

## Architettura

```
src/
├── main/              processo Electron
│   ├── index.js       entry, IPC, lifecycle
│   ├── tray.js        tray icon e menu contestuale
│   ├── windows.js     gestione finestre (popup, dashboard, settings)
│   ├── scheduler.js   intervallo, prompt, registrazione time entry
│   ├── db.js          SQLite (better-sqlite3) e accesso dati
│   ├── jira.js        client API Jira (validate / search / worklog)
│   ├── aggregation.js raggruppamento per consecutività
│   ├── autolaunch.js  registrazione avvio con Windows
│   └── preload.js     bridge IPC esposto al renderer
└── renderer/          UI HTML/CSS/JS vanilla
    ├── popup/         popup di scelta task
    ├── dashboard/     dashboard con preview worklog
    ├── settings/      configurazione token e intervallo
    └── shared/        styles condivisi
```

## Regola di consecutività (sync)

Due entry sullo stesso task sono aggregate in un singolo worklog se tra di loro non ci sono entry su un task diverso. Gli **skip non rompono** la consecutività ma il loro tempo non viene conteggiato.

Esempi:
- `30m T1 → 30m T1 → 30m T1` → 1 worklog di 1h30 su T1
- `30m T1 → 30m T2 → 30m T1` → 3 worklog separati
- `30m T1 → skip 30m → 30m T1` → 1 worklog di 1h su T1
