import { Vec, checkCircleCollision, checkSegmentCollision, resolveCollision } from './physics.js';
import { audio } from './audio.js';

// Game Canvas and context
let canvas, ctx;

// Game constants
const WIDTH = 500;
const BASE_HEIGHT = 800;
let HEIGHT = BASE_HEIGHT;
const SUB_STEPS = 8; // Sub-stepping count for physics precision

const difficultySettings = {
  normal: {
    label: 'NORMAL',
    balls: 3,
    gravity: 900,
  },
  practice: {
    label: 'PRACTICA',
    balls: 5,
    gravity: 820,
  },
};

// Game state
const state = {
  score: 0,
  highScore: parseInt(localStorage.getItem('rock_pinball_highscore') || '0', 10),
  balls: 3,
  maxBalls: 3,
  difficulty: 'normal',
  multiplier: 1,
  gameState: 'START', // 'START', 'PLAYING', 'GAMEOVER'
  activeBandMode: 'NONE', // 'NONE', 'NIRVANA', 'GNR', 'RATM'
  bandHits: { nirvana: 0, gnr: 0, rage: 0 },
  rockLanes: { r: false, o: false, c: false, k: false },
  tiltCount: 0,
  isTilted: false,
};

// Keyboard inputs state
const keys = {};
const controlledKeys = new Set([' ', 'arrowleft', 'arrowright', 'a', 'l', 'm', 'r', 't']);
const scheduledTimers = new Set();

let startScreen;
let settingsPanel;
let menuToggle;
let musicToggle;
let scorePanel;
let scoreCollapseTimer;
let lastTouchEndTime = 0;
let viewportResizeTimer;

function lowerY(y) {
  return y + Math.max(0, HEIGHT - BASE_HEIGHT);
}

// Background Image
const bgImage = new Image();
bgImage.src = 'assets/pinball_bg.jpg';

// Ball object
const ball = {
  pos: Vec.create(465, lowerY(750)),
  vel: Vec.create(0, 0),
  radius: 11,
  mass: 1.0,
  active: false,
  onRamp: false,
  rampProgress: 0,
  rampSpeed: 0.05,
};

// Plunger object
const plunger = {
  x: 450,
  y: lowerY(770),
  width: 30,
  height: 30,
  compression: 0,
  maxCompression: 40,
  chargeSpeed: 1.2,
};

// Flippers definition
const flippers = {
  left: {
    pivot: Vec.create(145, lowerY(705)),
    length: 70,
    radius: 8,
    angle: 0.38, // rest angle (downwards)
    minAngle: -0.38, // fully actuated (upwards)
    maxAngle: 0.38,
    speed: 26,
    restSpeed: 13,
    omega: 0,
    state: 'down',
    isLeft: true
  },
  right: {
    pivot: Vec.create(305, lowerY(705)),
    length: 70,
    radius: 8,
    angle: Math.PI - 0.38, // rest angle (downwards)
    minAngle: Math.PI - 0.38,
    maxAngle: Math.PI + 0.38, // fully actuated (upwards)
    speed: 26,
    restSpeed: 13,
    omega: 0,
    state: 'down',
    isLeft: false
  }
};

// Static Wall Segments
const walls = [];

// Circular Bumpers
const bumpers = [
  { id: 'nirvana', pos: Vec.create(235, 250), radius: 30, label: 'NIRVANA', color: '#F7E018', flashTime: 0, activeColor: '#FFF8B3' },
  { id: 'gnr', pos: Vec.create(150, 360), radius: 26, label: 'GNR', color: '#FF3B30', flashTime: 0, activeColor: '#FF9E9E' },
  { id: 'rage', pos: Vec.create(320, 360), radius: 26, label: 'RATM', color: '#00F2FE', flashTime: 0, activeColor: '#A8F9FF' }
];

// Slingshots (Triangles) - only the front edge kicks
const slingshots = [
  {
    // Left Slingshot
    p1: Vec.create(95, lowerY(590)),
    p2: Vec.create(125, lowerY(665)),
    restitution: 0.8,
    friction: 0.1,
    isSlingshot: true,
    flashTime: 0,
    normal: Vec.create(0.9, -0.4) // points up-right
  },
  {
    // Right Slingshot
    p1: Vec.create(355, lowerY(590)),
    p2: Vec.create(325, lowerY(665)),
    restitution: 0.8,
    friction: 0.1,
    isSlingshot: true,
    flashTime: 0,
    normal: Vec.create(-0.9, -0.4) // points up-left
  }
];

// Target definitions
const dropTargets = [
  { id: 'target_1', p1: Vec.create(30, 440), p2: Vec.create(45, 450), active: true, color: '#A100FF', flashTime: 0 },
  { id: 'target_2', p1: Vec.create(30, 470), p2: Vec.create(45, 480), active: true, color: '#A100FF', flashTime: 0 },
  { id: 'target_3', p1: Vec.create(30, 500), p2: Vec.create(45, 510), active: true, color: '#A100FF', flashTime: 0 }
];

// Rollover Lanes (R-O-C-K at top)
const rolloverLanes = [
  { id: 'r', x1: 170, x2: 205, y: 110, lit: false, label: 'R', color: '#FF007F' },
  { id: 'o', x1: 205, x2: 240, y: 110, lit: false, label: 'O', color: '#00FF66' },
  { id: 'c', x1: 240, x2: 275, y: 110, lit: false, label: 'C', color: '#00FFFF' },
  { id: 'k', x1: 275, x2: 310, y: 110, lit: false, label: 'K', color: '#FFFF00' }
];

// Ramp definition
const rampEntrance = { x: 55, y: 400, width: 25, height: 15 };
const rampPath = [
  Vec.create(60, 390),
  Vec.create(50, 300),
  Vec.create(65, 200),
  Vec.create(110, 130),
  Vec.create(180, 100),
  Vec.create(240, 120), // Drops onto the R-O-C-K lanes
];

// (Plunger Gate removed to prevent trapping bugs)

// Visual particles for hits
let particles = [];

// Initialize Static Boundaries
function initWalls() {
  walls.length = 0; // Clear array

  // Outer left wall
  walls.push({ p1: Vec.create(20, 230), p2: Vec.create(20, lowerY(640)), restitution: 0.6, friction: 0.05 });
  // Left outlane outer guide
  walls.push({ p1: Vec.create(20, lowerY(640)), p2: Vec.create(80, lowerY(710)), restitution: 0.6, friction: 0.05 });

  // Plunger lane inner wall divider
  walls.push({ p1: Vec.create(440, 230), p2: Vec.create(440, HEIGHT), restitution: 0.6, friction: 0.05 });
  // Plunger lane outer right wall
  walls.push({ p1: Vec.create(480, 230), p2: Vec.create(480, HEIGHT), restitution: 0.6, friction: 0.05 });

  // Right outlane outer guide
  walls.push({ p1: Vec.create(440, lowerY(640)), p2: Vec.create(380, lowerY(710)), restitution: 0.6, friction: 0.05 });

  // Bottom drain slanted outer structures
  walls.push({ p1: Vec.create(20, lowerY(710)), p2: Vec.create(100, lowerY(780)), restitution: 0.1, friction: 0.1 });
  walls.push({ p1: Vec.create(440, lowerY(710)), p2: Vec.create(350, lowerY(780)), restitution: 0.1, friction: 0.1 });

  // Inlane guide rails (slanted dividers that feed flippers or let ball go to outlane)
  // Left inlane guide
  walls.push({ p1: Vec.create(80, lowerY(560)), p2: Vec.create(125, lowerY(660)), restitution: 0.4, friction: 0.05 });
  walls.push({ p1: Vec.create(100, lowerY(700)), p2: Vec.create(125, lowerY(660)), restitution: 0.4, friction: 0.05 });
  
  // Right inlane guide
  walls.push({ p1: Vec.create(380, lowerY(560)), p2: Vec.create(335, lowerY(660)), restitution: 0.4, friction: 0.05 });
  walls.push({ p1: Vec.create(360, lowerY(700)), p2: Vec.create(335, lowerY(660)), restitution: 0.4, friction: 0.05 });

  // Top arch: smooth circle semi-curve connecting left wall (20, 230) to right outer wall (480, 230)
  const archCenter = Vec.create(250, 230);
  const archRadius = 230;
  const numSteps = 24;
  let prevPt = Vec.create(20, 230);
  for (let i = 1; i <= numSteps; i++) {
    const angle = Math.PI - (i / numSteps) * Math.PI;
    const nextPt = Vec.create(
      archCenter.x + archRadius * Math.cos(angle),
      archCenter.y - archRadius * Math.sin(angle)
    );
    walls.push({ p1: prevPt, p2: nextPt, restitution: 0.7, friction: 0.02 });
    prevPt = nextPt;
  }

  // Visual/physical lane dividers at the top to direct ball into ROCK lanes
  walls.push({ p1: Vec.create(170, 70), p2: Vec.create(170, 130), restitution: 0.2, friction: 0.05 });
  walls.push({ p1: Vec.create(205, 70), p2: Vec.create(205, 130), restitution: 0.2, friction: 0.05 });
  walls.push({ p1: Vec.create(240, 70), p2: Vec.create(240, 130), restitution: 0.2, friction: 0.05 });
  walls.push({ p1: Vec.create(275, 70), p2: Vec.create(275, 130), restitution: 0.2, friction: 0.05 });
  walls.push({ p1: Vec.create(310, 70), p2: Vec.create(310, 130), restitution: 0.2, friction: 0.05 });
}

// Particle explosion helper
function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 150;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1 + Math.random() * 3,
      color,
      alpha: 1.0,
      decay: 0.02 + Math.random() * 0.03
    });
  }
}

function scheduleTimer(callback, delay) {
  const timerId = window.setTimeout(() => {
    scheduledTimers.delete(timerId);
    callback();
  }, delay);
  scheduledTimers.add(timerId);
  return timerId;
}

function clearScheduledTimers() {
  for (const timerId of scheduledTimers) {
    window.clearTimeout(timerId);
  }
  scheduledTimers.clear();
}

function configureViewportWorld() {
  const viewportWidth = Math.max(1, window.innerWidth || WIDTH);
  const viewportHeight = Math.max(1, window.innerHeight || BASE_HEIGHT);
  document.documentElement.style.setProperty('--app-height', `${viewportHeight}px`);
  HEIGHT = Math.max(BASE_HEIGHT, Math.round(WIDTH * (viewportHeight / viewportWidth)));
  applyAdaptiveGeometry();
}

function resizeCanvasBackingStore() {
  if (!canvas || !ctx) return;
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  canvas.width = Math.round(WIDTH * dpr);
  canvas.height = Math.round(HEIGHT * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function handleViewportChange() {
  window.clearTimeout(viewportResizeTimer);
  viewportResizeTimer = window.setTimeout(() => {
    configureViewportWorld();
    resizeCanvasBackingStore();
    initWalls();
    render();
  }, 120);
}

function applyAdaptiveGeometry() {
  plunger.y = lowerY(770);
  flippers.left.pivot = Vec.create(145, lowerY(705));
  flippers.right.pivot = Vec.create(305, lowerY(705));

  slingshots[0].p1 = Vec.create(95, lowerY(590));
  slingshots[0].p2 = Vec.create(125, lowerY(665));
  slingshots[1].p1 = Vec.create(355, lowerY(590));
  slingshots[1].p2 = Vec.create(325, lowerY(665));

  if (!ball.active) {
    resetBall();
  }
}

// Game Reset
function resetBall() {
  ball.pos = Vec.create(465, lowerY(750));
  ball.vel = Vec.create(0, 0);
  ball.active = false;
  ball.onRamp = false;
  ball.rampProgress = 0;
}

function startGame() {
  clearScheduledTimers();
  window.clearTimeout(scoreCollapseTimer);
  scorePanel?.classList.remove('is-expanded');
  const selectedDifficulty = document.getElementById('difficulty-select')?.value || 'normal';
  const difficulty = difficultySettings[selectedDifficulty] ? selectedDifficulty : 'normal';
  const settings = difficultySettings[difficulty];

  state.score = 0;
  state.difficulty = difficulty;
  state.maxBalls = settings.balls;
  state.balls = settings.balls;
  state.multiplier = 1;
  state.activeBandMode = 'NONE';
  state.bandHits = { nirvana: 0, gnr: 0, rage: 0 };
  for (const lane of rolloverLanes) lane.lit = false;
  for (const t of dropTargets) t.active = true;
  state.gameState = 'PLAYING';
  state.isTilted = false;
  state.tiltCount = 0;
  particles = [];
  resetBall();
  if (startScreen) startScreen.classList.remove('active');
  closeMenu();
  updateUI();
}

// Keyboard input setup
function initInputs() {
  window.addEventListener('gesturestart', preventBrowserGesture, { passive: false });
  window.addEventListener('gesturechange', preventBrowserGesture, { passive: false });
  window.addEventListener('gestureend', preventBrowserGesture, { passive: false });
  window.addEventListener('touchmove', preventMultiTouchZoom, { passive: false });
  window.addEventListener('touchend', preventDoubleTapZoom, { passive: false });

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (controlledKeys.has(key) || controlledKeys.has(e.key)) {
      e.preventDefault();
    }
    
    // Resume context on first keypress
    audio.resume();

    if (e.key === ' ') {
      setPlungerInput(true);
    } else {
      keys[key] = true;
    }

    // Flipper sound on press
    if (key === 'a' || key === 'arrowleft') setFlipperInput('left', true);
    if (key === 'l' || key === 'arrowright') setFlipperInput('right', true);

    // Music toggle
    if (key === 'm') {
      toggleMusic();
    }

    // Reset / Start
    if (key === 'r') {
      startGame();
    }
    
    // Tilt action (shake)
    if (key === 't' && state.gameState === 'PLAYING' && !state.isTilted) {
      triggerTilt();
    }
  });

  window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (controlledKeys.has(key) || controlledKeys.has(e.key)) {
      e.preventDefault();
    }
    if (e.key === ' ') {
      setPlungerInput(false);
    } else {
      keys[key] = false;
    }

    if (key === 'a' || key === 'arrowleft') setFlipperInput('left', false);
    if (key === 'l' || key === 'arrowright') setFlipperInput('right', false);
  });
}

function preventBrowserGesture(e) {
  e.preventDefault();
}

function preventMultiTouchZoom(e) {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}

function preventDoubleTapZoom(e) {
  const now = Date.now();
  if (now - lastTouchEndTime < 320) {
    e.preventDefault();
  }
  lastTouchEndTime = now;
}

function setFlipperInput(side, isPressed) {
  const flipper = flippers[side];
  const keyName = side === 'left' ? 'a' : 'l';
  keys[keyName] = isPressed;

  if (isPressed && flipper.state !== 'up') {
    flipper.state = 'up';
    audio.playFlipper();
  } else if (!isPressed) {
    flipper.state = 'down';
  }
}

function setPlungerInput(isPressed) {
  keys.space = isPressed;
}

function initTouchControls() {
  bindHoldZone(document.getElementById('touch-left-flipper'), () => setFlipperInput('left', true), () => setFlipperInput('left', false));
  bindHoldZone(document.getElementById('touch-right-flipper'), () => setFlipperInput('right', true), () => setFlipperInput('right', false));
  bindPlungerZone(document.getElementById('touch-plunger'));
}

function bindHoldZone(element, onPress, onRelease) {
  if (!element) return;

  element.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    element.setPointerCapture?.(e.pointerId);
    element.classList.add('is-pressed');
    audio.resume();
    onPress();
  });

  const release = (e) => {
    e.preventDefault();
    element.classList.remove('is-pressed');
    onRelease();
  };

  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', () => {
    element.classList.remove('is-pressed');
    onRelease();
  });
}

function bindPlungerZone(element) {
  if (!element) return;

  let dragStartY = 0;
  let pointerActive = false;

  element.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointerActive = true;
    dragStartY = e.clientY;
    element.setPointerCapture?.(e.pointerId);
    element.classList.add('is-pressed');
    audio.resume();
    setPlungerInput(true);
  });

  element.addEventListener('pointermove', (e) => {
    if (!pointerActive || ball.active) return;
    e.preventDefault();
    const dragDistance = Math.max(0, e.clientY - dragStartY);
    const dragCharge = Math.min(plunger.maxCompression, dragDistance * 0.55);
    plunger.compression = Math.max(plunger.compression, dragCharge);
  });

  const release = (e) => {
    e.preventDefault();
    pointerActive = false;
    element.classList.remove('is-pressed');
    setPlungerInput(false);
  };

  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', () => {
    pointerActive = false;
    element.classList.remove('is-pressed');
    setPlungerInput(false);
  });
}

function initUIControls() {
  startScreen = document.getElementById('start-screen');
  settingsPanel = document.getElementById('settings-panel');
  menuToggle = document.getElementById('menu-toggle');
  musicToggle = document.getElementById('music-toggle');
  scorePanel = document.getElementById('score-panel');

  document.getElementById('start-btn')?.addEventListener('click', () => {
    audio.resume();
    startGame();
    const startMusic = document.getElementById('start-music');
    if (startMusic?.checked && !audio.musicEnabled) {
      toggleMusic();
    } else {
      syncMusicButton();
    }
  });

  document.getElementById('reset-btn')?.addEventListener('click', () => {
    audio.resume();
    startGame();
  });

  musicToggle?.addEventListener('click', () => toggleMusic());
  menuToggle?.addEventListener('click', () => toggleMenu());
  document.getElementById('menu-close')?.addEventListener('click', () => closeMenu());
}

function toggleMenu() {
  if (!settingsPanel) return;
  const isOpen = settingsPanel.classList.toggle('open');
  settingsPanel.setAttribute('aria-hidden', String(!isOpen));
  menuToggle?.setAttribute('aria-expanded', String(isOpen));
}

function closeMenu() {
  settingsPanel?.classList.remove('open');
  settingsPanel?.setAttribute('aria-hidden', 'true');
  menuToggle?.setAttribute('aria-expanded', 'false');
}

function toggleMusic() {
  const isPlaying = audio.toggleMusic();
  syncMusicButton(isPlaying);
}

function syncMusicButton(isPlaying = audio.musicEnabled) {
  if (!musicToggle) return;
  musicToggle.textContent = isPlaying ? 'Music On' : 'Music Off';
  musicToggle.classList.toggle('active', isPlaying);
}

function triggerTilt() {
  state.tiltCount++;
  
  // Add mild random velocity to ball if active
  if (ball.active) {
    ball.vel.x += (Math.random() * 200 - 100);
    ball.vel.y += (Math.random() * 200 - 100);
  }

  // Visual shake
  canvas.classList.add('shake');
  setTimeout(() => canvas.classList.remove('shake'), 200);

  if (state.tiltCount >= 3) {
    state.isTilted = true;
    state.activeBandMode = 'TILT!';
    audio.playDrain();
    updateUI();
  }
}

// UI display updates
function updateUI() {
  const scoreVal = document.getElementById('score-val');
  const hudMultiplierVal = document.getElementById('hud-multiplier-val');
  const hudModeVal = document.getElementById('hud-mode-val');
  const highVal = document.getElementById('high-val');
  const multiplierVal = document.getElementById('multiplier-val');
  const difficultyVal = document.getElementById('difficulty-val');
  if (scoreVal) scoreVal.textContent = state.score.toLocaleString();
  if (hudMultiplierVal) hudMultiplierVal.textContent = `${state.multiplier}x`;
  if (hudModeVal) hudModeVal.textContent = state.isTilted ? 'TILT' : state.activeBandMode === 'NONE' ? 'READY' : state.activeBandMode;
  if (highVal) highVal.textContent = state.highScore.toLocaleString();
  if (multiplierVal) multiplierVal.textContent = `${state.multiplier}x`;
  if (difficultyVal) difficultyVal.textContent = difficultySettings[state.difficulty].label;
  
  // Balls indicator (guitar icons or text)
  const ballsContainer = document.getElementById('balls-indicator');
  if (ballsContainer) {
    ballsContainer.innerHTML = '';
    for (let i = 0; i < state.maxBalls; i++) {
      const git = document.createElement('span');
      git.className = `guitar-icon ${i < state.balls ? 'active' : 'spent'}`;
      git.textContent = '🎸';
      ballsContainer.appendChild(git);
    }
  }

  // Update Band statuses
  const statusLabels = {
    nirvana: document.getElementById('nirvana-status'),
    gnr: document.getElementById('gnr-status'),
    rage: document.getElementById('rage-status')
  };

  for (const band in statusLabels) {
    if (statusLabels[band]) {
      const hits = state.bandHits[band];
      if (hits >= 5) {
        statusLabels[band].innerHTML = `<span class="active-badge glow-${band}">LIT</span> ${band.toUpperCase()}`;
        statusLabels[band].classList.add('lit');
      } else {
        statusLabels[band].innerHTML = `<span class="inactive-badge">[${hits}/5]</span> ${band.toUpperCase()}`;
        statusLabels[band].classList.remove('lit');
      }
    }
  }

  // Active status box
  const mainModeBox = document.getElementById('mode-text');
  if (mainModeBox) {
    if (state.isTilted) {
      mainModeBox.textContent = '!!! TILT !!!';
      mainModeBox.className = 'tilt-blink';
    } else if (state.activeBandMode !== 'NONE') {
      mainModeBox.textContent = `${state.activeBandMode} MODE ACTIVE!`;
      mainModeBox.className = `mode-blink glow-${state.activeBandMode.toLowerCase()}`;
    } else {
      mainModeBox.textContent = 'READY TO ROCK';
      mainModeBox.className = '';
    }
  }
}

// Add Score and handle achievements
function addScore(points) {
  if (state.isTilted || state.gameState !== 'PLAYING') return;
  const awardedPoints = points * state.multiplier;
  state.score += awardedPoints;
  
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem('rock_pinball_highscore', state.highScore.toString());
  }
  updateUI();
  showScorePanel(awardedPoints);
}

function showScorePanel(points) {
  const lastScoreVal = document.getElementById('last-score-val');
  if (lastScoreVal) lastScoreVal.textContent = `+${points.toLocaleString()}`;
  if (!scorePanel) return;

  scorePanel.classList.add('is-expanded');
  window.clearTimeout(scoreCollapseTimer);
  scoreCollapseTimer = window.setTimeout(() => {
    scorePanel.classList.remove('is-expanded');
  }, 1800);
}

// Physics Sub-Step Update
function updatePhysics(sub_dt) {
  if (state.gameState !== 'PLAYING') return;

  // 1. Update flippers angle & angular velocity (omega)
  // Left Flipper
  const leftF = flippers.left;
  if (!state.isTilted && (keys['a'] || keys['arrowleft'])) {
    if (leftF.angle > leftF.minAngle) {
      leftF.angle = Math.max(leftF.minAngle, leftF.angle - leftF.speed * sub_dt);
      leftF.omega = -leftF.speed;
    } else {
      leftF.omega = 0;
    }
  } else {
    if (leftF.angle < leftF.maxAngle) {
      leftF.angle = Math.min(leftF.maxAngle, leftF.angle + leftF.restSpeed * sub_dt);
      leftF.omega = leftF.restSpeed;
    } else {
      leftF.omega = 0;
    }
  }

  // Right Flipper
  const rightF = flippers.right;
  if (!state.isTilted && (keys['l'] || keys['arrowright'])) {
    if (rightF.angle < rightF.maxAngle) {
      rightF.angle = Math.min(rightF.maxAngle, rightF.angle + rightF.speed * sub_dt);
      rightF.omega = rightF.speed;
    } else {
      rightF.omega = 0;
    }
  } else {
    if (rightF.angle > rightF.minAngle) {
      rightF.angle = Math.max(rightF.minAngle, rightF.angle - rightF.restSpeed * sub_dt);
      rightF.omega = -rightF.restSpeed;
    } else {
      rightF.omega = 0;
    }
  }

  // 2. Plunger charge
  if (keys['space'] && !ball.active) {
    plunger.compression = Math.min(plunger.maxCompression, plunger.compression + plunger.chargeSpeed * 40 * sub_dt);
    // Play hum modulated by compression
    if (Math.random() < 0.25) {
      audio.playPlungerHum(plunger.compression / plunger.maxCompression);
    }
  } else {
    // Release plunger
    if (plunger.compression > 0) {
      if (!ball.active && ball.pos.x > 450) {
        const force = plunger.compression / plunger.maxCompression;
        ball.vel.y = -700 - force * 1100;
        ball.vel.x = -10 - Math.random() * 20;
        ball.active = true;
        audio.playLaunch();
      }
      plunger.compression = Math.max(0, plunger.compression - 200 * sub_dt);
    }
  }

  // 3. Ball movement & collisions
  if (ball.onRamp) {
    // Move ball along pre-defined ramp spline path
    ball.rampProgress += ball.rampSpeed * 60 * sub_dt;
    if (ball.rampProgress >= 1.0) {
      // Exit ramp
      ball.onRamp = false;
      ball.rampProgress = 0;
      // Drop onto top layout
      const exitPos = rampPath[rampPath.length - 1];
      ball.pos = Vec.clone(exitPos);
      ball.vel = Vec.create(150, 100); // Shoot out rightwards/downwards
      audio.playRamp();
      addScore(5000);
    } else {
      // Interpolate along path
      const pathLength = rampPath.length;
      const idx = Math.floor(ball.rampProgress * (pathLength - 1));
      const nextIdx = Math.min(pathLength - 1, idx + 1);
      const segmentT = (ball.rampProgress * (pathLength - 1)) - idx;
      
      const p1 = rampPath[idx];
      const p2 = rampPath[nextIdx];
      
      ball.pos.x = p1.x + (p2.x - p1.x) * segmentT;
      ball.pos.y = p1.y + (p2.y - p1.y) * segmentT;
      ball.vel = Vec.create(0, 0); // No velocity while captured
    }
    return;
  }

  // Normal physical movement
  if (ball.active) {
    // Apply gravity
    ball.vel.y += difficultySettings[state.difficulty].gravity * sub_dt;
    // Air resistance
    ball.vel = Vec.mult(ball.vel, 1 - 0.05 * sub_dt);

    // Speed clamp (safety)
    const speed = Vec.mag(ball.vel);
    if (speed > 2800) {
      ball.vel = Vec.mult(Vec.normalize(ball.vel), 2800);
    }

    // Update position
    ball.pos = Vec.add(ball.pos, Vec.mult(ball.vel, sub_dt));

    // A. Check wall collisions
    for (const wall of walls) {
      const col = checkSegmentCollision(ball, wall);
      if (col) {
        resolveCollision(ball, col, wall.restitution, wall.friction);
      }
    }

    // B. Plunger return check (replaces old gate, resets ball to plunger if it rolls back)
    if (ball.active && ball.pos.x > 440 && ball.pos.y > 750 && ball.vel.y > 0) {
      ball.active = false;
      ball.pos = Vec.create(465, 750);
      ball.vel = Vec.create(0, 0);
    }

    // C. Bumper collisions
    for (const bumper of bumpers) {
      const col = checkCircleCollision(ball, bumper);
      if (col) {
        const hit = resolveCollision(ball, col, 0.8, 0.1, null, true, false);
        if (hit) {
          bumper.flashTime = 12; // number of frames to flash
          spawnParticles(col.point.x, col.point.y, bumper.color);
          
          // Trigger audio
          let bumperIdx = 1;
          if (bumper.id === 'gnr') bumperIdx = 2;
          if (bumper.id === 'rage') bumperIdx = 3;
          audio.playBumper(bumperIdx);

          // Update game state
          addScore(1000);
          state.bandHits[bumper.id]++;
          
          // Trigger Band Mode if hitting a bumper 5 times
          if (state.bandHits[bumper.id] === 5) {
            state.activeBandMode = bumper.label;
            state.multiplier += 1;
            addScore(15000);
          }
          updateUI();
        }
      }
    }

    // D. Slingshot collisions
    for (const sling of slingshots) {
      const col = checkSegmentCollision(ball, sling);
      if (col) {
        // Calculate relative velocity towards slingshot normal
        const velAlongNormal = Vec.dot(ball.vel, sling.normal);
        // Only trigger kick if moving towards the slingshot
        if (velAlongNormal < 0) {
          const hit = resolveCollision(ball, col, sling.restitution, sling.friction, null, false, true);
          if (hit) {
            sling.flashTime = 12;
            spawnParticles(col.point.x, col.point.y, '#FFFFFF', 8);
            audio.playSlingshot();
            addScore(500);
          }
        }
      }
    }

    // E. Drop Targets collisions
    for (const target of dropTargets) {
      if (!target.active) continue;
      const col = checkSegmentCollision(ball, target, 4); // target thickness
      if (col) {
        target.active = false;
        target.flashTime = 15;
        spawnParticles(col.point.x, col.point.y, target.color, 10);
        audio.playTarget();
        addScore(2500);

        // Check if all targets are down
        const allDown = dropTargets.every(t => !t.active);
        if (allDown) {
          addScore(20000);
          // Spawn extra particles and reset drop targets
          scheduleTimer(() => {
            for (const t of dropTargets) {
              t.active = true;
              t.flashTime = 10;
            }
            audio.playRollover();
          }, 1500);
        }
      }
    }

    // F. Flipper collisions
    // Left Flipper
    const leftCol = checkSegmentCollision(ball, getFlipperSegment(leftF), leftF.radius);
    if (leftCol) {
      // Calculate contact point linear velocity: v_f = omega x r_perp
      const rVec = Vec.sub(leftCol.point, leftF.pivot);
      const flipperVel = Vec.create(-leftF.omega * rVec.y, leftF.omega * rVec.x);
      resolveCollision(ball, leftCol, 0.4, 0.05, flipperVel);
    }

    // Right Flipper
    const rightCol = checkSegmentCollision(ball, getFlipperSegment(rightF), rightF.radius);
    if (rightCol) {
      const rVec = Vec.sub(rightCol.point, rightF.pivot);
      const flipperVel = Vec.create(-rightF.omega * rVec.y, rightF.omega * rVec.x);
      resolveCollision(ball, rightCol, 0.4, 0.05, flipperVel);
    }

    // G. Rollover Lanes trigger
    for (const lane of rolloverLanes) {
      if (ball.pos.y >= lane.y - 12 && ball.pos.y <= lane.y + 12) {
        if (ball.pos.x >= lane.x1 && ball.pos.x <= lane.x2 && !lane.lit) {
          lane.lit = true;
          audio.playRollover();
          addScore(3000);
          
          // Check if all ROCK lanes are lit
          const allLit = rolloverLanes.every(l => l.lit);
          if (allLit) {
            state.multiplier += 1;
            addScore(25000);
            // Reset lanes after a delay
            scheduleTimer(() => {
              for (const l of rolloverLanes) l.lit = false;
            }, 1000);
          }
          updateUI();
        }
      }
    }

    // H. Ramp entrance trigger
    if (ball.pos.x >= rampEntrance.x && ball.pos.x <= rampEntrance.x + rampEntrance.width &&
        ball.pos.y >= rampEntrance.y && ball.pos.y <= rampEntrance.y + rampEntrance.height) {
      // Ball must have upward speed
      if (ball.vel.y < -150) {
        ball.onRamp = true;
        ball.rampProgress = 0;
      }
    }

    // I. Drain check
    if (ball.pos.y > HEIGHT + 20) {
      ball.active = false;
      state.balls--;
      audio.playDrain();
      updateUI();

      if (state.balls > 0) {
        resetBall();
        state.isTilted = false;
        state.tiltCount = 0;
      } else {
        state.gameState = 'GAMEOVER';
      }
    }
  }
}

// Get the actual line segment representing a flipper
function getFlipperSegment(flipper) {
  return {
    p1: flipper.pivot,
    p2: Vec.create(
      flipper.pivot.x + flipper.length * Math.cos(flipper.angle),
      flipper.pivot.y + flipper.length * Math.sin(flipper.angle)
    )
  };
}

// Particles rendering and updating
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alpha -= p.decay;
    if (p.alpha <= 0) {
      particles.splice(i, 1);
    }
  }
}

// Draw a flipper (glowing capsule/rod)
function drawFlipper(flipper) {
  const seg = getFlipperSegment(flipper);
  
  ctx.save();
  ctx.lineCap = 'round';
  
  // Shadow/Glow
  ctx.shadowBlur = 12;
  ctx.shadowColor = flipper.isLeft ? '#FF3B30' : '#00F2FE';
  
  // Outer Stroke (Chrome finish edge)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = flipper.radius * 2;
  ctx.beginPath();
  ctx.moveTo(seg.p1.x, seg.p1.y);
  ctx.lineTo(seg.p2.x, seg.p2.y);
  ctx.stroke();

  // Flipper core (colored center)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = flipper.isLeft ? '#FF3B30' : '#00F2FE';
  ctx.lineWidth = flipper.radius * 2 - 4;
  ctx.beginPath();
  ctx.moveTo(seg.p1.x, seg.p1.y);
  ctx.lineTo(seg.p2.x, seg.p2.y);
  ctx.stroke();

  // Pivot cap
  ctx.fillStyle = '#CCCCCC';
  ctx.beginPath();
  ctx.arc(seg.p1.x, seg.p1.y, flipper.radius + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw static boundary lines
function drawWalls() {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 3;
  ctx.shadowBlur = 5;
  ctx.shadowColor = '#000000';

  for (const wall of walls) {
    ctx.beginPath();
    ctx.moveTo(wall.p1.x, wall.p1.y);
    ctx.lineTo(wall.p2.x, wall.p2.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCoverImage(image, x, y, width, height) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = image.naturalWidth;
  let sh = image.naturalHeight;

  if (imageRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }

  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

// Draw the entire scene
function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  // 1. Draw Background texture
  if (bgImage.complete && bgImage.naturalWidth !== 0) {
    drawCoverImage(bgImage, 0, 0, WIDTH, HEIGHT);
  } else {
    // Fallback retro style background
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    
    // Grid lines
    ctx.strokeStyle = 'rgba(255, 0, 128, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < HEIGHT; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
    }
  }

  // Draw semi-dark overlay to make neon stand out
  ctx.fillStyle = 'rgba(10, 10, 12, 0.45)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 2. Draw static walls & plunger lane boundaries
  drawWalls();

  // 3. Plunger Gate (removed)

  // 4. Draw Rollover lanes
  for (const lane of rolloverLanes) {
    ctx.save();
    const midX = (lane.x1 + lane.x2) / 2;
    ctx.shadowBlur = lane.lit ? 15 : 0;
    ctx.shadowColor = lane.color;
    ctx.fillStyle = lane.lit ? lane.color : 'rgba(255, 255, 255, 0.15)';
    
    // Draw letters
    ctx.font = 'bold 20px "Orbitron", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lane.label, midX, lane.y - 15);

    // Draw little rollover wire trigger line
    ctx.strokeStyle = lane.lit ? lane.color : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lane.x1 + 4, lane.y);
    ctx.lineTo(lane.x2 - 4, lane.y);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Draw Ramp outline
  ctx.save();
  ctx.strokeStyle = 'rgba(0, 242, 254, 0.3)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(rampPath[0].x, rampPath[0].y);
  for (let i = 1; i < rampPath.length; i++) {
    ctx.lineTo(rampPath[i].x, rampPath[i].y);
  }
  ctx.stroke();

  // Ramp rails (inner)
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rampPath[0].x, rampPath[0].y);
  for (let i = 1; i < rampPath.length; i++) {
    ctx.lineTo(rampPath[i].x, rampPath[i].y);
  }
  ctx.stroke();
  ctx.restore();

  // 6. Draw Drop Targets
  for (const target of dropTargets) {
    if (!target.active && target.flashTime <= 0) continue;
    
    ctx.save();
    ctx.fillStyle = target.active ? target.color : '#FFFFFF';
    ctx.shadowBlur = target.active ? 10 : 25;
    ctx.shadowColor = target.color;
    
    // Target board
    ctx.beginPath();
    ctx.rect(target.p1.x, target.p1.y, target.p2.x - target.p1.x, target.p2.y - target.p1.y);
    ctx.fill();
    ctx.restore();

    if (target.flashTime > 0) target.flashTime--;
  }

  // 7. Draw Slingshots
  for (const sling of slingshots) {
    ctx.save();
    ctx.fillStyle = sling.flashTime > 0 ? '#FFFFFF' : 'rgba(255, 255, 255, 0.08)';
    ctx.strokeStyle = sling.flashTime > 0 ? '#FFFFFF' : 'rgba(255, 0, 128, 0.6)';
    ctx.lineWidth = 3;
    ctx.shadowBlur = sling.flashTime > 0 ? 20 : 8;
    ctx.shadowColor = 'rgba(255, 0, 128, 0.8)';

    // Slingshot triangle shape
    ctx.beginPath();
    ctx.moveTo(sling.p1.x, sling.p1.y);
    ctx.lineTo(sling.p2.x, sling.p2.y);
    
    // Back vertex
    const isLeft = sling.p1.x < WIDTH / 2;
    const backX = isLeft ? sling.p1.x - 20 : sling.p1.x + 20;
    ctx.lineTo(backX, sling.p2.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (sling.flashTime > 0) sling.flashTime--;
  }

  // 8. Draw Bumpers
  for (const bumper of bumpers) {
    ctx.save();
    const isFlashing = bumper.flashTime > 0;
    
    ctx.shadowBlur = isFlashing ? 28 : 12;
    ctx.shadowColor = bumper.color;
    ctx.fillStyle = isFlashing ? bumper.activeColor : 'rgba(10, 10, 12, 0.75)';
    ctx.strokeStyle = bumper.color;
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner cap
    ctx.fillStyle = bumper.color;
    ctx.beginPath();
    ctx.arc(bumper.pos.x, bumper.pos.y, bumper.radius - 8, 0, Math.PI * 2);
    ctx.fill();

    // Bumper Label
    ctx.fillStyle = isFlashing ? '#000000' : '#FFFFFF';
    ctx.font = 'bold 11px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bumper.label, bumper.pos.x, bumper.pos.y);

    ctx.restore();
    if (bumper.flashTime > 0) bumper.flashTime--;
  }

  // 9. Draw Flippers
  drawFlipper(flippers.left);
  drawFlipper(flippers.right);

  // 10. Draw Plunger spring
  ctx.save();
  ctx.fillStyle = '#444';
  ctx.fillRect(plunger.x, plunger.y + plunger.compression, plunger.width, plunger.height);
  
  // Spring wire representation
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const springTop = plunger.y + plunger.compression;
  const springBottom = HEIGHT - 10;
  ctx.moveTo(plunger.x + plunger.width/2, springBottom);
  
  const coils = 6;
  const spacing = (springBottom - springTop) / coils;
  for (let i = 1; i <= coils; i++) {
    const coilY = springBottom - i * spacing;
    const offset = (i % 2 === 0 ? 8 : -8);
    ctx.lineTo(plunger.x + plunger.width/2 + offset, coilY + spacing/2);
    ctx.lineTo(plunger.x + plunger.width/2, coilY);
  }
  ctx.stroke();
  ctx.restore();

  // 11. Draw particles
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 12. Draw Ball
  if (ball.active || !ball.active && ball.pos.x > 450) {
    ctx.save();
    
    // Draw ball body (Metal finish)
    const grad = ctx.createRadialGradient(
      ball.pos.x - 3, ball.pos.y - 3, 1,
      ball.pos.x, ball.pos.y, ball.radius
    );
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.3, '#E0E0E5');
    grad.addColorStop(0.8, '#707078');
    grad.addColorStop(1, '#202025');

    // Aura glow if on ramp
    if (ball.onRamp) {
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#00F2FE';
    } else {
      ctx.shadowBlur = 5;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.pos.x, ball.pos.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Chrome reflection arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ball.pos.x, ball.pos.y, ball.radius - 2, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
    
    ctx.restore();
  }

  // 13. Overlay Game states text
  if (state.gameState === 'START') {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 12, 0.8)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 36px "Orbitron", sans-serif';
    ctx.fillStyle = '#00F2FE';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#00F2FE';
    ctx.fillText('90s ALTERNATIVE', WIDTH/2, HEIGHT/2 - 80);
    
    ctx.font = 'bold 48px "Orbitron", sans-serif';
    ctx.fillStyle = '#FF3B30';
    ctx.shadowColor = '#FF3B30';
    ctx.fillText('PINBALL', WIDTH/2, HEIGHT/2 - 20);

    ctx.font = '16px "Inter", sans-serif';
    ctx.fillStyle = '#CCCCCC';
    ctx.shadowBlur = 0;
    ctx.fillText('Press "R" to launch game and load sounds', WIDTH/2, HEIGHT/2 + 50);
    ctx.fillText('Press "M" to toggle 90s bass soundtrack', WIDTH/2, HEIGHT/2 + 80);
    ctx.fillText('Left Flipper: [A] or [←] | Right Flipper: [L] or [→]', WIDTH/2, HEIGHT/2 + 120);
    ctx.fillText('Launch: Hold [Space] / Release', WIDTH/2, HEIGHT/2 + 150);
    
    ctx.restore();
  } else if (state.gameState === 'GAMEOVER') {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 10, 12, 0.85)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.font = 'bold 50px "Orbitron", sans-serif';
    ctx.fillStyle = '#FF3B30';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#FF3B30';
    ctx.fillText('GAME OVER', WIDTH/2, HEIGHT/2 - 40);

    ctx.font = 'bold 24px "Orbitron", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.fillText(`FINAL SCORE: ${state.score.toLocaleString()}`, WIDTH/2, HEIGHT/2 + 30);

    ctx.font = '16px "Inter", sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('Press "R" to replay', WIDTH/2, HEIGHT/2 + 90);
    ctx.restore();
  }
}

// Core Game Loop
let lastTime = 0;
function loop(currentTime) {
  if (!lastTime) lastTime = currentTime;
  let dt = (currentTime - lastTime) / 1000;
  lastTime = currentTime;

  // Cap frame duration to prevent physics explosion on tab change/lag
  if (dt > 0.1) dt = 0.1;

  // Sub-stepping for physics stability
  const sub_dt = dt / SUB_STEPS;
  for (let i = 0; i < SUB_STEPS; i++) {
    updatePhysics(sub_dt);
  }

  // Update particles and animations
  updateParticles(dt);

  // Draw scene
  render();

  requestAnimationFrame(loop);
}

// Entrypoint
window.addEventListener('load', () => {
  canvas = document.getElementById('pinball-canvas');
  ctx = canvas.getContext('2d');

  configureViewportWorld();
  resizeCanvasBackingStore();

  // Initialize systems
  initWalls();
  initUIControls();
  initInputs();
  initTouchControls();
  updateUI();
  syncMusicButton();
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('orientationchange', handleViewportChange);

  // Run loop
  requestAnimationFrame(loop);
});
