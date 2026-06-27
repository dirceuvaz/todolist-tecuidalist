const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

function init(config) {
  if (db) return db;

  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true });
  }

  const dbPath = path.join(config.dataDir, 'kanban.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const hasOldSchema = db.prepare("SELECT name FROM pragma_table_info('users') WHERE name = 'role'").get();
  if (hasOldSchema) {
    db.exec('DROP TABLE IF EXISTS tasks');
    db.exec('DROP TABLE IF EXISTS users');
    console.log('Migração: schema antigo removido');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      boardName TEXT NOT NULL DEFAULT 'Meu Quadro',
      createdAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  `);

  migrateColumns('tasks', [
    ['boardId', 'TEXT'],
    ['assignee', 'TEXT DEFAULT \'\''],
    ['deadline', 'INTEGER'],
    ['impact', 'TEXT DEFAULT \'baixo\''],
    ['priority', 'TEXT DEFAULT \'baixa\''],
    ['archived', 'INTEGER DEFAULT 0'],
    ['createdBy', 'TEXT DEFAULT \'\'']
  ]);

  migrateColumns('boards', [
    ['createdBy', 'TEXT DEFAULT \'\'']
  ]);

  createIndexSafe('idx_tasks_boardId', 'tasks', 'boardId');
  createIndexSafe('idx_tasks_archived', 'tasks', 'archived');
  createIndexSafe('idx_tasks_createdBy', 'tasks', 'createdBy');
  createIndexSafe('idx_boards_createdBy', 'boards', 'createdBy');

  return db;
}

function migrateColumns(table, columns) {
  for (const [col, def] of columns) {
    try {
      const exists = db.prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name = ?`).get(col);
      if (!exists) {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`).run();
      }
    } catch (e) {
      console.log(`Migração coluna ${table}.${col}: ${e.message}`);
    }
  }
}

function createIndexSafe(indexName, table, column) {
  try {
    const colExists = db.prepare(`SELECT name FROM pragma_table_info('${table}') WHERE name = ?`).get(column);
    if (colExists) {
      db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${table}(${column})`);
    }
  } catch (e) {
    console.log(`Índice ${indexName}: ${e.message}`);
  }
}

function close() {
  if (db) { db.close(); db = null; }
}

function hasUsers() {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return row.count > 0;
}

function userCount() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserById(id) {
  return db.prepare('SELECT id, name, email, username, boardName, createdAt FROM users WHERE id = ?').get(id);
}

function getFullUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUsers() {
  return db.prepare('SELECT id, name, username, boardName, createdAt FROM users ORDER BY createdAt ASC').all();
}

function updateUser(id, fields) {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values = Object.values(fields);
  db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...values, id);
  return getUserById(id);
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function updateUserPassword(id, hashedPassword) {
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, id);
  return getUserById(id);
}

function createUser(user) {
  db.prepare(`
    INSERT INTO users (id, name, email, username, password, boardName, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.name, user.email, user.username, user.password, user.boardName, user.createdAt);
  return getUserById(user.id);
}

function getBoards(userId) {
  return db.prepare('SELECT * FROM boards WHERE createdBy = ? OR createdBy = \'\' ORDER BY createdAt ASC').all(userId);
}

function getBoardById(id) {
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
}

function createBoard(board) {
  db.prepare(`
    INSERT INTO boards (id, name, description, createdAt, updatedAt, createdBy)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(board.id, board.name, board.description, board.createdAt, board.updatedAt, board.createdBy || '');
  return getBoardById(board.id);
}

function updateBoard(id, fields) {
  const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
  const values = Object.values(fields);
  db.prepare(`UPDATE boards SET ${sets}, updatedAt = ? WHERE id = ?`).run(...values, Date.now(), id);
  return getBoardById(id);
}

function deleteBoard(id) {
  db.prepare('UPDATE tasks SET boardId = NULL WHERE boardId = ?').run(id);
  db.prepare('DELETE FROM boards WHERE id = ?').run(id);
}

function getTasks(userId) {
  return db.prepare('SELECT * FROM tasks WHERE createdBy = ? OR createdBy = \'\' ORDER BY createdAt ASC').all(userId);
}

function getTaskById(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function createTask(task) {
  db.prepare(`
    INSERT INTO tasks (id, text, status, boardId, assignee, deadline, impact, priority, archived, createdAt, updatedAt, createdBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id, task.text, task.status,
    task.boardId || null, task.assignee || '', task.deadline || null,
    task.impact || 'baixo', task.priority || 'baixa', task.archived ? 1 : 0,
    task.createdAt, task.updatedAt, task.createdBy || ''
  );
  return getTaskById(task.id);
}

function updateTask(id, fields) {
  const allowed = ['text', 'status', 'boardId', 'assignee', 'deadline', 'impact', 'priority', 'archived'];
  const sets = [];
  const values = [];
  for (const k of allowed) {
    if (k in fields) {
      sets.push(`${k} = ?`);
      values.push(k === 'archived' ? (fields[k] ? 1 : 0) : fields[k]);
    }
  }
  if (sets.length === 0) return getTaskById(id);
  sets.push('updatedAt = ?');
  values.push(Date.now());
  values.push(id);
  db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getTaskById(id);
}

function updateTaskStatus(id, status) {
  db.prepare('UPDATE tasks SET status = ?, updatedAt = ? WHERE id = ?').run(status, Date.now(), id);
  return getTaskById(id);
}

function getDashboardStats(userId) {
  const taskFilter = '(t.createdBy = ? OR t.createdBy = \'\') AND t.archived = 0';
  const totalTasks = db.prepare(`SELECT COUNT(*) as c FROM tasks WHERE (createdBy = ? OR createdBy = '') AND archived = 0`).get(userId).c;
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as c FROM tasks WHERE (createdBy = ? OR createdBy = '') AND archived = 0 GROUP BY status
  `).all(userId);
  const byBoard = db.prepare(`
    SELECT b.id, b.name,
      COUNT(t.id) as total,
      SUM(CASE WHEN t.status = 'todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN t.status = 'doing' THEN 1 ELSE 0 END) as doing,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done
    FROM boards b
    LEFT JOIN tasks t ON t.boardId = b.id AND ${taskFilter}
    WHERE b.createdBy = ? OR b.createdBy = ''
    GROUP BY b.id
    ORDER BY b.name
  `).all(userId, userId);

  let worstBoard = null;
  let worstRatio = -1;
  for (const b of byBoard) {
    const total = b.total || 0;
    if (total === 0) continue;
    const done = b.done || 0;
    const ratio = total > 0 ? (total - done) / total : 0;
    if (ratio > worstRatio) {
      worstRatio = ratio;
      worstBoard = b;
    }
  }

  return { totalTasks, byStatus, byBoard, worstBoard };
}

function deleteTask(id) {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

function deleteAllTasks() {
  db.prepare('DELETE FROM tasks').run();
}

module.exports = {
  init, close, hasUsers, userCount,
  getUsers, getUserByUsername, getUserById, getFullUserById, createUser, updateUser, deleteUser, updateUserPassword,
  getBoards, getBoardById, createBoard, updateBoard, deleteBoard,
  getTasks, getTaskById, createTask, updateTask, updateTaskStatus, deleteTask, deleteAllTasks,
  getDashboardStats
};
