const Canvas = document.getElementById("canvas");
const GAME_WIDTH = document.documentElement.clientWidth;
const GAME_HEIGHT = document.documentElement.clientHeight;
Canvas.width = GAME_WIDTH;
Canvas.height = GAME_HEIGHT;
const ctx = Canvas.getContext("2d");
const GameMenu = document.getElementById("game-menu");
const StartButton = document.getElementById("start-btn");
const ManaBar = document.getElementById("mana-bar");
const HealthBar = document.getElementById("health-bar");
GameMenu.classList.add("fade-in");
const radius = 30;
const PLAYER_DEFAULT_SPEED = 4;
const PLAYER_BULLET_RADIUS = radius / 4;
const PLAYER_BULLET_OFFSET = 10;
let playerHealth = 100; // 0-100 scale
let flashAlpha = 0;
let score = 0;
let enemiesKilled = 0;
const SCORE_INCREMENT_INTERVAL = 60; // frames
const ENEMY_CAP = 20; // max enemies allowed on screen
const ENEMY_OUT_OF_VIEW_CLEAN_PADDING = 100; // extra space outside viewport
const ITEM_SPAWN_INTERVAL = 10000; // 10s
let gameOver = false;
function showDeathScreen() {
  const deathScreen = document.getElementById("death-screen");
  const deathScore = document.getElementById("death-score");
  const deathKilled = document.getElementById("death-killed");
  const restartBtn = document.getElementById("restart-btn");
  // hide gameplay UI
  document.getElementById("health-bar").classList.add("hidden");
  document.getElementById("mana-bar").classList.add("hidden");
  GameMenu.classList.add("hidden"); // just in case menu still visible
  deathScore.textContent = `Score: ${score}`;
  deathKilled.textContent = `Enemies Killed: ${enemiesKilled}`;
  deathScreen.classList.add("fade-in");
  deathScreen.classList.remove("hidden");
  restartBtn.addEventListener("click", () => {
    location.reload();
  });
}
let gamePaused = false;
function togglePause() {
  if (gameOver) return; // can't pause if game over
  gamePaused = !gamePaused;
  const pauseScreen = document.getElementById("pause-screen");
  const healthBar = document.getElementById("health-bar");
  const manaBar = document.getElementById("mana-bar");
  if (gamePaused) {
    // show pause screen and hide gameplay UI
    pauseScreen.classList.remove("hidden");
    healthBar.classList.add("hidden");
    manaBar.classList.add("hidden");
    // update stats
    document.getElementById("pause-score").textContent = `Score: ${score}`;
    document.getElementById("pause-killed").textContent =
      `Enemies Killed: ${enemiesKilled}`;
  } else {
    // hide pause screen and show gameplay UI
    pauseScreen.classList.add("hidden");
    healthBar.classList.remove("hidden");
    manaBar.classList.remove("hidden");
  }
}
// --------- VECTOR ---------
class Vector2 {
  x;
  y;
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  add(v) {
    return new Vector2(this.x + v.x, this.y + v.y);
  }
  sub(v) {
    return new Vector2(this.x - v.x, this.y - v.y);
  }
  scale(s) {
    return new Vector2(this.x * s, this.y * s);
  }
  length() {
    return Math.sqrt(this.x ** 2 + this.y ** 2);
  }
  normalize() {
    const l = this.length();
    return new Vector2(this.x / l, this.y / l);
  }
  distance(p) {
    return this.sub(p).length();
  }
}
// --------- CAMERA & ZONE ---------
const cameraRadius = Math.min(Canvas.width, Canvas.height) * 0.35;
let cameraPos = new Vector2(Canvas.width / 2, Canvas.height / 2);
// --------- MOVEMENT MAP ---------
const MOVEMENT_MAP = {
  up: { keys: ["w", "arrowup"], direction: new Vector2(0, -1) },
  down: { keys: ["s", "arrowdown"], direction: new Vector2(0, 1) },
  left: { keys: ["a", "arrowleft"], direction: new Vector2(-1, 0) },
  right: { keys: ["d", "arrowright"], direction: new Vector2(1, 0) },
};
// --------- BACKGROUND ---------
const gameBackgroundCirclesSpacing = 500;
function drawBackground(ctx, time) {
  const cols = Math.ceil(Canvas.width / gameBackgroundCirclesSpacing) + 2;
  const rows = Math.ceil(Canvas.height / gameBackgroundCirclesSpacing) + 2;
  const startX = Math.floor(cameraPos.x / gameBackgroundCirclesSpacing) - 1;
  const startY = Math.floor(cameraPos.y / gameBackgroundCirclesSpacing) - 1;
  for (let x = startX; x < startX + cols; x++) {
    for (let y = startY; y < startY + rows; y++) {
      const circleX =
        x * gameBackgroundCirclesSpacing - cameraPos.x + Canvas.width / 2;
      const circleY =
        y * gameBackgroundCirclesSpacing - cameraPos.y + Canvas.height / 2;
      const phase = (x + y) % Math.PI;
      const alpha = ((Math.sin(time * 0.0009 + phase) + 1) / 2) * 0.1;
      ctx.beginPath();
      ctx.arc(circleX, circleY, 200, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(178,190,181,${alpha})`;
      ctx.fill();
    }
  }
}
// --------- BULLET ---------
class Bullet {
  position;
  direction;
  speed = 16;
  constructor(pos, dir) {
    this.position = pos;
    this.direction = dir;
  }
  update() {
    this.position = this.position.add(this.direction.scale(this.speed));
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(
      this.position.x - cameraPos.x + Canvas.width / 2,
      this.position.y - cameraPos.y + Canvas.height / 2,
      PLAYER_BULLET_RADIUS,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "forestgreen";
    ctx.fill();
  }
}
// --------- PLAYER ---------
class Player {
  position;
  direction;
  speed;
  bullets = [];
  lastShotTimestamp = null;
  recoilTimeMs = 2000;
  color = "rgba(158,149,199,1)";
  positionHistory = [];
  constructor(position) {
    this.position = position;
    this.direction = new Vector2();
    this.speed = PLAYER_DEFAULT_SPEED;
  }
  draw(pos = this.position) {
    const trailLength = Math.min(10, this.positionHistory.length);
    for (let i = trailLength - 1; i >= 0; i--) {
      const p = this.positionHistory[i];
      if (!p) continue;
      const r = radius - i * 2;
      const a = 0.05 + (i / trailLength) * 0.2;
      ctx.beginPath();
      ctx.arc(
        p.x - cameraPos.x + Canvas.width / 2,
        p.y - cameraPos.y + Canvas.height / 2,
        r,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(158,149,199,${a})`;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(
      pos.x - cameraPos.x + Canvas.width / 2,
      pos.y - cameraPos.y + Canvas.height / 2,
      radius,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = this.color;
    ctx.fill();
  }
  setDirection(dir) {
    this.direction = dir;
  }
  getVelocity(speed = this.speed) {
    return this.direction.scale(speed);
  }
  move() {
    this.position = this.position.add(this.getVelocity());
  }
  shoot(target) {
    if (
      this.lastShotTimestamp &&
      Date.now() - this.lastShotTimestamp < this.recoilTimeMs
    )
      return;
    const dir = target.sub(this.position).normalize();
    const spawn = this.position.add(
      dir.scale(radius + PLAYER_BULLET_RADIUS + PLAYER_BULLET_OFFSET),
    );
    this.bullets.push(new Bullet(spawn, dir));
    this.lastShotTimestamp = Date.now();
  }
}
const player = new Player(new Vector2(Canvas.width / 2, Canvas.height / 2));
const pressedKeys = new Set();
function getPlayerRecoilPercentage() {
  const delta =
    player.lastShotTimestamp === null
      ? player.recoilTimeMs
      : Date.now() - player.lastShotTimestamp;
  return Math.min(delta / player.recoilTimeMs, 1) * 100;
}
// --------- CAMERA ---------
function updateCamera() {
  const toPlayer = player.position.sub(cameraPos);
  const dist = toPlayer.length();
  if (dist > cameraRadius)
    cameraPos = cameraPos.add(toPlayer.normalize().scale(dist - cameraRadius));
}
let itemSpawnTimer = 0;
const items = [];
const ITEM_CAP = 5;
const ITEM_OUT_OF_VIEW_CLEAN_PADDING = 200;
const ITEM_RADIUS = 15;
function spawnItem() {
  if (items.length >= ITEM_CAP) return;
  const padding = 50;
  const blacklistRadius = radius * 3; // distance from player
  let ix, iy;
  let tries = 0;
  do {
    ix =
      cameraPos.x -
      Canvas.width / 2 +
      padding +
      Math.random() * (Canvas.width - 2 * padding);
    iy =
      cameraPos.y -
      Canvas.height / 2 +
      padding +
      Math.random() * (Canvas.height - 2 * padding);
    tries++;
    if (tries > 50) return;
    const pos = new Vector2(ix, iy);
    const tooCloseToPlayer = pos.distance(player.position) < blacklistRadius;
    const tooCloseToEnemies = enemies.some(
      (e) => pos.distance(e.position) < e.radius * 2,
    );
    if (!tooCloseToPlayer && !tooCloseToEnemies) break;
  } while (true);
  // Random type
  const rand = Math.random();
  let type;
  if (rand < 0.33)
    type = "recoil-booster"; // gold
  else if (rand < 0.66)
    type = "speed"; // skyblue
  else type = "health"; // red
  items.push({
    position: new Vector2(ix, iy),
    radius: ITEM_RADIUS,
    color:
      type === "recoil-booster" ? "gold" : type === "speed" ? "skyblue" : "red",
    type,
  });
}
const enemies = [];
let spawnTimer = 0;
let spawnInterval = 2000; // ms
const enemySpeed = 2;
function spawnEnemy() {
  if (enemies.length >= ENEMY_CAP) return; // cap reached
  const padding = 50;
  const blacklistRadius = radius * 3; // distance from player to avoid spawning
  let ex, ey;
  let tries = 0;
  do {
    ex =
      cameraPos.x -
      Canvas.width / 2 +
      padding +
      Math.random() * (Canvas.width - 2 * padding);
    ey =
      cameraPos.y -
      Canvas.height / 2 +
      padding +
      Math.random() * (Canvas.height - 2 * padding);
    tries++;
    if (tries > 50) return; // safety: abort spawn if can't find spot
  } while (new Vector2(ex, ey).distance(player.position) < blacklistRadius);
  enemies.push({
    position: new Vector2(ex, ey),
    speed: enemySpeed,
    radius: radius,
    color: "rgba(255,10,10,1)",
    positionHistory: [],
  });
}
let pickupMessage = null;
function showPickupMessage(text) {
  pickupMessage = { text, alpha: 1 };
}
function drawPickupMessage() {
  if (!pickupMessage) return;
  ctx.font = "18px Arial";
  ctx.fillStyle = `rgba(255,255,255,${pickupMessage.alpha})`;
  ctx.fillText(
    pickupMessage.text,
    Canvas.width / 2 - ctx.measureText(pickupMessage.text).width / 2,
    50,
  );
  pickupMessage.alpha -= 0.01;
  if (pickupMessage.alpha <= 0) pickupMessage = null;
}
// --------- ANIMATE ---------
let frameCounter = 0;
function animate(time) {
  if (gameOver) return;
  if (!gamePaused) {
    if (playerHealth <= 0) {
      gameOver = true;
      showDeathScreen();
      return;
    }
    const delta = 16;
    ctx.clearRect(0, 0, Canvas.width, Canvas.height);
    // at the start or end of animate, while player is alive
    if (!gameOver && frameCounter % SCORE_INCREMENT_INTERVAL === 0) {
      score += 1;
    }
    // remove out-of-visibility enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (
        e.position.x + e.radius <
          cameraPos.x - Canvas.width / 2 - ENEMY_OUT_OF_VIEW_CLEAN_PADDING || // left
        e.position.x - e.radius >
          cameraPos.x + Canvas.width / 2 + ENEMY_OUT_OF_VIEW_CLEAN_PADDING || // right
        e.position.y + e.radius <
          cameraPos.y - Canvas.height / 2 - ENEMY_OUT_OF_VIEW_CLEAN_PADDING || // top
        e.position.y - e.radius >
          cameraPos.y + Canvas.height / 2 + ENEMY_OUT_OF_VIEW_CLEAN_PADDING // bottom
      ) {
        enemies.splice(i, 1);
      }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (
        item.position.x + item.radius <
          cameraPos.x - Canvas.width / 2 - ITEM_OUT_OF_VIEW_CLEAN_PADDING ||
        item.position.x - item.radius >
          cameraPos.x + Canvas.width / 2 + ITEM_OUT_OF_VIEW_CLEAN_PADDING ||
        item.position.y + item.radius <
          cameraPos.y - Canvas.height / 2 - ITEM_OUT_OF_VIEW_CLEAN_PADDING ||
        item.position.y - item.radius >
          cameraPos.y + Canvas.height / 2 + ITEM_OUT_OF_VIEW_CLEAN_PADDING
      ) {
        items.splice(i, 1);
      }
    }
    // player input
    let moveDir = new Vector2();
    for (const m of Object.values(MOVEMENT_MAP))
      if (m.keys.some((k) => pressedKeys.has(k.toLowerCase())))
        moveDir = moveDir.add(m.direction);
    player.setDirection(moveDir);
    if (moveDir.length()) player.move();
    updateCamera();
    drawBackground(ctx, time);
    // bullets
    for (const b of player.bullets) b.update();
    // handle enemies
    spawnTimer += delta;
    if (spawnTimer > spawnInterval) {
      spawnEnemy();
      spawnTimer = 0;
      if (spawnInterval > 500) spawnInterval -= 50;
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      // move towards player
      e.position = e.position.add(
        player.position.sub(e.position).normalize().scale(e.speed),
      );
      // --- TRAIL LOGIC ---
      if (!e.positionHistory) e.positionHistory = [];
      if (frameCounter % 3 === 0) e.positionHistory.unshift(e.position);
      if (e.positionHistory.length > 20) e.positionHistory.pop();
      const trailLength = Math.min(10, e.positionHistory.length);
      for (let j = trailLength - 1; j >= 0; j--) {
        const p = e.positionHistory[j];
        if (!p) continue;
        const r = radius - j * 2;
        const a = 0.05 + (j / trailLength) * 0.2;
        ctx.beginPath();
        ctx.arc(
          p.x - cameraPos.x + Canvas.width / 2,
          p.y - cameraPos.y + Canvas.height / 2,
          r,
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = `rgba(255,50,50,${a})`; // enemy trail color
        ctx.fill();
      }
      // --- END TRAIL LOGIC ---
      // collision with bullets
      let hitByBullet = false;
      for (let j = player.bullets.length - 1; j >= 0; j--) {
        const b = player.bullets[j];
        if (b.position.distance(e.position) < PLAYER_BULLET_RADIUS + e.radius) {
          player.bullets.splice(j, 1);
          hitByBullet = true;
          break;
        }
      }
      if (hitByBullet) {
        enemies.splice(i, 1);
        enemiesKilled += 1; // increment
        continue; // skip drawing this enemy
      }
      // collision with player
      const distToPlayer = e.position.distance(player.position);
      if (distToPlayer < radius + e.radius) {
        playerHealth -= 50;
        if (playerHealth < 0) playerHealth = 0;
        flashAlpha = 0.7;
        enemies.splice(i, 1);
        continue;
      }
      // draw enemy
      ctx.beginPath();
      ctx.arc(
        e.position.x - cameraPos.x + Canvas.width / 2,
        e.position.y - cameraPos.y + Canvas.height / 2,
        e.radius,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = e.color;
      ctx.fill();
    }
    // UI update
    HealthBar.querySelector("div").style.right = `${100 - playerHealth}%`;
    HealthBar.querySelector("div").style.left = "auto"; // reset left
    // draw bullets
    for (const b of player.bullets) b.draw(ctx);
    // update items
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (player.position.distance(item.position) < radius + item.radius) {
        if (item.type === "recoil-booster") {
          player.recoilTimeMs = Math.max(500, player.recoilTimeMs - 300);
          showPickupMessage("Player recoil improved!");
        } else if (item.type === "speed") {
          player.speed += 0.5; // small speed boost
          showPickupMessage("Player speed improved!");
        } else if (item.type === "health") {
          playerHealth = Math.min(100, playerHealth + 20); // heal 20
          showPickupMessage("Health restored!");
        }
        // make game slightly harder for non-health pickups
        if (item.type !== "health") {
          spawnInterval = Math.max(500, spawnInterval - 50); // faster spawn
          for (const e of enemies) e.speed += 0.1; // slightly faster enemies
        }
        items.splice(i, 1);
      }
    }
    // draw items
    for (const item of items) {
      ctx.beginPath();
      ctx.arc(
        item.position.x - cameraPos.x + Canvas.width / 2,
        item.position.y - cameraPos.y + Canvas.height / 2,
        item.radius,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = item.color;
      ctx.fill();
    }
    itemSpawnTimer += delta;
    if (itemSpawnTimer > ITEM_SPAWN_INTERVAL) {
      spawnItem();
      itemSpawnTimer = 0;
    }
    // draw pickup messages
    drawPickupMessage();
    // player
    if (frameCounter % 3 === 0) player.positionHistory.unshift(player.position);
    if (player.positionHistory.length > 20) player.positionHistory.pop();
    player.draw();
    // flash effect (smooth pulse fade)
    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,0,0,${flashAlpha})`;
      ctx.fillRect(0, 0, Canvas.width, Canvas.height);
      flashAlpha *= 0.9; // exponential fade
    }
    // UI
    ManaBar.querySelector("div").style.right =
      `${100 - getPlayerRecoilPercentage()}%`;
    HealthBar.querySelector("div").style.right = `${100 - playerHealth}%`;
    frameCounter++;
  }
  requestAnimationFrame(animate);
}
// --------- START BUTTON ---------
StartButton.addEventListener("click", () => {
  GameMenu.classList.remove("fade-in");
  GameMenu.classList.add("fade-out");
  GameMenu.addEventListener(
    "animationend",
    () => {
      GameMenu.classList.add("hidden");
      document.getElementById("health-bar").classList.remove("hidden");
      document.getElementById("mana-bar").classList.remove("hidden");
      requestAnimationFrame(animate);
      document.addEventListener("click", (e) => {
        player.shoot(
          new Vector2(
            e.x + cameraPos.x - Canvas.width / 2,
            e.y + cameraPos.y - Canvas.height / 2,
          ),
        );
      });
      document.addEventListener("keydown", (e) => {
        if (e.code === "Space") {
          togglePause();
          return;
        }
        pressedKeys.add(e.key);
      });
      document.addEventListener("keyup", (e) => pressedKeys.delete(e.key));
    },
    { once: true },
  );
});
export {};
//# sourceMappingURL=index.js.map

