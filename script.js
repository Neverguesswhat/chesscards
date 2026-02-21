/** =========================
 *  Data
 *  ========================= */
const UNICODE = {
  w: { K:"\u2654", Q:"\u2655", R:"\u2656", B:"\u2657", N:"\u2658", P:"\u2659" },
  b: { K:"\u265A", Q:"\u265B", R:"\u265C", B:"\u265D", N:"\u265E", P:"\u265F" }
};

const PIECE_CARDS = [
  { id:"P", name:"Pawn", images:{ w:"./images/pawnwhitecard.svg",   b:"./images/pawnblackcard.svg" } },
  { id:"N", name:"Knight", images:{ w:"./images/knightwhitecard.svg", b:"./images/knightblackcard.svg" } },
  { id:"B", name:"Bishop", images:{ w:"./images/bishopwhitecard.svg", b:"./images/bishopblackcard.svg" } },
  { id:"R", name:"Rook", images:{ w:"./images/rookwhitecard.svg",   b:"./images/rookblackcard.svg" } },
  { id:"Q", name:"Queen", images:{ w:"./images/queenwhitecard.svg",  b:"./images/queenblackcard.svg" } },
  { id:"K", name:"King", images:{ w:"./images/kingwhitecard.svg",   b:"./images/kingblackcard.svg" } }
];

const BOARD_PIECES = {
  P: { w:"./images/pawnwhitenofill.svg",   b:"./images/pawnblacknofill.svg" },
  N: { w:"./images/knightwhitenofill.svg", b:"./images/knightblacknofill.svg" },
  B: { w:"./images/bishopwhitenofill.svg", b:"./images/bishopblacknofill.svg" },
  R: { w:"./images/rookwhitenofill.svg",   b:"./images/rookblacknofill.svg" },
  Q: { w:"./images/queenwhitenofill.svg",  b:"./images/queenblacknofill.svg" },
  K: { w:"./images/kingwhitenofill.svg",   b:"./images/kingblacknofill.svg" }
};

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
    turnCounter: 0,
    selected: null,
    legal: new Set(),
    captures: new Set(),
    capturedPieces: { w: [], b: [] },
    decks: {
      w: { piece: makePieceDeck() },
      b: { piece: makePieceDeck() }
    },
    hands: {
      w: { piece: [] },
      b: { piece: [] }
    },
    selectedCards: { piece: null },
    gameOver: false,
    inCheck: { w:false, b:false }
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

function ensureKingCardInHand(side){
  const hand = state.hands[side].piece;
  if (hand.some((c)=>c.id==="K")) return;
  if (!hand.length) return;

  const replaceIdx = hand.findIndex((c)=>c.id!=="K");
  if (replaceIdx === -1) return;

  const replaced = hand[replaceIdx];
  const deck = state.decks[side].piece;
  const kingIdx = deck.findIndex((c)=>c.id==="K");

  if (kingIdx !== -1){
    const [kingCard] = deck.splice(kingIdx, 1);
    hand[replaceIdx] = kingCard;
    deck.push(replaced);
    shuffle(deck);
    return;
  }

  hand[replaceIdx] = {id:"K"};
}

/** =========================
 *  Chess-legal moves
 *  ========================= */
function normalChessMoves(r,c,piece, boardRef = state.board){
  const moves=[], caps=[];
  const side = piece.side;
  const opp  = (side==="w") ? "b" : "w";

  const push = (rr,cc)=>{
    if (!inBounds(rr,cc)) return;
    const t = boardRef[rr][cc];
    if (!t) moves.push([rr,cc]);
    else if (t.side===opp && t.type!=="K") caps.push([rr,cc]);
  };

  const ray = (dr,dc)=>{
    let rr=r+dr, cc=c+dc;
    while(inBounds(rr,cc)){
      const t = boardRef[rr][cc];
      if (!t) moves.push([rr,cc]);
      else{
        if (t.side!==side && t.type!=="K") caps.push([rr,cc]);
        break;
      }
      rr+=dr; cc+=dc;
    }
  };

  switch(piece.type){
    case "P": {
      const dir = (side==="w") ? -1 : 1;
      const startRow = (side==="w") ? 6 : 1;

      if (inBounds(r+dir,c) && !boardRef[r+dir][c]){
        moves.push([r+dir,c]);
        if (r===startRow && !boardRef[r+2*dir][c]) moves.push([r+2*dir,c]);
      }
      for (const dc of [-1,1]){
        const rr=r+dir, cc=c+dc;
        if (!inBounds(rr,cc)) continue;
        const t = boardRef[rr][cc];
        if (t && t.side===opp && t.type!=="K") caps.push([rr,cc]);
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

function cloneBoard(boardRef){
  return boardRef.map((row)=>row.map((cell)=>cell ? {side:cell.side, type:cell.type} : null));
}

function findKing(boardRef, side){
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const p = boardRef[r][c];
      if (p && p.side===side && p.type==="K") return {r,c};
    }
  }
  return null;
}

function isSquareAttacked(boardRef, targetR, targetC, attackerSide){
  // Pawn attacks
  const pawnDir = attackerSide==="w" ? -1 : 1;
  for (const dc of [-1,1]){
    const rr = targetR - pawnDir;
    const cc = targetC - dc;
    if (!inBounds(rr,cc)) continue;
    const p = boardRef[rr][cc];
    if (p && p.side===attackerSide && p.type==="P") return true;
  }

  // Knight attacks
  const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr,dc] of knightDeltas){
    const rr = targetR + dr;
    const cc = targetC + dc;
    if (!inBounds(rr,cc)) continue;
    const p = boardRef[rr][cc];
    if (p && p.side===attackerSide && p.type==="N") return true;
  }

  // King attacks
  const kingDeltas = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (const [dr,dc] of kingDeltas){
    const rr = targetR + dr;
    const cc = targetC + dc;
    if (!inBounds(rr,cc)) continue;
    const p = boardRef[rr][cc];
    if (p && p.side===attackerSide && p.type==="K") return true;
  }

  // Sliding attacks: rook/queen
  for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
    let rr = targetR + dr;
    let cc = targetC + dc;
    while(inBounds(rr,cc)){
      const p = boardRef[rr][cc];
      if (p){
        if (p.side===attackerSide && (p.type==="R" || p.type==="Q")) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  // Sliding attacks: bishop/queen
  for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
    let rr = targetR + dr;
    let cc = targetC + dc;
    while(inBounds(rr,cc)){
      const p = boardRef[rr][cc];
      if (p){
        if (p.side===attackerSide && (p.type==="B" || p.type==="Q")) return true;
        break;
      }
      rr += dr;
      cc += dc;
    }
  }

  return false;
}

function isKingInCheck(side, boardRef = state.board){
  const kingPos = findKing(boardRef, side);
  if (!kingPos) return false;
  const attacker = side==="w" ? "b" : "w";
  return isSquareAttacked(boardRef, kingPos.r, kingPos.c, attacker);
}

function moveKeepsKingSafe(fromR, fromC, toR, toC){
  const sim = cloneBoard(state.board);
  const moving = sim[fromR][fromC];
  sim[toR][toC] = moving;
  sim[fromR][fromC] = null;
  return !isKingInCheck(moving.side, sim);
}

function getLegalMovesForPiece(r,c,piece){
  const pseudo = normalChessMoves(r,c,piece);
  const legalMoves = pseudo.moves.filter(([rr,cc])=>moveKeepsKingSafe(r,c,rr,cc));
  const legalCaps = pseudo.caps.filter(([rr,cc])=>moveKeepsKingSafe(r,c,rr,cc));
  return {moves:legalMoves, caps:legalCaps};
}

function sideHasAnyLegalMoveByBoard(side){
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const p = state.board[r][c];
      if (!p || p.side!==side) continue;
      const legal = getLegalMovesForPiece(r,c,p);
      if (legal.moves.length || legal.caps.length) return true;
    }
  }
  return false;
}

/** =========================
 *  Availability logic
 *  ========================= */
function pieceTypeHasAnyLegalMove(side, pieceType){
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const p = state.board[r][c];
      if (!p || p.side!==side || p.type!==pieceType) continue;

      const res = getLegalMovesForPiece(r,c,p);
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

  const res = getLegalMovesForPiece(r,c,piece);

  for (const [rr,cc] of res.moves){
    state.legal.add(keyOf(rr,cc));
  }
  for (const [rr,cc] of res.caps){
    state.captures.add(keyOf(rr,cc));
  }
}

function evaluateTurnThreats(){
  if (state.gameOver) return;
  const side = state.turn;
  const sideName = side==="w" ? "White" : "Black";
  const winner = side==="w" ? "Black" : "White";
  const inCheck = isKingInCheck(side);
  state.inCheck.w = false;
  state.inCheck.b = false;
  state.inCheck[side] = inCheck;
  if (!inCheck) return;

  ensureKingCardInHand(side);

  if (!sideHasAnyLegalMoveByBoard(side)){
    state.gameOver = true;
    log(`🏁 Checkmate: ${sideName} is checkmated. ${winner} wins.`);
    return;
  }
  log(`⚠️ ${sideName} is in check.`);
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
  state.turnCounter += 1;
  log(`(${reasonLabel}) — Turn passes to ${state.turn==="w"?"White":"Black"} —`);
  evaluateTurnThreats();
  renderAll();
}

function redrawPieces(){
  if (state.gameOver) return;
  const side = state.turn;
  if (state.inCheck[side]) return;

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
    state.capturedPieces[target.side].push(target.type);
    captureText = ` and captures ${target.side==="w"?"White":"Black"} ${target.type}`;
  }

  state.board[toR][toC] = fromPiece;
  state.board[r][c] = null;

  // Pawn promotion: auto-promote to Queen on last rank.
  if (fromPiece.type==="P" && ((fromPiece.side==="w" && toR===0) || (fromPiece.side==="b" && toR===7))){
    state.board[toR][toC].type = "Q";
    log(`${fromPiece.side==="w"?"White":"Black"} pawn promotes to Queen at ${algebraic(toR,toC)}.`);
  }

  // spend piece card
  state.hands[state.turn].piece.splice(selPieceIdx, 1);

  // refill
  drawUpTo(state.turn, 5);

  log(`${state.turn==="w"?"White":"Black"} plays Piece:${pieceCard.id} → ${fromPiece.type} ${algebraic(r,c)}→${algebraic(toR,toC)}${captureText}.`);

  clearSelections();

  state.turn = (state.turn==="w") ? "b" : "w";
  state.turnCounter += 1;
  log(`— Turn passes to ${state.turn==="w"?"White":"Black"} —`);
  evaluateTurnThreats();
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
const capturedWhiteEl = document.getElementById("capturedWhite");
const capturedBlackEl = document.getElementById("capturedBlack");
const logEl = document.getElementById("log");
const coachTextEl = document.getElementById("coachText");
const coachIconEl = document.getElementById("coachIcon");

document.getElementById("resetBtn").addEventListener("click", newGame);
document.getElementById("endTurnBtn").addEventListener("click", endTurn);
document.getElementById("redrawPiecesBtn").addEventListener("click", redrawPieces);

function renderAll(){
  renderBoard();
  renderCapturedPieces();
  renderHands();
  renderTurnUI();
  renderCoach();
  renderActionButtons();
}

function renderTurnUI(){
  // Hand title is static text in the markup.
}

function renderActionButtons(){
  document.getElementById("redrawPiecesBtn").disabled = state.gameOver || state.inCheck[state.turn];
  document.getElementById("endTurnBtn").disabled = state.gameOver;
}

function renderCoach(){
  if (state.gameOver){
    coachIconEl.textContent = "🏁";
    coachTextEl.innerHTML = `<b>Game over.</b> Win condition is checkmate.<br><span class="muted">Hit Reset to start a fresh run.</span>`;
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
    coachIconEl.textContent = "🎯";
    const checkSuffix = state.inCheck[state.turn] ? " — Check" : "";
    coachTextEl.innerHTML =
      `<div>${sideEmoji}<span style="display:inline-block; width:6px;"></span><b>${sideName}'s turn${checkSuffix}.</b></div>
       <div style="margin-top:8px;">Choose a card to play.</div>
       <div class="muted" style="margin-top:8px;">Grey cards mean there are no legal chess moves for that piece right now.</div>`;
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
  const whiteKingInCheck = isKingInCheck("w");
  const blackKingInCheck = isKingInCheck("b");
  const whiteCheckmate = whiteKingInCheck && !sideHasAnyLegalMoveByBoard("w");
  const blackCheckmate = blackKingInCheck && !sideHasAnyLegalMoveByBoard("b");
  for (let r=0;r<8;r++){
    for (let c=0;c<8;c++){
      const sq = document.createElement("div");
      sq.className = `sq ${((r+c)%2===0) ? "light":"dark"}`;

      const piece = state.board[r][c];
      if (piece){
        const img = document.createElement("img");
        img.className = "pieceArt";
        img.src = BOARD_PIECES[piece.type]?.[piece.side] ?? "";
        img.alt = `${piece.side === "w" ? "White" : "Black"} ${piece.type}`;
        sq.appendChild(img);

        const checkedKing =
          piece.type === "K" &&
          ((piece.side === "w" && whiteKingInCheck) || (piece.side === "b" && blackKingInCheck));
        if (checkedKing){
          const badge = document.createElement("div");
          badge.className = "checkBadge";
          const isMate =
            (piece.side === "w" && whiteCheckmate) ||
            (piece.side === "b" && blackCheckmate);
          badge.textContent = isMate ? "Checkmate" : "Check";
          sq.appendChild(badge);
        }
      }

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
    const enabled = pieceTypeHasAnyLegalMove(side, card.id);
    const cardImage = meta?.images?.[side] ?? "";

    const el = document.createElement("div");
    el.className = "cCard" +
      (state.selectedCards.piece===idx ? " selected" : "") +
      (!enabled ? " disabled" : "");

    el.innerHTML = `
      <img class="cardArt" src="${cardImage}" alt="${meta?.name ?? "Piece"} card" />
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

function renderCapturedPieces(){
  capturedWhiteEl.innerHTML = "";
  capturedBlackEl.innerHTML = "";

  state.capturedPieces.w.forEach((type, idx)=>{
    const img = document.createElement("img");
    img.className = "capturedPiece";
    img.src = BOARD_PIECES[type]?.w ?? "";
    img.alt = `Captured White ${type} ${idx + 1}`;
    capturedWhiteEl.appendChild(img);
  });

  state.capturedPieces.b.forEach((type, idx)=>{
    const img = document.createElement("img");
    img.className = "capturedPiece";
    img.src = BOARD_PIECES[type]?.b ?? "";
    img.alt = `Captured Black ${type} ${idx + 1}`;
    capturedBlackEl.appendChild(img);
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
