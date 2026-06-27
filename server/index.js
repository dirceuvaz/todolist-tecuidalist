const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const config = require('../config');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Token não fornecido' });

  try {
    const decoded = jwt.verify(header, config.jwtSecret);
    const user = db.getUserById(decoded.id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

const ADMIN_USERNAME = 'rtkanban';
const ADMIN_PASSWORD = 'rtkanban';
const ADMIN_NAME = 'TeSalvei';

function seedAdmin() {
  const existing = db.getUserByUsername(ADMIN_USERNAME);
  if (existing) return;

  const hashed = bcrypt.hashSync(ADMIN_PASSWORD, 10);
  db.createUser({
    id: uuidv4(),
    name: ADMIN_NAME,
    username: ADMIN_USERNAME,
    email: null,
    password: hashed,
    boardName: 'Administração',
    createdAt: Date.now()
  });
  console.log('Usuário administrador TeSalvei criado');
}

function createApp() {
  db.init(config);

  const app = express();
  app.use(express.json());

  seedAdmin();

  const rendererDir = path.join(__dirname, '..', 'renderer');
  app.use(express.static(rendererDir));

  app.get('/api/status', (req, res) => {
    res.json({ setup: !db.hasUsers(), userCount: db.userCount() });
  });

  app.post('/api/setup', async (req, res) => {
    if (db.hasUsers()) {
      return res.status(400).json({ error: 'Sistema já configurado' });
    }

    const { name, email, username, password, boardName } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 4 caracteres' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      name,
      email: email || null,
      username,
      password: hashedPassword,
      boardName: boardName || 'Meu Quadro',
      createdAt: Date.now()
    };

    db.createUser(user);

    const token = jwt.sign(
      { id: user.id, username, name, boardName: user.boardName },
      config.jwtSecret,
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: user.id, name, username, email: user.email, boardName: user.boardName } });
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha obrigatórios' });
    }

    const user = db.getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, boardName: user.boardName },
      config.jwtSecret,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, boardName: user.boardName }
    });
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json(req.user);
  });

  app.get('/api/dashboard', authMiddleware, (req, res) => {
    res.json(db.getDashboardStats(req.user.id));
  });

  app.get('/api/boards', authMiddleware, (req, res) => {
    res.json(db.getBoards(req.user.id));
  });

  app.post('/api/boards', authMiddleware, (req, res) => {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do quadro é obrigatório' });

    const board = {
      id: uuidv4(),
      name: name.trim(),
      description: (description || '').trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: req.user.id
    };

    const created = db.createBoard(board);
    res.json(created);
  });

  app.put('/api/boards/:id', authMiddleware, (req, res) => {
    const board = db.getBoardById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Quadro não encontrado' });

    const { name, description } = req.body;
    if (name !== undefined && !name.trim()) return res.status(400).json({ error: 'Nome do quadro não pode ficar vazio' });

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (description !== undefined) fields.description = description.trim();

    const updated = db.updateBoard(req.params.id, fields);
    res.json(updated);
  });

  app.delete('/api/boards/:id', authMiddleware, (req, res) => {
    const board = db.getBoardById(req.params.id);
    if (!board) return res.status(404).json({ error: 'Quadro não encontrado' });

    db.deleteBoard(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/tasks', authMiddleware, (req, res) => {
    res.json(db.getTasks(req.user.id));
  });

  app.post('/api/tasks', authMiddleware, (req, res) => {
    const { text, status, boardId, assignee, deadline, impact, priority } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Texto da tarefa é obrigatório' });

    const task = {
      id: uuidv4(),
      text: text.trim(),
      status: status || 'todo',
      boardId: boardId || null,
      assignee: assignee || '',
      deadline: deadline || null,
      impact: impact || 'baixo',
      priority: priority || 'baixa',
      archived: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: req.user.id
    };

    const created = db.createTask(task);
    res.json(created);
  });

  app.put('/api/tasks/:id', authMiddleware, (req, res) => {
    const task = db.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

    const { text, status, boardId, assignee, deadline, impact, priority, archived } = req.body;
    if (text !== undefined && !text.trim()) return res.status(400).json({ error: 'Texto da tarefa não pode ficar vazio' });

    const fields = {};
    if (text !== undefined) fields.text = text.trim();
    if (status !== undefined) {
      if (!['todo', 'doing', 'done'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
      fields.status = status;
    }
    if (boardId !== undefined) fields.boardId = boardId || null;
    if (assignee !== undefined) fields.assignee = assignee;
    if (deadline !== undefined) fields.deadline = deadline;
    if (impact !== undefined) fields.impact = impact;
    if (priority !== undefined) fields.priority = priority;
    if (archived !== undefined) fields.archived = archived;

    const updated = db.updateTask(req.params.id, fields);
    res.json(updated);
  });

  app.put('/api/tasks/:id/status', authMiddleware, (req, res) => {
    const { status } = req.body;
    if (!['todo', 'doing', 'done'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const task = db.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

    const updated = db.updateTaskStatus(req.params.id, status);
    res.json(updated);
  });

  app.delete('/api/tasks/:id', authMiddleware, (req, res) => {
    const task = db.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarefa não encontrada' });

    db.deleteTask(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/export/csv', authMiddleware, (req, res) => {
    const tasks = db.getTasks(req.user.id);
    const header = 'text,status,dataCriacao,dataAtualizacao';
    const rows = tasks.map(t => {
      const text = `"${t.text.replace(/"/g, '""')}"`;
      const date = new Date(t.createdAt).toISOString().split('T')[0];
      const updated = new Date(t.updatedAt).toISOString().split('T')[0];
      return `${text},${t.status},${date},${updated}`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=tarefas.csv');
    res.send('\uFEFF' + header + '\n' + rows.join('\n'));
  });

  app.post('/api/import/csv', authMiddleware, (req, res) => {
    const { csv, replace } = req.body;
    if (!csv) return res.status(400).json({ error: 'Nenhum dado CSV enviado' });

    try {
      const lines = csv.trim().split('\n');
      if (lines.length < 2) return res.status(400).json({ error: 'CSV vazio ou inválido' });

      if (replace) {
        db.prepare('DELETE FROM tasks WHERE createdBy = ? OR createdBy = \'\'').run(req.user.id);
      }

      const headerLine = lines[0].replace(/^\uFEFF/, '');
      const headers = parseCSVLine(headerLine);
      const textIdx = headers.findIndex(h => h.toLowerCase() === 'text');
      const statusIdx = headers.findIndex(h => h.toLowerCase() === 'status');

      if (textIdx === -1) return res.status(400).json({ error: 'Coluna "text" não encontrada no CSV' });

      const statusMap = { 'a fazer': 'todo', 'em andamento': 'doing', 'concluído': 'done', 'concluido': 'done' };
      let imported = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length <= textIdx) continue;

        const text = cols[textIdx].trim();
        if (!text) continue;

        let status = 'todo';
        if (statusIdx !== -1 && cols[statusIdx]) {
          const rawStatus = cols[statusIdx].trim().toLowerCase();
          status = statusMap[rawStatus] || rawStatus;
          if (!['todo', 'doing', 'done'].includes(status)) status = 'todo';
        }

        db.createTask({
          id: uuidv4(),
          text,
          status,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: req.user.id
        });
        imported++;
      }

      res.json({ success: true, imported });
    } catch (err) {
      res.status(400).json({ error: 'Erro ao processar CSV: ' + err.message });
    }
  });

  app.get('/api/users', (req, res) => {
    const users = db.getUsers();
    res.json(users.map(u => ({
      id: u.id, name: u.name, username: u.username,
      isAdmin: u.username === ADMIN_USERNAME
    })));
  });

  app.post('/api/register', async (req, res) => {
    const { name, username, password } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ error: 'Nome, usuário e senha são obrigatórios' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 4 caracteres' });
    }

    const existing = db.getUserByUsername(username);
    if (existing) return res.status(400).json({ error: 'Nome de usuário já existe' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      name,
      username,
      email: null,
      password: hashedPassword,
      boardName: 'Meu Quadro',
      createdAt: Date.now()
    };

    db.createUser(user);
    res.json({ success: true, user: { id: user.id, name, username } });
  });

  app.post('/api/users/:id/delete', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Senha é obrigatória' });

    const user = db.getFullUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (user.username === ADMIN_USERNAME) {
      return res.status(400).json({ error: 'Não é possível excluir o usuário administrador' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Senha incorreta' });

    if (db.userCount() <= 1) {
      return res.status(400).json({ error: 'Não pode excluir o único usuário' });
    }

    db.deleteUser(req.params.id);
    res.json({ success: true });
  });

  function adminMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'Token não fornecido' });

    try {
      const decoded = jwt.verify(header, config.jwtSecret);
      if (decoded.username !== ADMIN_USERNAME) {
        return res.status(403).json({ error: 'Acesso restrito ao administrador' });
      }
      req.user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Token inválido' });
    }
  }

  app.post('/api/admin/delete-user', adminMiddleware, (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'ID do usuário é obrigatório' });

    const user = db.getFullUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (user.username === ADMIN_USERNAME) {
      return res.status(400).json({ error: 'Não é possível excluir o administrador' });
    }

    if (db.userCount() <= 1) {
      return res.status(400).json({ error: 'Não pode excluir o único usuário' });
    }

    db.deleteUser(userId);
    res.json({ success: true });
  });

  app.post('/api/admin/reset-password', adminMiddleware, async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'ID do usuário e nova senha são obrigatórios' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Nova senha deve ter no mínimo 4 caracteres' });
    }

    const user = db.getFullUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (user.username === ADMIN_USERNAME) {
      return res.status(400).json({ error: 'Não é possível alterar a senha do administrador por este meio' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    db.updateUserPassword(userId, hashed);
    res.json({ success: true, user: { id: user.id, name: user.name, username: user.username } });
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(rendererDir, 'index.html'));
  });

  return app;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (line[i] === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

function startServer() {
  const app = createApp();
  return new Promise((resolve) => {
    let port = config.port;
    const tryListen = (p) => {
      const server = app.listen(p, () => {
        const actualPort = server.address().port;
        config.port = actualPort;
        console.log(`\n  Servidor Kanban rodando em http://localhost:${actualPort}\n`);
        resolve({ server, app, port: actualPort });
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && p < config.port + 100) {
          tryListen(p + 1);
        } else {
          console.error('Erro ao iniciar servidor:', err);
          process.exit(1);
        }
      });
    };
    tryListen(port);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = startServer;
