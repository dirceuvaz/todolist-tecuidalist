const API = '/api';
let currentUser = null;
let tasks = [];
let editingTaskId = null;
let editingBoardId = null;
let boards = [];
let currentBoardId = null;
let showArchived = false;

function getToken() { return localStorage.getItem('tecuidalist_token'); }
function setToken(t) { localStorage.setItem('tecuidalist_token', t); }
function delToken() { localStorage.removeItem('tecuidalist_token'); }

function getTheme() { return localStorage.getItem('tecuidalist_theme') || 'dark'; }
function setTheme(t) { localStorage.setItem('tecuidalist_theme', t); }

function applyTheme() {
  document.body.classList.toggle('light', getTheme() === 'light');
}

function toggleTheme() {
  const t = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(t);
  applyTheme();
}

async function api(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = token;

  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

const IS_ADMIN = () => currentUser && currentUser.username === 'rtkanban';

applyTheme();

async function init() {
  const status = await api('/status');

  if (status.setup) {
    showView('setup');
    return;
  }

  if (status.userCount > 1) {
    showView('users');
    return;
  }

  const token = getToken();
  if (token) {
    try {
      currentUser = await api('/auth/me');
      document.getElementById('boardTitle').textContent = currentUser.boardName || 'Te Cuida List';
      document.getElementById('userDisplay').textContent = currentUser.name;
      document.getElementById('loginSubtitle').textContent = `Bem-vindo de volta, ${currentUser.name}!`;
      if (IS_ADMIN()) {
        showView('users');
      } else {
        showDash();
      }
      return;
    } catch {
      delToken();
    }
  }

  showLanding();
}

function showLanding() {
  showView('landing');
}

function startApp() {
  const token = getToken();
  if (token) {
    api('/auth/me').then(user => {
      currentUser = user;
      document.getElementById('boardTitle').textContent = user.boardName || 'Te Cuida List';
      document.getElementById('userDisplay').textContent = user.name;
      document.getElementById('loginSubtitle').textContent = `Bem-vindo de volta, ${user.name}!`;
      if (user.username === 'rtkanban') {
        showView('users');
      } else {
        showDash();
      }
    }).catch(() => {
      delToken();
      showView('login');
    });
  } else {
    showView('login');
  }
}

function showView(view) {
  ['setup', 'login', 'users', 'dashboard', 'boards', 'app', 'landing'].forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.style.display = v === view ? '' : 'none';
  });
  if (view === 'users') loadUsers();
}

function showDash() {
  currentBoardId = null;
  showView('dashboard');
  document.getElementById('dashTitle').textContent = currentUser.boardName || 'Te Cuida List';
  document.getElementById('dashUserDisplay').textContent = currentUser.name;
  loadDashboard();
}

document.getElementById('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('setupError');
  errorEl.textContent = '';

  const name = document.getElementById('setupName').value.trim();
  const username = document.getElementById('setupUsername').value.trim();
  const email = document.getElementById('setupEmail').value.trim();
  const password = document.getElementById('setupPass').value;
  const boardName = document.getElementById('setupBoard').value.trim() || 'Meu Quadro';

  if (!name || !username || !password) {
    errorEl.textContent = 'Preencha todos os campos obrigatórios';
    return;
  }

  try {
    const data = await api('/setup', {
      method: 'POST',
      body: JSON.stringify({ name, username, email, password, boardName })
    });
    setToken(data.token);
    currentUser = data.user;
    document.getElementById('boardTitle').textContent = boardName;
    document.getElementById('userDisplay').textContent = name;
    showView('app');
    await loadBoard();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  try {
    const data = await api('/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setToken(data.token);
    currentUser = data.user;
    document.getElementById('boardTitle').textContent = currentUser.boardName || 'Te Cuida List';
    document.getElementById('userDisplay').textContent = currentUser.name;
    document.getElementById('loginSubtitle').textContent = `Bem-vindo de volta, ${currentUser.name}!`;

    if (IS_ADMIN()) {
      showView('users');
    } else {
      showDash();
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* ---------- DASHBOARD ---------- */
function maybeRefreshDashboard() {
  const dashView = document.getElementById('view-dashboard');
  if (dashView && dashView.style.display !== 'none') {
    loadDashboard();
  }
}

async function loadDashboard() {
  try {
    const stats = await api('/dashboard');
    const boardsData = await api('/boards');
    boards = boardsData;
    renderDashboard(stats);
  } catch (err) {
    console.error(err);
  }
}

function renderDashboard(stats) {
  const todo = (stats.byStatus.find(s => s.status === 'todo') || {}).c || 0;
  const doing = (stats.byStatus.find(s => s.status === 'doing') || {}).c || 0;
  const done = (stats.byStatus.find(s => s.status === 'done') || {}).c || 0;

  document.getElementById('dashboardStats').innerHTML = `
    <div class="stat-card stat-total">
      <div class="stat-value">${stats.totalTasks}</div>
      <div class="stat-label">Total de Tarefas</div>
    </div>
    <div class="stat-card stat-todo">
      <div class="stat-value">${todo}</div>
      <div class="stat-label">A Fazer</div>
    </div>
    <div class="stat-card stat-doing">
      <div class="stat-value">${doing}</div>
      <div class="stat-label">Em Andamento</div>
    </div>
    <div class="stat-card stat-done">
      <div class="stat-value">${done}</div>
      <div class="stat-label">Concluído</div>
    </div>
  `;

  const worstHtml = stats.worstBoard
    ? `<div class="dashboard-worst"><h3>&#9888; Quadro com pior desempenho</h3><p><strong>${escapeHtml(stats.worstBoard.name)}</strong> — ${stats.worstBoard.todo + stats.worstBoard.doing} tarefas pendentes de ${stats.worstBoard.total} total</p></div>`
    : '';

  document.getElementById('dashboardBoards').innerHTML = worstHtml + `
    <h3>Quadros (${stats.byBoard.length})</h3>
    <div class="dashboard-boards-grid">
    ${stats.byBoard.map(b => {
      const total = b.total || 0;
      const t = b.todo || 0;
      const dg = b.doing || 0;
      const dn = b.done || 0;
      const todoPct = total > 0 ? (t / total * 100) : 0;
      const doingPct = total > 0 ? (dg / total * 100) : 0;
      const donePct = total > 0 ? (dn / total * 100) : 0;
      return `<div class="board-summary">
        <div class="board-name">${escapeHtml(b.name)}</div>
        <div class="board-bar">
          <div class="bar-todo" style="width:${todoPct}%"></div>
          <div class="bar-doing" style="width:${doingPct}%"></div>
          <div class="bar-done" style="width:${donePct}%"></div>
        </div>
        <div class="board-counts">
          <span>A Fazer: ${t}</span>
          <span>Em Andamento: ${dg}</span>
          <span>Concluído: ${dn}</span>
          <span>Total: ${total}</span>
        </div>
      </div>`;
    }).join('')}
    </div>
  `;
}

/* ---------- BOARD MANAGER ---------- */
function showBoardManager() {
  showView('boards');
  loadBoardList();
}

async function loadBoardList() {
  try {
    const data = await api('/boards');
    boards = data;
    const list = document.getElementById('boardsList');
    if (data.length === 0) {
      list.innerHTML = '<div class="empty-state">Nenhum quadro criado ainda</div>';
      return;
    }
    list.innerHTML = data.map(b => `
      <div class="board-manager-item">
        <div class="board-info">
          <div class="board-mgr-name">${escapeHtml(b.name)}</div>
          ${b.description ? `<div class="board-mgr-desc">${escapeHtml(b.description)}</div>` : ''}
        </div>
        <div class="board-mgr-actions">
          <button class="btn btn-small" onclick="editBoard('${b.id}')">Editar</button>
          <button class="btn btn-small btn-danger" onclick="deleteBoard('${b.id}')">Excluir</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

function showCreateBoardModal() {
  closeAllModals();
  editingBoardId = null;
  document.getElementById('boardModalTitle').textContent = 'Novo Quadro';
  document.getElementById('boardInput').value = '';
  document.getElementById('boardDescInput').value = '';
  document.getElementById('boardModalError').textContent = '';
  document.getElementById('boardModalSaveBtn').textContent = 'Salvar';
  document.getElementById('boardModalOverlay').classList.add('active');
  requestAnimationFrame(() => {
    const inp = document.getElementById('boardInput');
    if (inp) inp.focus();
  });
}

function editBoard(id) {
  const board = boards.find(b => b.id === id);
  if (!board) return;
  closeAllModals();
  editingBoardId = id;
  document.getElementById('boardModalTitle').textContent = 'Editar Quadro';
  document.getElementById('boardInput').value = board.name;
  document.getElementById('boardDescInput').value = board.description || '';
  document.getElementById('boardModalError').textContent = '';
  document.getElementById('boardModalSaveBtn').textContent = 'Atualizar';
  document.getElementById('boardModalOverlay').classList.add('active');
  requestAnimationFrame(() => {
    const inp = document.getElementById('boardInput');
    if (inp) inp.focus();
  });
}

function closeAllModals() {
  ['taskModalOverlay', 'boardModalOverlay', 'passwordModalOverlay', 'moverModalOverlay', 'confirmModalOverlay', 'boardSelectOverlay'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
}

function closeBoardModal() {
  document.getElementById('boardModalOverlay').classList.remove('active');
  editingBoardId = null;
}

async function saveBoard() {
  const name = document.getElementById('boardInput').value.trim();
  const description = document.getElementById('boardDescInput').value.trim();
  const errorEl = document.getElementById('boardModalError');
  errorEl.textContent = '';

  if (!name) {
    errorEl.textContent = 'Nome do quadro é obrigatório';
    return;
  }

  try {
    if (editingBoardId) {
      await api(`/boards/${editingBoardId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description })
      });
    } else {
      await api('/boards', {
        method: 'POST',
        body: JSON.stringify({ name, description })
      });
    }
    closeBoardModal();
    await loadBoardList();
    await loadBoardSelector();
    maybeRefreshDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function deleteBoard(id) {
  showConfirm('Excluir este quadro? As tarefas associadas perderão o vínculo.', async () => {
    try {
      await api(`/boards/${id}`, { method: 'DELETE' });
      await loadBoardList();
      await loadBoardSelector();
      maybeRefreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  });
}

document.getElementById('boardModalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeBoardModal();
});

function showBoardSelector(callback) {
  closeAllModals();
  const list = document.getElementById('boardSelectList');
  if (boards.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--text2);padding:12px 0">Nenhum quadro disponível. Crie um quadro primeiro.</p>';
  } else {
    list.innerHTML = boards.map(b => `
      <button class="btn btn-full" style="text-align:left" onclick="selectBoard('${b.id}')">${escapeHtml(b.name)}</button>
    `).join('');
  }
  document.getElementById('boardSelectOverlay').classList.add('active');
  window._boardSelectCallback = callback || null;
}

function selectBoard(boardId) {
  const cb = window._boardSelectCallback;
  window._boardSelectCallback = null;
  closeBoardSelect();
  if (cb) cb(boardId);
}

function closeBoardSelect() {
  document.getElementById('boardSelectOverlay').classList.remove('active');
  window._boardSelectCallback = null;
}

document.getElementById('boardSelectOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeBoardSelect();
});

async function loadBoardSelector() {
  try {
    const data = await api('/boards');
    boards = data;
    const sel = document.getElementById('taskBoard');
    sel.innerHTML = '<option value="">Sem quadro</option>' +
      data.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    if (currentBoardId) sel.value = currentBoardId;
  } catch (err) {
    console.error(err);
  }
}

function switchToBoard(boardId) {
  showKanban(boardId);
}

async function showKanban(boardId) {
  try {
    boards = await api('/boards');
  } catch (_) {}
  currentBoardId = boardId || null;
  const board = boards.find(b => b.id === boardId);
  document.getElementById('boardTitle').textContent = board ? board.name : 'Quadro Kanban';
  showView('app');
  await loadBoard();
}

/* ---------- KANBAN BOARD ---------- */
async function loadBoard() {
  try {
    const allTasks = await api('/tasks');
    tasks = currentBoardId ? allTasks.filter(t => t.boardId === currentBoardId) : allTasks;
    renderBoard();
  } catch (err) {
    console.error(err);
  }
}

function renderBoard() {
  const statuses = ['todo', 'doing', 'done'];
  const containers = {
    todo: document.getElementById('container-todo'),
    doing: document.getElementById('container-doing'),
    done: document.getElementById('container-done')
  };

  document.getElementById('btnToggleArchived').textContent = showArchived ? 'Voltar' : 'Tarefas Arquivadas';

  statuses.forEach(s => {
    const container = containers[s];
    const allCards = tasks.filter(t => t.status === s && (showArchived ? t.archived : !t.archived));
    const filterEl = document.getElementById(`search-${s}`);
    const filterText = filterEl ? filterEl.value.toLowerCase() : '';
    const cards = filterText ? allCards.filter(t => t.text.toLowerCase().includes(filterText)) : allCards;

    document.getElementById(`count-${s}`).textContent = cards.length;

    if (cards.length === 0) {
      container.innerHTML = `<div class="empty-state">${allCards.length === 0 ? (showArchived ? 'Nenhuma tarefa arquivada' : 'Nenhuma tarefa aqui') : 'Nenhuma tarefa encontrada pelo filtro'}</div>`;
      return;
    }

    container.innerHTML = cards.map((t, idx) => {
      const boardName = t.boardId ? (boards.find(b => b.id === t.boardId) || {}).name || '' : '';
      const impactTag = t.impact && t.impact !== 'baixo' ? `<span class="tag tag-impact-${t.impact}">${t.impact}</span>` : '';
      const priorityTag = t.priority ? `<span class="tag tag-priority-${t.priority}">${t.priority}</span>` : '';
      const assigneeText = t.assignee ? `<span>&#9993; ${escapeHtml(t.assignee)}</span>` : '';
      const deadlineText = t.deadline ? `<span>&#128197; ${formatDate(t.deadline)}</span>` : '';
      const boardTag = boardName ? `<span class="card-board-name">${escapeHtml(boardName)}</span>` : '';
      const archivedClass = t.archived ? ' archived' : '';

      const actions = t.archived
        ? `<button class="btn btn-small" onclick="restoreTask('${t.id}')">Restaurar</button>
           <button class="btn btn-small btn-danger" onclick="deleteTask('${t.id}')">Excluir</button>`
        : `<button class="btn btn-small" onclick="editTask('${t.id}')">Editar</button>
           <button class="btn btn-small" onclick="showMoverModal('${t.id}')">Mover</button>
           <button class="btn btn-small" onclick="archiveTask('${t.id}')">Arquivar</button>
           <button class="btn btn-small btn-danger" onclick="deleteTask('${t.id}')">Excluir</button>`;

      return `
      <div class="card priority-${t.priority}${archivedClass}"
           data-id="${t.id}">
        <div class="card-row">
          <div class="card-handle" draggable="true" ondragstart="dragStart(event, '${t.id}')" title="Arrastar para mover">
            <span class="drag-icon">&#x2807;</span>
          </div>
          <div class="card-body">
            <div class="card-text"><span class="card-number">${idx + 1}.</span>${escapeHtml(t.text)}</div>
            <div class="card-meta">
              ${impactTag} ${priorityTag} ${assigneeText} ${deadlineText} ${boardTag}
              ${t.archived ? '<span class="archived-badge">Arquivada</span>' : ''}
            </div>
          </div>
        </div>
        <div class="card-actions">
          ${actions}
        </div>
      </div>`;
    }).join('');
  });
}

function toggleArchived() {
  showArchived = !showArchived;
  renderBoard();
}

async function restoreTask(id) {
  try {
    await api(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ archived: false })
    });
    await loadBoard();
    maybeRefreshDashboard();
  } catch (err) {
    alert(err.message);
  }
}

function filterColumn(status) {
  const filterEl = document.getElementById(`search-${status}`);
  if (filterEl) renderBoard();
}

function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('pt-BR');
}

function formatDateTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('pt-BR');
}

function toDatetimeLocal(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function allowDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function dragStart(e, id) {
  e.dataTransfer.setData('text/plain', id);
  e.currentTarget.classList.add('dragging');
}

async function drop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const id = e.dataTransfer.getData('text/plain');
  const container = e.currentTarget;
  const column = container.closest('.column');
  const newStatus = column.dataset.status;

  const task = tasks.find(t => t.id === id);
  if (!task || task.status === newStatus) return;

  try {
    await api(`/tasks/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    await loadBoard();
  } catch (err) {
    alert(err.message);
  }
}

document.addEventListener('dragend', () => {
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
});

document.getElementById('btnNovaTarefa').addEventListener('click', async () => {
  await loadBoardSelector();
  openTaskModal();
});

document.getElementById('statusSelector').addEventListener('click', (e) => {
  const btn = e.target.closest('.status-opt');
  if (!btn) return;
  document.querySelectorAll('.status-opt').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');
});

function openTaskModal(task) {
  closeAllModals();
  editingTaskId = null;
  document.getElementById('taskModalTitle').textContent = task ? 'Editar Tarefa' : 'Nova Tarefa';
  document.getElementById('taskInput').value = task ? task.text : '';
  document.getElementById('modalSaveBtn').textContent = task ? 'Atualizar' : 'Salvar';

  document.getElementById('taskAssignee').value = task ? (task.assignee || '') : '';
  document.getElementById('taskDeadline').value = task ? toDatetimeLocal(task.deadline) : '';
  document.getElementById('taskImpact').value = task ? (task.impact || 'baixo') : 'baixo';
  document.getElementById('taskPriority').value = task ? (task.priority || 'baixa') : 'baixa';
  document.getElementById('taskBoard').value = task ? (task.boardId || '') : (currentBoardId || '');

  const status = task ? task.status : 'todo';
  document.querySelectorAll('.status-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.status === status);
  });

  document.getElementById('taskModalOverlay').classList.add('active');
  requestAnimationFrame(() => {
    const inp = document.getElementById('taskInput');
    if (inp) inp.focus();
  });

  if (task) editingTaskId = task.id;
}

function closeTaskModal() {
  document.getElementById('taskModalOverlay').classList.remove('active');
  document.getElementById('taskInput').value = '';
  editingTaskId = null;
}

function getSelectedStatus() {
  const active = document.querySelector('.status-opt.active');
  return active ? active.dataset.status : 'todo';
}

async function saveTask() {
  const text = document.getElementById('taskInput').value.trim();
  if (!text) return;

  const payload = {
    text,
    status: getSelectedStatus(),
    assignee: document.getElementById('taskAssignee').value.trim(),
    deadline: document.getElementById('taskDeadline').value
      ? new Date(document.getElementById('taskDeadline').value).getTime()
      : null,
    impact: document.getElementById('taskImpact').value,
    priority: document.getElementById('taskPriority').value,
    boardId: document.getElementById('taskBoard').value || null
  };

  try {
    if (editingTaskId) {
      await api(`/tasks/${editingTaskId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await api('/tasks', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }
    closeTaskModal();
    await loadBoard();
    maybeRefreshDashboard();
  } catch (err) {
    alert(err.message);
  }
}

async function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  await loadBoardSelector();
  openTaskModal(task);
}

async function archiveTask(id) {
  try {
    await api(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ archived: true })
    });
    await loadBoard();
    maybeRefreshDashboard();
  } catch (err) {
    alert(err.message);
  }
}

function deleteTask(id) {
  showConfirm('Excluir esta tarefa permanentemente?', async () => {
    try {
      await api(`/tasks/${id}`, { method: 'DELETE' });
      await loadBoard();
      maybeRefreshDashboard();
    } catch (err) {
      alert(err.message);
    }
  });
}

let moveTaskId = null;

async function showMoverModal(taskId) {
  closeAllModals();
  moveTaskId = taskId;
  document.getElementById('moverModalError').textContent = '';
  const sel = document.getElementById('moverBoardSelect');
  try {
    const data = await api('/boards');
    sel.innerHTML = '<option value="">Sem quadro</option>' +
      data.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('');
    const task = tasks.find(t => t.id === taskId);
    if (task && task.boardId) sel.value = task.boardId;
    document.getElementById('moverModalOverlay').classList.add('active');
  } catch (err) {
    document.getElementById('moverModalError').textContent = err.message;
  }
}

function closeMoverModal() {
  document.getElementById('moverModalOverlay').classList.remove('active');
  moveTaskId = null;
}

async function confirmMoveTask() {
  if (!moveTaskId) return;
  const boardId = document.getElementById('moverBoardSelect').value || null;
  try {
    await api(`/tasks/${moveTaskId}`, {
      method: 'PUT',
      body: JSON.stringify({ boardId })
    });
    closeMoverModal();
    await loadBoard();
    maybeRefreshDashboard();
  } catch (err) {
    document.getElementById('moverModalError').textContent = err.message;
  }
}

document.getElementById('moverModalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeMoverModal();
});

document.getElementById('taskModalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeTaskModal();
});

document.getElementById('taskInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) saveTask();
  if (e.key === 'Esc') closeTaskModal();
});

async function exportCSV() {
  try {
    const blob = await fetch(`${API}/export/csv`, {
      headers: { 'Authorization': getToken() }
    }).then(r => r.blob());

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tarefas.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Erro ao exportar: ' + err.message);
  }
}

async function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const csv = await file.text();

  showConfirm('Deseja SUBSTITUIR todas as tarefas atuais?\n\n"Confirmar" = substituir | "Cancelar" = adicionar ao final', async () => {
    await doImport(csv, true);
  }, async () => {
    await doImport(csv, false);
  });

  async function doImport(csv, replace) {
    try {
      const data = await api('/import/csv', {
        method: 'POST',
        body: JSON.stringify({ csv, replace })
      });
      alert(`${data.imported} tarefas importadas com sucesso!`);
      await loadBoard();
      maybeRefreshDashboard();
    } catch (err) {
      alert('Erro ao importar: ' + err.message);
    }
    event.target.value = '';
  }
}

/* ---------- USER SWITCH ---------- */
function switchUser() {
  showView('users');
}

function backFromUsers() {
  currentBoardId = null;
  if (getToken() && !IS_ADMIN()) {
    showDash();
  } else {
    showLanding();
  }
}

async function loadUsers() {
  try {
    const users = await api('/users');
    const list = document.getElementById('usersList');
    const isAdmin = IS_ADMIN();

    if (users.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:#7f8c8d">Nenhum usuário encontrado</p>';
      return;
    }

    list.innerHTML = users.map(u => {
      const adminClass = u.isAdmin ? ' is-admin' : '';
      const badge = u.isAdmin ? '<span class="user-admin-badge">Admin</span>' : '';
      const resetBtn = isAdmin && !u.isAdmin
        ? `<button class="user-reset-pass" onclick="event.stopPropagation();adminResetPassword('${escapeHtml(u.id)}','${escapeHtml(u.name)}')" title="Redefinir senha">&#9679; Redefinir</button>`
        : '';
      const deleteBtn = u.isAdmin
        ? ''
        : `<button class="user-delete" onclick="event.stopPropagation();${isAdmin ? `adminDeleteUser('${escapeHtml(u.id)}')` : `promptDeleteUser('${escapeHtml(u.id)}')`}" title="Excluir usuário">&times;</button>`;

      return `
      <div class="user-item${adminClass}" onclick="${isAdmin && !u.isAdmin ? '' : `loginAsUser('${escapeHtml(u.username)}')`}">
        <div class="user-info">
          <span class="user-name">${escapeHtml(u.name)}${badge}</span>
          <span class="user-username">@${escapeHtml(u.username)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          ${resetBtn}
          ${deleteBtn}
        </div>
      </div>`;
    }).join('');

    const subtitle = document.querySelector('#view-users .auth-subtitle');
    if (isAdmin) {
      subtitle.textContent = 'Painel de Administração — clique em Redefinir para alterar senha';
    } else {
      subtitle.textContent = 'Selecione um usuário para continuar';
    }
  } catch (err) {
    document.getElementById('usersError').textContent = err.message;
  }
}

async function loginAsUser(username) {
  passwordModalPrompt(
    `Digite a senha para entrar como ${username}:`,
    async (password) => {
      const data = await api('/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      setToken(data.token);
      currentUser = data.user;
      document.getElementById('boardTitle').textContent = currentUser.boardName || 'Te Cuida List';
      document.getElementById('userDisplay').textContent = currentUser.name;
      document.getElementById('loginSubtitle').textContent = `Bem-vindo de volta, ${currentUser.name}!`;

      if (IS_ADMIN()) {
        showView('users');
      } else {
        showDash();
      }
    }
  );
}

async function promptDeleteUser(id) {
  passwordModalPrompt(
    'Confirme a SENHA do usuário para excluí-lo:',
    async (password) => {
      await api(`/users/${id}/delete`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      if (currentUser && currentUser.id === id) {
        delToken();
        currentUser = null;
      }
      await loadUsers();
    }
  );
}

async function adminResetPassword(userId, userName) {
  passwordModalPrompt(
    `Digite a NOVA senha para ${userName}:`,
    async (newPassword) => {
      if (newPassword.length < 4) {
        throw new Error('A senha deve ter no mínimo 4 caracteres');
      }
      await api('/admin/reset-password', {
        method: 'POST',
        body: JSON.stringify({ userId, newPassword })
      });
      alert(`Senha de ${userName} redefinida com sucesso!`);
      await loadUsers();
    },
    'Nova senha'
  );
}

function adminDeleteUser(userId) {
  showConfirm('Tem certeza que deseja excluir este usuário?', async () => {
    try {
      await api('/admin/delete-user', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      await loadUsers();
    } catch (err) {
      document.getElementById('usersError').textContent = err.message;
    }
  });
}

function showRegisterForm() {
  document.getElementById('registerForm').style.display = 'flex';
  document.getElementById('usersError').textContent = '';
}

function hideRegisterForm() {
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('regError').textContent = '';
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('regError');
  errorEl.textContent = '';

  const name = document.getElementById('regName').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPass').value;

  if (!name || !username || !password) {
    errorEl.textContent = 'Preencha todos os campos';
    return;
  }

  try {
    await api('/register', {
      method: 'POST',
      body: JSON.stringify({ name, username, password })
    });
    document.getElementById('regName').value = '';
    document.getElementById('regUsername').value = '';
    document.getElementById('regPass').value = '';
    hideRegisterForm();
    await loadUsers();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* --- Password Prompt Modal --- */
let passwordModalCallback = null;
let confirmModalCallback = null;

function showConfirm(message, onConfirm, onCancel) {
  closeAllModals();
  document.getElementById('confirmModalDesc').textContent = message;
  document.getElementById('confirmModalOverlay').classList.add('active');
  confirmModalCallback = { onConfirm, onCancel };
}

function closeConfirmModal() {
  document.getElementById('confirmModalOverlay').classList.remove('active');
  confirmModalCallback = null;
}

document.getElementById('confirmModalOkBtn').addEventListener('click', () => {
  const cb = confirmModalCallback;
  closeConfirmModal();
  if (cb && cb.onConfirm) cb.onConfirm();
});

document.getElementById('confirmModalCancelBtn').addEventListener('click', () => {
  const cb = confirmModalCallback;
  closeConfirmModal();
  if (cb && cb.onCancel) cb.onCancel();
});

document.getElementById('confirmModalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    const cb = confirmModalCallback;
    closeConfirmModal();
    if (cb && cb.onCancel) cb.onCancel();
  }
});

function passwordModalPrompt(message, onConfirm, inputPlaceholder) {
  closeAllModals();
  const overlay = document.getElementById('passwordModalOverlay');
  document.getElementById('passwordModalDesc').textContent = message;
  document.getElementById('passwordInput').value = '';
  document.getElementById('passwordModalError').textContent = '';
  document.getElementById('passwordInput').placeholder = inputPlaceholder || 'Digite a senha';
  overlay.classList.add('active');
  requestAnimationFrame(() => {
    const inp = document.getElementById('passwordInput');
    if (inp) inp.focus();
  });

  passwordModalCallback = async (password) => {
    try {
      await onConfirm(password);
      closePasswordModal();
    } catch (err) {
      document.getElementById('passwordModalError').textContent = err.message;
    }
  };
}

function closePasswordModal() {
  document.getElementById('passwordModalOverlay').classList.remove('active');
  passwordModalCallback = null;
}

document.getElementById('passwordModalConfirmBtn').addEventListener('click', () => {
  const password = document.getElementById('passwordInput').value;
  if (!password) {
    document.getElementById('passwordModalError').textContent = 'Campo obrigatório';
    return;
  }
  if (passwordModalCallback) passwordModalCallback(password);
});

document.getElementById('passwordModalCancelBtn').addEventListener('click', closePasswordModal);

document.getElementById('passwordInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('passwordModalConfirmBtn').click();
  if (e.key === 'Esc') closePasswordModal();
});

document.getElementById('passwordModalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closePasswordModal();
});

init();
