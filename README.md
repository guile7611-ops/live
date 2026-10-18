# 🗳️ TikTok LIVE - Urna Eletrônica Interativa (13 vs 22)
## Sistema Completo com Backend, Fila de Eventos, WebSocket e Painel Administrativo

Overlay interativo vertical no formato **9:16** inspirado na interface de transmissão do **TikTok LIVE**, com gamificação, urna eletrônica 3D realista, mão animada com dedos e manga calibrados, placares em tempo real, barra de disputa dinâmica, fila inteligente de presentes e painel administrativo completo.

---

## 🚀 Como Iniciar em 1 Clique (Windows)

Dê um duplo clique no arquivo:
👉 **`iniciar_live.bat`**

O script iniciará o servidor Node.js e abrirá automaticamente no navegador padrão:
- **Overlay da Live (9:16):** [http://localhost:3000/overlay](http://localhost:3000/overlay)
- **Painel Administrativo:** [http://localhost:3000/admin](http://localhost:3000/admin)
- **Cockpit de Testes:** [http://localhost:3000/test](http://localhost:3000/test)

---

## 🏛️ Arquitetura do Sistema

O sistema é dividido em três camadas desacopladas e integradas via **WebSocket** e **REST API**:

```
                       ┌────────────────────────┐
                       │   TikTok LIVE Real /   │
                       │   Webhooks Externos    │
                       └───────────┬────────────┘
                                   │ POST /api/tiktok/event
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND (Node.js)                         │
│                                                                 │
│  ┌──────────────────────┐           ┌────────────────────────┐  │
│  │   tiktokConnector    │ ────────► │      queueManager      │  │
│  │  (Listener & Bridge) │           │ (Fila & Anti-Flood)    │  │
│  └──────────────────────┘           └───────────┬────────────┘  │
│                                                 │               │
│  ┌──────────────────────┐                       ▼               │
│  │     stateManager     │ ◄─────────── Atualiza Pontuações      │
│  │  (data/state.json)   │                                       │
│  └──────────────────────┘                                       │
│             │                                                   │
│             ▼ WebSocket Broadcast (/ws)                         │
└─────────────┬───────────────────────────────────────────────────┘
              │
      ┌───────┴────────────────────────┐
      ▼                                ▼
┌──────────────────┐         ┌──────────────────┐
│  /overlay (9:16) │         │      /admin      │
│  - Urna 3D       │         │  - Painel Geral  │
│  - Mão Animada   │         │  - Mapear Dons   │
│  - Placares      │         │  - Configurações │
│  - Barra Disputa │         │  - Logs ao Vivo  │
└──────────────────┘         └──────────────────┘
```

---

## 🎮 Regras e Mecânica da Disputa

- **Lado 13 (Esquerdo - Vermelho):**
  - Mapeamento padrão: **Rosa** (`assets/rose.png`) = +1 voto
  - Animação na Urna:
    1. A mão desliza até a tecla **1** (afunda com clique tátil e som)
    2. A tela da urna exibe `1`
    3. A mão desliza até a tecla **3** (afunda com clique)
    4. A tela da urna exibe `13`
    5. A mão desliza até **CONFIRMA** (pressiona com o som do TSE)
    6. A tela da urna exibe `"FIM"` e pisca em verde
    7. O placar do 13 incrementa
    8. A barra de disputa se move em direção ao vermelho
    9. Chuva de corações vermelhos e pílula de voto recente aparecem

- **Lado 22 (Direito - Verde):**
  - Mapeamento padrão: **Flor branca** (`assets/white_flower.png`) = +1 voto
  - Animação na Urna:
    1. A mão desliza até a tecla **2** (afunda com clique)
    2. A tela exibe `2`
    3. A mão executa um segundo clique na tecla **2**
    4. A tela exibe `22`
    5. A mão desliza até **CONFIRMA** (pressiona com o som da urna)
    6. Tela exibe `"FIM"`
    7. Placar do 22 incrementa e a barra se move em direção ao verde
    8. Chuva de corações verdes e pílula de voto recente aparecem

---

## ⚡ Tratamento de Combos e Fila Inteligente

Quando um usuário envia múltiplos presentes simultaneamente (ex: **Rosa x10**, **Flor branca x25**):
- **100% dos votos são computados instantaneamente** no banco persistente do backend.
- O multiplicador `x10` ou `x25` é exibido em destaque dourado no feed de presentes.
- O sistema suporta dois modos configuráveis no `/admin`:
  1. **Modo Detalhado:** Anima os votos com velocidade adaptativa; se a fila acumular mais de 3 eventos, o tempo de viagem da mão é automaticamente acelerado em até 40% para manter fluidez sem congelar a tela.
  2. **Modo Resumido (Compacto):** Agrupa os combos num único disparo de alto impacto visual com efeito acumulado, ideal para transmissões com centenas de presentes por minuto.

---

## ⚙️ Painel Administrativo (`/admin`)

Acesse [http://localhost:3000/admin](http://localhost:3000/admin) para gerenciar toda a transmissão em tempo real:

1. **Status da Partida:**
   - Placar em tempo real com votos e porcentagens sincronizados via WebSocket.
   - Mini barra de disputa e cronômetro.
   - Botões: `Iniciar`, `Pausar`, `Resetar Votos` e `Encerrar`.

2. **Configuração Visual:**
   - Personalize o título da live, números e nomes dos lados.
   - Toggles instantâneos:
     - Ativar/Desativar Animação da Mão
     - Ativar/Desativar Sons da Urna
     - Ativar/Desativar Chuva de Corações
     - Ativar/Desativar Comentários Simulados
     - Ativar/Desativar Fundo Transparente (Chroma/Alpha para OBS)
     - Alternar Modo da Fila (Detalhado vs Resumido)

3. **Mapeamento Dinâmico de Presentes:**
   - Tabela onde você define qual presente do TikTok pontua para o 13 ou para o 22.
   - Define o peso em votos de cada presente (ex: Rosa = 1 voto, Presente = 5 votos, Galáxia = 100 votos).
   - Adicione novos presentes dinamicamente com 1 clique.

4. **TikTok LIVE Bridge:**
   - Insira o `@nomedeusuario` da sua live no TikTok.
   - Botão para conectar diretamente à live.
   - Botão para ligar o **Simulador Automático de Live** (ótimo para testar sem estar ao vivo).

5. **Auditoria e Logs em Tempo Real:**
   - Histórico em tempo real de cada voto, presente, usuário e timestamp recebido pelo backend.

---

## 📡 Integração com Presentes do TikTok LIVE

O backend expõe um endpoint REST pronto para receber eventos de presentes de bridges externos ou automações:

### Webhook HTTP para envio de presentes:
- **URL:** `POST http://localhost:3000/api/tiktok/event`
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
  "username": "@joaosilva",
  "giftName": "Rosa",
  "count": 10,
  "avatar": "https://..."
}
```

O backend interpreta o `giftName`, consulta a tabela de presentes ativa, calcula a quantidade de votos (`count * votesPerUnit`), atribui ao lado correspondente (13 ou 22), atualiza a pontuação e dispara o evento no overlay via WebSocket.

---

## 🎬 Como Configurar no OBS Studio

1. Abra o **OBS Studio**.
2. Na caixa **Fontes (Sources)**, clique no `+` e escolha **Navegador (Browser Source)**.
3. Configure:
   - **URL:** `http://localhost:3000/overlay`
   - **Largura (Width):** `1080`
   - **Altura (Height):** `1920` (ou `720` x `1280` para 720p vertical)
   - **FPS:** `60`
   - Marque a opção: **"Controlar áudio via OBS"** (para capturar os sons da urna).
4. **Opção de Fundo Transparente:**
   - Se desejar sobrepor a urna diretamente sobre a imagem da sua câmera ou vídeo de fundo, ative a opção **"Fundo Transparente para OBS"** no [Painel Admin](http://localhost:3000/admin). O fundo da sala e mesa será removido e o overlay terá transparência total nativa!

---

## 💾 Persistência de Dados

Todos os votos, estados da partida, preferências visuais e mapeamento de presentes são persistidos automaticamente no arquivo:
📁 `data/state.json`

Se o servidor for reiniciado, a contagem exata e as configurações são restauradas sem perda de dados.
