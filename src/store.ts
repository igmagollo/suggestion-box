import { connect } from "@tursodatabase/database";
import { randomUUID } from "crypto";
import { isTrigramMode, trigramSimilarity, DEFAULT_TRIGRAM_THRESHOLD } from "./embedder.js";
import type {
  SupervisorConfig,
  Feedback,
  FeedbackStatus,
  SubmitFeedbackInput,
  SubmitFeedbackResult,
  UpvoteInput,
  ListFeedbackInput,
  FeedbackStats,
  SortBy,
} from "./types.js";

type Database = Awaited<ReturnType<typeof connect>>;

/** Turso driver truncates Float32Array to 1 byte/element. Wrap as Buffer to preserve float32 binary data. */
function vecBuf(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS feedback (
    id                          TEXT PRIMARY KEY,
    title                       TEXT,
    content                     TEXT NOT NULL,
    embedding                   BLOB,
    category                    TEXT NOT NULL,
    target_type                 TEXT NOT NULL,
    target_name                 TEXT NOT NULL,
    github_repo                 TEXT,
    status                      TEXT NOT NULL DEFAULT 'open',
    votes                       INTEGER NOT NULL DEFAULT 1,
    estimated_tokens_saved      INTEGER,
    estimated_time_saved_minutes INTEGER,
    created_at                  INTEGER NOT NULL,
    updated_at                  INTEGER NOT NULL,
    published_issue_url         TEXT,
    session_id                  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vote_log (
    id                          TEXT PRIMARY KEY,
    feedback_id                 TEXT NOT NULL,
    session_id                  TEXT NOT NULL,
    evidence                    TEXT,
    estimated_tokens_saved      INTEGER,
    estimated_time_saved_minutes INTEGER,
    created_at                  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`;

export class FeedbackStore {
  private initialized = false;

  private readonly dbPath: string;
  private readonly sessionId: string;
  private readonly embed: SupervisorConfig["embed"];
  private readonly vectorType: string;
  private readonly dedupThreshold: number;
  private readonly persistent: boolean;
  private cachedDb: Database | null = null;
  private readonly useTrigramDedup: boolean;
  private readonly trigramThreshold: number;

  constructor(config: SupervisorConfig) {
    this.dbPath = config.dbPath;
    this.sessionId = config.sessionId;
    this.embed = config.embed;
    this.vectorType = config.vectorType ?? "vector32";
    this.dedupThreshold = config.dedupThreshold ?? 0.85;
    this.persistent = config.persistent ?? false;
    this.useTrigramDedup = isTrigramMode(config.embed);
    this.trigramThreshold = DEFAULT_TRIGRAM_THRESHOLD;
  }

  /**
   * Open a new DB connection with retry logic for lock contention.
   */
  private async openConnection(): Promise<Database> {
    const maxRetries = 10;
    const baseDelay = 50;

    let db: Database;
    for (let attempt = 0; ; attempt++) {
      try {
        db = await connect(this.dbPath);
        break;
      } catch (e: any) {
        if (
          attempt >= maxRetries ||
          (!e.message?.includes("locked") && !e.message?.includes("Locking"))
        ) {
          throw e;
        }
        const delay = baseDelay * (1 + Math.random()) * Math.min(attempt + 1, 5);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    await db.exec("PRAGMA journal_mode=WAL");
    await db.exec("PRAGMA busy_timeout = 5000");
    return db;
  }

  /**
   * Get the persistent DB connection, creating it if needed.
   */
  private async getDb(): Promise<Database> {
    if (!this.cachedDb) {
      this.cachedDb = await this.openConnection();
    }
    return this.cachedDb;
  }

  /**
   * Execute a function with a DB connection.
   * In persistent mode, reuses a single long-lived connection.
   * In non-persistent mode (CLI), opens and closes per operation.
   */
  private async withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    if (this.persistent) {
      const db = await this.getDb();
      return fn(db);
    }

    const db = await this.openConnection();
    try {
      return await fn(db);
    } finally {
      db.close();
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.withDb(async (db) => {
      await db.exec(SCHEMA);
      // Migrate existing databases: add title column if missing
      try {
        await db.exec("ALTER TABLE feedback ADD COLUMN title TEXT");
      } catch {
        // Column already exists — ignore
      }
    });
    this.initialized = true;
  }

  private get vfn(): string {
    return this.vectorType;
  }

  async submitFeedback(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
    await this.init();
    const now = Math.floor(Date.now() / 1000);

    const duplicate = this.useTrigramDedup
      ? await this.findSimilarByTrigram(input.content, input.targetType, input.targetName)
      : await this.findSimilarByEmbedding(input.content, input.targetType, input.targetName);

    if (duplicate) {
      await this.withDb(async (db) => {
        await db.prepare(
          "UPDATE feedback SET votes = votes + 1, estimated_tokens_saved = COALESCE(estimated_tokens_saved, 0) + COALESCE(?, 0), estimated_time_saved_minutes = COALESCE(estimated_time_saved_minutes, 0) + COALESCE(?, 0), updated_at = ? WHERE id = ?"
        ).run(input.estimatedTokensSaved ?? null, input.estimatedTimeSavedMinutes ?? null, now, duplicate.id);

        await db.prepare(
          "INSERT INTO vote_log (id, feedback_id, session_id, evidence, estimated_tokens_saved, estimated_time_saved_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ).run(randomUUID(), duplicate.id, this.sessionId, null, input.estimatedTokensSaved ?? null, input.estimatedTimeSavedMinutes ?? null, now);
      });

      const updated = await this.getFeedbackById(duplicate.id);
      return {
        feedbackId: duplicate.id,
        isDuplicate: true,
        votes: updated?.votes ?? duplicate.votes + 1,
      };
    }

    const id = randomUUID();
    const embedding = this.useTrigramDedup ? null : await this.embed(input.content);

    await this.withDb(async (db) => {
      await db.prepare(
        `INSERT INTO feedback (id, title, content, embedding, category, target_type, target_name, github_repo, status, votes, estimated_tokens_saved, estimated_time_saved_minutes, created_at, updated_at, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, ?, ?, ?)`
      ).run(
        id, input.title ?? null, input.content, embedding ? vecBuf(embedding) : null, input.category, input.targetType,
        input.targetName, input.githubRepo ?? null,
        input.estimatedTokensSaved ?? null, input.estimatedTimeSavedMinutes ?? null,
        now, now, this.sessionId
      );

      await db.prepare(
        "INSERT INTO vote_log (id, feedback_id, session_id, estimated_tokens_saved, estimated_time_saved_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), id, this.sessionId, input.estimatedTokensSaved ?? null, input.estimatedTimeSavedMinutes ?? null, now);
    });

    return { feedbackId: id, isDuplicate: false, votes: 1 };
  }

  /** Find similar feedback using cosine distance on embeddings (HuggingFace mode). */
  private async findSimilarByEmbedding(content: string, targetType: string, targetName: string): Promise<Feedback | null> {
    const embedding = await this.embed(content);
    return this.withDb(async (db) => {
      const vfn = this.vfn;
      const rows = await db.prepare(`
        SELECT id, title, content, category, target_type, target_name, github_repo,
               status, votes, estimated_tokens_saved, estimated_time_saved_minutes,
               created_at, updated_at, published_issue_url, session_id,
               vector_distance_cos(${vfn}(embedding), ${vfn}(?)) AS distance
        FROM feedback
        WHERE embedding IS NOT NULL AND status = 'open'
          AND target_type = ? AND target_name = ?
        ORDER BY distance ASC
        LIMIT 1
      `).all(vecBuf(embedding), targetType, targetName) as any[];

      if (rows.length === 0) return null;
      const row = rows[0];
      const similarity = 1.0 - row.distance;
      if (similarity < this.dedupThreshold) return null;

      return this.rowToFeedback(row);
    });
  }

  /** Find similar feedback using trigram Jaccard similarity (lightweight fallback). */
  private async findSimilarByTrigram(content: string, targetType: string, targetName: string): Promise<Feedback | null> {
    return this.withDb(async (db) => {
      const rows = await db.prepare(`
        SELECT id, title, content, category, target_type, target_name, github_repo,
               status, votes, estimated_tokens_saved, estimated_time_saved_minutes,
               created_at, updated_at, published_issue_url, session_id
        FROM feedback
        WHERE status = 'open'
          AND target_type = ? AND target_name = ?
      `).all(targetType, targetName) as any[];

      if (rows.length === 0) return null;

      let bestRow: any = null;
      let bestSimilarity = 0;

      for (const row of rows) {
        const sim = trigramSimilarity(content, row.content);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestRow = row;
        }
      }

      if (!bestRow || bestSimilarity < this.trigramThreshold) return null;

      return this.rowToFeedback(bestRow);
    });
  }

  private rowToFeedback(row: any): Feedback {
    return {
      id: row.id,
      title: row.title ?? null,
      content: row.content,
      category: row.category,
      targetType: row.target_type,
      targetName: row.target_name,
      githubRepo: row.github_repo,
      status: row.status,
      votes: row.votes,
      estimatedTokensSaved: row.estimated_tokens_saved,
      estimatedTimeSavedMinutes: row.estimated_time_saved_minutes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedIssueUrl: row.published_issue_url,
      sessionId: row.session_id,
    };
  }

  async getFeedbackById(id: string): Promise<Feedback | null> {
    return this.withDb(async (db) => {
      const row = await db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) as any;
      if (!row) return null;
      return this.rowToFeedback(row);
    });
  }

  async upvote(input: UpvoteInput): Promise<{ votes: number }> {
    await this.init();
    const now = Math.floor(Date.now() / 1000);

    await this.withDb(async (db) => {
      await db.prepare(
        "UPDATE feedback SET votes = votes + 1, estimated_tokens_saved = COALESCE(estimated_tokens_saved, 0) + COALESCE(?, 0), estimated_time_saved_minutes = COALESCE(estimated_time_saved_minutes, 0) + COALESCE(?, 0), updated_at = ? WHERE id = ?"
      ).run(input.estimatedTokensSaved ?? null, input.estimatedTimeSavedMinutes ?? null, now, input.feedbackId);

      await db.prepare(
        "INSERT INTO vote_log (id, feedback_id, session_id, evidence, estimated_tokens_saved, estimated_time_saved_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), input.feedbackId, this.sessionId, input.evidence ?? null, input.estimatedTokensSaved ?? null, input.estimatedTimeSavedMinutes ?? null, now);
    });

    const feedback = await this.getFeedbackById(input.feedbackId);
    return { votes: feedback?.votes ?? 0 };
  }

  async dismiss(feedbackId: string): Promise<boolean> {
    await this.init();
    const now = Math.floor(Date.now() / 1000);
    return this.withDb(async (db) => {
      const result = await db.prepare(
        "UPDATE feedback SET status = 'dismissed', updated_at = ? WHERE id = ? AND status = 'open'"
      ).run(now, feedbackId);
      return result.changes > 0;
    });
  }

  async markPublished(feedbackId: string, issueUrl: string): Promise<boolean> {
    await this.init();
    const now = Math.floor(Date.now() / 1000);
    return this.withDb(async (db) => {
      const result = await db.prepare(
        "UPDATE feedback SET status = 'published', published_issue_url = ?, updated_at = ? WHERE id = ?"
      ).run(issueUrl, now, feedbackId);
      return result.changes > 0;
    });
  }

  async listFeedback(input: ListFeedbackInput = {}): Promise<Feedback[]> {
    await this.init();
    return this.withDb(async (db) => {
      const conditions: string[] = [];
      const params: any[] = [];

      if (input.category) {
        conditions.push("category = ?");
        params.push(input.category);
      }
      if (input.targetType) {
        conditions.push("target_type = ?");
        params.push(input.targetType);
      }
      if (input.targetName) {
        conditions.push("target_name = ?");
        params.push(input.targetName);
      }
      if (input.status) {
        conditions.push("status = ?");
        params.push(input.status);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      const sortMap: Record<SortBy, string> = {
        votes: "votes DESC",
        recent: "created_at DESC",
        impact: "COALESCE(estimated_tokens_saved, 0) + COALESCE(estimated_time_saved_minutes, 0) * 1000 DESC",
      };
      const orderBy = sortMap[input.sortBy ?? "votes"];
      const limit = input.limit ?? 20;

      params.push(limit);

      const rows = await db.prepare(
        `SELECT * FROM feedback ${where} ORDER BY ${orderBy} LIMIT ?`
      ).all(...params) as any[];

      return rows.map((r: any) => this.rowToFeedback(r));
    });
  }

  async getStats(): Promise<FeedbackStats> {
    await this.init();
    return this.withDb(async (db) => {
      const total = (await db.prepare("SELECT COUNT(*) as c FROM feedback").get() as any).c;

      const catRows = await db.prepare(
        "SELECT category, COUNT(*) as c FROM feedback GROUP BY category"
      ).all() as any[];
      const byCategory: Record<string, number> = {};
      for (const r of catRows) byCategory[r.category] = r.c;

      const statusRows = await db.prepare(
        "SELECT status, COUNT(*) as c FROM feedback GROUP BY status"
      ).all() as any[];
      const byStatus: Record<string, number> = {};
      for (const r of statusRows) byStatus[r.status] = r.c;

      const topRows = await db.prepare(
        "SELECT * FROM feedback WHERE status = 'open' ORDER BY votes DESC LIMIT 5"
      ).all() as any[];
      const topVoted = topRows.map((r: any) => this.rowToFeedback(r));

      const totals = await db.prepare(
        "SELECT COALESCE(SUM(estimated_tokens_saved), 0) as tokens, COALESCE(SUM(estimated_time_saved_minutes), 0) as minutes FROM feedback"
      ).get() as any;

      return {
        total,
        byCategory,
        byStatus,
        topVoted,
        totalEstimatedTokensSaved: totals.tokens,
        totalEstimatedTimeSavedMinutes: totals.minutes,
      };
    });
  }

  async getVoteLog(feedbackId: string): Promise<Array<{ evidence: string | null; estimatedTokensSaved: number | null; estimatedTimeSavedMinutes: number | null; sessionId: string; createdAt: number }>> {
    await this.init();
    return this.withDb(async (db) => {
      const rows = await db.prepare(
        "SELECT session_id, evidence, estimated_tokens_saved, estimated_time_saved_minutes, created_at FROM vote_log WHERE feedback_id = ? ORDER BY created_at DESC"
      ).all(feedbackId) as any[];
      return rows.map((r: any) => ({
        sessionId: r.session_id,
        evidence: r.evidence,
        estimatedTokensSaved: r.estimated_tokens_saved,
        estimatedTimeSavedMinutes: r.estimated_time_saved_minutes,
        createdAt: r.created_at,
      }));
    });
  }

  async embedPending(): Promise<number> {
    // In trigram mode, embeddings are not used — nothing to backfill
    if (this.useTrigramDedup) return 0;

    await this.init();
    const rows = await this.withDb(async (db) => {
      return await db.prepare(
        "SELECT id, content FROM feedback WHERE embedding IS NULL"
      ).all() as any[];
    });

    if (rows.length === 0) return 0;

    const embedded: Array<{ id: string; embedding: Buffer }> = [];
    for (const row of rows) {
      const vec = await this.embed(row.content);
      embedded.push({ id: row.id, embedding: vecBuf(vec) });
    }

    await this.withDb(async (db) => {
      for (const e of embedded) {
        await db.prepare("UPDATE feedback SET embedding = ? WHERE id = ?").run(e.embedding, e.id);
      }
    });

    return rows.length;
  }

  async purge(): Promise<number> {
    await this.init();
    return this.withDb(async (db) => {
      const result = await db.prepare("DELETE FROM feedback WHERE status = 'dismissed'").run();
      return result.changes;
    });
  }

  async close(): Promise<void> {
    if (this.cachedDb) {
      this.cachedDb.close();
      this.cachedDb = null;
    }
    this.initialized = false;
  }
}
