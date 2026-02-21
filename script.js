/** =========================
 *  Data
 *  ========================= */
const UNICODE = {
  w: { K:"\u2654", Q:"\u2655", R:"\u2656", B:"\u2657", N:"\u2658", P:"\u2659" },
  b: { K:"\u265A", Q:"\u265B", R:"\u265C", B:"\u265D", N:"\u265E", P:"\u265F" }
};

const PIECE_CARDS = [
  { id:"P", name:"Pawn", image:{ w:"./images/pawnwhitecard.svg", b:"./images/pawnblackcard.svg" } },
  { id:"N", name:"Knight", image:{ w:"./images/knightwhitecard.svg", b:"./images/knightblackcard.svg" } },
  { id:"B", name:"Bishop", image:{ w:"./images/bishopwhitecard.svg", b:"./images/bishopblackcard.svg" } },
  { id:"R", name:"Rook", image:{ w:"./images/rookwhitecard.svg", b:"./images/rookblackcard.svg" } },
  { id:"Q", name:"Queen", image:{ w:"./images/queenwhitecard.svg", b:"./images/queenblackcard.svg" } },
  { id:"K", name:"King", image:{ w:"./images/kingwhitecard.svg", b:"./images/kingblackcard.svg" } }
];

function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function keyOf(r,c){ return `${r},${c}`; }
function algebraic(r,c){ return "abcdefgh"[c] + (8-r); }
function shuffle(arr){
  for (let i = arr.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function unique(arr){ return [...new Set(arr)]; }

/** =========================
 *  Game State
 *  ========================= */
let state;

function newGame(){
  state = {
    board: makeStartingBoard(),
    turn: "w",
    selected: null,
    legal: new Set(),
    captures: new Set(),
    decks: {
      w: { piece: makePieceDeck() },
      b: { piece: makePieceDeck() }
    },
    hands: {
      w: { piece: [] },
      b: { piece: [] }
    },
    selectedCards: { piece: null },
    gameOver: false
  };

  for (const side of ["w","b"]){
    drawUpTo(side, 5);
  }

  logClear();
  log("Game start. White to play.");
  renderAll();
}

function makeStartingBoard(){
  const b = Array.from({length:8},()=>Array(8).fill(null));
  for (let c=0;c<8;c++){
    b[6][c] = {side:"w", type:"P"};
    b[1][c] = {side:"b", type:"P"};
  }
  const back = ["R","N","B","Q","K","B","N","R"];
  for (let c=0;c<8;c++){
    b[7][c] = {side:"w", type:back[c]};
    b[0][c] = {side:"b", type:back[c]};
  }
  return b;
}

function makePieceDeck(){
  const deck = [];
  const add = (id,n)=>{ for(let i=0;i<n;i++) deck.push({id}); };
  add("P",10); add("N",4); add("B",4); add("R",4); add("Q",2); add("K",2);
  return shuffle(deck);
}

function drawCard(side){
  let deck = state.decks[side].piece;
  if (deck.length === 0){
    state.decks[side].piece = makePieceDeck();
    deck = state.decks[side].piece;
  }
  return deck.pop();
}

function drawUpTo(side, count){
  const hand = state.hands[side].piece;
  while (hand.length < count) hand.push(drawCard(side));
}

/** =========================
 *  Chess-legal moves
 *  ========================= */
function normalChessMoves(r,c,piece){
  const moves=[], caps=[];
  const side = piece.side;
  const opp  = (side==="w") ? "b" : "w";

  const push = (rr,cc)=>{
    if (!inBounds(rr,cc)) return;
    const t = state.board[rr][cc];
    if (!t) moves.push([rr,cc]);
    else if (t.side===opp) caps.push([rr,cc]);
  };

  const ray = (dr,dc)=>{
    let rr=r+dr, cc=c+dc;
    while(inBounds(rr,cc)){
      const t = state.board[rr][cc];
      if (!t) moves.push([rr,cc]);
      else{
        if (t.side!==side) caps.push([rr,cc]);
        break;
      }
      rr+=dr; cc+=dc;
    }
  };

  switch(piece.type){
    case "P": {
      const dir = (side==="w") ? -1 : 1;
      const startRow = (side==="w") ? 6 : 1;

      if (inBounds(r+dir,c) && !state.board[r+dir][c]){
        moves.push([r+dir,c]);
        if (r===startRow && !state.board[r+2*dir][c]) moves.push([r+2*dir,c]);
      }
      for (const dc of [-1,1]){
        const rr=r+dir, cc=c+dc;
        if (!inBounds(rr,cc)) continue;
        const t = state.board[rr][cc];
        if (t && t.side===opp) caps.push([rr,cc]);
      }
      break;
    }
    case "N": {
      const ds=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr,dc] of ds) push(r+dr,c+dc);
      break;
    }
    case "B": for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) ray(dr,dc); break;
    case "R": for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) ray(dr,dc); break;
    case "Q": for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) ray(dr,dc); break;
    case "K": for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) push(r+dr,c+dc); break;
  }
  return {moves,caps};
}

/** =========================
 *  Availability logic
 *  ========================= */
function pieceTypeHasAnyLegalMove(side, pieceType){
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const p = state.board[r][c];
      if (!p || p.side!==side || p.type!==pieceType) continue;

      const res = normalChessMoves(r,c,p);
      if (res.moves.length || res.caps.length) return true;
    }
  }
  return false;
}

function currentPlayerHasAnyMove(){
  const side = state.turn;
  const pieceTypes = unique(state.hands[side].piece.map(c=>c.id));

  for (const t of pieceTypes){
    if (pieceTypeHasAnyLegalMove(side, t)) return true;
  }
  return false;
}

/** =========================
 *  Legal squares for selected piece
 *  ========================= */
function computeLegalForSelection(r,c){
  state.legal.clear();
  state.captures.clear();

  const piece = state.board[r][c];
  if (!piece || piece.side!==state.turn) return;

  const selPieceIdx = state.selectedCards.piece;
  const pieceCard = (selPieceIdx!=null) ? state.hands[state.turn].piece[selPieceIdx] : null;
  if (!pieceCard || pieceCard.id !== piece.type) return;

  const res = normalChessMoves(r,c,piece);

  for (const [rr,cc] of res.moves){
    state.legal.add(keyOf(rr,cc));
  }
  for (const [rr,cc] of res.caps){
    state.captures.add(keyOf(rr,cc));
  }
}

/** =========================
 *  Turn actions
 *  ========================= */
function clearSelections(){
  state.selected = null;
  state.selectedCards.piece = null;
  state.legal.clear();
  state.captures.clear();
}

function passTurn(reasonLabel){
  clearSelections();
  state.turn = (state.turn==="w") ? "b" : "w";
  log(`(${reasonLabel}) — Turn passes to ${state.turn==="w"?"White":"Black"} —`);
  renderAll();
}

function redrawPieces(){
  if (state.gameOver) return;
  const side = state.turn;

  state.hands[side].piece = [];
  drawUpTo(side, 5);

  log(`${side==="w"?"White":"Black"} redraws all PIECE cards (costs turn).`);
  passTurn("Redraw Pieces");
}

/** =========================
 *  Move resolution
 *  ========================= */
function attemptMove(toR,toC){
  if (state.gameOver || !state.selected) return;

  const {r,c} = state.selected;
  const fromPiece = state.board[r][c];
  if (!fromPiece || fromPiece.side!==state.turn) return;

  const k = keyOf(toR,toC);
  if (!(state.legal.has(k) || state.captures.has(k))) return;

  const selPieceIdx = state.selectedCards.piece;
  const pieceCard = (selPieceIdx!=null) ? state.hands[state.turn].piece[selPieceIdx] : null;
  if (!pieceCard || pieceCard.id !== fromPiece.type) return;

  const target = state.board[toR][toC];
  let captureText = "";
  if (target){
    captureText = ` and captures ${target.side==="w"?"White":"Black"} ${target.type}`;
    if (target.type==="K") state.gameOver = true;
  }

  state.board[toR][toC] = fromPiece;
  state.board[r][c] = null;

  // spend piece card
  state.hands[state.turn].piece.splice(selPieceIdx, 1);

  // refill
  drawUpTo(state.turn, 5);

  log(`${state.turn==="w"?"White":"Black"} plays Piece:${pieceCard.id} → ${fromPiece.type} ${algebraic(r,c)}→${algebraic(toR,toC)}${captureText}.`);

  clearSelections();

  if (state.gameOver){
    log(`🏁 Game over: ${state.turn==="w"?"White":"Black"} captured the King.`);
    renderAll();
    return;
  }

  state.turn = (state.turn==="w") ? "b" : "w";
  log(`— Turn passes to ${state.turn==="w"?"White":"Black"} —`);
  renderAll();
}

function endTurn(){
  if (state.gameOver) return;
  passTurn("Pass");
}

/** =========================
 *  UI
 *  ========================= */
const boardEl = document.getElementById("board");
const pieceHandEl = document.getElementById("pieceHand");
const turnPillEl = document.getElementById("turnPill");
const handSubEl = document.getElementById("handSub");
const logEl = document.getElementById("log");
const coachTextEl = document.getElementById("coachText");
const coachIconEl = document.getElementById("coachIcon");

document.getElementById("resetBtn").addEventListener("click", newGame);
document.getElementById("endTurnBtn").addEventListener("click", endTurn);
document.getElementById("redrawPiecesBtn").addEventListener("click", redrawPieces);

function renderAll(){
  renderBoard();
  renderHands();
  renderTurnUI();
  renderCoach();
  renderActionButtons();
}

function renderTurnUI(){
  const sideName = state.turn==="w" ? "White" : "Black";
  turnPillEl.textContent = `Turn: ${sideName}${state.gameOver ? " (Game Over)" : ""}`;
  turnPillEl.className = "pill " + (state.gameOver ? "over" : (state.turn==="w" ? "turnW" : "turnB"));
  handSubEl.textContent = `${sideName}: 5 piece cards`;
}

function renderActionButtons(){
  document.getElementById("redrawPiecesBtn").disabled = state.gameOver;
  document.getElementById("endTurnBtn").disabled = state.gameOver;
}

function renderCoach(){
  if (state.gameOver){
    coachIconEl.textContent = "🏁";
    coachTextEl.innerHTML = `<b>Game over.</b> In this prototype you win by capturing the King.<br><span class="muted">Hit Reset to start a fresh run.</span>`;
    return;
  }

  const sideName = state.turn==="w" ? "White" : "Black";
  const sideEmoji = state.turn==="w" ? "⚪" : "⚫";

  const selPieceIdx = state.selectedCards.piece;
  const pieceCard = (selPieceIdx!=null) ? state.hands[state.turn].piece[selPieceIdx] : null;
  const legalCount = state.legal.size + state.captures.size;

  const stuck = !currentPlayerHasAnyMove();
  if (stuck){
    coachIconEl.textContent = "🪦";
    coachTextEl.innerHTML =
      `${sideEmoji} <b>${sideName} is stuck.</b><br>
       You have no valid piece-card move right now.<br>
       <span class="muted">Use <b>Redraw Pieces</b> (costs your turn).</span>`;
    return;
  }

  if (!pieceCard){
    coachIconEl.textContent = "🧠";
    coachTextEl.innerHTML =
      `${sideEmoji} <b>${sideName} to play!</b><br>
       <b>Step 1:</b> Choose a <b>Piece card</b>.<br>
       <span class="muted">Grey piece cards mean there are no legal chess moves for that piece type right now.</span>`;
    return;
  }

  if (!state.selected){
    coachIconEl.textContent = "🎯";
    coachTextEl.innerHTML =
      `${sideEmoji} <b>Ready!</b> You played <b>${pieceCard.id}</b>.<br>
       <b>Step 2:</b> Click one of your <b>${pieceCard.id}</b> pieces on the board.`;
    return;
  }

  if (legalCount === 0){
    coachIconEl.textContent = "⛔";
    coachTextEl.innerHTML =
      `${sideEmoji} <b>No legal moves for that piece.</b><br>
       Try a different piece card.`;
    return;
  }

  coachIconEl.textContent = state.captures.size ? "⚔️" : "✨";
  coachTextEl.innerHTML =
    `${sideEmoji} <b>${sideName} — make your move!</b><br>
     Click a highlighted square. <b>${state.captures.size}</b> capture(s) available.`;
}

function renderBoard(){
  boardEl.innerHTML = "";
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const sq = document.createElement("div");
      sq.className = `sq ${((r+c)%2===0) ? "light":"dark"}`;

      const piece = state.board[r][c];
      if (piece) sq.textContent = UNICODE[piece.side][piece.type];

      const k = keyOf(r,c);
      if (state.selected && state.selected.r===r && state.selected.c===c) sq.classList.add("selected");
      if (state.legal.has(k)) sq.classList.add("legal");
      if (state.captures.has(k)) sq.classList.add("capture");

      const coord = document.createElement("div");
      coord.className="coord";
      coord.textContent = algebraic(r,c);
      sq.appendChild(coord);

      sq.addEventListener("click", ()=>{
        if (state.gameOver) return;

        // If clicking a legal target: move
        if (state.selected && (state.legal.has(k) || state.captures.has(k))){
          attemptMove(r,c);
          return;
        }

        const p = state.board[r][c];
        if (p && p.side===state.turn){
          const selPieceIdx = state.selectedCards.piece;
          const pieceCard = (selPieceIdx!=null) ? state.hands[state.turn].piece[selPieceIdx] : null;

          if (!pieceCard || pieceCard.id !== p.type){
            state.selected = null;
            state.legal.clear();
            state.captures.clear();
            renderAll();
            return;
          }

          state.selected = {r,c};
          computeLegalForSelection(r,c);
          renderAll();
          return;
        }

        // Clicked empty/opponent: clear
        state.selected = null;
        state.legal.clear();
        state.captures.clear();
        renderAll();
      });

      boardEl.appendChild(sq);
    }
  }
}

function renderHands(){
  const side = state.turn;

  pieceHandEl.innerHTML = "";
  state.hands[side].piece.forEach((card, idx)=>{
    const meta = PIECE_CARDS.find(x=>x.id===card.id);
    const image = meta?.image?.[side] ?? "";
    const enabled = pieceTypeHasAnyLegalMove(side, card.id);

    const el = document.createElement("div");
    el.className = "cCard" +
      (state.selectedCards.piece===idx ? " selected" : "") +
      (!enabled ? " disabled" : "");

    el.innerHTML = `
      <img class="cardArt" src="${image}" alt="${meta?.name ?? "Piece"} card" />
      <div class="small">${meta?.name ?? "Piece"} • ${card.id}</div>
      <div class="tag">${enabled ? "Playable" : "No legal moves"}</div>
    `;

    el.addEventListener("click", ()=>{
      if (state.gameOver || !enabled) return;
      state.selectedCards.piece = (state.selectedCards.piece===idx) ? null : idx;
      state.selected = null;
      state.legal.clear();
      state.captures.clear();
      renderAll();
    });

    pieceHandEl.appendChild(el);
  });
}

/** =========================
 *  Log
 *  ========================= */
function logClear(){ logEl.innerHTML = ""; }
function log(msg){
  const div = document.createElement("div");
  div.textContent = msg;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

/** Start */
newGame();
