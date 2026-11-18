import * as THREE from 'three';
import { Arena } from './game/arena.js';
import { Player, PLAYER_CONFIG } from './game/player.js';
import { Robot } from './game/robot.js';
import { Brain } from './game/brain.js';
import { Combat } from './game/combat.js';
import { HUD } from './game/hud.js';
import { audio } from './game/audio.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 140);

const arena = new Arena(scene);
const player = new Player(camera, scene);
const robot = new Robot(scene);
const hud = new HUD();
const combat = new Combat(scene, camera, player, robot, hud);
const brain = new Brain();

player.hpCurrent = 100;

const state = {
  phase: 'menu', // menu | playing | roundEnd | matchEnd
  paused: false,
  round: 1,
  scorePlayer: 0,
  scoreBot: 0,
  roundStart: 0,
  botAmmo: 7,
  botReload: 0,
  botCooldown: 0.8,
  botWinding: 0,
  lastMoveMode: null,
  moveTargetX: 0,
  breakSide: -1,
  shotTimes: [],
  playerHitAt: -99,
  robotHitAt: -99,
  time: 0,
};

const keys = new Set();

function resetRound() {
  player.resetRound();
  robot.reset();
  player.hpCurrent = 100;
  state.botAmmo = 7;
  state.botReload = 0;
  state.botCooldown = 1.1;
  state.botWinding = 0;
  state.lastMoveMode = null;
  state.moveTargetX = 0;
  state.breakSide = -1;
  state.shotTimes.length = 0;
  state.playerHitAt = -99;
  state.robotHitAt = -99;
  state.roundStart = state.time;
  state.phase = 'playing';
  state.paused = false;
  brain.reset();
  brain.ask(buildBrainState()); // warm up the Pages Function before the first official thought
  combat.clearPetals();
  hud.setPlayerHP(100);
  hud.setBotHP(100);
  hud.setAmmo(7, false);
  hud.setScore(state.scorePlayer, state.scoreBot, state.round);
  hud.show();
  hud.announce(`ROUND ${state.round}`, 'FIGHT', '', 1200);
  audio.beep(880, 0.12, 0.2);
  setTimeout(() => audio.beep(1320, 0.16, 0.2), 260);
}

function endRound(winner) {
  if (state.phase !== 'playing') return;
  state.phase = 'roundEnd';
  const won = winner === 'player';
  if (won) {
    state.scorePlayer++;
    combat.celebrate();
    audio.cheer(1);
  } else {
    state.scoreBot++;
    audio.cheer(0.5);
  }
  hud.setScore(state.scorePlayer, state.scoreBot, state.round);
  hud.announce(won ? 'ROUND WON' : 'ROUND LOST', won ? 'NICE SHOT' : 'JEV-01 TAKES IT', won ? 'win' : 'lose', 2200);
  setTimeout(() => {
    if (state.scorePlayer >= 2 || state.scoreBot >= 2) {
      showMatchEnd(state.scorePlayer >= 2);
    } else {
      state.round++;
      resetRound();
    }
  }, 2700);
}

function showMatchEnd(won) {
  state.phase = 'matchEnd';
  const overlay = document.getElementById('overlay');
  const brand = overlay.querySelector('.brand');
  const kicker = overlay.querySelector('.brand-kicker');
  const tagline = overlay.querySelector('.tagline');
  const btn = document.getElementById('start-btn');
  const note = document.getElementById('start-note');
  brand.innerHTML = won ? 'VICTORY' : 'DEFEAT';
  brand.style.color = won ? 'var(--amber)' : 'var(--red)';
  kicker.textContent = won ? 'THE CROWD GOES WILD' : 'JEV-01 LEARNS FROM YOU';
  tagline.innerHTML = won
    ? `你以 ${state.scorePlayer} : ${state.scoreBot} 赢下了这场对决。<br />花已经飞满整个擂台。`
    : `JEV-01 以 ${state.scoreBot} : ${state.scorePlayer} 赢下了这场对决。<br />再来一次，它会更难缠。`;
  btn.querySelector('span').textContent = 'RUN IT BACK';
  note.textContent = '按 ENTER 或点击按钮重开';
  overlay.classList.remove('hidden');
  hud.el.hud.classList.add('hidden');
  audio.cheer(won ? 1 : 0.4);
}

function startMatch() {
  state.scorePlayer = 0;
  state.scoreBot = 0;
  state.round = 1;
  resetRound();
}

function buildBrainState() {
  const d = PLAYER_CONFIG.z - robot.root.position.z;
  const yaw = player.yaw;
  const aimX = player.x - Math.tan(yaw) * d;
  const aimY = PLAYER_CONFIG.eyeHeight + Math.tan(player.pitch) * d;
  return {
    alive: robot.alive && player.hpCurrent > 0,
    round: state.round,
    distance: d,
    player: {
      x: player.x, vx: player.velocity,
      aimOffset: aimX - robot.x,
      aimHeight: aimY - 1.6,
      shotsRecent: state.shotTimes.filter((t) => state.time - t < 3).length,
      sinceShot: state.shotTimes.length ? state.time - state.shotTimes[state.shotTimes.length - 1] : 99,
      reloading: player.reloading > 0,
      hp: player.hpCurrent,
    },
    robot: {
      x: robot.x, vx: robot.velocity, hp: robot.hp, ammo: state.botAmmo,
      sinceHit: state.time - state.robotHitAt,
    },
  };
}

function updateBot(dt, bstate) {
  if (!robot.alive) return;

  // reload
  if (state.botReload > 0) {
    state.botReload -= dt;
    if (state.botReload <= 0) { state.botReload = 0; state.botAmmo = 7; }
  } else if (state.botAmmo === 0 && brain.action.reload) {
    state.botReload = 1.5;
    audio.reload();
  }

  // Movement: keep a live target and re-issue it on arrival. Setting only once
  // per mode change made the robot walk to a point and then stand still forever.
  const mode = brain.action.moveMode;
  const target = state.moveTargetX ?? robot.x;
  const arrived = Math.abs(robot.x - target) < 0.4;
  if (mode !== state.lastMoveMode || arrived || mode === 'mirror') {
    let next = target;
    switch (mode) {
      case 'mirror':
        next = player.x;
        break;
      case 'break':
        // Patrol between both far lanes instead of parking on one side.
        next = state.breakSide < 0 ? 5.6 : -5.6;
        state.breakSide *= -1;
        break;
      case 'left':
        next = robot.x - (2.4 + Math.random() * 1.5);
        if (next < -6.1) next = robot.x + 3.0; // bounce off the edge
        break;
      case 'right':
        next = robot.x + (2.4 + Math.random() * 1.5);
        if (next > 6.1) next = robot.x - 3.0;
        break;
      default:
        next = robot.x;
    }
    state.moveTargetX = THREE.MathUtils.clamp(next, -6.3, 6.3);
    robot.setMoveTarget(state.moveTargetX);
    state.lastMoveMode = mode;
  }

  robot.aimAt(player.x);

  // Firing: aim tell -> shot. The animation is visible before the tracer.
  state.botCooldown = Math.max(0, state.botCooldown - dt);
  const wantsFire = brain.action.fire && state.botAmmo > 0
    && state.botReload <= 0 && state.botCooldown <= 0 && player.hpCurrent > 0;
  if (wantsFire && state.botWinding <= 0) state.botWinding = 0.2;

  if (state.botWinding > 0) {
    state.botWinding -= dt;
    robot.setAiming(true);
    if (state.botWinding <= 0) {
      robot.setAiming(false);
      combat.botFire(brain.action.accuracy);
      state.botAmmo--;
      state.botCooldown = 0.42 + Math.random() * 0.22;
      if (state.botAmmo === 0) state.botReload = 1.5;
    }
  } else {
    robot.setAiming(false);
  }
}

// ---------------- input ----------------
document.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyR' && state.phase === 'playing' && player.startReload()) audio.reload();
  if (e.code === 'Enter' && (state.phase === 'menu' || state.phase === 'matchEnd')) startMatch();
  if (e.code === 'Space' && state.phase === 'playing' && !state.paused) tryFire();
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => keys.delete(e.code));

document.addEventListener('mousemove', (e) => {
  if (state.phase !== 'playing' || state.paused) return;
  player.onMouseMove(e.movementX || 0, e.movementY || 0);
});

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0 && state.phase === 'playing' && !state.paused) tryFire();
});

function tryFire() {
  const result = combat.playerFire();
  if (result) state.shotTimes.push(state.time);
}

document.getElementById('start-btn').addEventListener('click', () => {
  audio.init(); audio.resume();
  canvas.requestPointerLock?.().catch(() => {});
  startMatch();
});

let hadPointerLock = false;
document.addEventListener('pointerlockchange', () => {
  if (state.phase !== 'playing') return;
  if (document.pointerLockElement === canvas) {
    hadPointerLock = true;
    state.paused = false;
    return;
  }
  // Never pause just because a lock request was denied — the game is playable
  // with plain mouse movement too.
  if (!hadPointerLock) { state.paused = false; return; }
  state.paused = true;
  hud.announce('PAUSED', 'CLICK TO RESUME', '', 99999);
});

canvas.addEventListener('click', () => {
  if (state.phase === 'playing' && state.paused) canvas.requestPointerLock?.().catch(() => {});
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

combat.onBotHit = () => { state.robotHitAt = state.time; };
combat.onPlayerHit = () => { state.playerHitAt = state.time; };
brain.onJevUpdate = () => { hud.updateBrain(brain); };

// ---------------- main loop ----------------
let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  state.time += dt;

  arena.update(state.time);

  if (state.phase === 'playing' && !state.paused) {
    player.updateMovement(keys, dt);
    player.update(dt);
    const bstate = buildBrainState();
    brain.update(dt, bstate);
    updateBot(dt, bstate);

    const taunt = brain.consumeTaunt();
    if (taunt && Math.random() < 0.75) hud.taunt(taunt);

    combat.update(dt);
    robot.update(dt, state.time);

    hud.setPlayerHP(player.hpCurrent);
    hud.setBotHP(robot.hp);
    hud.setAmmo(player.ammo, player.reloading > 0);
    hud.setCrosshairSpread(player.recoil * 0.8 + Math.min(0.6, Math.abs(player.velocity) / 6));
    hud.updateBrain(brain);

    if (robot.hp <= 0) endRound('player');
    else if (player.hpCurrent <= 0) endRound('bot');
  } else {
    player.update(dt);
    robot.update(dt, state.time);
    combat.update(dt);
  }

  renderer.render(scene, camera);
}

hud.hideLoading();
hud.updateBrain(brain);
requestAnimationFrame(tick);

// expose a small debug surface for self-testing
window.__duel = {
  state, player, robot, brain, combat, hud,
  start: startMatch,
  fire: tryFire,
  setBotHP: (v) => { robot.hp = v; hud.setBotHP(v); },
  setPlayerHP: (v) => { player.hpCurrent = v; hud.setPlayerHP(v); },
};
