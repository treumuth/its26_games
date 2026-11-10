let particles = [];
let rockProjectiles = [];
let noiseRipples = [];
let floatingTexts = [];
let player = null;
let guards = [];
let margusNPC = null;
let margusFound = false;
let margusNear = false;
let margusChallengeDone = false;
let exitLockOpened = false;
let exitLockDismissed = false;
let lockSequence = [2, 4, 1];
let lockProgress = 0;
let pyodidePromise = null;

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
    // Margus hides in a quiet corner of the western chamber.
    const margusRow = Math.floor(MAP_ROWS * 0.4) + 1;
    const margusCol = 5;
    margusNPC = { x: margusCol * TILE_SIZE + TILE_SIZE / 2, y: margusRow * TILE_SIZE + TILE_SIZE / 2 };
    margusFound = false;
    margusNear = false;
    margusChallengeDone = false;
    exitLockOpened = false;
    exitLockDismissed = false;
    window.exitLockNoticeShown = false;
    lockSequence = Array.from({length: 3}, () => 1 + Math.floor(seededRandom() * 4));
    lockProgress = 0;
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

    // Keep the opening area clear and cap guard density so each run is readable.
    const spawnX = player.x;
    const spawnY = player.y;
    const maxGuards = 12;
    const minSpawnDistance = TILE_SIZE * 8;
    const minGuardSpacing = TILE_SIZE * 4.5;

    for (let r = 9; r < MAP_ROWS - 3 && guards.length < maxGuards; r += 5) {
        for (let c = 3; c < MAP_COLS - 3 && guards.length < maxGuards; c += 5) {
            if (MAP_GRID[r][c] !== 0 || seededRandom() >= 0.42) continue;

            const gx = c * TILE_SIZE + TILE_SIZE / 2;
            const gy = r * TILE_SIZE + TILE_SIZE / 2;
            const farFromSpawn = Math.hypot(gx - spawnX, gy - spawnY) >= minSpawnDistance;
            const farFromMargus = Math.hypot(gx - margusNPC.x, gy - margusNPC.y) >= TILE_SIZE * 3;
            const spacedOut = guards.every(g => Math.hypot(g.x - gx, g.y - gy) >= minGuardSpacing);

            if (farFromSpawn && farFromMargus && spacedOut) {
                guards.push(new Guard(gx, gy));
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
    const steps = Math.max(1, Math.ceil(dist / 12));
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
        showBannerAlert("ALARM TRIGGERED! NEARBY GUARDS ARE INVESTIGATING!");

        // Only nearby guards investigate the alarm. Distant guards keep patrolling,
        // so triggering an alarm does not make the entire map rush the spawn area.
        const alarmRadius = TILE_SIZE * 9;
        guards.forEach(g => {
            if (g.hp <= 0) return;
            const distance = Math.hypot(g.x - player.x, g.y - player.y);
            if (distance <= alarmRadius) {
                g.state = 'SUSPICIOUS';
                g.suspicionTimer = 2.2;
                g.targetLastKnown = { x: player.x, y: player.y };
                g.path = [];
            }
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
            vx: (seededRandom() - 0.5) * 4.5,
            vy: (seededRandom() - 0.5) * 4.5,
            radius: seededRandom() * 3 + 1,
            color: '#dc2626',
            life: 0.55
        });
    }
}

function createSlashEffect(x, y, angle, range) {
    for (let i = 0; i < 18; i++) {
        const spread = (seededRandom() - 0.5) * 0.95;
        const pAngle = angle + spread;
        const speed = seededRandom() * 3.5 + 2;
        particles.push({
            x: x + Math.cos(angle) * 16,
            y: y + Math.sin(angle) * 16,
            vx: Math.cos(pAngle) * speed,
            vy: Math.sin(pAngle) * speed,
            radius: seededRandom() * 2.5 + 1,
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

    ctx.clearRect(0, 0, canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);

    const viewW = canvas.clientWidth || window.innerWidth;
    const viewH = canvas.clientHeight || window.innerHeight;
    cameraX = Math.max(0, Math.min(player.x - viewW / 2, MAP_COLS * TILE_SIZE - viewW));
    cameraY = Math.max(0, Math.min(player.y - viewH / 2, MAP_ROWS * TILE_SIZE - viewH));

    ctx.save();
    ctx.translate(-cameraX, -cameraY);

    drawMap();
    drawInteractiveItems();
    drawMargusNPC();

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
            ctx.font = '900 20px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('?', g.x, g.y - g.radius - 8);
        } else if (g.state === 'CHASE') {
            ctx.fillStyle = '#ef4444';
            ctx.font = '900 22px Inter, sans-serif';
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

    // Reset alignment (guard "?"/"!" labels leave it centered)
    ctx.textAlign = 'left';
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
                ctx.textAlign = 'left';
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

function drawMargusNPC() {
    if (!margusNPC || margusFound) return;
    const x = margusNPC.x, y = margusNPC.y;
    ctx.save();
    ctx.translate(x, y);
    // Warm lantern-like marker, only noticeable when you get close.
    if (margusNear) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.13)';
        ctx.beginPath(); ctx.arc(0, 0, 29, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(2, 6, 23, 0.45)';
    ctx.beginPath(); ctx.ellipse(0, 13, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
    // Deep plum travelling cloak and muted green medieval tunic.
    ctx.fillStyle = '#49334b';
    ctx.beginPath(); ctx.moveTo(-13, 3); ctx.quadraticCurveTo(-17, 12, -13, 17);
    ctx.lineTo(13, 17); ctx.quadraticCurveTo(17, 12, 13, 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#251d2c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#64745a';
    ctx.beginPath(); ctx.moveTo(-8, -1); ctx.lineTo(8, -1); ctx.lineTo(10, 15); ctx.lineTo(-10, 15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b58a52'; ctx.fillRect(-10, 7, 20, 3);
    ctx.fillStyle = '#e5c28f'; ctx.fillRect(-2, 7, 4, 3);
    // Face and tousled chestnut hair, inspired by Margus's portrait.
    ctx.fillStyle = '#e7b995';
    ctx.beginPath(); ctx.ellipse(0, -8, 9, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#49352f';
    ctx.beginPath(); ctx.moveTo(-9, -9); ctx.quadraticCurveTo(-12, -23, -2, -22);
    ctx.quadraticCurveTo(8, -25, 10, -12); ctx.lineTo(7, -14); ctx.lineTo(3, -18);
    ctx.lineTo(-1, -14); ctx.lineTo(-5, -17); ctx.lineTo(-8, -12); ctx.closePath(); ctx.fill();
    // Signature round spectacles.
    ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 1.7;
    ctx.beginPath(); ctx.ellipse(-4, -8, 3.7, 2.8, 0, 0, Math.PI * 2);
    ctx.ellipse(4, -8, 3.7, 2.8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.3, -8); ctx.lineTo(0.3, -8); ctx.moveTo(-8, -9); ctx.lineTo(-10, -10); ctx.moveTo(8, -9); ctx.lineTo(10, -10); ctx.stroke();
    ctx.fillStyle = '#3f302c';
    ctx.beginPath(); ctx.arc(-4, -8, 0.8, 0, Math.PI * 2); ctx.arc(4, -8, 0.8, 0, Math.PI * 2); ctx.fill();
    // Tiny hood clasp and an old parchment tucked into his belt.
    ctx.fillStyle = '#eabf64'; ctx.beginPath(); ctx.arc(-10, 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9c9a3'; ctx.fillRect(7, 9, 3, 6);
    ctx.restore();

    if (margusNear) {
        ctx.save(); ctx.fillStyle = '#fde68a'; ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.shadowColor = '#020617'; ctx.shadowBlur = 5;
        ctx.fillText('MARGUS', x, y - 29); ctx.restore();
    }
}

function talkToMargus() {
    if (!player || !margusNPC || margusFound || !margusNear || gameState !== 'PLAYING') return;
    const editor = document.getElementById('margus-python-code');
    const output = document.getElementById('margus-python-output');
    const feedback = document.getElementById('code-feedback');
    if (editor) editor.value = 'name = "Margus"\ngreeting = ""\n\n# Margus wants to greet the visitor.\nif name == "Margus":\n    print(greeting)\n\ngreeting = "Hello, " + name';
    if (output) output.textContent = 'Program output will appear here…';
    if (feedback) feedback.textContent = 'Something is wrong with the order. Run it and inspect the output.';
    openMiniGame('modal-margus-code');
}

function openMiniGame(id) {
    gameState = 'MINIGAME';
    resetKeys();
    const el = document.getElementById(id);
    el.classList.remove('hidden'); el.classList.add('flex');
}
function closeMiniGame(id) {
    const el = document.getElementById(id);
    el.classList.add('hidden'); el.classList.remove('flex');
    if (gameState === 'MINIGAME') gameState = 'PLAYING';
}

// Load the real Python runtime only when Margus's challenge is first run.
function loadMargusPythonRuntime() {
    if (window.loadPyodide) return Promise.resolve();
    if (pyodidePromise) return pyodidePromise;
    pyodidePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Could not load the Python runtime. Check your internet connection and try again.'));
        document.head.appendChild(script);
    });
    return pyodidePromise;
}

async function runMargusPython() {
    const editor = document.getElementById('margus-python-code');
    const output = document.getElementById('margus-python-output');
    const feedback = document.getElementById('code-feedback');
    const runButton = document.getElementById('btn-code-run');
    const source = editor?.value ?? '';
    // Execute the player's actual Python, rather than matching a prewritten answer.
    // The challenge is solved by the program's behaviour: its output must greet Margus.
    if (!source.trim()) {
        output.textContent = '(no output)';
        feedback.textContent = 'The program is empty. Add or fix some Python first.';
        return;
    }

    runButton.disabled = true;
    runButton.textContent = 'Loading Python…';
    feedback.textContent = 'Starting the Python runtime…';
    try {
        await loadMargusPythonRuntime();
        const pyodide = await window.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/'
        });
        let printed = '';
        pyodide.setStdout({ batched: (line) => { printed += `${line}\n`; } });
        await pyodide.runPythonAsync(source);
        output.textContent = printed.trimEnd() || '(no output)';
        if (printed.trim() === 'Hello, Margus!') {
            feedback.textContent = 'Python ran successfully — Margus got your greeting!';
            finishMargusChallenge();
        } else {
            feedback.textContent = 'The program ran, but Margus did not hear the right greeting.';
        }
    } catch (error) {
        output.textContent = error?.message || String(error);
        feedback.textContent = 'Python could not start. Check your connection and try again.';
    } finally {
        runButton.disabled = false;
        runButton.textContent = '▶ Run Python';
    }
}
function finishMargusChallenge() {
    margusChallengeDone = true; margusFound = true;
    player.rocksRemaining += 3; player.hp = Math.min(player.maxHp, player.hp + 15);
    sfx.itemPick();
    showFloatingText('+3 LURES  +15 HP', margusNPC.x, margusNPC.y - 28, '#fbbf24');
    showBannerAlert('MARGUS: “Brilliant! Real Python! The flag lies in the southern sanctum!”');
    document.getElementById('btn-talk-margus')?.classList.add('hidden');
    closeMiniGame('modal-margus-code');
}
function startLockpick() {
    if (exitLockOpened || gameState !== 'PLAYING') return;
    lockProgress = 0;
    document.getElementById('lock-sequence').textContent = lockSequence.join(' · ');
    document.getElementById('lock-progress').textContent = 'Pins set: 0 / 3';
    document.getElementById('lock-feedback').textContent = 'Choose the first pin.';
    openMiniGame('modal-lockpick');
}
function chooseLockPin(pin) {
    if (pin === lockSequence[lockProgress]) {
        lockProgress++;
        document.getElementById('lock-progress').textContent = `Pins set: ${lockProgress} / 3`;
        if (lockProgress === lockSequence.length) {
            exitLockOpened = true; sfx.itemPick();
            document.getElementById('lock-feedback').textContent = 'Click! The gate is open!';
            setTimeout(() => { closeMiniGame('modal-lockpick'); if (gameState === 'PLAYING') triggerVictory(); }, 650);
        } else document.getElementById('lock-feedback').textContent = 'Good! Set the next pin.';
    } else {
        lockProgress = 0;
        document.getElementById('lock-progress').textContent = 'Pins set: 0 / 3';
        document.getElementById('lock-feedback').textContent = 'The pins slipped. Try the sequence again.';
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
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        fCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const viewW = canvas.clientWidth || window.innerWidth;
    const viewH = canvas.clientHeight || window.innerHeight;
    fCtx.globalCompositeOperation = 'source-over';
    fCtx.fillStyle = '#020617';
    fCtx.fillRect(0, 0, viewW, viewH);

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

    ctx.drawImage(fogCanvas, cameraX, cameraY, canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
}

function drawMinimap() {
    const mw = minimapCanvas.width, mh = minimapCanvas.height;
    mmCtx.clearRect(0, 0, mw, mh);
    mmCtx.fillStyle = 'rgba(3, 7, 18, 0.95)';
    mmCtx.fillRect(0, 0, mw, mh);

    const scaleX = mw / (MAP_COLS * TILE_SIZE);
    const scaleY = mh / (MAP_ROWS * TILE_SIZE);

    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            const tile = MAP_GRID[r][c];
            if (tile === 1 || tile === 4) {
                mmCtx.fillStyle = '#475569';
                mmCtx.fillRect(c * TILE_SIZE * scaleX, r * TILE_SIZE * scaleY, Math.max(2,mw/130*3), Math.max(2,mh/130*3));
            } else if (tile === 2) {
                mmCtx.fillStyle = '#10b981';
                mmCtx.fillRect(c * TILE_SIZE * scaleX, r * TILE_SIZE * scaleY, Math.max(3,mw/130*4), Math.max(3,mh/130*4));
            } else if (tile === 3 && !flagCaptured) {
                mmCtx.fillStyle = '#f59e0b';
                mmCtx.fillRect(c * TILE_SIZE * scaleX, r * TILE_SIZE * scaleY, Math.max(4,mw/130*5), Math.max(4,mh/130*5));
            } else if (tile === 6) {
                mmCtx.fillStyle = '#ef4444';
                mmCtx.fillRect(c * TILE_SIZE * scaleX, r * TILE_SIZE * scaleY, Math.max(3,mw/130*4), Math.max(3,mh/130*4));
            }
        }
    }

    guards.forEach(g => {
        if (g.hp <= 0) return;
        mmCtx.fillStyle = g.state === 'CHASE' ? '#ef4444' : '#eab308';
        mmCtx.beginPath();
        mmCtx.arc(g.x * scaleX, g.y * scaleY, Math.max(2,mw/130*2), 0, Math.PI * 2);
        mmCtx.fill();
    });

    if (margusNPC && margusFound) {
        mmCtx.fillStyle = '#fbbf24';
        mmCtx.beginPath(); mmCtx.arc(margusNPC.x * scaleX, margusNPC.y * scaleY, 3, 0, Math.PI * 2); mmCtx.fill();
    }

    mmCtx.fillStyle = '#38bdf8';
    mmCtx.beginPath();
    mmCtx.arc(player.x * scaleX, player.y * scaleY, Math.max(3,mw/130*3), 0, Math.PI * 2);
    mmCtx.fill();
}

