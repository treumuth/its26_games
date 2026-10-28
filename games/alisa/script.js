import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-analytics.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit 
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBhvZMRuOJUQrCJ1f2ssdIIDNmoGZr6ndE",
  authDomain: "treumuth-its26games-alisa.firebaseapp.com",
  projectId: "treumuth-its26games-alisa",
  storageBucket: "treumuth-its26games-alisa.firebasestorage.app",
  messagingSenderId: "656147050699",
  appId: "1:656147050699:web:e5ba40d92fff15a84aab4e",
  measurementId: "G-5GSGRWVE0P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// --- STATE VARIABLES ---
let currentUser = null;
let firestoreLeaderboard = [];
let gameStartTime = 0;
let totalKills = 0;

let currentPlayerName = localStorage.getItem('kosmose_player_name') || 'Allu';
let keysCount = parseInt(localStorage.getItem('kosmose_keys') || '3');
let highScore = parseInt(localStorage.getItem('kosmose_highscore') || '0');

document.getElementById('playerNameInput').value = currentPlayerName;
document.getElementById('keyCount').innerText = keysCount;
document.getElementById('topScoreNav').innerText = highScore;

let selectedShip = localStorage.getItem('kosmose_ship') || 'neon';
let selectedLaser = localStorage.getItem('kosmose_laser') || 'cyan';

const SHIPS = {
  neon: { name: "Neoon-Süstik", color: "#06b6d4", speed: 6.5 },
  plasma: { name: "Plasma-Hävitaja", color: "#a855f7", speed: 7.5 },
  titan: { name: "Titaan-Ristleja", color: "#f59e0b", speed: 5.5 },
  quantum: { name: "Kvant-Torm", color: "#10b981", speed: 8.5 }
};

const LASERS = {
  cyan: { name: "Neoon Sinine", color: "#38bdf8" },
  plasma: { name: "Lilla Plasma", color: "#c084fc" },
  fire: { name: "Tule-Kiir", color: "#f97316" }
};

let achievements = JSON.parse(localStorage.getItem('kosmose_achievements') || '{}');

const ACHIEVEMENTS_LIST = [
  { id: 'first_game', title: 'Esimene Lend', desc: 'Mängi oma esimene lahing', reward: 2 },
  { id: 'score_500', title: 'Snoob-Laskur', desc: 'Saa skooriks vähemalt 500 panka', reward: 3 },
  { id: 'score_2000', title: 'Kosmose-Ass', desc: 'Saa skooriks vähemalt 2000 panka', reward: 5 },
  { id: 'powerup_collector', title: 'Boonuste Koguja', desc: 'Kogu mängus boonuseid', reward: 3 }
];

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let isPlaying = false;
let score = 0;
let lives = 3;
let level = 1;
let animFrame = 0;

const player = {
  x: canvas.width / 2,
  y: canvas.height - 80,
  width: 44,
  height: 44,
  tripleShotTimer: 0,
  speedBoostTimer: 0
};

let bullets = [], enemyBullets = [], enemies = [], powerUps = [], particles = [], stars = [];
const keys = { left: false, right: false, shoot: false };

// Start screen: lock the name to the Google account when logged in
function updateStartAuthUI() {
  const input = document.getElementById('playerNameInput');
  const hint = document.getElementById('authHint');
  const loginBtn = document.getElementById('startLoginBtn');

  if (currentUser) {
    input.value = currentPlayerName;
    input.readOnly = true;
    hint.textContent = 'Sisse logitud – tulemus salvestatakse edetabelisse.';
    hint.className = 'text-[11px] text-emerald-400';
    loginBtn.classList.add('hidden');
  } else {
    input.readOnly = false;
    hint.textContent = 'Edetabelisse pääsemiseks logi sisse.';
    hint.className = 'text-[11px] text-slate-500';
    loginBtn.classList.remove('hidden');
  }
}

document.getElementById('startLoginBtn').addEventListener('click', () => {
  signInWithPopup(auth, googleProvider).catch((err) => console.error("Sisselogimise viga:", err));
});
updateStartAuthUI();

// --- GOOGLE AUTHENTICATION (VOCO.EE RESTRICTION) ---
onAuthStateChanged(auth, (user) => {
  const authContainer = document.getElementById('authContainer');
  if (user) {
    if (!user.email.endsWith('@voco.ee')) {
      alert('Sisselogimine on lubatud ainult @voco.ee e-posti aadressiga!');
      signOut(auth);
      return;
    }
    currentUser = user;
    currentPlayerName = user.displayName || user.email.split('@')[0];
    updateStartAuthUI();

    if (authContainer) {
      authContainer.innerHTML = `
        <div class="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1 rounded-xl text-xs text-slate-200">
          <span class="text-emerald-400 font-bold">●</span> ${user.displayName || user.email}
          <button id="logoutBtn" class="ml-2 text-red-400 hover:text-red-300 font-bold">Välju</button>
        </div>`;
      document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));
    }
  } else {
    currentUser = null;
    currentPlayerName = localStorage.getItem('kosmose_player_name') || 'Allu';
    document.getElementById('playerNameInput').value = currentPlayerName;
    updateStartAuthUI();
    if (authContainer) {
      authContainer.innerHTML = `
        <button id="loginBtn" class="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2">
          <i class="fa-brands fa-google"></i> Logi sisse (@voco.ee)
        </button>`;
      document.getElementById('loginBtn').addEventListener('click', () => {
        signInWithPopup(auth, googleProvider).catch((err) => {
          console.error("Sisselogimise viga:", err);
        });
      });
    }
  }
});

// --- FIRESTORE REALTIME LEADERBOARD ---
const lbQuery = query(collection(db, "leaderboard"), orderBy("kills", "desc"), limit(50));
onSnapshot(lbQuery, (snapshot) => {
  firestoreLeaderboard = [];
  snapshot.forEach((doc) => {
    firestoreLeaderboard.push(doc.data());
  });
  renderLeaderboard();
}, (error) => {
  console.error("Viga edetabeli laadimisel:", error);
});

// Audio Synthesizer
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;

  if (type === 'shoot') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
  } else if (type === 'explosion') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(30, now + 0.25);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.25);
    osc.start(now);
    osc.stop(now + 0.25);
  } else if (type === 'powerup') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

// Init Stars
for (let i = 0; i < 70; i++) {
  stars.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 2 + 0.5,
    speed: Math.random() * 1.5 + 0.3
  });
}

// Event Listeners
document.getElementById('startBtn').addEventListener('click', startNewGame);
document.getElementById('restartBtn').addEventListener('click', () => {
  document.getElementById('gameOverContent').classList.add('hidden');
  document.getElementById('startOverlayContent').classList.remove('hidden');
  startNewGame();
});

document.getElementById('navMenuBtn').addEventListener('click', () => switchTab('menu'));
document.getElementById('navCharBtn').addEventListener('click', () => switchTab('characters'));
document.getElementById('navBoardsBtn').addEventListener('click', () => switchTab('boards'));
document.getElementById('navAwardsBtn').addEventListener('click', () => switchTab('awards'));
document.getElementById('closeModalBtn').addEventListener('click', closeModal);

document.getElementById('searchPlayer').addEventListener('input', (e) => {
  renderLeaderboard(e.target.value);
});

window.addEventListener('keydown', e => {
  if (isPlaying && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
  if (e.code === 'Space') {
    if (!keys.shoot && isPlaying) shootBullet();
    keys.shoot = true;
  }
});

window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  if (e.code === 'Space') keys.shoot = false;
});

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderLeaderboard(filter = "") {
  const listContainer = document.getElementById('leaderboardList');
  const totalBadge = document.getElementById('totalPlayersBadge');
  const avgBadge = document.getElementById('avgScoreVal');

  const filtered = firestoreLeaderboard.filter(item => item.name.toLowerCase().includes(filter.toLowerCase()));
  totalBadge.innerText = `${firestoreLeaderboard.length} Mängijat`;

  if (firestoreLeaderboard.length > 0) {
    const sum = firestoreLeaderboard.reduce((a, b) => a + (b.kills || 0), 0);
    avgBadge.innerText = Math.round(sum / firestoreLeaderboard.length);
  } else {
    avgBadge.innerText = "0";
  }

  listContainer.innerHTML = "";

  if (filtered.length === 0) {
    listContainer.innerHTML = `<div class="text-center py-12 text-slate-500 text-xs">Edetabel on tühi või tulemusi ei leitud!</div>`;
    return;
  }

  filtered.forEach((entry, index) => {
    const rank = index + 1;
    let rankBadge = `<span class="w-6 text-center text-slate-400 font-bold text-xs">${rank}</span>`;
    if (rank === 1) rankBadge = `<span class="w-6 text-center text-amber-400 text-sm"><i class="fa-solid fa-crown"></i></span>`;
    else if (rank === 2) rankBadge = `<span class="w-6 text-center text-slate-300 text-sm"><i class="fa-solid fa-medal"></i></span>`;
    else if (rank === 3) rankBadge = `<span class="w-6 text-center text-amber-600 text-sm"><i class="fa-solid fa-award"></i></span>`;

    const row = document.createElement('div');
    row.className = "flex items-center justify-between p-2.5 rounded-xl bg-slate-950/50 border border-slate-800 text-slate-300";
    row.innerHTML = `
      <div class="flex items-center gap-2 overflow-hidden">
        ${rankBadge}
        <span class="font-semibold text-xs truncate max-w-[110px]">${escapeHtml(entry.name)}</span>
      </div>
      <div class="text-right">
        <span class="orbitron font-bold text-xs text-cyan-400">${entry.kills} hit</span>
        <span class="text-[10px] text-slate-500 block">${(entry.time || 0).toFixed(1)}s</span>
      </div>
    `;
    listContainer.appendChild(row);
  });
}

async function saveScoreToFirestore(name, totalKillsCount, elapsedTimeInSeconds) {
  if (!currentUser) return;
  if (elapsedTimeInSeconds <= 5.0) return; // Strict Firestore rule match: time > 5.0

  try {
    await addDoc(collection(db, "leaderboard"), {
      uid: currentUser.uid,
      name: name,
      kills: totalKillsCount,
      time: elapsedTimeInSeconds
    });
  } catch (e) {
    console.error("Viga tulemuse salvestamisel Firestore'i: ", e);
  }
}

function startNewGame() {
  if (currentUser) {
    currentPlayerName = currentUser.displayName || currentUser.email.split('@')[0];
  } else {
    currentPlayerName = document.getElementById('playerNameInput').value.trim() || "Allu";
    localStorage.setItem('kosmose_player_name', currentPlayerName);
  }

  score = 0; 
  lives = 3; 
  level = 1;
  totalKills = 0;
  enemyDirection = 1;
  gameStartTime = Date.now();

  bullets = []; enemyBullets = []; enemies = []; powerUps = []; particles = [];
  player.x = canvas.width / 2;
  player.tripleShotTimer = 0;
  player.speedBoostTimer = 0;

  spawnEnemies();
  isPlaying = true;

  document.getElementById('overlay').classList.add('hidden');
  unlockAchievement('first_game');
  requestAnimationFrame(gameLoop);
}

function spawnEnemies() {
  enemies = [];
  const rows = 3 + Math.min(level, 3);
  const cols = 7;
  const enemyWidth = 38;
  const enemyHeight = 30;
  const padding = 16;
  const offsetLeft = (canvas.width - (cols * (enemyWidth + padding))) / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      enemies.push({
        x: offsetLeft + c * (enemyWidth + padding),
        y: 60 + r * (enemyHeight + padding),
        width: enemyWidth,
        height: enemyHeight,
        type: r === 0 ? 'boss' : 'alien',
        hp: r === 0 ? 2 : 1,
        color: r === 0 ? '#f59e0b' : '#06b6d4'
      });
    }
  }
}

function shootBullet() {
  playSound('shoot');
  const laserColor = LASERS[selectedLaser].color;

  if (player.tripleShotTimer > 0) {
    bullets.push({ x: player.x - 14, y: player.y, dx: -1.5, dy: -9, color: laserColor });
    bullets.push({ x: player.x, y: player.y - 12, dx: 0, dy: -9, color: laserColor });
    bullets.push({ x: player.x + 14, y: player.y, dx: 1.5, dy: -9, color: laserColor });
  } else {
    bullets.push({ x: player.x, y: player.y - 12, dx: 0, dy: -9, color: laserColor });
  }
}

function createExplosion(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 7,
      size: Math.random() * 3 + 2,
      color: color,
      alpha: 1
    });
  }
}

let enemyDirection = 1;

function updateGame() {
  animFrame++;

  if (player.tripleShotTimer > 0) player.tripleShotTimer--;
  if (player.speedBoostTimer > 0) player.speedBoostTimer--;

  const currentSpeed = (SHIPS[selectedShip].speed) * (player.speedBoostTimer > 0 ? 1.5 : 1);
  if (keys.left && player.x - player.width/2 > 10) player.x -= currentSpeed;
  if (keys.right && player.x + player.width/2 < canvas.width - 10) player.x += currentSpeed;

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dx || 0;
    b.y += b.dy;
    if (b.y < -10) bullets.splice(i, 1);
  }

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const eb = enemyBullets[i];
    eb.y += eb.dy;
    if (Math.abs(eb.x - player.x) < 22 && Math.abs(eb.y - player.y) < 22) {
      enemyBullets.splice(i, 1);
      createExplosion(player.x, player.y, '#ef4444', 20);
      playSound('explosion');
      lives--;
      if (lives <= 0) { endGame(); return; }
    } else if (eb.y > canvas.height + 10) {
      enemyBullets.splice(i, 1);
    }
  }

  let moveDown = false;
  const enemySpeed = 0.8 + (level * 0.25);

  enemies.forEach(e => {
    e.x += enemySpeed * enemyDirection;
    if (e.x + e.width > canvas.width - 15 || e.x < 15) moveDown = true;
    if (Math.random() < 0.0015 * level) {
      enemyBullets.push({ x: e.x + e.width/2, y: e.y + e.height, dy: 3.5 + level * 0.3 });
    }
  });

  if (moveDown) {
    enemyDirection *= -1;
    enemies.forEach(e => e.y += 12);
  }

  // Enemies reaching the player's line = game over
  if (enemies.some(e => e.y + e.height >= player.y - 20)) {
    lives = 0;
    endGame();
    return;
  }

  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (let ei = enemies.length - 1; ei >= 0; ei--) {
      const e = enemies[ei];
      if (b.x > e.x && b.x < e.x + e.width && b.y > e.y && b.y < e.y + e.height) {
        bullets.splice(bi, 1);
        e.hp--;
        createExplosion(b.x, b.y, e.color, 6);

        if (e.hp <= 0) {
          playSound('explosion');
          createExplosion(e.x + e.width/2, e.y + e.height/2, e.color, 16);
          score += (e.type === 'boss' ? 35 : 20);
          totalKills++;

          if (Math.random() < 0.18) {
            const types = ['3X', 'SPEED', 'LIFE'];
            powerUps.push({ x: e.x + e.width/2, y: e.y, type: types[Math.floor(Math.random() * types.length)] });
          }
          enemies.splice(ei, 1);
        }
        break; // one bullet hits only one enemy
      }
    }
  }

  for (let pi = powerUps.length - 1; pi >= 0; pi--) {
    const p = powerUps[pi];
    p.y += 2.2;
    if (Math.abs(p.x - player.x) < 25 && Math.abs(p.y - player.y) < 25) {
      playSound('powerup');
      if (p.type === '3X') player.tripleShotTimer = 300;
      if (p.type === 'SPEED') player.speedBoostTimer = 350;
      if (p.type === 'LIFE') lives = Math.min(lives + 1, 5);
      unlockAchievement('powerup_collector');
      powerUps.splice(pi, 1);
    } else if (p.y > canvas.height) {
      powerUps.splice(pi, 1);
    }
  }

  if (enemies.length === 0) {
    level++;
    spawnEnemies();
  }

  if (score >= 500) unlockAchievement('score_500');
  if (score >= 2000) unlockAchievement('score_2000');

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.04;
    if (p.alpha <= 0) particles.splice(i, 1);
  }

  stars.forEach(s => {
    s.y += s.speed;
    if (s.y > canvas.height) s.y = 0;
  });
}

function renderGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Stars
  ctx.fillStyle = '#ffffff';
  stars.forEach(s => {
    ctx.globalAlpha = 0.6;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  });
  ctx.globalAlpha = 1;

  // Draw Detailed Player Ship
  ctx.save();
  ctx.translate(player.x, player.y);
  const shipColor = SHIPS[selectedShip].color;

  // Thruster Effect
  ctx.fillStyle = '#f59e0b';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  const flameHeight = 12 + Math.sin(animFrame * 0.4) * 6;
  ctx.moveTo(-6, 16);
  ctx.lineTo(0, 16 + flameHeight);
  ctx.lineTo(6, 16);
  ctx.closePath();
  ctx.fill();

  // Ship Hull
  ctx.fillStyle = shipColor;
  ctx.shadowColor = shipColor;
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(20, 14);
  ctx.lineTo(10, 8);
  ctx.lineTo(0, 12);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-20, 14);
  ctx.closePath();
  ctx.fill();

  // Cockpit
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.ellipse(0, -4, 4, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bullets
  bullets.forEach(b => {
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 10;
    ctx.fillRect(b.x - 2, b.y, 4, 14);
  });
  ctx.shadowBlur = 0;

  // Enemy Bullets
  ctx.fillStyle = '#ef4444';
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 8;
  enemyBullets.forEach(eb => {
    ctx.fillRect(eb.x - 2, eb.y, 4, 10);
  });
  ctx.shadowBlur = 0;

  // Enemies
  enemies.forEach(e => {
    ctx.save();
    ctx.translate(e.x + e.width/2, e.y + e.height/2);

    ctx.fillStyle = e.color;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 10;

    if (e.type === 'boss') {
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(18, -6);
      ctx.lineTo(10, -14);
      ctx.lineTo(-10, -14);
      ctx.lineTo(-18, -6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(16, 0);
      ctx.lineTo(12, 12);
      ctx.lineTo(-12, 12);
      ctx.lineTo(-16, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-6, 2, 3, 3);
      ctx.fillRect(3, 2, 3, 3);
    }

    ctx.restore();
  });
  ctx.shadowBlur = 0;

  // Powerups
  powerUps.forEach(p => {
    ctx.fillStyle = p.type === '3X' ? '#f59e0b' : (p.type === 'SPEED' ? '#10b981' : '#ef4444');
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText(p.type, p.x, p.y + 3);
  });
  ctx.shadowBlur = 0;

  // Particles
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  });
  ctx.globalAlpha = 1;

  // HUD
  ctx.font = 'bold 16px Orbitron';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'left';
  ctx.fillText(`SKOOR: ${score}`, 16, 30);

  ctx.textAlign = 'right';
  ctx.fillText(`TASE: ${level}`, canvas.width - 16, 30);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ef4444';
  let lifeIcons = '';
  for (let i = 0; i < lives; i++) lifeIcons += '❤️ ';
  ctx.fillText(`ELUD: ${lifeIcons}`, 16, canvas.height - 20);
}

function gameLoop() {
  if (!isPlaying) return;
  updateGame();
  renderGame();
  requestAnimationFrame(gameLoop);
}

function endGame() {
  if (!isPlaying) return; // prevent double-saving
  isPlaying = false;
  const elapsedTimeInSeconds = (Date.now() - gameStartTime) / 1000;

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('kosmose_highscore', highScore);
    document.getElementById('topScoreNav').innerText = highScore;
  }

  saveScoreToFirestore(currentPlayerName, totalKills, elapsedTimeInSeconds);

  document.getElementById('finalScore').innerText = score;
  document.getElementById('finalHighScore').innerText = highScore;

  document.getElementById('startOverlayContent').classList.add('hidden');
  document.getElementById('gameOverContent').classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}

// Modal navigation
function switchTab(tab) {
  ['navMenuBtn', 'navCharBtn', 'navBoardsBtn', 'navAwardsBtn'].forEach(id => {
    document.getElementById(id).classList.remove('active');
  });

  if (tab === 'menu') {
    document.getElementById('navMenuBtn').classList.add('active');
    closeModal();
  } else if (tab === 'characters') {
    document.getElementById('navCharBtn').classList.add('active');
    openModal('Tegelased / Laevad', renderCharactersModal());
  } else if (tab === 'boards') {
    document.getElementById('navBoardsBtn').classList.add('active');
    openModal('Disainid / Relvad', renderBoardsModal());
  } else if (tab === 'awards') {
    document.getElementById('navAwardsBtn').classList.add('active');
    openModal('Auhinnad & Saavutused', renderAwardsModal());
  }
}

function openModal(title, contentHtml) {
  document.getElementById('modalTitle').innerText = title;
  document.getElementById('modalContent').innerHTML = contentHtml;
  document.getElementById('tabModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('tabModal').classList.add('hidden');
}

function renderCharactersModal() {
  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
  Object.keys(SHIPS).forEach(key => {
    const ship = SHIPS[key];
    const isSelected = (selectedShip === key);
    html += `
      <div class="bg-slate-950/80 border ${isSelected ? 'border-cyan-400 bg-cyan-950/20' : 'border-slate-800'} rounded-2xl p-4 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-center mb-2">
            <h4 class="orbitron font-bold text-lg text-white">${ship.name}</h4>
            <div class="w-6 h-6 rounded-full" style="background:${ship.color}"></div>
          </div>
          <p class="text-xs text-slate-400">Kiirus: ${ship.speed}</p>
        </div>
        <button onclick="selectShip('${key}')" class="mt-4 w-full py-2 rounded-xl text-xs font-bold orbitron cursor-pointer ${
          isSelected ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }">
          ${isSelected ? 'VALITUD' : 'VALI LAEV'}
        </button>
      </div>`;
  });
  html += '</div>';
  return html;
}

window.selectShip = function(key) {
  selectedShip = key;
  localStorage.setItem('kosmose_ship', key);
  openModal('Tegelased / Laevad', renderCharactersModal());
};

function renderBoardsModal() {
  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
  Object.keys(LASERS).forEach(key => {
    const laser = LASERS[key];
    const isSelected = (selectedLaser === key);
    html += `
      <div class="bg-slate-950/80 border ${isSelected ? 'border-amber-400 bg-amber-950/20' : 'border-slate-800'} rounded-2xl p-4 flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-center mb-2">
            <h4 class="orbitron font-bold text-lg text-white">${laser.name}</h4>
            <div class="w-4 h-8 rounded-full" style="background:${laser.color}"></div>
          </div>
        </div>
        <button onclick="selectLaser('${key}')" class="mt-4 w-full py-2 rounded-xl text-xs font-bold orbitron cursor-pointer ${
          isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }">
          ${isSelected ? 'VALITUD' : 'VALI DISAIN'}
        </button>
      </div>`;
  });
  html += '</div>';
  return html;
}

window.selectLaser = function(key) {
  selectedLaser = key;
  localStorage.setItem('kosmose_laser', key);
  openModal('Disainid / Relvad', renderBoardsModal());
};

function renderAwardsModal() {
  let html = '<div class="space-y-3">';
  ACHIEVEMENTS_LIST.forEach(ach => {
    const isUnlocked = achievements[ach.id];
    html += `
      <div class="bg-slate-950/80 border ${isUnlocked ? 'border-emerald-500/60 bg-emerald-950/10' : 'border-slate-800'} rounded-2xl p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${isUnlocked ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'} flex items-center justify-center text-xl">
            <i class="fa-solid ${isUnlocked ? 'fa-check' : 'fa-lock'}"></i>
          </div>
          <div>
            <h4 class="orbitron font-bold text-sm text-white">${ach.title}</h4>
            <p class="text-xs text-slate-400">${ach.desc}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-xl text-xs text-amber-300 font-bold">
          +${ach.reward} <i class="fa-solid fa-key"></i>
        </div>
      </div>`;
  });
  html += '</div>';
  return html;
}

function unlockAchievement(id) {
  if (!achievements[id]) {
    achievements[id] = true;
    const ach = ACHIEVEMENTS_LIST.find(a => a.id === id);
    if (ach) {
      keysCount += ach.reward;
      localStorage.setItem('kosmose_keys', keysCount);
      document.getElementById('keyCount').innerText = keysCount;
    }
    localStorage.setItem('kosmose_achievements', JSON.stringify(achievements));
  }
}

renderLeaderboard();
renderGame();
