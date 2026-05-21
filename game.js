const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const feathersEl = document.getElementById("feathers");
const bestEl = document.getElementById("best");
const energyFill = document.getElementById("energyFill");
const panel = document.getElementById("panel");
const panelTitle = document.getElementById("panelTitle");
const panelText = document.getElementById("panelText");
const startButton = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const touchJump = document.getElementById("touchJump");
const touchSlide = document.getElementById("touchSlide");
const touchDash = document.getElementById("touchDash");
const touchPause = document.getElementById("touchPause");

const CELL_W = 192;
const CELL_H = 208;
const ROWS = {
  idle: { row: 0, frames: 6, speed: 0.12 },
  run: { row: 1, frames: 8, speed: 0.19 },
  slide: { row: 2, frames: 8, speed: 0.14 },
  jump: { row: 4, frames: 5, speed: 0.16 },
  fail: { row: 5, frames: 8, speed: 0.13 },
  wave: { row: 3, frames: 4, speed: 0.1 },
};

const sprite = new Image();
sprite.src = "./assets/golden-scout-spritesheet.webp?v=mobile-totem-ground-1";
const slideSprite = new Image();
slideSprite.src = "./assets/slide-sequence.png?v=mobile-totem-ground-1";
const sceneImage = new Image();
sceneImage.src = "./assets/scene-background.png?v=scene-bg-1";
const groundImage = new Image();
groundImage.src = "./assets/grass-platform.png?v=grass-clean-3";
const totemLowImage = new Image();
totemLowImage.src = "./assets/totem-low.png?v=mobile-totem-ground-1";
const totemHighImage = new Image();
totemHighImage.src = "./assets/totem-high.png?v=mobile-totem-ground-1";

const SCENE_SURFACE_Y = 762;
const GROUND_SURFACE_OFFSET = 78;
const SLIDE_CELL_W = 330;
const SLIDE_CELL_H = 270;
const SLIDE_FRAMES = 15;
const SLIDE_DURATION = 1.02;
const TOTEM_BOTTOM_PAD = 8;
const TOTEM_LOW_ASSET_H = 370;
const TOTEM_HIGH_ASSET_H = 627;
const SLIDE_BOUNDS = [
  [66, 20, 179, 248],
  [66, 22, 186, 246],
  [70, 22, 177, 246],
  [89, 20, 150, 248],
  [5, 82, 301, 181],
  [23, 88, 281, 173],
  [13, 119, 312, 142],
  [34, 98, 262, 133],
  [49, 99, 232, 131],
  [81, 87, 189, 143],
  [131, 60, 103, 166],
  [114, 61, 120, 165],
  [102, 42, 126, 198],
  [104, 41, 124, 199],
  [102, 40, 122, 200],
];
const SLIDE_DRAW_SCALE = 104 / 248;

const keys = new Set();
const rand = (min, max) => min + Math.random() * (max - min);

let scale = 1;
let spriteScale = 1;
let motionScale = 1;
let groundY = 560;
let lastTime = 0;
let spawnTimer = 0;
let featherTimer = 0;
let powerupTimer = 0;
let weatherTime = 0;
let game;

const playerWidth = () => 86 * spriteScale;
const playerStandHeight = () => 104 * spriteScale;
const playerSlideWidth = () => 124 * spriteScale;
const playerDuckHeight = () => 48 * spriteScale;
const totemGroundPad = (obstacle) =>
  obstacle.h * TOTEM_BOTTOM_PAD / (obstacle.type === "totemHigh" ? TOTEM_HIGH_ASSET_H : TOTEM_LOW_ASSET_H);

function resetGame() {
  spawnTimer = 1.35;
  featherTimer = 0.42;
  powerupTimer = 5.2;
  game = {
    state: "ready",
    score: 0,
    feathers: 0,
    best: Number(localStorage.getItem("goldenFeatherBest") || 0),
    energy: 0,
    speed: 420,
    dashTime: 0,
    magnetTime: 0,
    shieldTime: 0,
    shieldHits: 0,
    shake: 0,
    obstacles: [],
    pickups: [],
    powerups: [],
    particles: [],
    player: {
      x: 180,
      y: groundY - playerStandHeight(),
      w: playerWidth(),
      h: playerStandHeight(),
      vy: 0,
      onGround: true,
      jumpsLeft: 2,
      ducking: false,
      slideTime: SLIDE_DURATION,
      anim: 0,
      invuln: 0,
    },
  };
  updateHud();
}

function resizeCanvas() {
  const stage = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(stage.width * dpr);
  canvas.height = Math.round(stage.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = stage.width / 1280;
  spriteScale =
    stage.height > stage.width
      ? Math.min(0.78, Math.max(0.56, stage.width / 620))
      : scale;
  motionScale = Math.max(scale, spriteScale * 0.74);
  groundY = stage.height * (stage.height > stage.width ? 0.72 : 0.78);
  if (game) {
    game.player.x = stage.width * 0.15;
    game.player.w = game.player.ducking ? playerSlideWidth() : playerWidth();
    game.player.h = game.player.ducking ? playerDuckHeight() : playerStandHeight();
    if (game.player.onGround) game.player.y = groundY - game.player.h;
  }
}

function updateHud() {
  scoreEl.textContent = Math.floor(game.score);
  feathersEl.textContent = game.feathers;
  bestEl.textContent = game.best;
  energyFill.style.width = `${Math.min(100, game.energy)}%`;
  const dashReady = game.energy >= 100 && game.state === "playing" && game.dashTime <= 0;
  touchDash.classList.toggle("is-ready", dashReady);
  touchDash.setAttribute("aria-disabled", dashReady ? "false" : "true");
}

function showPanel(title, text, label = "开始") {
  panelTitle.textContent = title;
  panelText.textContent = text;
  startButton.textContent = label;
  panel.classList.remove("hidden");
}

function hidePanel() {
  panel.classList.add("hidden");
}

function beginGame() {
  if (game.state === "playing") return;
  if (game.state === "gameover") resetGame();
  game.state = "playing";
  updateHud();
  hidePanel();
}

function pauseGame() {
  if (game.state === "playing") {
    game.state = "paused";
    updateHud();
    showPanel("暂停中", "按 P 或点击继续，山道还在前方。", "继续");
  } else if (game.state === "paused") {
    beginGame();
  }
}

function jump() {
  const p = game.player;
  if (game.state !== "playing") {
    beginGame();
    return;
  }
  if (p.onGround || p.jumpsLeft > 0) {
    const firstJump = p.onGround;
    if (p.ducking) {
      p.ducking = false;
      p.slideTime = SLIDE_DURATION;
      p.h = playerStandHeight();
      p.w = playerWidth();
      p.y = groundY - p.h;
    }
    p.vy = (firstJump ? -930 : -820) * motionScale;
    p.onGround = false;
    p.jumpsLeft = firstJump ? 1 : 0;
    p.ducking = false;
    burst(p.x + p.w * 0.5, p.y + p.h, firstJump ? "#fff4c2" : "#ffc44d", firstJump ? 8 : 12);
  }
}

function dash() {
  if (game.state !== "playing" || game.energy < 100 || game.dashTime > 0) return;
  game.energy = 0;
  game.dashTime = 2.25;
  game.player.invuln = 2.25;
  burst(game.player.x + game.player.w * 0.5, game.player.y + 34, "#ffc44d", 22);
  updateHud();
}

function setDucking(value) {
  const p = game.player;
  if (!p.onGround || game.state !== "playing") return;
  if (value && !p.ducking) {
    p.ducking = true;
    p.slideTime = 0;
    p.h = playerDuckHeight();
    p.w = playerSlideWidth();
    p.y = groundY - p.h;
  }
}

function spawnObstacle() {
  const type = game.score > 260 && Math.random() > 0.52 ? "totemHigh" : "totemLow";
  const h = (type === "totemHigh" ? 260 : 112) * spriteScale;
  const w = h * (type === "totemHigh" ? 290 / 627 : 270 / 370);
  game.obstacles.push({
    type,
    x: canvas.clientWidth + 60,
    y: groundY - h,
    w,
    h,
    passed: false,
  });
}

function spawnFeather() {
  const high = Math.random() > 0.5;
  const roll = Math.random();
  const type = roll > 0.91 ? "rainbow" : roll > 0.76 ? "energy" : "gold";
  game.pickups.push({
    type,
    x: canvas.clientWidth + 40,
    y: groundY - (high ? rand(170, 230) : rand(96, 140)),
    r: type === "rainbow" ? 18 : 16,
    spin: rand(0, 6),
    taken: false,
  });
}

function spawnPowerup() {
  const type = Math.random() > 0.5 ? "magnet" : "shield";
  game.powerups.push({
    type,
    x: canvas.clientWidth + 50,
    y: groundY - rand(130, 220),
    r: 22,
    spin: rand(0, 6),
    taken: false,
  });
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    game.particles.push({
      x,
      y,
      vx: rand(-190, 190) * scale,
      vy: rand(-250, 60) * motionScale,
      life: rand(0.35, 0.75),
      max: 0.75,
      color,
      size: rand(3, 8) * spriteScale,
    });
  }
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function circleRectOverlap(c, r) {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  return (c.x - cx) ** 2 + (c.y - cy) ** 2 <= c.r ** 2;
}

function update(dt) {
  weatherTime += dt;
  if (game.state !== "playing") {
    game.player.anim += dt * 7;
    return;
  }

  const p = game.player;
  const dashBoost = game.dashTime > 0 ? 1.65 : 1;
  const currentSpeed = game.speed * dashBoost * scale;
  game.score += dt * (currentSpeed / 18);
  game.speed += dt * 7;
  game.dashTime = Math.max(0, game.dashTime - dt);
  game.magnetTime = Math.max(0, game.magnetTime - dt);
  game.shieldTime = Math.max(0, game.shieldTime - dt);
  if (game.shieldTime <= 0) game.shieldHits = 0;
  p.invuln = Math.max(0, p.invuln - dt);
  p.anim += dt * (game.dashTime > 0 ? 14 : 10);
  if (p.ducking) {
    p.slideTime += dt;
    if (p.slideTime >= SLIDE_DURATION) {
      p.ducking = false;
      p.slideTime = SLIDE_DURATION;
      p.h = playerStandHeight();
      p.w = playerWidth();
      p.y = groundY - p.h;
    }
  }

  p.vy += 1900 * dt * motionScale;
  p.y += p.vy * dt;
  if (p.y + p.h >= groundY) {
    p.y = groundY - p.h;
    p.vy = 0;
    p.onGround = true;
    p.jumpsLeft = 2;
  }

  spawnTimer -= dt;
  featherTimer -= dt;
  powerupTimer -= dt;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = rand(0.9, 1.45) / Math.min(1.5, game.speed / 470);
  }
  if (featherTimer <= 0) {
    spawnFeather();
    featherTimer = rand(0.55, 1.0);
  }
  if (powerupTimer <= 0) {
    spawnPowerup();
    powerupTimer = rand(7.5, 11.5);
  }

  for (const obstacle of game.obstacles) {
    obstacle.x -= currentSpeed * dt;
    const insetX = (obstacle.type === "totemHigh" ? 14 : 10) * spriteScale;
    const groundPad = totemGroundPad(obstacle);
    const hitBox = {
      x: obstacle.x + insetX,
      y: obstacle.y + groundPad + 10 * spriteScale,
      w: obstacle.w - insetX * 2,
      h: obstacle.h - groundPad - 12 * spriteScale,
    };
    const playerBox = {
      x: p.x + 24 * spriteScale,
      y: p.y + (p.ducking ? 22 : 20) * spriteScale,
      w: p.w - 44 * spriteScale,
      h: p.h - 34 * spriteScale,
    };
    if (rectsOverlap(playerBox, hitBox)) {
      if (game.dashTime > 0) {
        obstacle.broken = true;
        game.score += 45;
        burst(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, "#ffc44d", 14);
      } else if (game.shieldHits > 0) {
        obstacle.broken = true;
        game.shieldHits = 0;
        game.shieldTime = 0;
        p.invuln = 1.1;
        game.score += 30;
        burst(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, "#82e1ff", 20);
      } else if (p.invuln <= 0) {
        endGame();
      }
    }
  }
  game.obstacles = game.obstacles.filter((item) => item.x + item.w > -80 && !item.broken);

  for (const feather of game.pickups) {
    feather.x -= currentSpeed * dt;
    feather.spin += dt * 6;
    if (game.magnetTime > 0 && !feather.taken) {
      const targetX = p.x + p.w * 0.52;
      const targetY = p.y + p.h * 0.45;
      const dx = targetX - feather.x;
      const dy = targetY - feather.y;
      const dist = Math.hypot(dx, dy);
      const reach = 285 * spriteScale;
      if (dist < reach) {
        const pull = Math.min(1, dt * (7.5 - (dist / reach) * 3));
        feather.x += dx * pull;
        feather.y += dy * pull;
      }
    }
    const playerBox = {
      x: p.x + 8 * spriteScale,
      y: p.y + 6 * spriteScale,
      w: p.w - 16 * spriteScale,
      h: p.h - 8 * spriteScale,
    };
    if (!feather.taken && circleRectOverlap(feather, playerBox)) {
      feather.taken = true;
      collectFeather(feather);
      updateHud();
    }
  }
  game.pickups = game.pickups.filter((item) => item.x > -80 && !item.taken);

  for (const powerup of game.powerups) {
    powerup.x -= currentSpeed * dt;
    powerup.spin += dt * 4;
    if (game.magnetTime > 0 && !powerup.taken) {
      const targetX = p.x + p.w * 0.5;
      const targetY = p.y + p.h * 0.45;
      const dx = targetX - powerup.x;
      const dy = targetY - powerup.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 220 * spriteScale) {
        powerup.x += dx * Math.min(1, dt * 5.2);
        powerup.y += dy * Math.min(1, dt * 5.2);
      }
    }
    const playerBox = {
      x: p.x + 8 * spriteScale,
      y: p.y + 6 * spriteScale,
      w: p.w - 16 * spriteScale,
      h: p.h - 8 * spriteScale,
    };
    if (!powerup.taken && circleRectOverlap(powerup, playerBox)) {
      powerup.taken = true;
      collectPowerup(powerup);
      updateHud();
    }
  }
  game.powerups = game.powerups.filter((item) => item.x > -80 && !item.taken);

  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 520 * dt * motionScale;
  }
  game.particles = game.particles.filter((item) => item.life > 0);
  game.shake = Math.max(0, game.shake - dt * 12);
  updateHud();
}

function collectFeather(feather) {
  if (feather.type === "energy") {
    game.feathers += 1;
    game.score += 120;
    game.energy = Math.min(100, game.energy + 38);
    burst(feather.x, feather.y, "#82e1ff", 14);
  } else if (feather.type === "rainbow") {
    game.feathers += 3;
    game.score += 220;
    game.energy = Math.min(100, game.energy + 25);
    burst(feather.x, feather.y, "#ff73d1", 18);
  } else {
    game.feathers += 1;
    game.score += 80;
    game.energy = Math.min(100, game.energy + 18);
    burst(feather.x, feather.y, "#fff27e", 10);
  }
}

function collectPowerup(powerup) {
  if (powerup.type === "magnet") {
    game.magnetTime = 8;
    game.score += 100;
    burst(powerup.x, powerup.y, "#1cc9c2", 18);
  } else {
    game.shieldTime = 12;
    game.shieldHits = 1;
    game.score += 100;
    burst(powerup.x, powerup.y, "#82e1ff", 18);
  }
}

function endGame() {
  game.state = "gameover";
  game.shake = 1;
  const finalScore = Math.floor(game.score);
  if (finalScore > game.best) {
    game.best = finalScore;
    localStorage.setItem("goldenFeatherBest", String(finalScore));
  }
  updateHud();
  showPanel("冲刺中断", `得分 ${finalScore}，收集 ${game.feathers} 根金羽。`, "再来一次");
}

function drawBackground(w, h) {
  if (sceneImage.complete && sceneImage.naturalWidth) {
    drawSceneBackground(w, h);
    return;
  }

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#74dcff");
  sky.addColorStop(0.48, "#bdf2ff");
  sky.addColorStop(1, "#f7d36a");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * 0.78;
  const sunY = h * 0.17;
  const sun = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, h * 0.25);
  sun.addColorStop(0, "rgba(255,244,188,0.95)");
  sun.addColorStop(1, "rgba(255,196,77,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  drawHills(w, h, 0.18, "#57a8a8", h * 0.62);
  drawHills(w, h, 0.32, "#347888", h * 0.69);

  drawGround(w, h);
}

function drawSceneBackground(w, h) {
  ctx.fillStyle = "#67d3ff";
  ctx.fillRect(0, 0, w, h);

  const sceneScale = Math.max(w / sceneImage.naturalWidth, h / sceneImage.naturalHeight);
  const drawW = sceneImage.naturalWidth * sceneScale;
  const drawH = sceneImage.naturalHeight * sceneScale;
  const focusX = h > w ? 0.78 : 0.5;
  let left = w * focusX - drawW * focusX;
  left = Math.min(0, Math.max(w - drawW, left));
  const top = groundY - SCENE_SURFACE_Y * sceneScale;

  ctx.drawImage(sceneImage, left, top, drawW, drawH);

  const bottom = top + drawH;
  if (bottom < h) {
    ctx.fillStyle = "#3f2d24";
    ctx.fillRect(0, bottom - 1, w, h - bottom + 1);
  }
}

function drawGround(w, h) {
  ctx.fillStyle = "#4a2f22";
  ctx.fillRect(0, groundY, w, h - groundY);

  if (!groundImage.complete || !groundImage.naturalWidth) {
    ctx.fillStyle = "#94bd17";
    ctx.fillRect(0, groundY - 6 * spriteScale, w, 12 * spriteScale);
    ctx.fillStyle = "#4a2f22";
    ctx.fillRect(0, groundY + 6 * spriteScale, w, h - groundY);
    return;
  }

  const groundScale = Math.max(0.76, Math.min(1.08, h / 840));
  const tileW = groundImage.naturalWidth * groundScale;
  const tileH = groundImage.naturalHeight * groundScale;
  const top = groundY - GROUND_SURFACE_OFFSET * groundScale;
  const offset = -((weatherTime * game.speed * 0.72 * scale) % tileW);

  for (let x = offset - tileW; x < w + tileW; x += tileW) {
    ctx.drawImage(groundImage, x, top, tileW, tileH);
  }
}

function drawHills(w, h, speed, color, baseY) {
  const offset = -((weatherTime * game.speed * speed * scale) % (360 * scale));
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = offset - 360 * scale; x < w + 360 * scale; x += 360 * scale) {
    ctx.quadraticCurveTo(x + 150 * scale, baseY - 115 * scale, x + 360 * scale, baseY);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawObstacle(obstacle) {
  ctx.save();
  ctx.fillStyle = "rgba(21, 31, 49, 0.2)";
  ctx.beginPath();
  ctx.ellipse(
    obstacle.x + obstacle.w * 0.5,
    groundY + 5 * spriteScale,
    obstacle.w * 0.46,
    7 * spriteScale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  const image = obstacle.type === "totemHigh" ? totemHighImage : totemLowImage;
  const drawY = obstacle.y + totemGroundPad(obstacle);
  if (image.complete && image.naturalWidth) {
    ctx.drawImage(image, obstacle.x, drawY, obstacle.w, obstacle.h);
  } else {
    ctx.translate(obstacle.x, drawY);
    ctx.fillStyle = obstacle.type === "totemHigh" ? "#8d765c" : "#b18b55";
    roundRect(0, 0, obstacle.w, obstacle.h, 8 * spriteScale);
    ctx.fill();
    ctx.fillStyle = "#e66d51";
    ctx.fillRect(8 * spriteScale, obstacle.h * 0.48, obstacle.w - 16 * spriteScale, 10 * spriteScale);
  }
  ctx.restore();
}

function drawFeather(feather) {
  ctx.save();
  ctx.translate(feather.x, feather.y);
  ctx.rotate(Math.sin(feather.spin) * 0.35 - 0.55);
  if (feather.type === "energy") {
    ctx.shadowColor = "rgba(130, 225, 255, 0.75)";
    ctx.shadowBlur = 14 * spriteScale;
  } else if (feather.type === "rainbow") {
    ctx.shadowColor = "rgba(255, 115, 209, 0.78)";
    ctx.shadowBlur = 18 * spriteScale;
  }
  ctx.fillStyle =
    feather.type === "energy"
      ? "#bff8ff"
      : feather.type === "rainbow"
        ? "#fff2a7"
        : "#fff5a4";
  ctx.beginPath();
  ctx.ellipse(0, 0, feather.r * 0.52, feather.r * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle =
    feather.type === "energy"
      ? "#1cc9c2"
      : feather.type === "rainbow"
        ? "#ff73d1"
        : "#ff8b2c";
  ctx.beginPath();
  ctx.ellipse(-2 * scale, -2 * scale, feather.r * 0.3, feather.r * 0.94, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7a3f15";
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.moveTo(0, -feather.r);
  ctx.lineTo(0, feather.r * 1.15);
  ctx.stroke();
  ctx.restore();
}

function drawPowerup(powerup) {
  ctx.save();
  ctx.translate(powerup.x, powerup.y);
  ctx.rotate(Math.sin(powerup.spin) * 0.18);
  ctx.shadowColor = powerup.type === "magnet" ? "rgba(28, 201, 194, 0.82)" : "rgba(130, 225, 255, 0.82)";
  ctx.shadowBlur = 18 * spriteScale;
  ctx.fillStyle = "rgba(16, 24, 45, 0.78)";
  ctx.strokeStyle = powerup.type === "magnet" ? "#1cc9c2" : "#82e1ff";
  ctx.lineWidth = 3 * spriteScale;
  ctx.beginPath();
  ctx.arc(0, 0, powerup.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (powerup.type === "magnet") {
    ctx.strokeStyle = "#ff73d1";
    ctx.lineWidth = 6 * spriteScale;
    ctx.beginPath();
    ctx.arc(0, -2 * spriteScale, 10 * spriteScale, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
    ctx.fillStyle = "#fff2a7";
    ctx.fillRect(-13 * spriteScale, 7 * spriteScale, 7 * spriteScale, 7 * spriteScale);
    ctx.fillRect(6 * spriteScale, 7 * spriteScale, 7 * spriteScale, 7 * spriteScale);
  } else {
    ctx.fillStyle = "#82e1ff";
    ctx.beginPath();
    ctx.moveTo(0, -14 * spriteScale);
    ctx.lineTo(13 * spriteScale, -6 * spriteScale);
    ctx.lineTo(9 * spriteScale, 12 * spriteScale);
    ctx.lineTo(0, 18 * spriteScale);
    ctx.lineTo(-9 * spriteScale, 12 * spriteScale);
    ctx.lineTo(-13 * spriteScale, -6 * spriteScale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
    ctx.fillRect(-3 * spriteScale, -7 * spriteScale, 6 * spriteScale, 14 * spriteScale);
  }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlayer() {
  const p = game.player;
  const isSliding =
    p.ducking && p.onGround && game.state === "playing" && slideSprite.complete && slideSprite.naturalWidth;
  let anim = ROWS.run;
  if (game.state === "ready") anim = ROWS.wave;
  if (game.state === "paused") anim = ROWS.idle;
  if (p.ducking && p.onGround && game.state === "playing") anim = ROWS.slide;
  if (!p.onGround) anim = ROWS.jump;
  if (game.state === "gameover") anim = ROWS.fail;
  const frame = Math.floor(p.anim * anim.speed * 10) % anim.frames;
  const drawW = 104 * spriteScale;
  const drawH = 112 * spriteScale;
  const drawX = p.x;
  const drawY = p.y - 8 * spriteScale;
  const bob = game.dashTime > 0 ? Math.sin(p.anim * 0.9) * 3 * spriteScale : 0;
  const drawPose = (x, alpha = 1) => {
    ctx.globalAlpha = alpha;
    if (isSliding) {
      const slideFrame = Math.min(
        SLIDE_FRAMES - 1,
        Math.floor((p.slideTime / SLIDE_DURATION) * SLIDE_FRAMES),
      );
      const [sx, sy, sw, sh] = SLIDE_BOUNDS[slideFrame];
      const slideScale = SLIDE_DRAW_SCALE * spriteScale;
      const slideW = sw * slideScale;
      const slideH = sh * slideScale;
      const slideX = x + (playerWidth() - slideW) * 0.5;
      ctx.drawImage(
        slideSprite,
        slideFrame * SLIDE_CELL_W + sx,
        sy,
        sw,
        sh,
        slideX,
        groundY - slideH,
        slideW,
        slideH,
      );
      return;
    }
    ctx.drawImage(
      sprite,
      frame * CELL_W,
      anim.row * CELL_H,
      CELL_W,
      CELL_H,
      x,
      drawY + bob,
      drawW,
      drawH,
    );
  };

  ctx.save();
  if (game.magnetTime > 0) {
    ctx.globalAlpha = 0.18 + Math.sin(weatherTime * 8) * 0.04;
    ctx.strokeStyle = "#1cc9c2";
    ctx.lineWidth = 3 * spriteScale;
    ctx.beginPath();
    ctx.arc(p.x + p.w * 0.5, p.y + p.h * 0.5, 96 * spriteScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (game.shieldHits > 0) {
    ctx.globalAlpha = 0.46 + Math.sin(weatherTime * 10) * 0.08;
    ctx.strokeStyle = "#82e1ff";
    ctx.lineWidth = 4 * spriteScale;
    ctx.beginPath();
    ctx.ellipse(p.x + p.w * 0.5, p.y + p.h * 0.52, 54 * spriteScale, 68 * spriteScale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (isSliding) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#fff2a7";
    ctx.fillRect(p.x - 34 * spriteScale, groundY - 7 * spriteScale, 92 * spriteScale, 3 * spriteScale);
    ctx.fillStyle = "rgba(28, 201, 194, 0.42)";
    ctx.fillRect(p.x - 12 * spriteScale, groundY - 15 * spriteScale, 118 * spriteScale, 3 * spriteScale);
    ctx.fillStyle = "rgba(255, 196, 77, 0.36)";
    ctx.fillRect(p.x + 36 * spriteScale, groundY - 23 * spriteScale, 72 * spriteScale, 2 * spriteScale);
    ctx.globalAlpha = 1;
  }
  if (game.dashTime > 0) {
    for (let i = 1; i <= 3; i += 1) {
      drawPose(drawX - i * 18 * spriteScale, 0.24);
    }
  }
  drawPose(drawX);
  ctx.restore();
}

function drawParticles() {
  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function render() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (game.shake > 0) {
    ctx.translate(rand(-8, 8) * game.shake * scale, rand(-4, 4) * game.shake * scale);
  }
  drawBackground(w, h);
  for (const pickup of game.pickups) drawFeather(pickup);
  for (const powerup of game.powerups) drawPowerup(powerup);
  for (const obstacle of game.obstacles) drawObstacle(obstacle);
  drawPlayer();
  drawParticles();
  ctx.restore();

  if (game.dashTime > 0) {
    ctx.fillStyle = `rgba(255, 196, 77, ${Math.min(0.16, game.dashTime * 0.08)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function loop(time) {
  const dt = Math.min(0.033, (time - lastTime) / 1000 || 0);
  lastTime = time;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  if (["Space", "ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.repeat && ["Space", "ArrowUp", "KeyW", "ShiftLeft", "ShiftRight", "KeyK"].includes(event.code)) {
    return;
  }
  keys.add(event.code);
  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") jump();
  if (event.code === "ArrowDown" || event.code === "KeyS") setDucking(true);
  if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "KeyK") dash();
  if (event.code === "KeyP") pauseGame();
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "ArrowDown" || event.code === "KeyS") setDucking(false);
});

function pressButton(button, onDown, onUp) {
  if (!button) return;
  const down = (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.classList.add("is-down");
    onDown();
  };
  const up = (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.classList.remove("is-down");
    if (onUp) onUp();
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("pointerleave", up);
}

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  jump();
});
pressButton(touchJump, jump);
pressButton(touchSlide, () => setDucking(true), () => setDucking(false));
pressButton(touchDash, dash);
pressButton(touchPause, pauseGame);
startButton.addEventListener("click", beginGame);
restartButton.addEventListener("click", () => {
  resetGame();
  beginGame();
});

sprite.addEventListener("load", () => {
  resetGame();
  resizeCanvas();
  showPanel("收集金羽，穿过山道", "收集特殊金羽，拾取磁铁和护盾，点「跳 / 滑 / 冲」穿过山道。", "开始");
  requestAnimationFrame(loop);
});
