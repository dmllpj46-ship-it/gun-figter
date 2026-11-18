const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), overlay: $('overlay'), loading: $('loading'),
      hpPlayer: $('hp-player'), hpPlayerText: $('hp-player-text'),
      hpBot: $('hp-bot'), hpBotText: $('hp-bot-text'),
      ammo: $('ammo-current'), ammoLabel: $('ammo-label'),
      scorePlayer: $('score-player'), scoreBot: $('score-bot'), round: $('round-label'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'),
      damageFlash: $('damage-flash'), subtitle: $('subtitle'), announce: $('announce'),
      brainSource: $('brain-source'), brainMeter: $('brain-meter-fill'),
      thinkAim: $('think-aim'), thinkThreat: $('think-threat'),
      thinkFire: $('think-fire'), thinkMove: $('think-move'), thinkTaunt: $('think-taunt'),
    };
    this.subtitleTimer = null;
    this.announceTimer = null;
    this.hitTimer = null;
    this.damageTimer = null;
  }

  show() {
    this.el.hud.classList.remove('hidden');
    this.el.overlay.classList.add('hidden');
  }

  hideLoading() {
    this.el.loading.style.opacity = '0';
    setTimeout(() => { this.el.loading.style.display = 'none'; }, 500);
  }

  setPlayerHP(v) {
    this.el.hpPlayer.style.width = `${Math.max(0, v)}%`;
    this.el.hpPlayerText.textContent = String(Math.max(0, Math.round(v)));
  }

  setBotHP(v) {
    this.el.hpBot.style.width = `${Math.max(0, v)}%`;
    this.el.hpBotText.textContent = String(Math.max(0, Math.round(v)));
  }

  setAmmo(n, reloading) {
    this.el.ammo.textContent = String(n);
    this.el.ammo.classList.toggle('empty', n === 0);
    this.el.ammoLabel.textContent = reloading ? 'RELOADING' : n === 0 ? 'PRESS R' : 'PISTOL';
  }

  setScore(p, b, round) {
    this.el.scorePlayer.textContent = String(p);
    this.el.scoreBot.textContent = String(b);
    this.el.round.textContent = `ROUND ${round}`;
  }

  hitmarker(head = false, kill = false) {
    const m = this.el.hitmarker;
    m.classList.toggle('kill', kill);
    m.classList.add('show');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => m.classList.remove('show'), 130);
  }

  showDamage(amount, head, worldPos, camera) {
    const p = worldPos.clone().project(camera);
    if (p.z > 1) return;
    const node = document.createElement('div');
    node.className = `dmg-number${head ? ' head' : ''}`;
    node.textContent = head ? `${amount}!` : String(amount);
    node.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
    node.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
    document.getElementById('app').appendChild(node);
    setTimeout(() => node.remove(), 800);
  }

  playerHit() {
    const f = this.el.damageFlash;
    f.style.opacity = '1';
    clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => { f.style.opacity = '0'; }, 110);
  }

  taunt(text) {
    if (!text) return;
    const s = this.el.subtitle;
    s.textContent = text;
    s.classList.add('show');
    clearTimeout(this.subtitleTimer);
    this.subtitleTimer = setTimeout(() => s.classList.remove('show'), 2600);
  }

  announce(text, sub = '', cls = '', duration = 1600) {
    const a = this.el.announce;
    a.className = `announce show ${cls}`;
    a.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => a.classList.remove('show'), duration);
  }

  updateBrain(brain) {
    const j = brain.judgments;
    const e = this.el;
    e.brainSource.textContent = `${brain.source} · ${brain.latency ? Math.round(brain.latency) + 'ms' : 'offline'}`;
    e.brainSource.classList.toggle('jev', brain.source === 'JEV');
    e.thinkAim.textContent = j.aim.toFixed(2);
    e.thinkThreat.textContent = j.threat.toFixed(2);
    e.thinkFire.textContent = j.fire.toFixed(2);
    e.thinkMove.textContent = j.move;
    e.thinkTaunt.textContent = brain.action.confident ? 'decision locked' : '…uncertain, holding';
    e.brainMeter.style.width = `${Math.min(100, brain.elapsed / 2.4 * 100)}%`;
  }

  setCrosshairSpread(v) {
    this.el.crosshair.style.setProperty('--spread', `${7 + v * 9}px`);
  }
}
