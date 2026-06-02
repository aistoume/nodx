use tauri_plugin_sql::{Migration, MigrationKind};

/// Schema v1 — mirrors `@nodx/models` (PRD §4).
///
/// Field naming: snake_case in SQL, camelCase in TS. The frontend translates
/// when reading rows; see `apps/desktop/src/App.tsx#rowToTopic`.
const V1_SQL: &str = r#"
CREATE TABLE topics (
    id              TEXT PRIMARY KEY,
    parent_id       TEXT REFERENCES topics(id) ON DELETE CASCADE,
    title           TEXT NOT NULL CHECK (length(title) > 0),
    status          TEXT NOT NULL CHECK (status IN ('exploring','summarized','atomic','ghost')),
    is_pinned       INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    message_count   INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
    child_count     INTEGER NOT NULL DEFAULT 0 CHECK (child_count >= 0),
    last_activity   INTEGER NOT NULL,
    ai_summary      TEXT
);
CREATE INDEX idx_topics_parent ON topics(parent_id);
CREATE INDEX idx_topics_status ON topics(status);

CREATE TABLE messages (
    id            TEXT PRIMARY KEY,
    topic_id      TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('user','ai')),
    type          TEXT NOT NULL CHECK (type IN ('text','survey','factor_list','explanation')),
    content       TEXT NOT NULL,
    anchors_json  TEXT NOT NULL DEFAULT '[]',
    mentions_json TEXT NOT NULL DEFAULT '[]',
    created_at    INTEGER NOT NULL
);
CREATE INDEX idx_messages_topic_created ON messages(topic_id, created_at);

CREATE TABLE comments (
    id                TEXT PRIMARY KEY,
    topic_id          TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    anchor_id         TEXT,
    type              TEXT NOT NULL CHECK (type IN ('note','explanation','atomic','reference')),
    content           TEXT NOT NULL,
    atomic_data_json  TEXT,
    created_at        INTEGER NOT NULL,
    CHECK (
        (type = 'atomic' AND atomic_data_json IS NOT NULL)
        OR (type != 'atomic' AND atomic_data_json IS NULL)
    )
);
CREATE INDEX idx_comments_topic ON comments(topic_id);
CREATE INDEX idx_comments_anchor ON comments(anchor_id) WHERE anchor_id IS NOT NULL;

CREATE TABLE edges (
    id                TEXT PRIMARY KEY,
    source_id         TEXT NOT NULL,
    target_id         TEXT NOT NULL,
    type              TEXT NOT NULL CHECK (type IN ('parent','semantic')),
    is_user_confirmed INTEGER NOT NULL CHECK (is_user_confirmed IN (0, 1)),
    weight            REAL CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1)),
    CHECK (source_id != target_id),
    CHECK (
        (type = 'semantic' AND weight IS NOT NULL)
        OR (type = 'parent')
    ),
    UNIQUE (source_id, target_id, type)
);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);

CREATE TABLE draft_items (
    id                TEXT PRIMARY KEY,
    source_topic_id   TEXT REFERENCES topics(id) ON DELETE SET NULL,
    source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    content           TEXT NOT NULL CHECK (length(content) > 0),
    created_at        INTEGER NOT NULL,
    CHECK (
        source_message_id IS NULL OR source_topic_id IS NOT NULL
    )
);
CREATE INDEX idx_draft_items_topic ON draft_items(source_topic_id);
"#;

/// Schema v2 — soft-archive on topics + auto-bump message counters.
///
/// Adds `topics.is_archived` so old topics can be tucked away without
/// losing them, and an AFTER INSERT trigger on `messages` so
/// `topics.message_count` / `last_activity` / `updated_at` stay in
/// sync without the client having to remember.
const V2_SQL: &str = r#"
ALTER TABLE topics ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0
    CHECK (is_archived IN (0, 1));
CREATE INDEX idx_topics_archived ON topics(is_archived) WHERE is_archived = 1;

CREATE TRIGGER trg_messages_after_insert
AFTER INSERT ON messages
BEGIN
    UPDATE topics
    SET message_count = message_count + 1,
        last_activity = NEW.created_at,
        updated_at = NEW.created_at
    WHERE id = NEW.topic_id;
END;
"#;

/// Schema v3 — per-topic "thinking document" (PRD pivot 2026-05-05).
///
/// Replaces the chat-bubble conversation surface with a single editable
/// artefact owned 1:1 by a Topic. Stored as HTML for now (TipTap's native
/// I/O); a future migration can introduce richer formats without changing
/// the table shape.
const V3_SQL: &str = r#"
CREATE TABLE topic_documents (
    topic_id    TEXT PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    format      TEXT NOT NULL DEFAULT 'html' CHECK (format IN ('html')),
    updated_at  INTEGER NOT NULL
);
"#;

/// Schema v4 — Expert Panel Protocol (PRD §3.14).
///
/// Adds the multi-agent debate scaffolding. Tables are normalised so
/// individual exchanges can stream in as the AI generates them without
/// re-writing a giant JSON blob on every step.
///
///   persona_templates  — reusable persona library
///   expert_panels      — one per direction Topic (1:1). LocalMaximumResult
///                        is flattened into this table (best_answer,
///                        confidence, consensus_json, divergence_json,
///                        open_questions_json, accepted_by_user, accepted_at)
///                        because it's always 1:1 with the panel.
///   panel_rounds       — one row per round (1–5)
///   panel_exchanges    — one row per agent-utterance in a round
///
/// Field-name convention: snake_case in SQL, camelCase in Zod. Arrays /
/// objects go in `*_json` TEXT columns and are JSON.parse'd at read time.
/// Timestamps are INTEGER epoch-ms, matching v1.
const V4_SQL: &str = r#"
CREATE TABLE persona_templates (
    id              TEXT PRIMARY KEY,
    domain_json     TEXT NOT NULL DEFAULT '[]',
    role            TEXT NOT NULL CHECK (role IN
        ('proposer','critic','practitioner','constraint','user_proxy')),
    display_name    TEXT NOT NULL CHECK (length(display_name) > 0),
    system_prompt   TEXT NOT NULL CHECK (length(system_prompt) > 0),
    frameworks_json TEXT NOT NULL DEFAULT '[]',
    eval_score      REAL CHECK (eval_score IS NULL OR (eval_score >= 0 AND eval_score <= 1))
);

CREATE TABLE expert_panels (
    id                   TEXT PRIMARY KEY,
    topic_id             TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    domain               TEXT NOT NULL CHECK (length(domain) > 0),
    members_json         TEXT NOT NULL DEFAULT '[]',
    status               TEXT NOT NULL CHECK (status IN
        ('forming','debating','converged','rejected_by_user')),
    -- LocalMaximumResult flattened (NULL until status='converged')
    best_answer          TEXT,
    confidence           REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    consensus_json       TEXT,
    divergence_json      TEXT,
    open_questions_json  TEXT,
    accepted_by_user     INTEGER CHECK (accepted_by_user IS NULL OR accepted_by_user IN (0, 1)),
    accepted_at          INTEGER,
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL
);
CREATE INDEX idx_expert_panels_topic ON expert_panels(topic_id);

CREATE TABLE panel_rounds (
    id                    TEXT PRIMARY KEY,
    panel_id              TEXT NOT NULL REFERENCES expert_panels(id) ON DELETE CASCADE,
    round_number          INTEGER NOT NULL CHECK (round_number BETWEEN 1 AND 5),
    type                  TEXT NOT NULL CHECK (type IN
        ('initial','critique','refined','synthesis')),
    stop_signals_hit_json TEXT
);
CREATE INDEX idx_panel_rounds_panel ON panel_rounds(panel_id, round_number);

CREATE TABLE panel_exchanges (
    id              TEXT PRIMARY KEY,
    round_id        TEXT NOT NULL REFERENCES panel_rounds(id) ON DELETE CASCADE,
    -- agent_id refers to ExpertAgent.id inside expert_panels.members_json
    -- (no FK — the agent lives inside a JSON blob, not its own table).
    agent_id        TEXT NOT NULL,
    content         TEXT NOT NULL CHECK (length(content) > 0),
    citations_json  TEXT,
    created_at      INTEGER NOT NULL
);
CREATE INDEX idx_panel_exchanges_round ON panel_exchanges(round_id);
CREATE INDEX idx_panel_exchanges_agent ON panel_exchanges(agent_id);
"#;

pub fn all() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_schema",
            sql: V1_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "topic_archive_and_message_counter_trigger",
            sql: V2_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "topic_documents",
            sql: V3_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "expert_panel_protocol",
            sql: V4_SQL,
            kind: MigrationKind::Up,
        },
    ]
}
