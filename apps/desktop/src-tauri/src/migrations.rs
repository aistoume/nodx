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

/// Schema v5 — raise the debate round ceiling (PRD §3.14 "硬上限" made
/// configurable). v4 pinned `panel_rounds.round_number` to `BETWEEN 1 AND 5`;
/// the engine can now run more refinement rounds (the `@nodx/models` schema
/// owns the real cap, MAX_PANEL_ROUNDS). SQLite can't ALTER a CHECK, so we
/// rebuild the table with a looser `round_number >= 1` guard.
///
/// The child `panel_exchanges` is rebuilt alongside so the rebuild is
/// foreign-key-safe: at no point does a live FK point at rows we delete, so
/// nothing cascade-deletes. The final `RENAME` re-points the new exchanges
/// table's FK onto `panel_rounds` (SQLite updates references on rename).
/// Existing rounds/exchanges are copied over intact.
const V5_SQL: &str = r#"
CREATE TABLE _panel_rounds_v5 (
    id                    TEXT PRIMARY KEY,
    panel_id              TEXT NOT NULL REFERENCES expert_panels(id) ON DELETE CASCADE,
    round_number          INTEGER NOT NULL CHECK (round_number >= 1),
    type                  TEXT NOT NULL CHECK (type IN
        ('initial','critique','refined','synthesis')),
    stop_signals_hit_json TEXT
);
INSERT INTO _panel_rounds_v5 (id, panel_id, round_number, type, stop_signals_hit_json)
    SELECT id, panel_id, round_number, type, stop_signals_hit_json FROM panel_rounds;

CREATE TABLE _panel_exchanges_v5 (
    id              TEXT PRIMARY KEY,
    round_id        TEXT NOT NULL REFERENCES _panel_rounds_v5(id) ON DELETE CASCADE,
    agent_id        TEXT NOT NULL,
    content         TEXT NOT NULL CHECK (length(content) > 0),
    citations_json  TEXT,
    created_at      INTEGER NOT NULL
);
INSERT INTO _panel_exchanges_v5 (id, round_id, agent_id, content, citations_json, created_at)
    SELECT id, round_id, agent_id, content, citations_json, created_at FROM panel_exchanges;

DROP TABLE panel_exchanges;
DROP TABLE panel_rounds;

ALTER TABLE _panel_rounds_v5 RENAME TO panel_rounds;
ALTER TABLE _panel_exchanges_v5 RENAME TO panel_exchanges;

CREATE INDEX idx_panel_rounds_panel ON panel_rounds(panel_id, round_number);
CREATE INDEX idx_panel_exchanges_round ON panel_exchanges(round_id);
CREATE INDEX idx_panel_exchanges_agent ON panel_exchanges(agent_id);
"#;

/// Schema v6 — CBR pipeline write path (PRD §3.16 / §3.18).
///
/// Stores the de-identified, abstracted cases distilled from Topics that
/// reached localMaximum, plus the case-to-case relation edges (simplified
/// GraphRAG). This is the LOCAL SQLite shape; the PRD's §3.16 index list
/// (pgvector HNSW on the embeddings, FTS GIN on the text) targets the M3
/// Supabase/Postgres port. On SQLite we approximate:
///   - embeddings: BLOB (Float32 LE, 768 dims each) — brute-force scan in V1
///     (no native vector index); HNSW lands with Supabase.
///   - keyword index: FTS5 (trigram tokenizer — substring-friendly for CJK),
///     SQLite's equivalent of Postgres FTS GIN, kept in sync via triggers.
///   - scalar filters: B-tree on domain / quality_score / freshness_date.
///   - relations: composite index for the recursive-CTE 2-hop queries.
///
/// Retrieval is NOT built in this migration — only the write path needs it.
const V6_SQL: &str = r#"
CREATE TABLE abstracted_cases (
    id                     TEXT PRIMARY KEY,
    source_topic_id        TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    -- structured AI output (problemSignature / reasoningPath / solutionPattern / outcome)
    problem_signature_json TEXT NOT NULL,
    reasoning_path_json    TEXT NOT NULL,
    solution_pattern_json  TEXT NOT NULL,
    outcome_json           TEXT NOT NULL,
    -- text-ified signature/solution that get embedded + full-text indexed
    signature_text         TEXT NOT NULL,
    solution_text          TEXT NOT NULL,
    -- 2 × 768-dim Gemini Embedding 2, Float32 little-endian (3072 bytes each)
    problem_emb            BLOB NOT NULL,
    solution_emb           BLOB NOT NULL,
    -- denormalised scalar filters (B-tree indexed below)
    domain                 TEXT NOT NULL,
    decision_type          TEXT NOT NULL CHECK (decision_type IN
        ('go_no_go','allocation','sequencing','tradeoff')),
    quality_score          REAL NOT NULL CHECK (quality_score >= 0 AND quality_score <= 1),
    visibility             TEXT NOT NULL CHECK (visibility IN
        ('private','team','public_anonymous')),
    freshness_date         INTEGER NOT NULL,
    created_at             INTEGER NOT NULL
);
CREATE INDEX idx_cases_domain ON abstracted_cases(domain);
CREATE INDEX idx_cases_quality ON abstracted_cases(quality_score);
CREATE INDEX idx_cases_freshness ON abstracted_cases(freshness_date);

-- Postgres FTS GIN equivalent: FTS5 over the text-ified signature/solution.
-- trigram tokenizer gives substring matching that works for Chinese (no
-- word boundaries). Standalone table mapped back to a case by case_id;
-- kept in sync by triggers so the write path never has to touch it directly.
CREATE VIRTUAL TABLE abstracted_cases_fts USING fts5(
    case_id UNINDEXED,
    signature_text,
    solution_text,
    tokenize = 'trigram'
);
CREATE TRIGGER trg_cases_fts_insert AFTER INSERT ON abstracted_cases BEGIN
    INSERT INTO abstracted_cases_fts (case_id, signature_text, solution_text)
    VALUES (NEW.id, NEW.signature_text, NEW.solution_text);
END;
CREATE TRIGGER trg_cases_fts_delete AFTER DELETE ON abstracted_cases BEGIN
    DELETE FROM abstracted_cases_fts WHERE case_id = OLD.id;
END;
CREATE TRIGGER trg_cases_fts_update AFTER UPDATE ON abstracted_cases BEGIN
    UPDATE abstracted_cases_fts
    SET signature_text = NEW.signature_text, solution_text = NEW.solution_text
    WHERE case_id = NEW.id;
END;

CREATE TABLE case_relations (
    id              TEXT PRIMARY KEY,
    source_case_id  TEXT NOT NULL REFERENCES abstracted_cases(id) ON DELETE CASCADE,
    target_case_id  TEXT NOT NULL REFERENCES abstracted_cases(id) ON DELETE CASCADE,
    relation_type   TEXT NOT NULL CHECK (relation_type IN
        ('shares_framework','shares_domain','contrasts','composed_from','caused_by')),
    weight          REAL NOT NULL CHECK (weight >= 0 AND weight <= 1),
    created_at      INTEGER NOT NULL,
    CHECK (source_case_id != target_case_id),
    UNIQUE (source_case_id, target_case_id, relation_type)
);
-- Composite for the forward recursive-CTE traversal (WHERE source + type);
-- a target index supports reverse / bidirectional walks.
CREATE INDEX idx_case_relations_src ON case_relations(source_case_id, target_case_id, relation_type);
CREATE INDEX idx_case_relations_tgt ON case_relations(target_case_id);
"#;

/// Schema v7 — diff-scoped panel seed (PRD §3.16 ④ → §3.14 handoff).
///
/// When the CBR adapter says a reused case "requires an expert panel", the
/// handoff creates a Topic and stashes the adaptation here. The panel surface
/// reads this seed and runs a debate scoped to ONLY the differing points
/// (`rediscuss_json`), treating the inherited structure as settled — so the
/// panel runs the diff, not the whole thing. The row is deleted once the
/// scoped debate starts (one-shot). 1:1 with a Topic.
const V7_SQL: &str = r#"
CREATE TABLE topic_panel_seeds (
    topic_id            TEXT PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
    source_case_id      TEXT NOT NULL,
    inherited_structure TEXT NOT NULL,
    levers_json         TEXT NOT NULL DEFAULT '[]',
    rediscuss_json      TEXT NOT NULL DEFAULT '[]',
    created_at          INTEGER NOT NULL
);
"#;

/// Schema v8 — 卖点②「不丢失」: 思路复现 / 卡点 / 思考会话（PRD §3.11–3.13）.
///
///   topics            +reasoning_trace, +has_open_questions
///   messages          +session_id (NULL for pre-session rows)
///   comments          +open_question_data_json; type CHECK relaxed to allow
///                     'open_question' (SQLite can't ALTER a CHECK → rebuild;
///                     no table FK-references comments, so the rebuild is simple)
///   thinking_sessions new table (1 topic : N sessions)
const V8_SQL: &str = r#"
ALTER TABLE topics ADD COLUMN reasoning_trace TEXT;
ALTER TABLE topics ADD COLUMN has_open_questions INTEGER NOT NULL DEFAULT 0
    CHECK (has_open_questions IN (0, 1));

ALTER TABLE messages ADD COLUMN session_id TEXT;

-- Rebuild comments to relax the type CHECK + add the 卡点 payload column.
CREATE TABLE _comments_v8 (
    id                      TEXT PRIMARY KEY,
    topic_id                TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    anchor_id               TEXT,
    type                    TEXT NOT NULL CHECK (type IN
        ('note','explanation','atomic','reference','open_question')),
    content                 TEXT NOT NULL,
    atomic_data_json        TEXT,
    open_question_data_json TEXT,
    created_at              INTEGER NOT NULL,
    CHECK (
        (type = 'atomic' AND atomic_data_json IS NOT NULL)
        OR (type != 'atomic' AND atomic_data_json IS NULL)
    ),
    CHECK (
        (type = 'open_question' AND open_question_data_json IS NOT NULL)
        OR (type != 'open_question' AND open_question_data_json IS NULL)
    )
);
INSERT INTO _comments_v8
    (id, topic_id, anchor_id, type, content, atomic_data_json, open_question_data_json, created_at)
    SELECT id, topic_id, anchor_id, type, content, atomic_data_json, NULL, created_at
    FROM comments;
DROP TABLE comments;
ALTER TABLE _comments_v8 RENAME TO comments;
CREATE INDEX idx_comments_topic ON comments(topic_id);
CREATE INDEX idx_comments_anchor ON comments(anchor_id) WHERE anchor_id IS NOT NULL;

CREATE TABLE thinking_sessions (
    id            TEXT PRIMARY KEY,
    topic_id      TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
    ai_recap      TEXT
);
CREATE INDEX idx_sessions_topic ON thinking_sessions(topic_id, started_at DESC);
"#;

/// Schema v9 — fix: allow `messages.type = 'replay_card'` (PRD §3.11).
///
/// v8 added the replay_card message type in the models but missed relaxing the
/// messages.type CHECK (from v1), so inserting a "上次回顾" card failed. SQLite
/// can't ALTER a CHECK → rebuild the table. `draft_items` FK-references
/// messages (ON DELETE SET NULL) but is empty, so the drop is safe; the
/// AFTER INSERT trigger + index are recreated.
const V9_SQL: &str = r#"
CREATE TABLE _messages_v9 (
    id            TEXT PRIMARY KEY,
    topic_id      TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    session_id    TEXT,
    role          TEXT NOT NULL CHECK (role IN ('user','ai')),
    type          TEXT NOT NULL CHECK (type IN
        ('text','survey','factor_list','explanation','replay_card')),
    content       TEXT NOT NULL,
    anchors_json  TEXT NOT NULL DEFAULT '[]',
    mentions_json TEXT NOT NULL DEFAULT '[]',
    created_at    INTEGER NOT NULL
);
INSERT INTO _messages_v9
    (id, topic_id, session_id, role, type, content, anchors_json, mentions_json, created_at)
    SELECT id, topic_id, session_id, role, type, content, anchors_json, mentions_json, created_at
    FROM messages;
DROP TABLE messages;
ALTER TABLE _messages_v9 RENAME TO messages;
CREATE INDEX idx_messages_topic_created ON messages(topic_id, created_at);
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

/// Schema v10 — 自动递进引擎 data layer (PRD §3.19, Sprint A).
///
///   topics              +generated_by_auto_recursion_run_id /
///                       +auto_recursion_depth / +parent_next_move_plan_id
///                       (lineage of run-spawned topics; NULL on all others)
///   next_move_plans     PM triage output per evaluated Topic — candidates /
///                       breakdowns stored as JSON TEXT like the panel tables
///   auto_recursion_runs one row per run: mode + hard caps (budget $5 /
///                       depth 4 defaults) + spend & spawned-topic accounting
///
/// No FK from topics' new columns to the new tables: runs/plans may be
/// pruned independently of the topics they spawned (mirrors edges/seeds).
const V10_SQL: &str = r#"
ALTER TABLE topics ADD COLUMN generated_by_auto_recursion_run_id TEXT NULL;
ALTER TABLE topics ADD COLUMN auto_recursion_depth INTEGER NULL;
ALTER TABLE topics ADD COLUMN parent_next_move_plan_id TEXT NULL;

CREATE TABLE next_move_plans (
    id                    TEXT PRIMARY KEY,
    topic_id              TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status                TEXT NOT NULL CHECK (status IN
        ('atomic_complete','needs_deepening','needs_real_world_data','multi_path_choice')),
    atomicity_score       REAL NOT NULL,
    whats_missing_json    TEXT NOT NULL DEFAULT '[]',
    child_candidates_json TEXT NOT NULL DEFAULT '[]',
    top_pick              TEXT NULL,
    top_pick_reasoning    TEXT NULL,
    created_at            INTEGER NOT NULL
);
CREATE INDEX idx_nmp_topic ON next_move_plans(topic_id, created_at DESC);

CREATE TABLE auto_recursion_runs (
    id                     TEXT PRIMARY KEY,
    root_topic_id          TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    mode                   TEXT NOT NULL CHECK (mode IN ('pilot','auto_step','auto_run')),
    budget_usd             REAL NOT NULL DEFAULT 5.0,
    depth_limit            INTEGER NOT NULL DEFAULT 4,
    started_at             INTEGER NOT NULL,
    ended_at               INTEGER NULL,
    status                 TEXT NOT NULL CHECK (status IN
        ('running','paused_by_user','completed',
         'budget_exhausted','depth_exhausted','hit_real_world_block')),
    total_spent_usd        REAL NOT NULL DEFAULT 0.0,
    max_depth_reached      INTEGER NOT NULL DEFAULT 0,
    spawned_topic_ids_json TEXT NOT NULL DEFAULT '[]',
    interruptions_json     TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_arr_root ON auto_recursion_runs(root_topic_id, started_at DESC);
"#;

/// Schema v11 — Attention Inbox (Lens → desktop pipeline).
///
/// The Chrome Lens extension and macOS Lens app both fire `nodx://capture?...`
/// URLs into the desktop app whenever the user clicks 🔍 (with explanation)
/// or 💾 (bare, no AI). nodx writes one `attentions` row per click, and
/// surfaces them in the Attention Inbox view where they can be tagged,
/// browsed, or "promoted" into a full Topic (which kicks off the standard
/// first-principles flow with the snippet as the seed message).
///
/// Design notes:
///   - `explanation` is nullable: 'quick' captures have no AI gloss.
///   - `tags_json` is a JSON array of strings; we keep it as TEXT instead of
///     a separate join table because cardinality is low and we'd rather
///     query/edit it from JS in one shot.
///   - `promoted_to_topic_id` is nullable & lazy-cleared: deleting the
///     promoted topic does NOT delete the attention (the snippet is still
///     useful as evidence even if the topic was dropped).
const V11_SQL: &str = r#"
CREATE TABLE attentions (
    id                    TEXT PRIMARY KEY,
    text                  TEXT NOT NULL,
    explanation           TEXT NULL,
    source_url            TEXT NOT NULL DEFAULT '',
    source_title          TEXT NOT NULL DEFAULT '',
    source_kind           TEXT NOT NULL CHECK (source_kind IN
        ('lens-chrome','lens-mac','manual')),
    kind                  TEXT NOT NULL CHECK (kind IN ('explain','quick')),
    tags_json             TEXT NOT NULL DEFAULT '[]',
    promoted_to_topic_id  TEXT NULL,
    captured_at           INTEGER NOT NULL,
    ingested_at           INTEGER NOT NULL
);
CREATE INDEX idx_attentions_ingested ON attentions(ingested_at DESC);
CREATE INDEX idx_attentions_source   ON attentions(source_kind, ingested_at DESC);
CREATE INDEX idx_attentions_promoted ON attentions(promoted_to_topic_id)
    WHERE promoted_to_topic_id IS NOT NULL;
"#;

/// Schema v12 — 素材 (Material) kind on both source tables.
///
/// Unifies the 案例库 (abstracted_cases → 方案素材) and the 灵感池
/// (attentions → 灵感素材) under one "素材" concept the network graph can
/// load as nodes. `material_kind` makes each row's material identity
/// explicit (defaults backfill every existing row). NOTE: attentions
/// already has a `kind` column with a different meaning ('explain'|'quick'),
/// so the material discriminator is a separate `material_kind` column.
const V12_SQL: &str = r#"
ALTER TABLE abstracted_cases ADD COLUMN material_kind TEXT NOT NULL DEFAULT 'solution';
ALTER TABLE attentions       ADD COLUMN material_kind TEXT NOT NULL DEFAULT 'inspiration';
"#;

/// Schema v13 — 思考 / 执行 node kind on topics.
///
/// A Topic is either a 思考 (deliberation) or 执行 (concrete action plan)
/// node. Execution nodes are split out of a thinking node's action plan via
/// 「拆出执行」. Every existing topic backfills to 'thinking'.
const V13_SQL: &str = r#"
ALTER TABLE topics ADD COLUMN node_kind TEXT NOT NULL DEFAULT 'thinking';
"#;

/// Schema v14 — image captures on attentions.
///
/// Lens can now marquee-select a region on a webpage and send the PNG bytes
/// to nodx desktop via POST /v1/capture-image. The image is written to
/// `<app_data>/media/{uuid}.png`; the attention row keeps the path (not
/// the bytes) plus a bit of metadata for display.
///
/// All four columns are optional — text-only attentions leave them NULL.
/// The `text` column is no longer NOT NULL in practice: image-only
/// captures write an empty string. SQLite has no easy way to relax
/// NOT NULL after the fact without a full table copy, so we keep the
/// NOT NULL constraint and let the DB layer coerce empty text to ''.
const V14_SQL: &str = r#"
ALTER TABLE attentions ADD COLUMN image_path   TEXT NULL;
ALTER TABLE attentions ADD COLUMN image_mime   TEXT NULL;
ALTER TABLE attentions ADD COLUMN image_width  INTEGER NULL;
ALTER TABLE attentions ADD COLUMN image_height INTEGER NULL;
CREATE INDEX idx_attentions_image ON attentions(image_path)
    WHERE image_path IS NOT NULL;
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
        Migration {
            version: 5,
            description: "relax_panel_round_number_ceiling",
            sql: V5_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "cbr_abstracted_cases_and_relations",
            sql: V6_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "topic_panel_seeds",
            sql: V7_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "replay_sessions_and_open_questions",
            sql: V8_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "allow_replay_card_message_type",
            sql: V9_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "auto_recursion_engine",
            sql: V10_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "attention_inbox",
            sql: V11_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "material_kind",
            sql: V12_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "topic_node_kind",
            sql: V13_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 14,
            description: "attentions_image_columns",
            sql: V14_SQL,
            kind: MigrationKind::Up,
        },
    ]
}
