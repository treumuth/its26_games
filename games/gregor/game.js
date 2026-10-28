import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDCl5gu6Xavdsi8ImqZxQjdpy9EHZBUeiU",
    authDomain: "treumuth-its26games-gregor.firebaseapp.com",
    projectId: "treumuth-its26games-gregor",
    storageBucket: "treumuth-its26games-gregor.firebasestorage.app",
    messagingSenderId: "848537370538",
    appId: "1:848537370538:web:b2679c9d56bacf010375d3",
    measurementId: "G-2KNME0CSZZ"
};

// Initialize Firebase Services
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Restrict Google Sign-In prompt to voco.ee domain
// googleProvider.setCustomParameters({
//     'hd': 'voco.ee'
// });

let currentUser = null;
let isMobileDevice = false;

// Auto-Detect Device Capabilities
function detectDevice() {
    const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const smallScreen = window.innerWidth <= 820;

    isMobileDevice = userAgentMobile || (hasTouchScreen && smallScreen);

    const deviceBadgeIcon = document.getElementById('device-icon');
    const deviceBadgeText = document.getElementById('device-text');
    const fullscreenBtn = document.getElementById('btn-fullscreen');
    const mobileOverlay = document.getElementById('mobile-controls');

    if (isMobileDevice) {
        if (deviceBadgeIcon) deviceBadgeIcon.innerText = '📱';
        if (deviceBadgeText) deviceBadgeText.innerText = 'Mobile Mode';
        if (fullscreenBtn) fullscreenBtn.classList.remove('hidden');
        if (mobileOverlay) mobileOverlay.classList.remove('hidden');
    } else {
        if (deviceBadgeIcon) deviceBadgeIcon.innerText = '💻';
        if (deviceBadgeText) deviceBadgeText.innerText = 'Desktop Mode';
        if (fullscreenBtn) fullscreenBtn.classList.add('hidden');
        if (mobileOverlay) mobileOverlay.classList.add('hidden');
    }
}

function requestFullscreenMode() {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) {
        docEl.requestFullscreen();
    } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
    } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
    }
}

document.getElementById('btn-fullscreen')?.addEventListener('click', requestFullscreenMode);

// Sync UI components based on user login status
function updateAuthUI(user) {
    const displayNameElem = document.getElementById('user-display-name');
    const loginBtn = document.getElementById('btn-google-login');
    const submitBtn = document.getElementById('btn-submit-score');

    if (user) {
        if (displayNameElem) displayNameElem.innerText = `👤 ${user.displayName || 'Player'}`;
        if (loginBtn) loginBtn.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Submit Score to Global Leaderboard';
            submitBtn.className = 'w-full bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer';
        }
    } else {
        if (displayNameElem) displayNameElem.innerText = 'Not signed in';
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = 'Sign in to Submit Score';
            submitBtn.className = 'w-full bg-slate-700 text-slate-500 text-xs font-bold px-4 py-2.5 rounded-xl cursor-not-allowed transition';
        }
    }
}

// Track Google Auth State Changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (!user.email || !user.email.endsWith('@voco.ee')) {
            alert('Access restricted! Please sign in with your official @voco.ee account.');
            await signOut(auth);
            currentUser = null;
            updateAuthUI(null);
            return;
        }
        currentUser = user;
        updateAuthUI(user);
    } else {
        currentUser = null;
        updateAuthUI(null);
    }
});

async function handleGoogleLogin() {
    try {
        // Always try popup mode first (keeps login scoped inside the browser window)
        await signInWithPopup(auth, googleProvider);
    } catch (error) {
        console.warn("Popup blocked or failed, fallback to redirect:", error);
        
        // Fallback to redirect only if popups are strictly blocked by browser settings
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user') {
            await signInWithRedirect(auth, googleProvider);
        }
    }
}

// --- Game Engine Logic ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const minimapCanvas = document.getElementById('minimapCanvas');
const mmCtx = minimapCanvas.getContext('2d');

const fogCanvas = document.createElement('canvas');
const fCtx = fogCanvas.getContext('2d');

const TILE_SIZE = 48;

let MAP_GRID = [];
let MAP_ROWS = 41;
let MAP_COLS = 41;

class AudioSynth {
    constructor() {
        this.ctx = null;
    }
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    playTone(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) {}
    }
    footstep(isCrouch) {
        if (Math.random() < 0.3) {
            this.playTone(isCrouch ? 60 : 110, 'triangle', 0.08, isCrouch ? 0.02 : 0.08);
        }
    }
    swordSwing() {
        this.init();
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.18);
            gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.18);
        } catch(e) {}
    }
    rockThud() {
        this.playTone(180, 'sine', 0.15, 0.2);
    }
    guardHit() {
        this.playTone(130, 'sawtooth', 0.12, 0.3);
    }
    alarm() {
        this.playTone(750, 'square', 0.35, 0.15);
    }
    itemPick() {
        this.playTone(523.25, 'triangle', 0.15, 0.2);
        setTimeout(() => this.playTone(659.25, 'triangle', 0.25, 0.2), 90);
    }
}
const sfx = new AudioSynth();

const unlockAudio = () => {
    sfx.init();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

function generateCleanMazeGrid(rows, cols) {
    rows = rows % 2 === 0 ? rows + 1 : rows;
    cols = cols % 2 === 0 ? cols + 1 : cols;
    MAP_ROWS = rows;
    MAP_COLS = cols;

    const grid = Array.from({ length: rows }, () => Array(cols).fill(1));

    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < cols; c++) {
            if (r === 0 || c === 0 || c === cols - 1) {
                grid[r][c] = 7;
            } else {
                grid[r][c] = 10;
            }
        }
    }

    const gateCol = Math.floor(cols / 2);
    for (let i = 0; i < 12; i++) {
        const tr = Math.floor(Math.random() * 3) + 1;
        const tc = Math.floor(Math.random() * (cols - 4)) + 2;
        if (Math.abs(tc - gateCol) > 3) {
            grid[tr][tc] = 7;
        }
    }

    grid[1][2] = 2;
    grid[1][3] = 2;
    grid[2][2] = 2;
    grid[2][3] = 2;

    const castleStartRow = 5;
    for (let c = 0; c < cols; c++) {
        grid[castleStartRow][c] = 1;
    }

    grid[castleStartRow][gateCol - 1] = 9;
    grid[castleStartRow][gateCol] = 9;
    grid[castleStartRow][gateCol + 1] = 9;

    const mazeStartRow = castleStartRow + 1;
    const mazeEndRow = rows - 2;

    function inMazeBounds(r, c) {
        return r >= mazeStartRow && r <= mazeEndRow && c >= 1 && c <= cols - 2;
    }

    const stack = [];
    const startCell = { r: mazeStartRow + 1, c: gateCol };
    grid[startCell.r][startCell.c] = 0;
    stack.push(startCell);

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = [];

        const dirs = [
            { dr: -2, dc: 0 },
            { dr: 2, dc: 0 },
            { dr: 0, dc: -2 },
            { dr: 0, dc: 2 }
        ];

        for (let d of dirs) {
            const nr = current.r + d.dr;
            const nc = current.c + d.dc;
            if (inMazeBounds(nr, nc) && grid[nr][nc] === 1) {
                neighbors.push({ r: nr, c: nc, dr: d.dr, dc: d.dc });
            }
        }

        if (neighbors.length > 0) {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            grid[current.r + next.dr / 2][current.c + next.dc / 2] = 0;
            grid[next.r][next.c] = 0;
            stack.push({ r: next.r, c: next.c });
        } else {
            stack.pop();
        }
    }

    for (let r = castleStartRow + 1; r <= mazeStartRow + 2; r++) {
        grid[r][gateCol] = 0;
        grid[r][gateCol - 1] = 0;
    }

    for (let r = mazeStartRow + 2; r < mazeEndRow; r += 3) {
        for (let c = 2; c < cols - 2; c += 3) {
            if (grid[r][c] === 1 && Math.random() < 0.35) {
                grid[r][c] = 0;
            }
        }
    }

    const armoryR = Math.floor(rows * 0.4);
    const armoryC = cols - 4;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            grid[armoryR + dr][armoryC + dc] = 0;
        }
    }
    grid[armoryR][armoryC] = 5;
    grid[armoryR + 1][armoryC] = 6;
    grid[armoryR][armoryC - 2] = 4;

    const westR = Math.floor(rows * 0.4);
    const westC = 4;
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            grid[westR + dr][westC + dc] = 0;
        }
    }
    grid[westR][westC] = 6;

    const sanctumR = rows - 4;
    const sanctumC = Math.floor(cols / 2);

    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -3; dc <= 3; dc++) {
            const r = sanctumR + dr;
            const c = sanctumC + dc;
            if (r >= mazeStartRow && r < rows - 1 && c > 0 && c < cols - 1) {
                grid[r][c] = 0;
            }
        }
    }
    grid[sanctumR][sanctumC] = 3;

    for (let r = mazeStartRow + 2; r < rows - 2; r += 4) {
        for (let c = 2; c < cols - 2; c += 4) {
            if (grid[r][c] === 1 && (grid[r+1][c] === 0 || grid[r-1][c] === 0)) {
                grid[r][c] = 8;
            }
        }
    }

    return grid;
}

let gameState = 'START';
let gameTime = 0;
let lastTime = 0;
let alarmTriggered = false;
let flagCaptured = false;
let swordEquipped = false;
let guardKills = 0;

let cameraX = 0;
let cameraY = 0;

let mouseX = 0;
let mouseY = 0;
let worldMouseX = 0;
let worldMouseY = 0;

class Player {
    constructor(x, y, startingRocks = 10) {
        this.x = x;
        this.y = y;
        this.radius = 13;
        this.hp = 100;
        this.maxHp = 100;
        this.stamina = 100;
        this.maxStamina = 100;
        this.angle = 0;
        this.state = 'NORMAL';
        this.isSprinting = false;
        this.speed = 3.2;
        this.isAttacking = false;
        this.attackCooldown = 0;
        this.rockCooldown = 0;
        this.rocksRemaining = startingRocks;
        this.attackArc = Math.PI / 1.3;
        this.attackRange = 48;
        this.noiseRadius = 120;
        this.stepTimer = 0;
    }

    update(dt) {
        let moveSpeed = this.speed;
        const isCrouching = keyState.crouch;

        if (keyState.sprint && !isCrouching) {
            if (this.isSprinting) {
                if (this.stamina <= 0) this.isSprinting = false;
            } else {
                if (this.stamina >= 12) this.isSprinting = true;
            }
        } else {
            this.isSprinting = false;
        }

        if (isCrouching) {
            this.state = 'CROUCH';
            moveSpeed = this.speed * 0.45;
            this.noiseRadius = 30;
        } else if (this.isSprinting) {
            this.state = 'SPRINT';
            moveSpeed = this.speed * 1.65;
            this.stamina = Math.max(0, this.stamina - dt * 30);
            this.noiseRadius = 320;
        } else {
            this.state = 'NORMAL';
            this.stamina = Math.min(this.maxStamina, this.stamina + dt * 22);
            this.noiseRadius = 130;
        }

        if (this.state === 'CROUCH') {
            this.stamina = Math.min(this.maxStamina, this.stamina + dt * 15);
        }

        let dx = 0;
        let dy = 0;

        if (keyState.up) dy -= 1;
        if (keyState.down) dy += 1;
        if (keyState.left) dx -= 1;
        if (keyState.right) dx += 1;

        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        if (dx !== 0 || dy !== 0) {
            this.stepTimer += dt;
            const stepInterval = this.state === 'SPRINT' ? 0.2 : (this.state === 'CROUCH' ? 0.5 : 0.32);
            if (this.stepTimer >= stepInterval) {
                sfx.footstep(this.state === 'CROUCH');
                this.stepTimer = 0;
            }
        }

        this.moveWithCollision(dx * moveSpeed, dy * moveSpeed);

        // Aiming Logic: Auto-lock only on Mobile, manual mouse aim on Desktop
        if (isMobileDevice) {
            let closestGuard = null;
            let minDistance = 280;

            for (let g of guards) {
                if (g.hp > 0) {
                    const dist = Math.hypot(g.x - this.x, g.y - this.y);
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestGuard = g;
                    }
                }
            }

            if (closestGuard) {
                this.angle = Math.atan2(closestGuard.y - this.y, closestGuard.x - this.x);
                worldMouseX = closestGuard.x;
                worldMouseY = closestGuard.y;
            } else if (dx !== 0 || dy !== 0) {
                this.angle = Math.atan2(dy, dx);
                worldMouseX = this.x + dx * 150;
                worldMouseY = this.y + dy * 150;
            }
        } else {
            // Strictly manual aiming via mouse position on Desktop
            this.angle = Math.atan2(worldMouseY - this.y, worldMouseX - this.x);
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
            if (this.attackCooldown <= 0) {
                this.isAttacking = false;
            }
        }

        if (this.rockCooldown > 0) {
            this.rockCooldown -= dt;
        }
    }

    moveWithCollision(vx, vy) {
        if (vx !== 0) {
            let nextX = this.x + vx;
            if (!checkTileCollision(nextX, this.y, this.radius)) {
                this.x = nextX;
            }
        }
        if (vy !== 0) {
            let nextY = this.y + vy;
            if (!checkTileCollision(this.x, nextY, this.radius)) {
                this.y = nextY;
            }
        }
    }

    throwRock() {
        if (this.rocksRemaining <= 0) {
            showFloatingText("No Rocks Left!", this.x, this.y - 18, "#ef4444");
            return;
        }
        if (this.rockCooldown > 0) return;

        this.rocksRemaining--;
        this.rockCooldown = 4.0;
        let targetX = worldMouseX;
        let targetY = worldMouseY;

        if (targetX === 0 && targetY === 0) {
            targetX = this.x + Math.cos(this.angle) * 180;
            targetY = this.y + Math.sin(this.angle) * 180;
        }

        const dist = Math.hypot(targetX - this.x, targetY - this.y);
        const maxDist = 260;
        if (dist > maxDist) {
            const ratio = maxDist / dist;
            targetX = this.x + (targetX - this.x) * ratio;
            targetY = this.y + (targetY - this.y) * ratio;
        }

        rockProjectiles.push({
            startX: this.x,
            startY: this.y,
            x: this.x,
            y: this.y,
            targetX: targetX,
            targetY: targetY,
            progress: 0,
            speed: 400
        });

        showFloatingText(`Rock Thrown! (${this.rocksRemaining} left)`, this.x, this.y - 18, "#fef08a");
    }

    attack() {
        if (this.attackCooldown > 0) return;

        this.isAttacking = true;
        this.attackCooldown = 0.35;
        
        if (swordEquipped) {
            sfx.swordSwing();
            createSlashEffect(this.x, this.y, this.angle, this.attackRange);
            emitNoise(this.x, this.y, 250);

            const hitTileX = Math.floor((this.x + Math.cos(this.angle) * 32) / TILE_SIZE);
            const hitTileY = Math.floor((this.y + Math.sin(this.angle) * 32) / TILE_SIZE);
            if (hitTileY >= 0 && hitTileY < MAP_ROWS && hitTileX >= 0 && hitTileX < MAP_COLS) {
                if (MAP_GRID[hitTileY][hitTileX] === 4) {
                    MAP_GRID[hitTileY][hitTileX] = 0;
                    sfx.guardHit();
                    showFloatingText("WALL BROKEN!", this.x, this.y - 20, "#f59e0b");
                }
            }

            guards.forEach(guard => {
                if (guard.hp <= 0) return;
                const dist = Math.hypot(guard.x - this.x, guard.y - this.y);
                if (dist < this.attackRange + guard.radius) {
                    const angleToGuard = Math.atan2(guard.y - this.y, guard.x - this.x);
                    let angleDiff = Math.abs(this.angle - angleToGuard);
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    angleDiff = Math.abs(angleDiff);

                    if (angleDiff < this.attackArc / 2 + 0.35) {
                        guard.takeDamage(45, this.x, this.y);
                    }
                }
            });
        }
    }
}

function lerpAngle(current, target, turnSpeed, dt) {
    let diff = target - current;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    
    const maxStep = turnSpeed * dt;
    if (Math.abs(diff) <= maxStep) {
        return target;
    }
    return current + Math.sign(diff) * maxStep;
}

class Guard {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 14;
        this.hp = 80;
        this.maxHp = 80;
        this.angle = Math.random() * Math.PI * 2;
        this.targetAngle = this.angle;
        this.speed = 1.3;
        this.chaseSpeed = 2.3;
        this.turnSpeed = 2.2;
        this.chaseTurnSpeed = 3.8;
        this.state = 'PATROL';
        this.visionRadius = 240;
        this.visionAngle = Math.PI / 3.4;
        this.suspicionTimer = 0;
        this.targetLastKnown = null;
        this.attackCooldown = 0;
        this.patrolTimer = 0;
        this.patrolState = 'WALK';
        this.waitTime = 0;
    }

    update(dt) {
        if (this.hp <= 0) return;

        if (this.attackCooldown > 0) {
            this.attackCooldown -= dt;
        }

        const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
        const canSee = this.canSeePlayer();
        const canHear = distToPlayer < player.noiseRadius && player.state !== 'CROUCH';

        if (alarmTriggered && this.state !== 'CHASE') {
            this.state = 'CHASE';
        }

        switch (this.state) {
            case 'PATROL':
                if (canSee || canHear) {
                    this.state = 'SUSPICIOUS';
                    this.suspicionTimer = 0.8;
                    this.targetLastKnown = { x: player.x, y: player.y };
                } else {
                    this.patrolRandomly(dt);
                }
                break;

            case 'SUSPICIOUS':
                if (canSee) {
                    this.suspicionTimer += dt * 2.2;
                    if (this.suspicionTimer > 1.0 || alarmTriggered) {
                        this.state = 'CHASE';
                        triggerAlarm();
                    }
                } else if (canHear) {
                    this.targetLastKnown = { x: player.x, y: player.y };
                }

                if (this.targetLastKnown) {
                    this.moveTowards(this.targetLastKnown.x, this.targetLastKnown.y, this.speed * 0.85, this.turnSpeed, dt);
                }

                this.suspicionTimer -= dt * 0.35;
                if (this.suspicionTimer <= 0 && !alarmTriggered) {
                    this.state = 'PATROL';
                    this.targetLastKnown = null;
                }
                break;

            case 'CHASE':
                this.targetLastKnown = { x: player.x, y: player.y };
                this.moveTowards(player.x, player.y, this.chaseSpeed, this.chaseTurnSpeed, dt);

                if (distToPlayer < this.radius + player.radius + 8 && this.attackCooldown <= 0) {
                    player.hp -= 16;
                    this.attackCooldown = 0.75;
                    sfx.guardHit();
                    createBloodParticles(player.x, player.y);
                    showFloatingText("-16", player.x, player.y, "#ef4444");

                    if (player.hp <= 0) {
                        triggerGameOver();
                    }
                }
                break;
        }
    }

    canSeePlayer() {
        const dist = Math.hypot(player.x - this.x, player.y - this.y);
        const maxDist = player.state === 'CROUCH' ? this.visionRadius * 0.5 : this.visionRadius;

        if (dist > maxDist) return false;

        const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
        let angleDiff = Math.abs(this.angle - angleToPlayer);
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        angleDiff = Math.abs(angleDiff);

        if (angleDiff > this.visionAngle / 2) return false;

        return !hasLineOfSightObstruction(this.x, this.y, player.x, player.y);
    }

    patrolRandomly(dt) {
        if (this.patrolState === 'WAIT') {
            this.waitTime -= dt;
            this.angle = lerpAngle(this.angle, this.targetAngle, this.turnSpeed * 0.7, dt);
            if (this.waitTime <= 0) {
                this.patrolState = 'WALK';
                this.patrolTimer = 0;
            }
            return;
        }

        this.angle = lerpAngle(this.angle, this.targetAngle, this.turnSpeed, dt);

        this.patrolTimer += dt;
        if (this.patrolTimer > 3.5) {
            if (Math.random() < 0.35) {
                this.patrolState = 'WAIT';
                this.waitTime = 1.2 + Math.random() * 1.5;
                this.targetAngle = this.angle + (Math.random() - 0.5) * (Math.PI * 0.8);
                return;
            } else {
                this.targetAngle = this.angle + (Math.random() - 0.5) * (Math.PI * 0.7);
                this.patrolTimer = 0;
            }
        }

        const probeDist = 24;
        const probeX = this.x + Math.cos(this.angle) * probeDist;
        const probeY = this.y + Math.sin(this.angle) * probeDist;

        if (checkTileCollision(probeX, probeY, this.radius)) {
            const anglesToTry = [Math.PI / 2, -Math.PI / 2, Math.PI * 0.75, -Math.PI * 0.75, Math.PI];
            let foundNewDir = false;
            for (let da of anglesToTry) {
                const testAngle = this.angle + da;
                const testX = this.x + Math.cos(testAngle) * (probeDist + 8);
                const testY = this.y + Math.sin(testAngle) * (probeDist + 8);
                if (!checkTileCollision(testX, testY, this.radius)) {
                    this.targetAngle = testAngle;
                    foundNewDir = true;
                    break;
                }
            }
            if (!foundNewDir) {
                this.targetAngle = this.angle + Math.PI;
            }
        } else {
            const vx = Math.cos(this.angle) * this.speed;
            const vy = Math.sin(this.angle) * this.speed;

            let nextX = this.x + vx;
            let nextY = this.y + vy;

            if (!checkTileCollision(nextX, this.y, this.radius)) this.x = nextX;
            if (!checkTileCollision(this.x, nextY, this.radius)) this.y = nextY;
        }
    }

    moveTowards(tx, ty, speed, turnSpeed, dt) {
        const targetAngle = Math.atan2(ty - this.y, tx - this.x);
        this.angle = lerpAngle(this.angle, targetAngle, turnSpeed, dt);

        const vx = Math.cos(this.angle) * speed;
        const vy = Math.sin(this.angle) * speed;

        let nextX = this.x + vx;
        let nextY = this.y + vy;

        if (!checkTileCollision(nextX, this.y, this.radius)) this.x = nextX;
        if (!checkTileCollision(this.x, nextY, this.radius)) this.y = nextY;
    }

    takeDamage(amount, attackerX, attackerY) {
        this.hp -= amount;
        sfx.guardHit();
        createBloodParticles(this.x, this.y);
        showFloatingText(`-${amount}`, this.x, this.y, "#f59e0b");

        this.state = 'CHASE';
        triggerAlarm();

        if (this.hp <= 0) {
            guardKills++;
            createBloodParticles(this.x, this.y, 25);
        }
    }
}

let particles = [];
let rockProjectiles = [];
let noiseRipples = [];
let floatingTexts = [];
let player = null;
let guards = [];

function getStartingRocksForGame() {
    const saved = localStorage.getItem('shadow_castle_v3_rocks');
    if (saved === null) return 10;
    const parsed = parseInt(saved, 10);
    return isNaN(parsed) ? 10 : Math.max(3, parsed);
}

function initLevel() {
    MAP_GRID = generateCleanMazeGrid(41, 41);

    const gateCol = Math.floor(MAP_COLS / 2);
    const startingRocks = getStartingRocksForGame();
    player = new Player((gateCol) * TILE_SIZE + TILE_SIZE / 2, 2.5 * TILE_SIZE, startingRocks);

    if (checkTileCollision(player.x, player.y, player.radius)) {
        player.x = gateCol * TILE_SIZE + TILE_SIZE / 2;
        player.y = 1.5 * TILE_SIZE;
    }

    guards = [];
    particles = [];
    rockProjectiles = [];
    noiseRipples = [];
    floatingTexts = [];
    alarmTriggered = false;
    flagCaptured = false;
    swordEquipped = false;
    guardKills = 0;
    gameTime = 0;
    resetKeys();

    for (let r = 7; r < MAP_ROWS - 3; r += 4) {
        for (let c = 3; c < MAP_COLS - 3; c += 4) {
            if (MAP_GRID[r][c] === 0 && Math.random() < 0.6) {
                guards.push(new Guard(c * TILE_SIZE + TILE_SIZE/2, r * TILE_SIZE + TILE_SIZE/2));
            }
        }
    }
}

function checkTileCollision(x, y, radius) {
    const minCol = Math.floor((x - radius) / TILE_SIZE);
    const maxCol = Math.floor((x + radius) / TILE_SIZE);
    const minRow = Math.floor((y - radius) / TILE_SIZE);
    const maxRow = Math.floor((y + radius) / TILE_SIZE);

    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) return true;
            const tile = MAP_GRID[r][c];
            if (tile === 1 || tile === 4 || tile === 7) {
                return true;
            }
        }
    }
    return false;
}

function hasLineOfSightObstruction(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(dist / 12);
    const dx = (x2 - x1) / steps;
    const dy = (y2 - y1) / steps;

    let curX = x1;
    let curY = y1;

    for (let i = 0; i < steps; i++) {
        curX += dx;
        curY += dy;
        const col = Math.floor(curX / TILE_SIZE);
        const row = Math.floor(curY / TILE_SIZE);

        if (row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS) {
            const tile = MAP_GRID[row][col];
            if (tile === 1 || tile === 4 || tile === 7) {
                return true;
            }
        }
    }
    return false;
}

function triggerAlarm() {
    if (!alarmTriggered) {
        alarmTriggered = true;
        sfx.alarm();
        showBannerAlert("ALARM TRIGGERED! GUARDS ALERTED!");
        guards.forEach(g => {
            if (g.hp > 0) g.state = 'CHASE';
        });
    }
}

function emitNoise(x, y, radius) {
    noiseRipples.push({
        x, y, maxRadius: radius, radius: 10, life: 0.4
    });

    guards.forEach(g => {
        if (g.hp <= 0) return;
        const d = Math.hypot(g.x - x, g.y - y);
        if (d < radius && g.state === 'PATROL') {
            g.state = 'SUSPICIOUS';
            g.suspicionTimer = 1.0;
            g.targetLastKnown = { x, y };
        }
    });
}

function createBloodParticles(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 4.5,
            vy: (Math.random() - 0.5) * 4.5,
            radius: Math.random() * 3 + 1,
            color: '#dc2626',
            life: 0.55
        });
    }
}

function createSlashEffect(x, y, angle, range) {
    for (let i = 0; i < 18; i++) {
        const spread = (Math.random() - 0.5) * 0.95;
        const pAngle = angle + spread;
        const speed = Math.random() * 3.5 + 2;
        particles.push({
            x: x + Math.cos(angle) * 16,
            y: y + Math.sin(angle) * 16,
            vx: Math.cos(pAngle) * speed,
            vy: Math.sin(pAngle) * speed,
            radius: Math.random() * 2.5 + 1,
            color: '#fef08a',
            life: 0.28
        });
    }
}

function showFloatingText(str, x, y, color = '#fff') {
    floatingTexts.push({
        text: str, x, y, color, life: 1.0, vy: -1.3
    });
}

function showBannerAlert(msg) {
    const banner = document.getElementById('banner-alert');
    const bg = document.getElementById('banner-bg');
    bg.innerText = msg;
    banner.classList.remove('opacity-0', '-translate-y-4');
    banner.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        banner.classList.remove('opacity-100', 'translate-y-0');
        banner.classList.add('opacity-0', '-translate-y-4');
    }, 3200);
}

function render() {
    if (!player) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    cameraX = Math.max(0, Math.min(player.x - canvas.width / 2, MAP_COLS * TILE_SIZE - canvas.width));
    cameraY = Math.max(0, Math.min(player.y - canvas.height / 2, MAP_ROWS * TILE_SIZE - canvas.height));

    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    drawMap();
    drawInteractiveItems();

    noiseRipples.forEach(r => {
        ctx.strokeStyle = 'rgba(245, 158, 11, ' + (r.life * 2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();
    });

    rockProjectiles.forEach(rock => {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(rock.x, rock.y, 4, 0, Math.PI * 2);
        ctx.fill();
    });

    guards.forEach(g => {
        if (g.hp <= 0) return;
        drawGuardVisionCone(g);

        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(g.angle);

        ctx.fillStyle = g.state === 'CHASE' ? '#ef4444' : (g.state === 'SUSPICIOUS' ? '#eab308' : '#3b82f6');
        ctx.beginPath();
        ctx.arc(0, 0, g.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(6, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        if (g.state === 'SUSPICIOUS') {
            ctx.fillStyle = '#f59e0b';
            ctx.font = 'black 20px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('?', g.x, g.y - g.radius - 8);
        } else if (g.state === 'CHASE') {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'black 22px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('!', g.x, g.y - g.radius - 8);
        }

        if (g.hp < g.maxHp) {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(g.x - 16, g.y - 22, 32, 5);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(g.x - 15, g.y - 21, (g.hp / g.maxHp) * 30, 3);
        }
    });

    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    if (player.state === 'SPRINT') {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, player.noiseRadius, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.fillStyle = player.state === 'CROUCH' ? '#065f46' : '#10b981';
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#022c22';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = swordEquipped ? '#38bdf8' : '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(player.radius + 6, 0);
    ctx.stroke();

    ctx.restore();

    particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });

    floatingTexts.forEach(ft => {
        ctx.fillStyle = ft.color;
        ctx.font = 'bold 12px Inter';
        ctx.globalAlpha = Math.max(0, ft.life);
        ctx.fillText(ft.text, ft.x - 10, ft.y);
        ctx.globalAlpha = 1.0;
    });

    drawDarknessFog();

    ctx.restore();

    drawMinimap();
}

function drawMap() {
    const time = performance.now() * 0.003;
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const tile = MAP_GRID[r][c];
            const x = c * TILE_SIZE;
            const y = r * TILE_SIZE;

            if (tile === 10) {
                ctx.fillStyle = '#062016';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#0a3223';
                ctx.fillRect(x + 8, y + 8, 6, 6);
                ctx.fillRect(x + 28, y + 24, 8, 8);
            } else if (tile === 1) {
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#334155';
                ctx.beginPath();
                ctx.moveTo(x, y + TILE_SIZE / 2);
                ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE / 2);
                ctx.stroke();
            } else if (tile === 2) {
                ctx.fillStyle = '#14532d';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#78350f';
                ctx.fillRect(x + 6, y + 10, 36, 28);
                ctx.fillStyle = '#f59e0b';
                ctx.font = 'bold 9px Inter';
                ctx.fillText('ESCAPE', x + 6, y + 26);
            } else if (tile === 4) {
                ctx.fillStyle = '#334155';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            } else if (tile === 7) {
                ctx.fillStyle = '#03120c';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#092d1f';
                ctx.beginPath();
                ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, TILE_SIZE * 0.45, 0, Math.PI * 2);
                ctx.fill();
            } else if (tile === 8) {
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

                const flicker = Math.sin(time + r + c) * 3;
                ctx.fillStyle = '#f59e0b';
                ctx.beginPath();
                ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 6 + flicker, 0, Math.PI * 2);
                ctx.fill();
            } else if (tile === 9) {
                ctx.fillStyle = '#334155';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.fillStyle = '#78350f';
                ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            } else {
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

function drawInteractiveItems() {
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const tile = MAP_GRID[r][c];
            const cx = c * TILE_SIZE + TILE_SIZE / 2;
            const cy = r * TILE_SIZE + TILE_SIZE / 2;

            if (tile === 3 && !flagCaptured) {
                ctx.fillStyle = '#92400e';
                ctx.beginPath();
                ctx.arc(cx, cy, 14, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(cx, cy - 16);
                ctx.lineTo(cx, cy + 12);
                ctx.stroke();

                ctx.fillStyle = '#ef4444';
                ctx.fillRect(cx, cy - 16, 14, 9);
            }

            if (tile === 5 && !swordEquipped) {
                ctx.fillStyle = '#1e1b4b';
                ctx.beginPath();
                ctx.arc(cx, cy, 15, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(cx - 9, cy + 9);
                ctx.lineTo(cx + 9, cy - 9);
                ctx.stroke();
            }

            if (tile === 6) {
                ctx.fillStyle = '#991b1b';
                ctx.beginPath();
                ctx.arc(cx, cy, 13, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#f87171';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(cx - 2.5, cy - 7, 5, 14);
                ctx.fillRect(cx - 7, cy - 2.5, 14, 5);
            }
        }
    }
}

function drawGuardVisionCone(guard) {
    ctx.save();
    ctx.translate(guard.x, guard.y);

    const coneAngle = guard.visionAngle;
    const startAngle = guard.angle - coneAngle / 2;
    const endAngle = guard.angle + coneAngle / 2;

    const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, guard.visionRadius);
    if (guard.state === 'CHASE') {
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0.05)');
    } else if (guard.state === 'SUSPICIOUS') {
        grad.addColorStop(0, 'rgba(234, 179, 8, 0.45)');
        grad.addColorStop(1, 'rgba(234, 179, 8, 0.05)');
    } else {
        grad.addColorStop(0, 'rgba(34, 197, 94, 0.28)');
        grad.addColorStop(1, 'rgba(34, 197, 94, 0.02)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, guard.visionRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawDarknessFog() {
    if (fogCanvas.width !== canvas.width || fogCanvas.height !== canvas.height) {
        fogCanvas.width = canvas.width;
        fogCanvas.height = canvas.height;
    }

    fCtx.globalCompositeOperation = 'source-over';
    fCtx.fillStyle = '#020617';
    fCtx.fillRect(0, 0, canvas.width, canvas.height);

    fCtx.globalCompositeOperation = 'destination-out';

    const pCamX = player.x - cameraX;
    const pCamY = player.y - cameraY;
    const visionRadius = player.state === 'CROUCH' ? 180 : 280;

    const pGrad = fCtx.createRadialGradient(pCamX, pCamY, 20, pCamX, pCamY, visionRadius);
    pGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    pGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.7)');
    pGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    fCtx.fillStyle = pGrad;
    fCtx.beginPath();
    fCtx.arc(pCamX, pCamY, visionRadius, 0, Math.PI * 2);
    fCtx.fill();

    guards.forEach(g => {
        if (g.hp <= 0) return;
        const gCamX = g.x - cameraX;
        const gCamY = g.y - cameraY;

        const gGrad = fCtx.createRadialGradient(gCamX, gCamY, 10, gCamX, gCamY, g.visionRadius);
        gGrad.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
        gGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        fCtx.fillStyle = gGrad;
        fCtx.beginPath();
        fCtx.moveTo(gCamX, gCamY);
        fCtx.arc(gCamX, gCamY, g.visionRadius, g.angle - g.visionAngle / 2, g.angle + g.visionAngle / 2);
        fCtx.closePath();
        fCtx.fill();
    });

    ctx.drawImage(fogCanvas, cameraX, cameraY);
}

function drawMinimap() {
    mmCtx.clearRect(0, 0, 130, 130);
    mmCtx.fillStyle = 'rgba(3, 7, 18, 0.95)';
    mmCtx.fillRect(0, 0, 130, 130);

    const scaleX = 130 / (MAP_COLS * TILE_SIZE);
    const scaleY = 130 / (MAP_ROWS * TILE_SIZE);

    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const tile = MAP_GRID[r][c];
            if (tile === 1 || tile === 4) {
                mmCtx.fillStyle = '#475569';
                mmCtx.fillRect(c * TILE_SIZE * scaleX, r * TILE_SIZE * scaleY, 3, 3);
            } else if (tile === 2) {
                mmCtx.fillStyle = '#10b981';
                mmCtx.fillRect(c * TILE_SIZE * scaleX, r * TILE_SIZE * scaleY, 4, 4);
            } else if (tile === 3 && !flagCaptured) {
                mmCtx.fillStyle = '#f59e0b';
                mmCtx.fillRect(c * TILE_SIZE * scaleX, r * TILE_SIZE * scaleY, 5, 5);
            } else if (tile === 6) {
                mmCtx.fillStyle = '#ef4444';
                mmCtx.fillRect(c * TILE_SIZE * scaleX, r * TILE_SIZE * scaleY, 4, 4);
            }
        }
    }

    guards.forEach(g => {
        if (g.hp <= 0) return;
        mmCtx.fillStyle = g.state === 'CHASE' ? '#ef4444' : '#eab308';
        mmCtx.beginPath();
        mmCtx.arc(g.x * scaleX, g.y * scaleY, 2, 0, Math.PI * 2);
        mmCtx.fill();
    });

    mmCtx.fillStyle = '#38bdf8';
    mmCtx.beginPath();
    mmCtx.arc(player.x * scaleX, player.y * scaleY, 3, 0, Math.PI * 2);
    mmCtx.fill();
}

const keyState = {
    up: false,
    down: false,
    left: false,
    right: false,
    crouch: false,
    sprint: false
};

function resetKeys() {
    keyState.up = false;
    keyState.down = false;
    keyState.left = false;
    keyState.right = false;
    keyState.crouch = false;
    keyState.sprint = false;
}

function handleKeyEvent(e, isDown) {
    const code = e.code;
    const key = e.key;
    let handled = false;

    if (code === 'KeyW' || code === 'ArrowUp' || key === 'w' || key === 'W' || key === 'ArrowUp') {
        keyState.up = isDown; handled = true;
    }
    if (code === 'KeyS' || code === 'ArrowDown' || key === 's' || key === 'S' || key === 'ArrowDown') {
        keyState.down = isDown; handled = true;
    }
    if (code === 'KeyA' || code === 'ArrowLeft' || key === 'a' || key === 'A' || key === 'ArrowLeft') {
        keyState.left = isDown; handled = true;
    }
    if (code === 'KeyD' || code === 'ArrowRight' || key === 'd' || key === 'D' || key === 'ArrowRight') {
        keyState.right = isDown; handled = true;
    }
    if (code === 'KeyC' || key === 'c' || key === 'C') {
        keyState.crouch = isDown; handled = true;
    }
    if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Space' || key === 'Shift' || key === ' ') {
        keyState.sprint = isDown; handled = true;
    }
    if (isDown && (code === 'KeyE' || key === 'e' || key === 'E')) {
        if (player && gameState === 'PLAYING') player.throwRock();
        handled = true;
    }

    if (handled && e.cancelable) {
        e.preventDefault();
    }
}

window.addEventListener('keydown', (e) => handleKeyEvent(e, true));
window.addEventListener('keyup', (e) => handleKeyEvent(e, false));
window.addEventListener('blur', resetKeys);

window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    worldMouseX = mouseX + cameraX;
    worldMouseY = mouseY + cameraY;
});

window.addEventListener('mousedown', (e) => {
    if (e.button === 0 && gameState === 'PLAYING' && player) {
        player.attack();
    }
});

// Left Touch D-Pad Binding
const bindTouchBtn = (id, keyName) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keyState[keyName] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keyState[keyName] = false; });
    btn.addEventListener('touchcancel', (e) => { e.preventDefault(); keyState[keyName] = false; });
};

bindTouchBtn('btn-touch-up', 'up');
bindTouchBtn('btn-touch-down', 'down');
bindTouchBtn('btn-touch-left', 'left');
bindTouchBtn('btn-touch-right', 'right');
bindTouchBtn('btn-touch-crouch', 'crouch');
bindTouchBtn('btn-touch-sprint', 'sprint');

document.getElementById('btn-touch-strike')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (player && gameState === 'PLAYING') player.attack();
});
document.getElementById('btn-touch-rock')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (player && gameState === 'PLAYING') player.throwRock();
});

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    detectDevice();
}
window.addEventListener('resize', resizeCanvas);

function update(dt) {
    if (gameState !== 'PLAYING') return;

    gameTime += dt;

    player.update(dt);

    rockProjectiles.forEach(rock => {
        rock.progress += dt * rock.speed;
        const totalDist = Math.hypot(rock.targetX - rock.startX, rock.targetY - rock.startY);
        const ratio = Math.min(1, rock.progress / Math.max(1, totalDist));
        
        rock.x = rock.startX + (rock.targetX - rock.startX) * ratio;
        rock.y = rock.startY + (rock.targetY - rock.startY) * ratio;

        let hitGuard = null;
        for (let g of guards) {
            if (g.hp > 0 && Math.hypot(g.x - rock.x, g.y - rock.y) < g.radius + 8) {
                hitGuard = g;
                break;
            }
        }

        if (hitGuard) {
            hitGuard.hp -= 10;
            sfx.guardHit();
            createBloodParticles(hitGuard.x, hitGuard.y, 8);
            showFloatingText("-10 HP", hitGuard.x, hitGuard.y, "#f59e0b");
            
            hitGuard.state = 'SUSPICIOUS';
            hitGuard.suspicionTimer = 1.5;
            hitGuard.targetLastKnown = { x: rock.x, y: rock.y };

            if (hitGuard.hp <= 0) {
                guardKills++;
                createBloodParticles(hitGuard.x, hitGuard.y, 25);
                showFloatingText("GUARD DEFEATED!", hitGuard.x, hitGuard.y - 15, "#ef4444");
            }

            emitNoise(rock.x, rock.y, 280);
            sfx.rockThud();
            rock.completed = true;
            return;
        }

        if (rock.progress >= totalDist) {
            rock.x = rock.targetX;
            rock.y = rock.targetY;
            sfx.rockThud();
            emitNoise(rock.x, rock.y, 280);
            rock.completed = true;
        }
    });
    rockProjectiles = rockProjectiles.filter(r => !r.completed);

    noiseRipples.forEach(r => {
        r.radius += dt * 450;
        r.life -= dt;
    });
    noiseRipples = noiseRipples.filter(r => r.life > 0);

    const pCol = Math.floor(player.x / TILE_SIZE);
    const pRow = Math.floor(player.y / TILE_SIZE);

    if (pRow >= 0 && pRow < MAP_ROWS && pCol >= 0 && pCol < MAP_COLS) {
        if (MAP_GRID[pRow][pCol] === 3 && !flagCaptured) {
            flagCaptured = true;
            sfx.itemPick();
            triggerAlarm();
            showBannerAlert("ROYAL FLAG STOLEN! ESCAPE OUTSIDE TO THE WAGON!");
        }

        if (MAP_GRID[pRow][pCol] === 5 && !swordEquipped) {
            swordEquipped = true;
            sfx.itemPick();
            showFloatingText("ANCIENT SWORD UNLOCKED!", player.x, player.y - 20, "#38bdf8");
            showBannerAlert("SWORD ACQUIRED! Left Click to Melee Strike!");
        }

        if (MAP_GRID[pRow][pCol] === 6) {
            if (player.hp < player.maxHp) {
                player.hp = Math.min(player.maxHp, player.hp + 50);
                MAP_GRID[pRow][pCol] = 0;
                sfx.itemPick();
                showFloatingText("+50 HP", player.x, player.y - 20, "#4ade80");
            }
        }

        if (MAP_GRID[pRow][pCol] === 2 && flagCaptured) {
            triggerVictory();
        }
    }

    guards.forEach(g => g.update(dt));

    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);

    floatingTexts.forEach(ft => {
        ft.y += ft.vy;
        ft.life -= dt;
    });
    floatingTexts = floatingTexts.filter(ft => ft.life > 0);

    updateHUD();
}

function updateHUD() {
    const hpBar = document.getElementById('hp-bar');
    const hpText = document.getElementById('hp-text');
    const hpPct = Math.max(0, (player.hp / player.maxHp) * 100);
    hpBar.style.width = `${hpPct}%`;
    hpText.innerText = `${Math.ceil(player.hp)} / ${player.maxHp}`;

    const staminaBar = document.getElementById('stamina-bar');
    const staminaText = document.getElementById('stamina-text');
    const staminaPct = Math.max(0, (player.stamina / player.maxStamina) * 100);
    staminaBar.style.width = `${staminaPct}%`;
    staminaText.innerText = `${Math.ceil(staminaPct)}%`;

    const stealthBadge = document.getElementById('stealth-badge');
    if (stealthBadge.dataset.state !== player.state) {
        stealthBadge.dataset.state = player.state;
        if (player.state === 'CROUCH') {
            stealthBadge.innerText = 'CROUCHED (SILENT)';
            stealthBadge.className = 'px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[11px] font-black tracking-wider uppercase bg-emerald-950/80 border border-emerald-500/50 text-emerald-400';
        } else if (player.state === 'SPRINT') {
            stealthBadge.innerText = 'SPRINTING (LOUD)';
            stealthBadge.className = 'px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[11px] font-black tracking-wider uppercase bg-red-950/80 border border-red-500/50 text-red-400 animate-pulse-fast';
        } else {
            stealthBadge.innerText = 'NORMAL';
            stealthBadge.className = 'px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[11px] font-black tracking-wider uppercase bg-slate-800 border border-slate-600 text-slate-300';
        }
    }

    const flagText = document.getElementById('flag-status-text');
    if (flagCaptured) {
        flagText.innerText = 'STOLEN!';
        flagText.className = 'text-red-400 font-bold animate-pulse';
    } else {
        flagText.innerText = 'NOT TAKEN';
        flagText.className = 'text-amber-400 font-bold';
    }

    const weaponText = document.getElementById('weapon-status-text');
    if (swordEquipped) {
        weaponText.innerText = 'ANCIENT SWORD';
        weaponText.className = 'text-sky-400 font-bold';
    } else {
        weaponText.innerText = 'UNARMED';
        weaponText.className = 'text-slate-400';
    }

    const rockText = document.getElementById('rock-status-text');
    if (player.rocksRemaining <= 0) {
        rockText.innerText = '0 LEFT';
        rockText.className = 'text-red-400 font-bold';
    } else if (player.rockCooldown <= 0) {
        rockText.innerText = `READY (${player.rocksRemaining})`;
        rockText.className = 'text-emerald-400 font-bold';
    } else {
        rockText.innerText = `${Math.ceil(player.rockCooldown)}s (${player.rocksRemaining})`;
        rockText.className = 'text-slate-400 font-bold';
    }

    document.getElementById('game-timer').innerText = formatTime(gameTime);
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`;
}

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

function loadHighScores() {
    const bestTime = localStorage.getItem('shadow_castle_v3_time');
    const bestKills = localStorage.getItem('shadow_castle_v3_kills') || '0';
    const startingRocks = getStartingRocksForGame();

    if (bestTime) {
        document.getElementById('best-time-val').innerText = formatTime(parseFloat(bestTime));
    } else {
        document.getElementById('best-time-val').innerText = 'None';
    }
    document.getElementById('best-kills-val').innerText = bestKills;

    const rockValElem = document.getElementById('start-rocks-val');
    if (rockValElem) {
        rockValElem.innerText = `${startingRocks}`;
    }

    fetchLeaderboard();
}

// --- Firebase Leaderboard Integration Functions ---

async function fetchLeaderboard() {
    const listElem = document.getElementById('leaderboard-list');
    if (!listElem) return;
    try {
        const q = query(collection(db, "leaderboard"), orderBy("time", "asc"), limit(5));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            listElem.innerHTML = `<p class="text-slate-500 italic">No scores posted yet. Be the first!</p>`;
            return;
        }

        let html = '';
        let rank = 1;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            html += `<div class="flex justify-between border-b border-slate-900 pb-0.5 text-xs">
                <span>#${rank++} <strong class="text-slate-200">${data.name || 'Anonymous'}</strong></span>
                <span class="text-amber-400 font-mono">${formatTime(data.time)}</span>
            </div>`;
        });
        listElem.innerHTML = html;
    } catch (e) {
        console.error("Error fetching leaderboard:", e);
        listElem.innerHTML = `<p class="text-red-400">Failed to load leaderboard.</p>`;
    }
}

async function submitScore() {
    if (!currentUser) return;

    const btn = document.getElementById('btn-submit-score');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Submitting...';
    }

    try {
        await addDoc(collection(db, "leaderboard"), {
            uid: currentUser.uid,
            name: currentUser.displayName || 'Anonymous',
            time: gameTime,
            kills: guardKills,
            timestamp: serverTimestamp()
        });

        if (btn) {
            btn.innerText = 'Score Posted! 🎉';
            btn.className = 'w-full bg-emerald-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl';
        }
        fetchLeaderboard();
    } catch (e) {
        console.error("Error adding document: ", e);
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Retry Submission';
        }
    }
}

function togglePause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        document.getElementById('modal-pause').classList.remove('hidden');
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        document.getElementById('modal-pause').classList.add('hidden');
    }
}

function returnToMainMenu() {
    gameState = 'START';
    resetKeys();
    loadHighScores();
    
    document.getElementById('modal-pause')?.classList.add('hidden');
    document.getElementById('modal-gameover')?.classList.add('hidden');
    document.getElementById('modal-victory')?.classList.add('hidden');
    document.getElementById('modal-start')?.classList.remove('hidden');
}

function triggerGameOver() {
    gameState = 'GAMEOVER';
    document.getElementById('go-flag-status').innerText = flagCaptured ? 'Yes' : 'No';
    document.getElementById('go-kills').innerText = guardKills.toString();
    document.getElementById('go-time').innerText = formatTime(gameTime);
    document.getElementById('modal-gameover').classList.remove('hidden');
}

function triggerVictory() {
    gameState = 'VICTORY';
    
    const currentRocks = getStartingRocksForGame();
    const nextRocks = Math.max(3, currentRocks - 1);
    localStorage.setItem('shadow_castle_v3_rocks', nextRocks.toString());

    document.getElementById('vic-time').innerText = formatTime(gameTime);
    document.getElementById('vic-kills').innerText = guardKills.toString();
    document.getElementById('vic-sword').innerText = swordEquipped ? 'Yes' : 'No';

    let rating = 'Ghost';
    if (guardKills > 5) rating = 'Shadow Assassin';
    else if (guardKills > 0) rating = 'Infiltrator';
    else if (gameTime > 120) rating = 'Patient Thief';
    document.getElementById('vic-rating').innerText = rating;

    const bestTime = localStorage.getItem('shadow_castle_v3_time');
    const badge = document.getElementById('new-high-score-badge');

    if (!bestTime || gameTime < parseFloat(bestTime)) {
        localStorage.setItem('shadow_castle_v3_time', gameTime.toString());
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    const currentKills = parseInt(localStorage.getItem('shadow_castle_v3_kills') || '0', 10);
    if (guardKills > currentKills) {
        localStorage.setItem('shadow_castle_v3_kills', guardKills.toString());
    }

    // Refresh user state UI directly on trigger
    updateAuthUI(currentUser);

    document.getElementById('modal-victory').classList.remove('hidden');
}

function startGame() {
    detectDevice();
    if (isMobileDevice) {
        try { requestFullscreenMode(); } catch(e) {}
    }
    loadHighScores();
    initLevel();
    resetKeys();
    gameState = 'PLAYING';
    document.getElementById('modal-start').classList.add('hidden');
    document.getElementById('modal-pause').classList.add('hidden');
    document.getElementById('modal-gameover').classList.add('hidden');
    document.getElementById('modal-victory').classList.add('hidden');
}

// Event Listeners
document.getElementById('btn-start-game').addEventListener('click', startGame);
document.getElementById('btn-pause').addEventListener('click', togglePause);
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-restart-pause').addEventListener('click', startGame);
document.getElementById('btn-restart-dead').addEventListener('click', startGame);
document.getElementById('btn-restart-victory').addEventListener('click', startGame);

document.getElementById('btn-menu-pause')?.addEventListener('click', returnToMainMenu);
document.getElementById('btn-menu-dead')?.addEventListener('click', returnToMainMenu);
document.getElementById('btn-menu-victory')?.addEventListener('click', returnToMainMenu);

document.getElementById('btn-google-login')?.addEventListener('click', handleGoogleLogin);
document.getElementById('btn-submit-score')?.addEventListener('click', submitScore);

window.onload = () => {
    resizeCanvas();
    detectDevice();
    loadHighScores();
    initLevel();
    requestAnimationFrame(gameLoop);
};
