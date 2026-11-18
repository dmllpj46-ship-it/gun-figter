/** Robot brain: Jev makes typed judgments; this module makes the decisions.
 * Falls back to a local heuristic if the API is unavailable. */

const ENDPOINT = '/api/jev';

const THINK_MIN = 1.6;
const THINK_MAX = 2.6;
const TIMEOUT_MS = 7500; // Pages Functions cold starts can be slow on the first call

const MOVE_TARGETS = {
  mirror_player: 'mirror',
  break_away: 'break',
  strafe_left: 'left',
  strafe_right: 'right',
  hold_and_aim: 'hold',
};

const TAUNT_LINES = {
  calm_stare: ['别着急，我内存很大。', '你在瞄准什么？', '呼吸，瞄准，开火。就这三件事。'],
  mocking_laugh: ['人类也需要热身后才准吗？', '你的手在抖，我看见了。', '再近一点，这样比较有礼貌。'],
  cold_threat: ['我已经计算过你下一步了。', '这一发我留给你。', '别躲，只会让曲线变丑。'],
  impressed: ['不错，这一枪像样。', '哦？你也会预判？', '继续，我正在学习。'],
  glitched: ['等等……我的概率有点乱。', '刚才那句不算。', '系统正在……重新考虑。'],
};

const TAUNT_CRITERIA = {
  calm_stare: 'quiet and confident, no emotion',
  mocking_laugh: 'playful teasing of the player',
  cold_threat: 'cold and menacing',
  impressed: 'genuine respect for the player',
  glitched: 'uncertain, as if the model is second-guessing itself',
};

function laneOf(x) {
  return x < -2.2 ? 'left' : x > 2.2 ? 'right' : 'center';
}

export class Brain {
  constructor() {
    this.source = 'LOCAL';
    this.latency = 0;
    this.failures = 0;
    this.lastCall = -99;
    this.nextThink = THINK_MIN;
    this.inFlight = false;
    this.elapsed = 0;
    this.judgments = { aim: 0.5, threat: 1.2, fire: 0.5, move: 'hold_and_aim', taunt: 'calm_stare' };
    this.action = { reload: false, fire: false, moveMode: 'hold', taunt: null, confident: true, accuracy: 0.5 };
    this._pendingTaunt = null;
    this.onJevUpdate = null;
  }

  /** Called every frame. Kicks off a Jev request when the timer allows. */
  update(dt, state) {
    this.elapsed += dt;
    if (!this.inFlight && this.elapsed >= this.nextThink) {
      this._scheduleNext();
      this.ask(state);
    }
    this._publishAction(state);
  }

  _scheduleNext() {
    this.nextThink = this.elapsed + THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN);
  }

  buildPayload(state) {
    const p = state.player;
    const r = state.robot;
    return {
      model: 'jev-latest',
      state: {
        round: state.round,
        distance_m: Number(state.distance.toFixed(1)),
        player: {
          lane: laneOf(p.x),
          speed_mps: Number(Math.abs(p.vx).toFixed(2)),
          aim_offset_m: Number(p.aimOffset.toFixed(2)),
          aim_height_offset_m: Number(p.aimHeight.toFixed(2)),
          shots_fired_last_3s: p.shotsRecent,
          seconds_since_last_shot: Number(p.sinceShot.toFixed(1)),
          reloading: p.reloading,
          health: Math.round(p.hp),
        },
        jev: {
          lane: laneOf(r.x),
          health: Math.round(r.hp),
          ammo: r.ammo,
          seconds_since_last_hit: Number(r.sinceHit.toFixed(1)),
        },
      },
      questions: {
        player_aimed_at_me: {
          type: 'noul',
          instructions: 'Is the player\'s crosshair on JEV-01 right now?',
        },
        player_threat: {
          type: 'score',
          instructions: 'How dangerous is the player to JEV-01 right now?',
          criteria: [
            'The player is reloading or has not aimed at JEV-01.',
            'The player is watching JEV-01 but has not fired recently.',
            'The player is aiming steadily at JEV-01 and recently fired.',
            'The player has a clear shot and is closing in for the kill.',
          ],
        },
        best_move: {
          type: 'choice',
          instructions: 'Which movement gives JEV-01 the best advantage right now?',
          criteria: {
            mirror_player: 'match the player lane and challenge them directly',
            break_away: 'move to the opposite side to break the player\'s aim',
            strafe_left: 'dodge to the left',
            strafe_right: 'dodge to the right',
            hold_and_aim: 'stay still to take a careful shot',
          },
        },
        fire_now: {
          type: 'noul',
          instructions: 'Is this a good moment for JEV-01 to shoot?',
        },
        taunt: {
          type: 'choice',
          instructions: 'Which tone suits this moment?',
          criteria: TAUNT_CRITERIA,
        },
      },
    };
  }

  async ask(state) {
    if (this.inFlight) return;
    this.inFlight = true;
    const payload = this.buildPayload(state);
    try {
      const resp = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!resp.ok) throw new Error(`http_${resp.status}`);
      const wrapper = await resp.json();
      if (!wrapper.ok || !wrapper.data) throw new Error(wrapper.error || 'bad_response');
      this._parse(wrapper.data, wrapper.latencyMs);
      this.failures = 0;
      this.source = 'JEV';
      if (this.onJevUpdate) this.onJevUpdate(this);
    } catch (err) {
      this.failures++;
      this._heuristic(state);
      if (this.failures >= 2) this.source = 'LOCAL';
      if (this.onJevUpdate) this.onJevUpdate(this);
    } finally {
      this.inFlight = false;
    }
  }

  /** Deterministic local fallback with the same judgment surface as Jev. */
  _heuristic(state) {
    const p = state.player;
    const r = state.robot;
    const offset = Math.abs(p.aimOffset);
    const aimed = offset < 0.35 && Math.abs(p.aimHeight) < 0.5;
    const threat = Math.max(0, Math.min(3,
      0.5 + (aimed ? 1.2 : 0) + (p.shotsRecent > 0 ? 0.7 : 0) + (p.sinceShot < 1.2 ? 0.4 : 0) - (p.reloading ? 1.0 : 0),
    ));
    let move = 'hold_and_aim';
    if (r.hp < 40) move = 'break_away';
    else if (Math.abs(laneOf(p.x) === laneOf(r.x) ? 0 : 1)) move = Math.random() < 0.5 ? 'strafe_left' : 'strafe_right';
    this.judgments = {
      aim: aimed ? 0.9 : offset < 1.0 ? 0.55 : 0.18,
      threat,
      fire: aimed ? 0.72 + Math.random() * 0.2 : 0.25 + Math.random() * 0.2,
      move,
      taunt: this.judgments.taunt,
    };
    if (Math.random() < 0.35) {
      const keys = Object.keys(TAUNT_LINES);
      this.judgments.taunt = keys[(Math.random() * keys.length) | 0];
      const line = TAUNT_LINES[this.judgments.taunt];
      this._pendingTaunt = line[(Math.random() * line.length) | 0];
    }
    this.latency = 0;
  }

  _parse(data, latencyMs) {
    const a = data.answers || {};
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    this.judgments = {
      aim: num(a.player_aimed_at_me?.noul, 0.5),
      threat: num(a.player_threat?.score, 1.2),
      fire: num(a.fire_now?.noul, 0.5),
      move: MOVE_TARGETS[a.best_move?.choice] ? a.best_move.choice : 'hold_and_aim',
      taunt: TAUNT_LINES[a.taunt?.choice] ? a.taunt.choice : 'calm_stare',
    };
    this.latency = latencyMs || 0;
    const line = TAUNT_LINES[this.judgments.taunt];
    this._pendingTaunt = line[(Math.random() * line.length) | 0];
  }

  /** TypeSafe decision table. Everything here is plain code, visible and testable. */
  _publishAction(state) {
    const j = this.judgments;
    const r = state.robot;
    const p = state.player;
    const a = this.action;

    // Narrow bands: Jev's noul values cluster near 0.5, so a wide band would
    // leave the robot frozen forever. Only a genuinely split decision hesitates.
    const unsettled = (j.fire > 0.44 && j.fire < 0.56 && j.threat > 1.35 && j.threat < 1.65)
      || j.taunt === 'glitched';
    a.confident = !unsettled;

    // movement: Jev proposes, code vetoes when it makes no sense
    let mode = MOVE_TARGETS[j.move] || 'hold';
    if (r.hp < 28 && mode === 'mirror') mode = 'break';
    if (r.ammo === 0 && mode !== 'hold') mode = 'break';
    // If the player is lined up on us, holding still is suicide.
    if (mode === 'hold' && j.aim > 0.68 && r.hp > 28) mode = p.x > 0 ? 'left' : 'right';
    if (unsettled) mode = 'hold'; // hesitation is part of the character
    a.moveMode = mode;

    // reload has priority over shooting
    a.reload = r.ammo === 0;
    // fire: calibrated probability + a geometrical sanity check
    const aimed = Math.abs(p.aimOffset) < 0.85 && Math.abs(p.aimHeight) < 0.75;
    const fireScore = j.fire * 0.62 + (j.aim > 0.62 ? 0.18 : 0) + Math.min(1, j.threat / 3) * 0.2;
    a.fire = !a.reload && state.alive && aimed && fireScore > 0.52;

    // accuracy: Jev's threat read plus simple geometry
    let acc = 0.50 + j.threat * 0.075 + (j.aim > 0.7 ? 0.12 : 0);
    acc -= Math.min(0.18, Math.abs(p.vx) * 0.045);
    acc -= state.distance > 11 ? 0.05 : 0;
    if (unsettled) acc -= 0.08;
    a.accuracy = Math.max(0.22, Math.min(0.82, acc));

    if (this._pendingTaunt) {
      a.taunt = this._pendingTaunt;
      this._pendingTaunt = null;
    } else {
      a.taunt = null;
    }
  }

  consumeTaunt() {
    const t = this.action.taunt;
    this.action.taunt = null;
    return t;
  }

  reset() {
    this.elapsed = 0;
    this.nextThink = 0.35;
    this.lastCall = -99;
    this.judgments = { aim: 0.5, threat: 1.2, fire: 0.5, move: 'hold_and_aim', taunt: 'calm_stare' };
    this._pendingTaunt = null;
    this.failures = 0;
  }
}

export { laneOf };
