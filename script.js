/** =========================
 *  Data
 *  ========================= */
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

/** =========================
 *  Firebase Online
 *  ========================= */
const ONLINE = {
  enabled: false,
  db: null,
  gameId: null,
  gameRef: null,
  playerId: null,
  playerSide: null,
  whitePlayerId: null,
  blackPlayerId: null,
  unsubscribeGame: null,
  applyingRemote: false,
  configReady: false
};

function randomId(len = 10){
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i=0;i<len;i++) out += chars[bytes[i] % chars.length];
  return out;
}

function getPlayerId(){
  const key = "chesscards_player_id";
  let id = localStorage.getItem(key);
  if (!id){
    id = randomId(12);
    localStorage.setItem(key, id);
  }
  return id;
}

function getFirebaseConfig(){
  return window.FIREBASE_CONFIG || window.__FIREBASE_CONFIG__ || null;
}

function updateOnlineStatus(text){
  onlineStatusEl.textContent = text;
}

function updateOnlineStatusFromState(){
  if (!ONLINE.enabled){
    updateOnlineStatus(ONLINE.configReady ? "Local game" : "Local game (set FIREBASE_CONFIG for online)");
    return;
  }

  const who = ONLINE.playerSide === "w"
    ? "White"
    : ONLINE.playerSide === "b"
      ? "Black"
      : "Spectator";

  const turn = state.turn === "w" ? "White" : "Black";
  const turnSuffix = ONLINE.playerSide && ONLINE.playerSide === state.turn ? " • your turn" : "";
  updateOnlineStatus(`Online • ${who} • ${turn} to move${turnSuffix}`);
}

async function copyGameLink(){
  if (!ONLINE.gameId) return;
  await navigator.clipboard.writeText(window.location.href);
  updateOnlineStatus("Link copied");
}

function setUrlGameId(gameId){
  const url = new URL(window.location.href);
  url.searchParams.set("game", gameId);
  window.history.replaceState({}, "", url.toString());
}

function clearUrlGameId(){
  const url = new URL(window.location.href);
  url.searchParams.delete("game");
  window.history.replaceState({}, "", url.toString());
}

function serializeState(){
  return {
    board: state.board,
    turn: state.turn,
    turnCounter: state.turnCounter,
    capturedPieces: state.capturedPieces,
    decks: state.decks,
    hands: state.hands,
    selectedCards: { piece: null },
    gameOver: state.gameOver,
    inCheck: state.inCheck,
    moveLog: state.moveLog
  };
}

function applySerializedState(next){
  if (!next) return;

  state.board = next.board;
  state.turn = next.turn;
  state.turnCounter = next.turnCounter ?? 0;
  state.capturedPieces = next.capturedPieces ?? { w: [], b: [] };
  state.decks = next.decks;
  state.hands = next.hands;
  state.selectedCards = { piece: null };
  state.selected = null;
  state.legal = new Set();
  state.captures = new Set();
  state.gameOver = Boolean(next.gameOver);
  state.inCheck = next.inCheck ?? { w:false, b:false };
  state.moveLog = Array.isArray(next.moveLog) ? next.moveLog : [];
}

function canLocalAct(){
  if (!ONLINE.enabled) return true;
  if (!ONLINE.playerSide) return false;
  return ONLINE.playerSide === state.turn;
}

async function syncOnlineState(){
  if (!ONLINE.enabled || !ONLINE.gameRef || ONLINE.applyingRemote) return;
  await ONLINE.gameRef.set({
    state: serializeState(),
    whitePlayerId: ONLINE.whitePlayerId,
    blackPlayerId: ONLINE.blackPlayerId,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: ONLINE.playerId
  }, { merge: true });
}

async function subscribeToGame(){
  if (ONLINE.unsubscribeGame) ONLINE.unsubscribeGame();

  ONLINE.unsubscribeGame = ONLINE.gameRef.onSnapshot((snap)=>{
    if (!snap.exists) return;
    const data = snap.data();

    ONLINE.whitePlayerId = data.whitePlayerId || null;
    ONLINE.blackPlayerId = data.blackPlayerId || null;

    if (ONLINE.playerId === ONLINE.whitePlayerId) ONLINE.playerSide = "w";
    else if (ONLINE.playerId === ONLINE.blackPlayerId) ONLINE.playerSide = "b";
    else ONLINE.playerSide = "spectator";

    if (data.state){
      ONLINE.applyingRemote = true;
      applySerializedState(data.state);
      ONLINE.applyingRemote = false;
      renderAll();
    }

    copyLinkBtn.disabled = false;
    updateOnlineStatusFromState();
  });
}

async function createOnlineGame(){
  if (!ONLINE.db) return;

  const gameId = randomId(8);
  ONLINE.gameId = gameId;
  ONLINE.enabled = true;
  ONLINE.gameRef = ONLINE.db.collection("games").doc(gameId);
  ONLINE.whitePlayerId = ONLINE.playerId;
  ONLINE.blackPlayerId = null;
  ONLINE.playerSide = "w";

  newGame({ skipSync: true });

  await ONLINE.gameRef.set({
    whitePlayerId: ONLINE.whitePlayerId,
    blackPlayerId: ONLINE.blackPlayerId,
    state: serializeState(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: ONLINE.playerId
  });

  setUrlGameId(gameId);
  await subscribeToGame();
  updateOnlineStatusFromState();
}

async function joinOnlineGame(gameId){
  ONLINE.gameId = gameId;
  ONLINE.enabled = true;
  ONLINE.gameRef = ONLINE.db.collection("games").doc(gameId);

  await ONLINE.db.runTransaction(async (tx)=>{
    const snap = await tx.get(ONLINE.gameRef);
    if (!snap.exists) throw new Error("Game not found");

    const d = snap.data();
    let white = d.whitePlayerId || null;
    let black = d.blackPlayerId || null;

    if (ONLINE.playerId === white){
      ONLINE.playerSide = "w";
    } else if (ONLINE.playerId === black){
      ONLINE.playerSide = "b";
    } else if (!black){
      black = ONLINE.playerId;
      ONLINE.playerSide = "b";
      tx.update(ONLINE.gameRef, { blackPlayerId: black });
    } else {
      ONLINE.playerSide = "spectator";
    }

    ONLINE.whitePlayerId = white;
    ONLINE.blackPlayerId = black;
  });

  await subscribeToGame();
  updateOnlineStatusFromState();
}

function initOnline(){
  ONLINE.playerId = getPlayerId();

  createOnlineBtn.addEventListener("click", async ()=>{
    try {
      await createOnlineGame();
    } catch (e){
      updateOnlineStatus("Failed to create online game");
      console.error(e);
    }
  });

  copyLinkBtn.addEventListener("click", async ()=>{
    try {
      await copyGameLink();
    } catch (e){
      updateOnlineStatus("Copy failed");
    }
  });

  const cfg = getFirebaseConfig();
  if (!cfg){
    ONLINE.configReady = false;
    createOnlineBtn.disabled = true;
    copyLinkBtn.disabled = true;
    updateOnlineStatusFromState();
    return;
  }

  ONLINE.configReady = true;
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  ONLINE.db = firebase.firestore();
  createOnlineBtn.disabled = false;

  const gameId = new URLSearchParams(window.location.search).get("game");
  if (gameId){
    joinOnlineGame(gameId).catch((e)=>{
      console.error(e);
      updateOnlineStatus("Invalid game link");
      ONLINE.enabled = false;
      clearUrlGameId();
    });
  } else {
    updateOnlineStatusFromState();
  }
}

/** =========================
 *  Core Helpers
 *  ========================= */
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

function newGame({ skipSync = false } = {}){
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
    inCheck: { w:false, b:false },
    moveLog: []
  };

  for (const side of ["w","b"]) drawUpTo(side, 5);

  log("Game start. White to play.");
  renderAll();
  if (!skipSync) syncOnlineState().catch(()=>{});
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
 *  Chess + Rules
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
  const pawnDir = attackerSide==="w" ? -1 : 1;
  for (const dc of [-1,1]){
    const rr = targetR - pawnDir;
    const cc = targetC - dc;
    if (!inBounds(rr,cc)) continue;
    const p = boardRef[rr][cc];
    if (p && p.side===attackerSide && p.type==="P") return true;
  }

  const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr,dc] of knightDeltas){
    const rr = targetR + dr;
    const cc = targetC + dc;
    if (!inBounds(rr,cc)) continue;
    const p = boardRef[rr][cc];
    if (p && p.side===attackerSide && p.type==="N") return true;
  }

  const kingDeltas = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (const [dr,dc] of kingDeltas){
    const rr = targetR + dr;
    const cc = targetC + dc;
    if (!inBounds(rr,cc)) continue;
    const p = boardRef[rr][cc];
    if (p && p.side===attackerSide && p.type==="K") return true;
  }

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

function computeLegalForSelection(r,c){
  state.legal.clear();
  state.captures.clear();

  const piece = state.board[r][c];
  if (!piece || piece.side!==state.turn) return;

  const selPieceIdx = state.selectedCards.piece;
  const pieceCard = (selPieceIdx!=null) ? state.hands[state.turn].piece[selPieceIdx] : null;
  if (!pieceCard || pieceCard.id !== piece.type) return;

  const res = getLegalMovesForPiece(r,c,piece);
  for (const [rr,cc] of res.moves) state.legal.add(keyOf(rr,cc));
  for (const [rr,cc] of res.caps) state.captures.add(keyOf(rr,cc));
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
  syncOnlineState().catch(()=>{});
}

function redrawPieces(){
  if (state.gameOver) return;
  if (!canLocalAct()) return;

  const side = state.turn;
  if (state.inCheck[side]) return;

  state.hands[side].piece = [];
  drawUpTo(side, 5);

  log(`${side==="w"?"White":"Black"} redraws all PIECE cards (costs turn).`);
  passTurn("Redraw Pieces");
}

function attemptMove(toR,toC){
  if (state.gameOver || !state.selected) return;
  if (!canLocalAct()) return;

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

  if (fromPiece.type==="P" && ((fromPiece.side==="w" && toR===0) || (fromPiece.side==="b" && toR===7))){
    state.board[toR][toC].type = "Q";
    log(`${fromPiece.side==="w"?"White":"Black"} pawn promotes to Queen at ${algebraic(toR,toC)}.`);
  }

  state.hands[state.turn].piece.splice(selPieceIdx, 1);
  drawUpTo(state.turn, 5);

  log(`${state.turn==="w"?"White":"Black"} plays Piece:${pieceCard.id} → ${fromPiece.type} ${algebraic(r,c)}→${algebraic(toR,toC)}${captureText}.`);

  clearSelections();
  state.turn = (state.turn==="w") ? "b" : "w";
  state.turnCounter += 1;
  log(`— Turn passes to ${state.turn==="w"?"White":"Black"} —`);
  evaluateTurnThreats();
  renderAll();
  syncOnlineState().catch(()=>{});
}

function endTurn(){
  if (state.gameOver) return;
  if (!canLocalAct()) return;
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

const onlineStatusEl = document.getElementById("onlineStatus");
const createOnlineBtn = document.getElementById("createOnlineBtn");
const copyLinkBtn = document.getElementById("copyLinkBtn");

document.getElementById("resetBtn").addEventListener("click", ()=>{
  newGame();
});
document.getElementById("endTurnBtn").addEventListener("click", endTurn);
document.getElementById("redrawPiecesBtn").addEventListener("click", redrawPieces);

function renderAll(){
  renderBoard();
  renderCapturedPieces();
  renderHands();
  renderTurnUI();
  renderCoach();
  renderActionButtons();
  renderLog();
  updateOnlineStatusFromState();
}

function renderTurnUI(){
  // Static hand title in markup
}

function renderActionButtons(){
  const locked = !canLocalAct();
  document.getElementById("redrawPiecesBtn").disabled = state.gameOver || state.inCheck[state.turn] || locked;
  document.getElementById("endTurnBtn").disabled = state.gameOver || locked;
}

function renderCoach(){
  if (state.gameOver){
    coachIconEl.textContent = "🏁";
    coachTextEl.innerHTML = `<b>Game over.</b> Win condition is checkmate.<br><span class="muted">Hit Reset to start a fresh run.</span>`;
    return;
  }

  if (!canLocalAct()){
    const sideName = state.turn==="w" ? "White" : "Black";
    coachTextEl.innerHTML = `<b>Waiting for ${sideName}.</b><br><span class="muted">Opponent's turn.</span>`;
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
    const checkSuffix = state.inCheck[state.turn] ? " — Check" : "";
    coachTextEl.innerHTML =
      `<div>${sideEmoji}<span style="display:inline-block; width:6px;"></span><b>${sideName}'s turn${checkSuffix}.</b></div>
       <div style="margin-top:8px;">Choose a card to play.</div>
       <div class="muted" style="margin-top:8px;">Grey cards mean there are no legal chess moves for that piece right now.</div>`;
    return;
  }

  if (!state.selected){
    coachTextEl.innerHTML =
      `${sideEmoji} <b>Ready!</b> You played <b>${pieceCard.id}</b>.<br>
       <b>Step 2:</b> Click one of your <b>${pieceCard.id}</b> pieces on the board.`;
    return;
  }

  if (legalCount === 0){
    coachTextEl.innerHTML =
      `${sideEmoji} <b>No legal moves for that piece.</b><br>
       Try a different piece card.`;
    return;
  }

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
        if (state.gameOver || !canLocalAct()) return;

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
      if (state.gameOver || !enabled || !canLocalAct()) return;
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

function renderLog(){
  logEl.innerHTML = "";
  for (const msg of state.moveLog){
    const div = document.createElement("div");
    div.textContent = msg;
    logEl.appendChild(div);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

function log(msg){
  state.moveLog.push(msg);
  renderLog();
}

/** Start */
newGame({ skipSync: true });
initOnline();
