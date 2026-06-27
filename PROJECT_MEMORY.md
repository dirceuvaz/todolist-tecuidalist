# PROJECT MEMORY — Te Cuida List

> Documento técnico completo do projeto, arquitetura, decisões, problemas enfrentados, soluções encontradas e padrões reutilizáveis para futuros projetos Electron + JavaScript + SQLite.

---

## 1. Visão geral do projeto

**Nome do projeto:** Te Cuida List  
**Nome do pacote:** `tecuidalist-app`  
**Versão atual:** `1.0.1`  
**Repositório:** (local) `C:\Users\DirceuThinkr5\OneDrive\001-tarefas\kanban-app`

**Proposta do app:** Gerenciador de tarefas pessoal estilo Kanban, desktop, 100% offline, multi-usuário local. Cada usuário em um computador compartilhado pode ter suas próprias tarefas, quadros e configurações.

**Problema que resolve:** Organização pessoal de tarefas no dia a dia, com suporte a múltiplos usuários no mesmo computador (ex: membros da mesma família), sem depender de internet, sem depender de servidor externo, com privacidade total dos dados.

**Público/usuário esperado:**
- Usuário doméstico que quer organizar tarefas pessoais.
- Múltiplos usuários no mesmo computador (família, sala compartilhada).
- Pessoas que preferem dados 100% locais e offline.
- Usuário que não quer depender de serviços web ou contas online.

**Principais fluxos de uso:**
1. **Primeira execução:** Setup wizard (nome, username, email opcional, senha, nome do board inicial).
2. **Login/Seleção de usuário:** Landing page mostra lista de usuários existentes + opção de criar novo.
3. **Dashboard:** Visão geral com contagens de tarefas por status, pior board, grid de boards com progresso.
4. **Board Kanban:** Três colunas (A Fazer, Em Andamento, Concluído) com cards arrastáveis.
5. **CRUD de tarefas:** Criar, editar, arquivar, restaurar, mover entre boards, excluir.
6. **CRUD de boards:** Criar, editar, excluir boards; seletor de board para navegar entre eles.
7. **Admin:** Usuário especial `rtkanban` pode resetar senhas e deletar usuários.
8. **Trocar usuário:** Botão no header → volta à lista de usuários.
9. **Export/Import CSV:** Exportar tarefas para CSV; importar CSV com opção replace ou append.
10. **Tema:** Alternar entre tema escuro (padrão) e claro.

**Estado atual do produto:** MVP funcional. Versão 1.0.1 empacotada com instalador NSIS para Windows. Aplicação desktop completa, testada, compartilhável com terceiros.

---

## 2. Stack técnica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Runtime desktop | Electron | ^28.0.0 |
| Linguagem | JavaScript (Node.js) | — |
| Frontend | HTML + CSS + Vanilla JS (sem framework) | — |
| Servidor web | Express (embarcado no Electron) | ^4.18.2 |
| Banco de dados | SQLite via better-sqlite3 | ^12.11.1 |
| Autenticação | bcryptjs (hash de senha) + jsonwebtoken (sessão local) | ^2.4.3 / ^9.0.2 |
| UUID | uuid | ^9.0.0 |
| Empacotador | electron-builder | ^26.15.3 |
| Instalador Windows | NSIS (gerado pelo electron-builder) | — |
| Ícone | generate-icon.js (script próprio, gera .ico e .png) | — |
| Rebuild nativo | @electron/rebuild | ^4.0.4 |

**Estrutura de diretórios:**

```
kanban-app/
├── electron.js            # Processo principal do Electron
├── preload.js             # Ponte IPC main ↔ renderer
├── app-id.js              # AppUserModelID compartilhado
├── config.js              # Configurações (porta, dataDir, chaves)
├── package.json           # Scripts, dependências, config build
├── generate-icon.js       # Gera icon.ico e icon.png programaticamente
├── embed-icon.js          # (legado, não usado mais) Rcedit pós-build
├── icon.ico               # Ícone multi-tamanho (projeto)
├── build/
│   └── icon.ico           # Cópia do ícone usada pelo electron-builder
├── server/
│   ├── index.js           # Rotas Express (setup, auth, CRUD, CSV, admin)
│   └── database.js        # Schema SQLite, queries, migrações
├── renderer/
│   ├── index.html         # Toda a UI (views + modals)
│   ├── app.js             # Lógica frontend completa
│   └── style.css          # Temas escuro/claro, estilos
├── data/                  # Banco SQLite (apenas em dev)
└── dist/                  # Saída do build
    ├── win-unpacked/      # App portátil (testes)
    └── Te Cuida List Setup 1.0.1.exe   # Instalador NSIS
```

**Scripts npm relevantes:**

```json
{
  "start": "node server/index.js",
  "electron": "electron .",
  "build": "node generate-icon.js && npx @electron/rebuild -f -w better-sqlite3 && npx electron-builder --win",
  "rebuild-electron": "npx @electron/rebuild -f -w better-sqlite3"
}
```

---

## 3. Arquitetura

### Processo principal (Electron)

`electron.js` é o ponto de entrada (`"main": "electron.js"` no `package.json`). Ele:

1. **Define AppUserModelID** (`com.tecuida.list`) antes de qualquer janela.
2. **Inicializa o servidor Express** embarcado (escutando em porta local 58901-59001).
3. **Cria a BrowserWindow** apontando para `http://localhost:{port}`.
4. **Expõe IPC** para o renderer (ex: `set-badge` para overlay de notificações).
5. **Remove o menu da janela** (`Menu.setApplicationMenu(null)`).
6. **Gerencia overlay de badge** na taskbar via `setOverlayIcon`.

### Servidor Express (embarcado)

O servidor Express roda no mesmo processo do Electron, escutando em `localhost:{port}`. Ele serve:

- **Rotas públicas:** `/api/setup` (wizard), `/api/login`, `/api/register`, `/api/users` (listar).
- **Rotas autenticadas:** `/api/me`, `/api/tasks`, `/api/boards`, `/api/dashboard`, `/api/csv`.
- **Rotas de admin:** `/api/admin/reset-password`, `/api/admin/delete-user`.
- **Arquivos estáticos:** `/renderer/` (HTML, CSS, JS).

### Processo renderer (frontend)

O renderer é uma Single Page Application (SPA) em Vanilla JS, dividida em **views** (telas) e **modals** (diálogos):

- **Views:** landing, setup, login, users, dashboard, boards, app (kanban).
- **Modals:** task, board, mover, password, confirm, boardSelect.
- **Gerenciamento de estado:** variáveis globais no escopo do `app.js` (`currentUser`, `currentBoardId`, `currentView`, etc.).
- **Tema:** CSS custom properties alternadas via `document.documentElement.setAttribute('data-theme', ...)`.

### Preload

`preload.js` expõe via `contextBridge` a API `window.electronAPI` com:
- `isElectron: true`
- `setTaskbarBadge(count)` — envia IPC para o main process definir overlay.

### Comunicação IPC

O IPC é usado exclusivamente para o badge da taskbar:
- **Renderer → Main:** `ipcRenderer.send('set-badge', count)`
- **Main → Window:** `mainWindow.setOverlayIcon(img, description)`

Todo o resto da comunicação é HTTP via `fetch()` do renderer para `localhost:{port}`.

### Inicialização do app

```
app.whenReady()
  → mkdir userData/data (se não existir)
  → config.dataDir = userData/data
  → startServer() (Express em porta aleatória ou 58901)
  → Menu.setApplicationMenu(null)
  → getWindowIconPath() → valida com nativeImage
  → new BrowserWindow({ icon: icon.ico })
  → mainWindow.loadURL(http://localhost:{port})
  → ipcMain.on('set-badge')
```

### Persistência local

- **SQLite** via `better-sqlite3` em `%APPDATA%\tecuidalist-app\data\kanban.db` (packaged) ou `./data/kanban.db` (dev).
- **localStorage** no renderer para: tema escuro/claro, último board visitado, preferências de UI.

### Separação de responsabilidades

| Camada | Arquivo | Responsabilidade |
|--------|---------|-----------------|
| Main process | `electron.js` | Janela, AppUserModelID, IPC, startup |
| Servidor | `server/index.js` | Rotas HTTP, autenticação, validação |
| Banco | `server/database.js` | Schema, queries, migrações |
| Preload | `preload.js` | Ponte IPC segura |
| UI (views) | `renderer/index.html` + `app.js` | Telas, modals, interação |
| Estilo | `renderer/style.css` | Temas, layout, responsivo |
| Config | `config.js` | Porta, chaves, diretório |
| Ícone | `generate-icon.js` | Geração de .ico multi-tamanho |

---

## 4. Modelo de dados

### Banco SQLite — `kanban.db`

**Tabela: `users`**

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  password TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  createdBy TEXT DEFAULT ''
);
```

- `role`: `'user'` ou `'admin'`
- `createdBy`: legacy — usuários antigos têm `''`, novos têm o `id` do admin que criou
- Admin `rtkanban` criado na inicialização do servidor (idempotente)

**Índice:** `idx_users_username` em `username`

---

**Tabela: `boards`**

```sql
CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  createdBy TEXT DEFAULT ''
);
```

- `createdBy`: isola boards por usuário; `''` = legacy (visível a todos)

---

**Tabela: `tasks`**

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  boardId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'a_fazer',
  assignee TEXT DEFAULT '',
  deadline TEXT DEFAULT '',
  impact TEXT DEFAULT '',
  priority TEXT DEFAULT 'media',
  archived INTEGER DEFAULT 0,
  createdAt TEXT DEFAULT (datetime('now', 'localtime')),
  updatedAt TEXT DEFAULT (datetime('now', 'localtime')),
  createdBy TEXT DEFAULT '',
  pos REAL DEFAULT 0
);
```

- `status`: `'a_fazer'`, `'em_andamento'`, `'concluido'`
- `priority`: `'baixa'`, `'media'`, `'alta'`
- `archived`: `0` = ativo, `1` = arquivado
- `pos`: posição para ordenação drag-and-drop
- `createdBy`: isola tarefas por usuário; `''` = legacy (visível a todos)

**Índices:**
```sql
CREATE INDEX idx_tasks_boardId ON tasks(boardId);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_createdBy ON tasks(createdBy);
```

---

### Relacionamentos

- `tasks.boardId` → `boards.id` (N:1) — uma tarefa pertence a um board
- `tasks.createdBy` → `users.id` (N:1, implícito) — uma tarefa pertence a um usuário
- `boards.createdBy` → `users.id` (N:1, implícito) — um board pertence a um usuário

### Regras de validação (aplicadas no servidor)

- Título da tarefa é obrigatório (não vazio).
- Status deve ser um dos três valores válidos.
- BoardId deve referenciar um board existente.
- Username deve ser único.
- Senha tem tamanho mínimo (6 caracteres) e máximo razoável.
- CSV import: valida cabeçalho, linhas com título vazio são ignoradas.

### Migrações futuras

O schema atual não tem sistema de migrações formal. `database.js` cria as tabelas com `CREATE TABLE IF NOT EXISTS`. Para adicionar colunas, usar `ALTER TABLE IF NOT EXISTS` (SQLite suporta `ALTER TABLE ADD COLUMN`). Recomenda-se implementar `user_version` no SQLite para controle de versão do schema:

```sql
PRAGMA user_version = 1;
```

---

## 5. Funcionalidades implementadas

- **Wizard de setup inicial** — primeira execução cria o admin e um board padrão
- **Tela de login/seleção de usuário** — landing page com cards de usuários
- **Criação de novo usuário** — qualquer um pode criar conta local
- **Autenticação via JWT** — token armazenado em memória (variável JS) e localStorage
- **Dashboard** — contagem total de tarefas, por status, pior board, grid de boards com progresso
- **Board Kanban** — 3 colunas com drag-and-drop (handle-based)
- **Criação de tarefas** — modal com título, descrição, board, prioridade, impacto, deadline, responsável
- **Edição de tarefas** — mesmo modal preenchido
- **Exclusão de tarefas** — com confirmação
- **Arquivar/restaurar tarefas** — toggle "Tarefas Arquivadas"
- **Mover tarefa entre boards** — modal "Mover"
- **CRUD de boards** — criar, editar, excluir
- **Seletor de board** — modal para navegar para outro board
- **Trocar de usuário** — botão no header
- **Admin:** redefinir senha de qualquer usuário, deletar usuário
- **Exportar CSV** — download de todas as tarefas do usuário
- **Importar CSV** — replace (limpa e importa) ou append (adiciona)
- **Tema escuro/claro** — alternável, salvo em localStorage
- **Pesquisa/filtro por coluna** — input de texto em cada coluna
- **Numeração automática** de tarefas por coluna (1., 2., 3.)
- **Ícone personalizado Windows** — multi-tamanho (16x16 a 256x256)
- **AppUserModelID** — `com.tecuida.list` para agrupamento correto na taskbar
- **Overlay de badge** — círculo vermelho com contagem na taskbar
- **Instalador NSIS** — `Te Cuida List Setup 1.0.1.exe`
- **Página inicial explicativa** — landing page com propósito, versão, créditos e funcionalidades futuras
- **Página de administração** — acesso via login como `rtkanban` (`rtkanban/rtkanban`)
- **Modal customizado de confirmação** — substitui `confirm()` nativo do Electron
- **Modal de senha** — substitui `prompt()` nativo do Electron
- **Guarda de modais** — `closeAllModals()` antes de abrir qualquer modal
- **Refresh automático do dashboard** após operações CRUD

---

## 6. Decisões técnicas importantes

### Por que Electron?

- Aplicação desktop multiplataforma com tecnologia web (HTML/CSS/JS).
- Acesso ao sistema de arquivos (SQLite, CSV, ícone, atalhos).
- Ambiente controlado sem depender de navegador.
- Permite empacotar servidor Express + banco SQLite em um único executável.

### Por que SQLite via better-sqlite3?

- 100% offline, sem servidor externo.
- Dados locais e privados do usuário.
- Concorrência segura (em comparação com JSON em arquivo).
- `better-sqlite3` é síncrono e mais rápido que alternativas async para Electron.
- Sem dependência de serviços cloud.

### Por que instalador NSIS em vez de depender só de win-unpacked?

- `win-unpacked` é funcional para testes, mas:
  - O caminho muda a cada rebuild (se a pasta for recriada).
  - Fixar na taskbar a partir de `win-unpacked` quebra quando a pasta é recriada.
  - Distribuir uma pasta zipada com 168 MB é amador.
- NSIS gera um único `.exe` instalável de 82 MB.
- Instala em caminho estável: `%LOCALAPPDATA%\Programs\tecuidalist-app\`.
- Atalhos do Menu Iniciar e Desktop funcionam corretamente.
- O ícone no .exe, na taskbar e no instalador fica consistente.
- O pin na taskbar não quebra com atualizações (o instalador substitui os arquivos no mesmo lugar).

### Como foi resolvido o ícone no Windows?

- **Problema:** O executável mostrava ícone personalizado no Explorer, mas o botão ativo da taskbar e o pin mostravam Electron.
- **Causa:** Múltiplos fatores agindo juntos:
  1. `BrowserWindow({ icon })` usava PNG, não ICO.
  2. O pin apontava para caminho instável (`win-unpacked`) que quebrava.
  3. AppUserModelID inconsistente.
- **Solução final (electron-builder):**
  1. `"win": { "icon": "build/icon.ico" }` — embed no .exe.
  2. `"extraResources": [{ "from": "build/icon.ico", "to": "icon.ico" }]` — copia para `resources/`.
  3. `getWindowIconPath()` retorna `process.resourcesPath/icon.ico` (packaged) ou `build/icon.ico` (dev).
  4. `app.setAppUserModelId('com.tecuida.list')` antes de criar BrowserWindow.
  5. `BrowserWindow({ icon })` recebe o caminho do .ico (não PNG).
  6. NSIS installer garante caminho estável para o pin.

### Por que AppUserModelID é importante?

- O Windows agrupa botões da taskbar pelo AppUserModelID.
- Sem ele, cada execução do app pode criar um novo grupo.
- Com ele definido, o pin e o app em execução compartilham o mesmo botão.
- Deve ser definido **antes** de criar qualquer janela (`app.setAppUserModelId` no topo do script).

### Como evitar atalhos quebrados?

1. Nunca orientar o usuário a fixar app executado de `dist/win-unpacked/`.
2. Sempre usar o instalador NSIS.
3. O instalador coloca o app em `%LOCALAPPDATA%\Programs\tecuidalist-app\`.
4. O pin criado a partir desse caminho não quebra com rebuilds.
5. Não usar `shell.writeShortcutLink` no startup para "reparar" atalhos.

### Como lidar com caminhos em dev vs packaged?

| Recurso | Dev | Packaged |
|---------|-----|----------|
| Banco | `./data/kanban.db` | `app.getPath('userData')/data/kanban.db` |
| Ícone | `./build/icon.ico` | `process.resourcesPath/icon.ico` |
| Server | Express standalone | Express embarcado no Electron |
| Porta | 58901 (configurável) | 58901-59001 (failover) |
| `__dirname` | Raiz do projeto | `resources/app/` (dentro do asar) |

### Como lidar com assets em Electron?

- Assets que precisam estar no app empacotado: colocar na raiz do projeto (ex: `icon.ico`, `preload.js`).
- electron-builder copia todos os arquivos do projeto (exceto listados em `files: ["!..."]`).
- Assets que precisam ficar FORA do asar (ex: ícone para BrowserWindow): usar `extraResources`.
- O path em packaged: `process.resourcesPath + asset.xxx`.
- O path em dev: `path.join(__dirname, 'pasta', 'asset.xxx')`.

---

## 7. Conquista especial: instalador Windows distribuível

### O antes

Antes da adoção do `electron-builder` com NSIS, o projeto dependia exclusivamente de:

```
dist/Te Cuida List-win32-x64/Te Cuida List.exe
```

Isso era uma pasta **unpacked/portátil** gerada pelo `electron-packager`. Era útil para testes rápidos, mas impraticável como produto final:

- A pasta `Te Cuida List-win32-x64/` era recriada a cada build, mudando de ID/caminho.
- Fixar o app na taskbar a partir dessa pasta criava um atalho que **quebrava** no próximo build.
- Distribuir para terceiros exigia zipar uma pasta de 168 MB.
- O usuário precisava saber onde descompactar e qual `.exe` executar.
- Não havia atalho no Menu Iniciar, não havia desinstalador.
- O app não tinha "cara de software de verdade".

### O depois

Agora o build gera:

```
dist/
├── Te Cuida List Setup 1.0.1.exe   (82 MB)
└── win-unpacked/                    (mantido para testes)
```

O instalador NSIS:

- Instala o app em `%LOCALAPPDATA%\Programs\tecuidalist-app\` — caminho **estável** e **padrão Windows**.
- Cria atalhos no Menu Iniciar e opcionalmente no Desktop.
- O pin na taskbar, uma vez fixado a partir do caminho instalado, **não quebra** com atualizações.
- O instalador pode ser compartilhado com terceiros como um único arquivo `.exe`.
- O usuário comum (não desenvolvedor) consegue instalar sem instruções complexas.
- O ícone é exibido corretamente no Explorer, no instalador, na taskbar e no pin.

### O que muda de patamar

1. **Distribuição:** Antes era "aqui está uma pasta zipada". Agora é "baixe o Setup e instale".
2. **Profissionalismo:** O app passa a ter cara e comportamento de software Windows real.
3. **Compartilhamento com terceiros:** Amigos e familiares podem instalar sem assistência técnica.
4. **Atualizações:** Basta gerar um novo Setup e o usuário instalar por cima.
5. **Taskbar pin:** Funciona de forma confiável — o maior problema anterior.
6. **Desinstalação:** O Windows reconhece o app como instalado e permite remover pelo Painel de Controle.

### Padrão para futuros projetos

Em qualquer projeto Electron futuro, **começar com electron-builder e NSIS desde o início**:

```json
{
  "build": {
    "appId": "com.seuapp.id",
    "productName": "Seu App",
    "win": {
      "icon": "build/icon.ico",
      "target": ["nsis"]
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "Seu App"
    },
    "extraResources": [
      { "from": "build/icon.ico", "to": "icon.ico" }
    ]
  }
}
```

Isso resolve dezenas de problemas de uma vez. **Não começar com electron-packager pensando em migrar depois.**

---

## 8. Caso especial: ícone do Windows/taskbar

### O problema original

O executável empacotado mostrava o ícone personalizado (TCL azul) no Windows Explorer, mas:

- O botão ativo na taskbar (enquanto o app rodava) mostrava o ícone padrão do Electron.
- O pin na taskbar (quando fixado) também mostrava Electron.
- Depois de fixar e rebuildar, aparecia "Problema no Atalho — o item foi alterado ou movido".

### Tentativas que não resolveram (sozinhas)

1. **BrowserWindow({ icon: 'icon.png' })** — PNG não funciona bem como ícone de janela no Windows.
2. **electron-packager --icon=icon.ico** — Embed correta no .exe, mas o ícone runtime continuava errado.
3. **shell.writeShortcutLink no startup** — Hack de atalho frágil, podia corromper atalhos existentes.
4. **repairStartMenuShortcut()** — Tentava "consertar" o atalho do Start Menu a cada abertura.
5. **app.setAppUserModelId** — Correto, mas sozinho não resolve porque o atalho apontava para o caminho errado.

### O que piorou o problema

- **Inconsistência entre abordagens:** Partes da solução usando electron-packager, partes com hacks de atalho, partes com ícone PNG.
- **Uso de `electron-packager`:** O output `dist/Te Cuida List-win32-x64/` mudava a cada rebuild. Fixar a partir daí era armadilha.
- **Atalhos fixados antigos:** O Windows usava o ícone do atalho quebrado (Electron) em vez de buscar o ícone do novo executável.
- **Hack de `repairStartMenuShortcut`:** Alterava o atalho do Start Menu com `shell.writeShortcutLink`, mas o atalho da taskbar continuava apontando para o caminho antigo.

### A causa real

Múltiplos fatores combinados:

1. **Instabilidade do caminho:** O pin da taskbar apontava para `dist/Te Cuida List-win32-x64/`, que era recriado a cada build.
2. **Ícone da janela inadequado:** `BrowserWindow({ icon: 'icon.png' })` usava PNG, e o Windows lida melhor com ICO para ícone de janela.
3. **AppUserModelID não era consistente** entre o build e o atalho.
4. **Cache de ícone do Windows:** O ícone antigo (Electron) ficava cacheado mesmo depois de mudar o executável.

### A solução final

1. **Migrar de electron-packager para electron-builder** — gera instalador NSIS com caminho estável.
2. **Configurar `win.icon = "build/icon.ico"`** — embed do .ico no .exe.
3. **Configurar `extraResources`** — copia `build/icon.ico` para `resources/icon.ico`.
4. **Criar `getWindowIconPath()` em electron.js:**
   - Packaged: `path.join(process.resourcesPath, 'icon.ico')`
   - Dev: `path.join(__dirname, 'build', 'icon.ico')`
5. **Passar o .ico para BrowserWindow** como string de caminho (Windows `LoadImageW` lê .ico nativamente).
6. **Criar pasta `build/` com `icon.ico`** — necessária para electron-builder.
7. **Definir AppUserModelID fixo** `com.tecuida.list` em `app-id.js`.
8. **Remover todos os hacks de atalho** (`repairStartMenuShortcut`, `shell.writeShortcutLink`).
9. **Garantir instalação via Setup** — o pin é criado a partir de `%LOCALAPPDATA%\Programs\tecuidalist-app\`, caminho estável.

### Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `electron.js` | Removeu `shell.writeShortcutLink`, `repairStartMenuShortcut`, `setImmediate`. Adicionou `getWindowIconPath()` com `process.resourcesPath`. Trocou `icon.png` por `icon.ico`. |
| `app-id.js` | `DirceuVaz.TeCuidaList` → `com.tecuida.list` |
| `package.json` | electron-packager → electron-builder + NSIS config |
| `build/icon.ico` | Novo (cópia do icon.ico raiz) |
| `.gitignore` (implícito) | `dist/` ignorado |

### Configurações finais

**electron.js (ícone):**
```js
function getWindowIconPath() {
  if (process.platform !== 'win32') return undefined;
  if (app.isPackaged) return path.join(process.resourcesPath, 'icon.ico');
  return path.join(__dirname, 'build', 'icon.ico');
}
```

**package.json (build):**
```json
{
  "build": {
    "appId": "com.tecuida.list",
    "productName": "Te Cuida List",
    "win": { "icon": "build/icon.ico", "target": ["nsis"] },
    "nsis": {
      "oneClick": false, "perMachine": false,
      "createDesktopShortcut": true, "createStartMenuShortcut": true,
      "shortcutName": "Te Cuida List"
    },
    "extraResources": [
      { "from": "build/icon.ico", "to": "icon.ico" }
    ]
  }
}
```

### Como testar corretamente

1. **Remover pin antigo quebrado** (se aparecer "Problema no Atalho", clicar em Sim).
2. **Instalar via Setup** (`dist/Te Cuida List Setup 1.0.1.exe`).
3. **Abrir o app instalado** (atalho do Menu Iniciar ou `%LOCALAPPDATA%\Programs\tecuidalist-app\Te Cuida List.exe`).
4. **Verificar console:** `[icon] path: ...resources/icon.ico`, `[icon] empty: false`.
5. **Conferir ícone ativo** na taskbar — deve ser o TCL azul.
6. **Fixar na taskbar** (direito no ícone → Fixar).
7. **Fechar e abrir pelo pin** — não deve aparecer "Problema no Atalho".

### O que nunca fazer novamente

- ❌ Não testar ícone da taskbar usando `npm start` ou `electron .`.
- ❌ Não fixar app a partir de `dist/win-unpacked/` como fluxo final.
- ❌ Não usar PNG como ícone principal de `BrowserWindow` no Windows.
- ❌ Não usar `shell.writeShortcutLink` para "consertar" atalhos no startup.
- ❌ Não usar `app.getPath('startMenu')`.
- ❌ Não misturar ferramentas de build (electron-packager + electron-builder ao mesmo tempo).
- ❌ Não pular a etapa de testar o instalador real — testar apenas `win-unpacked` não é suficiente.
- ❌ Não considerar o ícone "resolvido" enquanto o pin quebrar com rebuild.

---

## 9. Build, empacotamento e distribuição

### Como rodar em desenvolvimento

```bash
npm start          # Apenas servidor Express (sem Electron)
npm run electron   # Electron + servidor embarcado (modo dev)
```

No modo dev, o ícone da taskbar será o do Electron (esperado). O banco fica em `./data/kanban.db`.

### Como gerar build

```bash
npm run build
```

Este comando executa em sequência:
1. `node generate-icon.js` — regenera `icon.ico` e `icon.png`
2. `npx @electron/rebuild -f -w better-sqlite3` — recompila módulo nativo para o Node.js do Electron
3. `npx electron-builder --win` — empacota + cria instalador NSIS

### Saída do build

```
dist/
├── win-unpacked/
│   ├── Te Cuida List.exe           (168 MB — portátil)
│   ├── resources/
│   │   ├── app.asar                (app empacotado)
│   │   ├── app.asar.unpacked/      (native modules)
│   │   ├── icon.ico                (extraído por extraResources)
│   │   └── elevate.exe
│   └── ... (demais arquivos do Electron)
├── Te Cuida List Setup 1.0.1.exe   (82 MB — instalador)
├── Te Cuida List Setup 1.0.1.exe.blockmap
└── builder-debug.yml
```

### Qual arquivo usar

| Finalidade | Arquivo |
|-----------|---------|
| Teste rápido (dev) | `npm run electron` |
| Teste de comportamento real | `dist/win-unpacked/Te Cuida List.exe` |
| **Instalar e usar** | `dist/Te Cuida List Setup 1.0.1.exe` |
| Compartilhar com terceiros | `dist/Te Cuida List Setup 1.0.1.exe` |

### Diferença entre win-unpacked e Setup

| Aspecto | win-unpacked | Setup NSIS |
|---------|-------------|------------|
| Caminho de instalação | Onde descompactar | `%LOCALAPPDATA%\Programs\tecuidalist-app\` |
| Atalho Start Menu | Não | Sim |
| Atalho Desktop | Não | Sim (opcional) |
| Pin na taskbar | Quebra se mover/recriar | Estável |
| Desinstalação | Manual (apagar pasta) | Painel de Controle |
| Distribuir para terceiros | Ruim (pasta zipada) | Excelente (.exe único) |
| Ícone na taskbar | Funciona se não mexer na pasta | Funciona sempre |

### Caminho esperado de instalação

```
%LOCALAPPDATA%\Programs\tecuidalist-app\
├── Te Cuida List.exe
├── resources\
│   ├── app.asar
│   ├── app.asar.unpacked\
│   └── icon.ico
├── locales\
├── chrome_100_percent.pak
└── ... (outros arquivos do Electron)
```

O banco de dados fica separado, em:
```
%APPDATA%\tecuidalist-app\data\kanban.db
```

Isso garante que **atualizações do app não afetam os dados do usuário.**

### Como validar se o build está correto

1. `dist/Te Cuida List Setup 1.0.1.exe` existe.
2. `dist/win-unpacked/resources/icon.ico` existe (9907 bytes, 7 imagens).
3. Ao executar `win-unpacked/Te Cuida List.exe`, o console mostra:
   ```
   [icon] path: ...resources\icon.ico
   [icon] empty: false
   ```
4. O executável mostra ícone TCL no Explorer.
5. O instalador pode ser executado e instala o app sem erros.
6. Após instalar, o app abre pelo atalho do Menu Iniciar.

### Como compartilhar o instalador

- Copiar `dist/Te Cuida List Setup 1.0.1.exe`.
- O destinatário executa o arquivo e segue o wizard de instalação.
- Ao abrir o app, passa pelo wizard de setup (nome, usuário, senha, board).
- Tudo offline, sem necessidade de instalar Node.js, npm ou qualquer dependência.

### Cuidados ao distribuir

- **Versão:** O nome do instalador inclui a versão (`Setup 1.0.1.exe`). Atualizar ao subir versão.
- **Ícone:** O instalador e o app instalado herdam o ícone configurado em `build/icon.ico`.
- **Atalhos:** O instalador cria atalhos no Menu Iniciar e opcionalmente no Desktop.
- **Dados:** Cada usuário tem seu banco em `%APPDATA%`. Não há conflito entre instalações.
- **SmartScreen/antivírus:** O instalador não é assinado digitalmente. O Windows SmartScreen pode exibir aviso "Este aplicativo não é confiável". Isso é normal para apps não assinados. O usuário pode clicar em "Executar assim mesmo".
- **Atualizações futuras:** O projeto não tem mecanismo de auto-update. Atualizações devem ser distribuídas como novo instalador. O usuário instala por cima e os dados são preservados.

---

## 10. Integração com SQLite/local database

### Como o banco é inicializado

`server/database.js` exporta `getDb()` que:
1. Determina o caminho do banco: `config.dataDir + '/kanban.db'`.
2. Cria o diretório se não existir.
3. Abre conexão SQLite com `better-sqlite3`.
4. Executa `CREATE TABLE IF NOT EXISTS` para users, boards, tasks.
5. Cria índices.
6. Cria admin `rtkanban` se não existir (idempotente).

### Onde o banco fica

- **Dev:** `kanban-app/data/kanban.db` (definido em `config.js` como `path.join(__dirname, 'data')`).
- **Packaged:** `%APPDATA%\tecuidalist-app\data\kanban.db` (definido em `electron.js` como `app.getPath('userData')/data`).

### Como evitar perda de dados ao atualizar

O banco fica em `%APPDATA%`, que é separado da pasta de instalação do app. Atualizações via novo instalador NSIS substituem apenas os arquivos em `%LOCALAPPDATA%\Programs\tecuidalist-app\`. O banco permanece intacto.

### Como fazer backup

O usuário pode copiar o arquivo `%APPDATA%\tecuidalist-app\data\kanban.db` para outro local. Para restaurar, basta substituir o arquivo com o app fechado.

### Migrações

O projeto atual não tem sistema de migrações. O schema é criado com `CREATE TABLE IF NOT EXISTS`. Para evoluir o schema, recomenda-se:

1. Adicionar `PRAGMA user_version = N;` no banco.
2. No startup, ler `PRAGMA user_version`.
3. Executar migrações sequenciais até a versão atual.
4. Atualizar `PRAGMA user_version` ao final.

Exemplo de migração futura:
```js
const version = db.pragma('user_version', { simple: true });
if (version < 1) {
  db.exec('ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT ""');
  db.pragma('user_version = 1');
}
```

### Erros comuns com paths em Electron packaged

- ❌ `__dirname` em asar aponta para dentro do arquivo .asar, não para o sistema de arquivos real.
- ❌ `fs.readFileSync(path.join(__dirname, 'asset.png'))` funciona com asar, mas `fs.existsSync` pode falhar.
- ❌ `app.getPath('userData')` não está disponível fora do Electron (ex: se o server rodar standalone).
- ✅ Usar `process.resourcesPath` para assets que precisam ficar fora do asar.
- ✅ Usar `app.getPath('userData')` para dados de usuário que precisam persistir entre atualizações.

---

## 11. Integração com APIs remotas

> **Nota:** O projeto atual (Te Cuida List v1.0.1) é 100% offline e **não implementa** integração com API remota. Esta seção documenta o padrão **recomendado** para projetos futuros que precisarem dessa funcionalidade.

### Onde colocar o client HTTP

Criar `src/services/api.js` (ou `server/services/api.js` se o servidor for o consumidor):

```js
const BASE_URL = process.env.API_URL || 'https://api.exemplo.com';

class ApiClient {
  constructor() {
    this.baseUrl = BASE_URL;
  }

  async request(path, options = {}) {
    const token = this.getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json();
  }

  setToken(token) { /* localStorage ou variável de sessão */ }
  getToken() { /* ... */ }
}
```

### Como configurar base URL

- Em `config.js`, adicionar `apiUrl: process.env.TCL_API_URL || ''`.
- Em dev, usar variável de ambiente.
- Em packaged, usar valor fixo ou arquivo de configuração em `%APPDATA%`.

### Como guardar tokens

- **Sessão:** Variável JS em memória (morre ao fechar o app).
- **Persistente:** `localStorage` no renderer (é Electron, não browser compartilhado) ou arquivo criptografado em `%APPDATA%`.

### Como lidar com offline/online

- Usar `navigator.onLine` no renderer para detectar conectividade.
- Manter fila de operações offline no SQLite local.
- Sincronizar quando a conexão for restabelecida.

### Sincronização SQLite local ↔ API remota

Estratégia recomendada:

1. **Last-write-wins** com timestamp: cada registro tem `updatedAt`. O maior timestamp vence.
2. **Fila de operações:** Criar tabela `sync_queue` com operações pendentes (create, update, delete).
3. **Full sync:** Periódico ou manual, envia operações pendentes, recebe atualizações do servidor.
4. **Resolução de conflitos:** Servidor como autoridade final. Se houver conflito, a versão do servidor prevalece com notificação ao usuário.

### Como separar camada de API da UI

```
renderer/
  app.js              # UI + estado
  services/
    api.js            # Client HTTP
    sync.js           # Lógica de sincronização
    cache.js          # Cache local (SQLite + localStorage)
```

O renderer nunca chama `fetch()` diretamente. Toda comunicação passa por `services/api.js`.

### Cuidados de segurança

- **Credenciais no Electron:** Não armazenar tokens JWT em arquivos de sessão do navegador (não se aplica ao Electron, mas ainda assim evitar `localStorage` para tokens sensíveis se possível).
- **ContextIsolation:** Manter `contextIsolation: true` e `nodeIntegration: false`.
- **Preload:** Expor apenas APIs específicas via `contextBridge`, nunca expor `require` ou `process`.
- **HTTPS:** Toda comunicação com API remota deve usar HTTPS.
- **Validação no servidor:** Nunca confiar apenas na validação do frontend.

---

## 12. Critérios de qualidade

Checklist para validar o projeto:

- [x] App inicia sem erro.
- [x] Dev (`npm run electron`) funciona.
- [x] Packaged (`win-unpacked/Te Cuida List.exe`) funciona.
- [x] Setup NSIS instala sem erro.
- [x] Banco persiste em `%APPDATA%\tecuidalist-app\data\kanban.db`.
- [x] Paths funcionam em dev e produção.
- [x] Assets (ícone) carregam no app empacotado.
- [x] Ícone aparece no .exe (Explorer), janela (title bar), taskbar (runtime) e instalador.
- [x] `nativeImage.isEmpty()` retorna `false` para o ícone.
- [x] Instalador cria atalhos no Menu Iniciar.
- [x] Pin na taskbar não quebra após instalação via Setup.
- [x] AppUserModelID configurado antes da janela.
- [x] Não há hacks de atalho no startup.
- [x] Erros de inicialização são tratados com `dialog.showErrorBox`.
- [x] UI mantém estado corretamente ao navegar entre views.
- [x] Build é reproduzível (`npm run build`).
- [x] Instalador pode ser enviado para outra pessoa e instalado sem ambiente de desenvolvimento.
- [x] Tema escuro/claro alterna e persiste.
- [x] Drag-and-drop funciona apenas via handle (não interfere com scroll/seleção).
- [x] Modais não acumulam (todo modal fecha antes de abrir outro).
- [x] CSV export/import funciona corretamente.
- [x] Admin consegue resetar senha e deletar usuário.
- [x] Troca de usuário funciona sem perder dados.

---

## 13. Dificuldades encontradas

### Ícone Electron/Windows

O problema mais custoso e frustrante. Foram necessárias múltiplas iterações para entender que:

1. **Ícone do .exe ≠ ícone da janela ≠ ícone da taskbar ≠ ícone do pin.**
   - O .exe pode mostrar o ícone correto no Explorer, mas a janela pode mostrar outro.
   - A taskbar pode mostrar o ícone do Electron mesmo com o .exe correto.
   - O pin pode mostrar o ícone do atalho antigo, não do executável atual.

2. **Cada camada tem seu próprio mecanismo de ícone:**
   - **.exe:** Embed via `win.icon` no electron-builder (ou `--icon` no electron-packager + rcedit).
   - **Janela:** `BrowserWindow({ icon: path })` — prefira .ico, não PNG.
   - **Taskbar (runtime):** Herdado da janela + AppUserModelID.
   - **Pin:** Lido do atalho `.lnk` (IconLocation), que aponta para o .exe.

3. **A correção só funciona quando todas as camadas estão alinhadas.**

### Diferença de comportamento entre dev e packaged

- Em dev (`electron .`), `__dirname` é a raiz do projeto e assets estão acessíveis.
- Em packaged, `__dirname` é `resources/app/` (dentro do asar) e `process.resourcesPath` é `resources/`.
- Assets em `extraResources` ficam em `process.resourcesPath`, **não** em `__dirname`.

### Atalhos antigos presos no Windows

- O Windows não atualiza automaticamente o ícone de um atalho fixado.
- O atalho `.lnk` guarda o `IconLocation` que, se apontar para um executável deletado, mostra o ícone genérico/antigo.
- Mesmo deletando o atalho e criando um novo, o cache de ícone do Windows pode manter o ícone antigo.
- Solução: desafixar, reiniciar Explorer (ou fazer logoff), fixar novamente.

### Riscos de soluções apressadas

- `repairStartMenuShortcut` com `shell.writeShortcutLink`: Parecia uma boa ideia para "garantir" o atalho correto, mas na prática:
  - Criava atalho com `process.execPath` que em certas condições apontava para o eletron.exe (dev) ou caminho errado.
  - Sobrescrevia atalhos que o usuário já tinha configurado.
  - Adicionava complexidade desnecessária ao startup.
  - **Lição:** O app não deve se meter em atalhos do Windows automaticamente.

### Por que a migração para electron-builder + NSIS foi decisiva

- `electron-packager` produzia output em `dist/Te Cuida List-win32-x64/`, que variava de nome.
- Cada rebuild podia mudar o diretório, quebrando pins existentes.
- `electron-builder` com NSIS resolveu de uma vez:
  - Caminho de instalação estável e previsível.
  - Atalhos gerenciados pelo instalador, não pelo app.
  - Embed de ícone integrado no build.
  - `extraResources` para assets fora do asar.

---

## 14. Erros a evitar em projetos futuros

1. **Não testar ícone da taskbar usando `npm start` ou `electron .`.**
   - O ícone do Electron em modo dev não reflete o comportamento do app empacotado.
   - Sempre testar com `dist/win-unpacked/Te Cuida List.exe` ou com o instalado via Setup.

2. **Não fixar app gerado em pasta instável como solução final.**
   - `dist/win-unpacked/` é para testes. O fluxo final é o instalador NSIS.
   - Fixar a partir de `win-unpacked` criará pins quebrados no próximo build.

3. **Não usar PNG como ícone principal no Windows.**
   - Windows lida melhor com `.ico` para ícone de janela, taskbar e Explorer.
   - PNG pode funcionar em alguns contextos, mas `.ico` é mais confiável.

4. **Não usar caminho relativo frágil para assets no packaged.**
   - `app.isPackaged` + `process.resourcesPath` é o padrão correto.
   - `__dirname` dentro do asar é diferente de `__dirname` em dev.

5. **Não editar atalhos `.lnk` automaticamente no startup.**
   - O app não deve mexer em atalhos da taskbar ou Start Menu.
   - Essa responsabilidade é do instalador, não do aplicativo.

6. **Não usar `app.getPath('startMenu')`.**
   - Esta API **não existe** no Electron. Causa erro.
   - Usar `process.env.APPDATA` + `Microsoft\Windows\Start Menu\Programs` se precisar (mas prefira não precisar).

7. **Não misturar `AppUserModelID` diferentes.**
   - O Windows agrupa janelas pelo AppUserModelID.
   - Deve ser consistente entre o build, o instalador e o atalho.
   - Mudar o AppUserModelID faz o Windows tratar como app diferente.

8. **Não salvar banco dentro da pasta de instalação.**
   - O banco deve ficar em `app.getPath('userData')`.
   - Isso garante que reinstalações/atualizações não apaguem dados do usuário.

9. **Não depender de `__dirname` sem entender as diferenças em app.asar.**
   - Em dev: `__dirname` = raiz do projeto.
   - Em packaged: `__dirname` = diretório dentro do asar virtual.
   - `fs` consegue ler arquivos dentro do asar, mas `nativeImage.createFromPath()` e caminhos passados para APIs nativas podem não funcionar.

10. **Não concluir build sem testar instalação real.**
    - Testar apenas `win-unpacked` é insuficiente.
    - Instalar via Setup, abrir, fixar na taskbar, fechar e abrir pelo pin.
    - Verificar se o ícone está correto em todos os contextos.

11. **Não considerar `win-unpacked` como forma final de distribuição.**
    - Para testadores técnicos, `win-unpacked` zipado pode ser aceitável.
    - Para usuários comuns, o instalador NSIS é obrigatório.

---

## 15. Padrões recomendados para futuros projetos Electron

### Estrutura de pastas recomendada

```
meu-app/
├── package.json
├── electron.js              # Main process (ponto de entrada)
├── preload.js               # Ponte IPC
├── app-id.js                # AppUserModelID
├── config.js                # Configurações globais
├── build/
│   └── icon.ico             # Ícone para electron-builder
├── src/
│   ├── main/                # Código do main process (se houver muito)
│   ├── renderer/            # Frontend (HTML, CSS, JS)
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── style.css
│   │   └── services/        # API, sync, cache
│   ├── server/              # Servidor embarcado (se houver)
│   ├── database/            # Schema, queries, migrations
│   └── assets/              # Assets estáticos (imagens, fontes)
├── scripts/
│   └── generate-icon.js     # Geração programática de .ico
└── dist/                    # Saída do build (gitignored)
```

### Main process (`electron.js`)

- Definir `app.setAppUserModelId` antes de qualquer janela.
- Usar `app.whenReady()` para inicialização.
- Separar lógica de criação da janela em função `createWindow()`.
- Usar `getWindowIconPath()` para resolver caminho do ícone.
- Tratar erros de inicialização com `dialog.showErrorBox`.
- Não editar atalhos do Windows no startup.

### Preload (`preload.js`)

- Expor apenas o necessário via `contextBridge`.
- Nunca expor `require`, `process`, `fs` ou `child_process`.
- Usar `ipcRenderer.invoke`/`on` para comunicação main ↔ renderer.

### Renderer

- SPA com Vanilla JS ou framework leve (não usar React/Angular a menos que necessário).
- Separar views de modals.
- Gerenciar estado em variáveis de escopo controlado (ou usar estado simples).
- Não misturar lógica de negócio com manipulação de DOM.

### Assets e ícone

- `build/icon.ico` para electron-builder.
- `extraResources` para assets que precisam ficar fora do asar.
- `getWindowIconPath()`:
  ```js
  if (app.isPackaged) return path.join(process.resourcesPath, 'icon.ico');
  return path.join(__dirname, 'build', 'icon.ico');
  ```

### Database

- SQLite via `better-sqlite3`.
- Banco em `app.getPath('userData')`.
- Schema versionado via `PRAGMA user_version`.
- Migrações executadas no startup.

### Build e instalador

- Usar `electron-builder` desde o início.
- Configurar NSIS com `oneClick: false`, `perMachine: false`.
- `extraResources` para ícone e outros assets externos.
- `files` com exclusões (`!build/`, `!scripts/`, `!*.md`).

### Testes manuais mínimos antes de distribuir

1. `npm run build` sem erros.
2. `dist/win-unpacked/Te Cuida List.exe` abre sem erro.
3. Banco criado em `%APPDATA%`.
4. Instalador NSIS instala sem erro.
5. App abre pelo atalho do Menu Iniciar.
6. Pin na taskbar funciona e não quebra.
7. Ícone correto em: Explorer, janela, taskbar, instalador.

---

## 16. Prompt-base para futuros agents

> Use este prompt para iniciar um novo projeto Electron + JavaScript + SQLite que será distribuído como aplicativo Windows:

---

**Prompt:**

```
Crie um aplicativo desktop Electron para Windows com as seguintes características:

## Stack
- Electron (main + renderer + preload)
- JavaScript (Vanilla JS no frontend, Node.js no backend embarcado)
- SQLite via better-sqlite3 para dados locais
- Express embarcado para servir API local
- electron-builder com NSIS para build e instalação Windows
- Ícone personalizado .ico

## Requisitos de arquitetura

### Main process (electron.js)
- app.setAppUserModelId('com.meuapp.id') ANTES de criar qualquer janela
- app.whenReady() com tratamento de erro via dialog.showErrorBox
- getWindowIconPath():
  - packaged: path.join(process.resourcesPath, 'icon.ico')
  - dev: path.join(__dirname, 'build', 'icon.ico')
- BrowserWindow com contextIsolation: true, nodeIntegration: false
- BrowserWindow icon: usar .ico, verificar com nativeImage.createFromPath
- NÃO usar shell.writeShortcutLink no startup
- NÃO usar app.getPath('startMenu')
- NÃO editar atalhos do Windows

### Preload (preload.js)
- contextBridge expondo APIs específicas para o renderer
- Nunca expor require, process, fs ou child_process

### Renderer
- SPA em Vanilla JS
- Views separadas (ex: setup, login, dashboard, kanban)
- Modals para criação/edição
- Estado gerenciado em variáveis de escopo

### Database (SQLite via better-sqlite3)
- Banco em app.getPath('userData') (packaged) ou ./data/ (dev)
- Schema com CREATE TABLE IF NOT EXISTS
- Migrações controladas via PRAGMA user_version
- Dados de usuário separados da instalação do app

### Build (package.json)
- builder: "build" configuration
- appId: "com.meuapp.id"
- productName: "Meu App"
- win.target: ["nsis"]
- win.icon: "build/icon.ico"
- nsis: oneClick false, perMachine false, createDesktopShortcut true, createStartMenuShortcut true
- extraResources: build/icon.ico → icon.ico
- files: excluir build/, scripts/*, *.md
- scripts: build = generate-icon.js + @electron/rebuild + electron-builder --win

## Entregáveis esperados
- Código fonte organizado
- npm run build gerando instalador NSIS
- Ícone correto em .exe, Explorer, taskbar, instalador
- Banco SQLite funcional em dev e packaged
- Nenhum hack de atalho no startup
- README ou documentação explicando como usar e distribuir
```

---

## 17. Resumo executivo

### O que foi conquistado

O Te Cuida List é hoje um aplicativo desktop Windows funcional, estável e compartilhável. De uma ideia de organizador pessoal de tarefas, chegou-se a:

- Um gerenciador Kanban completo com 3 colunas, drag-and-drop, CRUD, boards múltiplos, dashboard, CSV, temas e multi-usuário.
- Um aplicativo Electron empacotado com instalador NSIS que qualquer pessoa pode instalar sem depender de ambiente de desenvolvimento.
- Um sistema de banco SQLite local que preserva dados do usuário entre atualizações.
- Um ícone personalizado que aparece corretamente no .exe, na janela, na taskbar e no instalador.

### Por que o resultado ficou bom

1. **Arquitetura simples e direta:** Express embarcado + SQLite + Vanilla JS — sem overengineering.
2. **Separação clara:** Main process, servidor, banco, preload, renderer — cada um com sua responsabilidade.
3. **Foco no usuário final:** A decisão de criar um instalador NSIS elevou o projeto de "script que roda no terminal" para "software que minha mãe consegue instalar".
4. **Persistência correta:** Banco em `%APPDATA%` garante que dados sobrevivem a reinstalações.
5. **Ícone consistente:** Depois de muita tentativa e erro, chegou-se a uma configuração que funciona em todas as camadas do Windows.

### Decisões que fizeram diferença

| Decisão | Impacto |
|---------|---------|
| electron-builder com NSIS em vez de electron-packager | Caminho estável, instalador, pin funcional |
| `extraResources` para icon.ico | Ícone acessível fora do asar |
| `app.setAppUserModelId` antes da janela | Agrupamento correto na taskbar |
| Banco em `app.getPath('userData')` | Dados não são perdidos em atualizações |
| Remover hacks de atalho no startup | Startup limpo, sem riscos de corromper atalhos |
| `BrowserWindow({ icon: .ico })` em vez de .png | Ícone de janela correto no Windows |
| generate-icon.js próprio | Controle total sobre multi-tamanhos do .ico |

### Por que o instalador Windows foi uma virada de chave

Antes do instalador NSIS, o Te Cuida List era um "aplicativo para desenvolvedores" — você precisava saber que o executável estava em `dist/alguma-pasta/` e executá-lo de lá. Fixar na taskbar era uma aposta que se perdia no próximo build.

Depois do instalador, o app se tornou **distribuível para qualquer pessoa com Windows**. Um arquivo `.exe` de 82 MB que instala o app, cria atalhos, coloca o ícone certo em tudo quanto é lugar e permite desinstalação limpa.

Isso **muda o nível do projeto**. Antes era um experimento técnico. Agora é um produto que pode ser compartilhado com amigos, familiares e colegas.

### Como isso permite compartilhar com terceiros

- Um único arquivo: `Te Cuida List Setup 1.0.1.exe`.
- A pessoa baixa, executa e segue o wizard de instalação.
- Abre o app, cria sua conta e começa a usar.
- Tudo offline, sem contas online, sem servidor.
- Se quiserem mais usuários no mesmo computador, é só criar.
- Se quiserem resetar, é só apagar o banco em `%APPDATA%`.

### O que deve ser preservado em evoluções futuras

1. **electron-builder + NSIS** — nunca voltar para electron-packager como solução principal.
2. **Banco em `%APPDATA%`** — separação entre app e dados.
3. **Ícone via `extraResources` + `process.resourcesPath`** — padrão que funciona.
4. **AppUserModelID fixo** — consistência no agrupamento da taskbar.
5. **Sem hacks de atalho** — o instalador cuida disso.
6. **100% offline** — a privacidade e confiabilidade de dados locais são o principal diferencial.
7. **Documentação de decisões** — este documento serve como memória para não repetir erros.

---

*Documento gerado em 27 de junho de 2026.*  
*Te Cuida List v1.0.1 — por Dirceu Vaz.*
