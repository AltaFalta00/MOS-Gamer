import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

const db = new Database('games.db');

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    html TEXT NOT NULL,
    title TEXT,
    votes INTEGER NOT NULL DEFAULT 0,
    complexity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Migration: Spalten hinzufuegen falls sie fehlen
const cols = db.prepare("PRAGMA table_info(games)").all().map(c => c.name);
if (!cols.includes('title')) {
  db.exec("ALTER TABLE games ADD COLUMN title TEXT");
}
if (!cols.includes('votes')) {
  db.exec("ALTER TABLE games ADD COLUMN votes INTEGER NOT NULL DEFAULT 0");
}
if (!cols.includes('complexity')) {
  db.exec("ALTER TABLE games ADD COLUMN complexity INTEGER NOT NULL DEFAULT 0");
}
if (!cols.includes('user_rating')) {
  db.exec("ALTER TABLE games ADD COLUMN user_rating INTEGER DEFAULT NULL");
}
if (!cols.includes('tags')) {
  db.exec("ALTER TABLE games ADD COLUMN tags TEXT DEFAULT ''");
}

const insertStmt = db.prepare('INSERT INTO games (id, prompt, html, title, complexity, tags) VALUES (?, ?, ?, ?, ?, ?)');
const selectStmt = db.prepare('SELECT id, prompt, html, title, votes, complexity, user_rating, tags, created_at FROM games WHERE id = ?');
const listStmt = db.prepare('SELECT id, prompt, title, votes, complexity, user_rating, tags, created_at FROM games ORDER BY created_at DESC');
const deleteStmt = db.prepare('DELETE FROM games WHERE id = ?');
const renameStmt = db.prepare('UPDATE games SET title = ? WHERE id = ?');
const voteStmt = db.prepare('UPDATE games SET votes = votes + ? WHERE id = ?');

export function saveGame(prompt, html, title, complexity, tags) {
  const id = nanoid(10);
  insertStmt.run(id, prompt, html, title || null, complexity || 0, tags || '');
  return id;
}

export function getGame(id) {
  return selectStmt.get(id) || null;
}

export function listGames() {
  return listStmt.all();
}

export function deleteGame(id) {
  return deleteStmt.run(id).changes > 0;
}

export function renameGame(id, title) {
  return renameStmt.run(title, id).changes > 0;
}

export function voteGame(id, delta) {
  return voteStmt.run(delta, id).changes > 0;
}

const rateStmt = db.prepare('UPDATE games SET user_rating = ? WHERE id = ?');

export function rateGame(id, rating) {
  return rateStmt.run(rating, id).changes > 0;
}

// Spiele mit fehlender Komplexitaet finden und updaten
const unratedStmt = db.prepare('SELECT id, html FROM games');
const updateComplexityStmt = db.prepare('UPDATE games SET complexity = ? WHERE id = ?');

export function getUnratedGames() {
  return unratedStmt.all();
}

export function updateComplexity(id, complexity) {
  return updateComplexityStmt.run(complexity, id).changes > 0;
}

const updateTagsStmt = db.prepare('UPDATE games SET tags = ? WHERE id = ?');

export function updateTags(id, tags) {
  return updateTagsStmt.run(tags, id).changes > 0;
}

const allGamesStmt = db.prepare('SELECT id, prompt, tags FROM games');

export function getAllGamesForTagging() {
  return allGamesStmt.all();
}
