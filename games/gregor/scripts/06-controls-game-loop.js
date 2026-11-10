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

    if (isDown && (code === 'Escape' || code === 'KeyP')) { togglePause(); handled = true; }
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
    if (isDown && (code === 'KeyF' || key === 'f' || key === 'F')) {
        talkToMargus();
        handled = true;
    }

    if (handled && e.cancelable) {
        e.preventDefault();
    }
}

window.addEventListener('keydown', (e) => handleKeyEvent(e, true));
window.addEventListener('keyup', (e) => handleKeyEvent(e, false));
window.addEventListener('blur', () => { resetKeys(); if (gameState === 'PLAYING') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && gameState === 'PLAYING') { resetKeys(); togglePause(); } });

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

const bindTouchBtn = (id, keyName) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); keyState[keyName] = true; btn.setPointerCapture?.(e.pointerId); });
    const release = (e) => { e.preventDefault(); keyState[keyName] = false; };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', () => { keyState[keyName] = false; });
};

bindTouchBtn('btn-touch-up', 'up');
bindTouchBtn('btn-touch-down', 'down');
bindTouchBtn('btn-touch-left', 'left');
bindTouchBtn('btn-touch-right', 'right');
bindTouchBtn('btn-touch-crouch', 'crouch');
bindTouchBtn('btn-touch-sprint', 'sprint');

document.getElementById('btn-touch-strike')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (player && gameState === 'PLAYING') player.attack();
});
document.getElementById('btn-touch-rock')?.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (player && gameState === 'PLAYING') player.throwRock();
});
document.getElementById('btn-talk-margus')?.addEventListener('pointerdown', (e) => { e.preventDefault(); talkToMargus(); });
document.getElementById('btn-code-clear')?.addEventListener('click', () => {
    document.getElementById('margus-python-code').value = 'name = "Margus"\ngreeting = ""\n\n# Margus wants to greet the visitor.\nif name == "Margus":\n    print(greeting)\n\ngreeting = "Hello, " + name';
    document.getElementById('margus-python-output').textContent = 'Program output will appear here…';
    document.getElementById('code-feedback').textContent = 'Back to Margus’s original messy program. Can you fix its logic?';
});
document.getElementById('btn-code-close')?.addEventListener('click', () => closeMiniGame('modal-margus-code'));
document.getElementById('btn-code-run')?.addEventListener('click', runMargusPython);
document.querySelectorAll('.lock-pin').forEach(btn => btn.addEventListener('click', () => chooseLockPin(Number(btn.dataset.pin))));
document.getElementById('btn-lock-cancel')?.addEventListener('click', () => { exitLockDismissed = true; closeMiniGame('modal-lockpick'); });

function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    detectDevice();
}
window.addEventListener('resize', resizeCanvas);

function update(dt) {
    if (gameState !== 'PLAYING') return;

    gameTime += dt;

    player.update(dt);
    margusNear = !!(margusNPC && !margusFound && Math.hypot(player.x - margusNPC.x, player.y - margusNPC.y) < 62);
    const talkButton = document.getElementById('btn-talk-margus');
    if (talkButton) talkButton.classList.toggle('hidden', !margusNear || gameState !== 'PLAYING');

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

        // Tile 9 marks the castle's north entrance gate. Solve the lock here,
        // then continue outside to tile 2 (the getaway wagon) to finish.
        if (MAP_GRID[pRow][pCol] === 9 && flagCaptured && !exitLockOpened && !exitLockDismissed) {
            if (!window.exitLockNoticeShown) {
                window.exitLockNoticeShown = true;
                showBannerAlert('THE CASTLE DOOR IS LOCKED! Solve the sequence to get out.');
            }
            startLockpick();
        } else if (MAP_GRID[pRow][pCol] !== 9) {
            exitLockDismissed = false;
        }

        if (MAP_GRID[pRow][pCol] === 2 && flagCaptured && exitLockOpened) {
            triggerVictory();
        }
    }

    guards.forEach(g => g.update(dt));

    particles.forEach(p => {
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);

    floatingTexts.forEach(ft => {
        ft.y += ft.vy * dt * 60;
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
    const objective = document.getElementById('objective-status');
    if (objective) objective.innerText = flagCaptured
        ? (exitLockOpened ? 'Reach the getaway wagon outside' : 'Unlock the castle entrance door, then reach the wagon')
        : 'Find the Royal Flag in the southern sanctum';
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

