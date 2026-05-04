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

pub fn all() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_initial_schema",
        sql: V1_SQL,
        kind: MigrationKind::Up,
    }]
}
