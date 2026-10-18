/**
 * Database Module - SQLite com Transações Atômicas e Idempotência
 * Utiliza o módulo nativo node:sqlite (ACID, WAL mode, alta performance).
 * Garante que NUNCA haja votos duplicados, totais negativos ou perda de dados.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'urna_live.sqlite');

class DatabaseManager {
  constructor() {
    this.ensureDir();
    this.db = new DatabaseSync(DB_PATH);
    this.setupPragmas();
    this.createTables();
    this.initDefaultData();
  }

  ensureDir() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  setupPragmas() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  createTables() {
    // 1. Tabela de Totais Oficiais (Única Fonte de Verdade)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS votes_summary (
        side TEXT PRIMARY KEY,
        votes INTEGER NOT NULL DEFAULT 0
      );
    `);

    // 2. Tabela de Streaks para Combos Cumulativos (Idempotência de Streaks)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS streaks (
        streak_id TEXT PRIMARY KEY,
        highest_repeat_count INTEGER NOT NULL DEFAULT 0,
        side TEXT NOT NULL,
        gift_name TEXT NOT NULL,
        is_ended INTEGER NOT NULL DEFAULT 0,
        last_updated INTEGER NOT NULL
      );
    `);
    try {
      this.db.exec('ALTER TABLE streaks ADD COLUMN is_ended INTEGER NOT NULL DEFAULT 0;');
    } catch (e) {
      // Já existe
    }

    // 3. Tabela de Eventos Processados (Chave Única contra Duplicatas)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        group_id TEXT,
        user_id TEXT,
        username TEXT NOT NULL,
        gift_name TEXT NOT NULL,
        repeat_count INTEGER NOT NULL,
        delta_votes INTEGER NOT NULL,
        side TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Tabela de Configurações Persistentes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  initDefaultData() {
    // Inicializa placar 13 e 22 se vazios
    const checkStmt = this.db.prepare('SELECT COUNT(*) as count FROM votes_summary');
    const row = checkStmt.all()[0];
    if (row.count === 0) {
      const insertStmt = this.db.prepare('INSERT INTO votes_summary (side, votes) VALUES (?, ?)');
      insertStmt.run('13', 10842);
      insertStmt.run('22', 11000);
    }
  }

  // Obter placar atual oficial
  getScores() {
    const rows = this.db.prepare('SELECT side, votes FROM votes_summary').all();
    let v13 = 0;
    let v22 = 0;

    rows.forEach(r => {
      if (r.side === '13') v13 = Number(r.votes);
      if (r.side === '22') v22 = Number(r.votes);
    });

    const total = v13 + v22;
    const pct13 = total > 0 ? Number(((v13 / total) * 100).toFixed(2)) : 50.0;
    const pct22 = total > 0 ? Number(((v22 / total) * 100).toFixed(2)) : 50.0;

    return {
      votes13: v13,
      votes22: v22,
      totalVotes: total,
      pct13,
      pct22
    };
  }

  // Reseta ou zera os placares no SQLite com transação atômica
  resetScores(v13 = 10842, v22 = 11000) {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare('UPDATE votes_summary SET votes = ? WHERE side = ?').run(v13, '13');
      this.db.prepare('UPDATE votes_summary SET votes = ? WHERE side = ?').run(v22, '22');
      // Limpa os streaks registrados para permitir novos ciclos limpos
      this.db.prepare('DELETE FROM streaks').run();
      this.db.exec('COMMIT;');
      return this.getScores();
    } catch (err) {
      this.db.exec('ROLLBACK;');
      throw err;
    }
  }

  /**
   * Processa evento de presente com estrita idempotência e transação atômica.
   * Suporta combos cumulativos do TikTok (repeatCount progressivo).
   */
  processGiftEvent({
    msgId = null,
    groupId = null,
    userId = null,
    username = 'espectador',
    giftName = 'Rosa',
    repeatCount = 1,
    repeatEnd = false,
    targetSide = '13',
    votesPerUnit = 1,
    timestamp = Date.now()
  }) {
    // Normalização dos identificadores
    const count = Math.max(1, parseInt(repeatCount, 10) || 1);
    const uName = username.startsWith('@') ? username : `@${username}`;
    const cleanSide = String(targetSide);
    const vPerUnit = Math.max(1, parseInt(votesPerUnit, 10) || 1);

    const isStreak = Boolean(groupId || count > 1 || repeatEnd);
    const streakId = groupId || `${userId || uName}_${giftName}`;
    const eventId = msgId ? String(msgId) : (isStreak ? `${streakId}_cnt${count}_${timestamp}` : `single_${uName}_${giftName}_${timestamp}_${Math.random().toString(36).substring(2, 7)}`);

    let deltaVotes = 0;
    let deltaUnits = 0;
    let isDuplicate = false;

    // Início da Transação Atômica
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      // 1. Verifica se evento já foi processado exatamente (Deduplicação por ID)
      const checkEventStmt = this.db.prepare('SELECT 1 FROM events WHERE event_id = ?');
      if (checkEventStmt.all(eventId).length > 0) {
        this.db.exec('ROLLBACK;');
        return {
          success: false,
          duplicate: true,
          reason: 'Evento já registrado anteriormente com este event_id.',
          deltaVotes: 0,
          scores: this.getScores()
        };
      }

      if (isStreak) {
        // 2. Tratamento de Streaks Cumulativos
        const checkStreakStmt = this.db.prepare('SELECT highest_repeat_count FROM streaks WHERE streak_id = ?');
        const streakRow = checkStreakStmt.all(streakId)[0];

        if (streakRow) {
          const highestSoFar = Number(streakRow.highest_repeat_count);

          if (count <= highestSoFar) {
            // Evento fora de ordem ou repeatEnd redundante já contabilizado
            this.db.exec('ROLLBACK;');
            return {
              success: false,
              duplicate: true,
              reason: `RepeatCount (${count}) menor ou igual ao já contabilizado (${highestSoFar}).`,
              deltaVotes: 0,
              scores: this.getScores()
            };
          }

          // Calcula estritamente a diferença positiva
          deltaUnits = count - highestSoFar;
          deltaVotes = deltaUnits * vPerUnit;

          // Atualiza streak para o novo maior repeatCount
          this.db.prepare('UPDATE streaks SET highest_repeat_count = ?, is_ended = ?, last_updated = ? WHERE streak_id = ?')
            .run(count, repeatEnd ? 1 : 0, timestamp, streakId);
        } else {
          // Primeiro evento deste streak
          deltaUnits = count;
          deltaVotes = deltaUnits * vPerUnit;

          this.db.prepare('INSERT INTO streaks (streak_id, highest_repeat_count, side, gift_name, is_ended, last_updated) VALUES (?, ?, ?, ?, ?, ?)')
            .run(streakId, count, cleanSide, giftName, repeatEnd ? 1 : 0, timestamp);
        }
      } else {
        // Presente avulso sem comportamento de streak: processa como evento único
        deltaUnits = 1;
        deltaVotes = vPerUnit;
      }

      // 3. Registra o evento na tabela de auditoria
      this.db.prepare(`
        INSERT INTO events (event_id, group_id, user_id, username, gift_name, repeat_count, delta_votes, side, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(eventId, groupId, userId, uName, giftName, count, deltaVotes, cleanSide, timestamp);

      // 4. Atualiza a contagem oficial na tabela de resumo
      this.db.prepare('UPDATE votes_summary SET votes = votes + ? WHERE side = ?')
        .run(deltaVotes, cleanSide);

      // Confirma transação com sucesso total
      this.db.exec('COMMIT;');
    } catch (err) {
      this.db.exec('ROLLBACK;');
      console.error('Erro na transação SQLite de votos:', err);
      throw err;
    }

    const currentScores = this.getScores();

    return {
      success: true,
      duplicate: false,
      eventId,
      streakId,
      user: uName,
      giftName,
      candidate: cleanSide,
      repeatCount: count,
      deltaUnits,
      deltaVotes,
      repeatEnd,
      scores: currentScores
    };
  }

  // Reset atômico dos votos
  resetScores(v13 = 10842, v22 = 11000) {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      this.db.prepare('UPDATE votes_summary SET votes = ? WHERE side = ?').run(v13, '13');
      this.db.prepare('UPDATE votes_summary SET votes = ? WHERE side = ?').run(v22, '22');
      this.db.prepare('DELETE FROM streaks;').run();
      this.db.prepare('DELETE FROM events;').run();
      this.db.exec('COMMIT;');
    } catch (e) {
      this.db.exec('ROLLBACK;');
      throw e;
    }
    return this.getScores();
  }

  // Salvar configuração JSON
  saveSetting(key, val) {
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, str);
  }

  getSetting(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').all(key)[0];
    if (!row) return fallback;
    try {
      return JSON.parse(row.value);
    } catch (e) {
      return row.value;
    }
  }

  // Obter histórico de eventos recentes
  getRecentEvents(limit = 25) {
    return this.db.prepare(`
      SELECT event_id, username, gift_name, delta_votes, side, repeat_count, timestamp, created_at
      FROM events
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = new DatabaseManager();
