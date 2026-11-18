import * as THREE from 'three';

const CONFIG = {
  z: -4.0,
  minX: -6.3,
  maxX: 6.3,
  height: 2.05,
  scale: 1.12,
};

/** Cute-but-menacing arena robot. Every part is generated in code. */
export class Robot {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.position.set(0, 0, CONFIG.z);
    this.root.scale.setScalar(CONFIG.scale);
    scene.add(this.root);

    this.x = 0;
    this.targetX = 0;
    this.velocity = 0;
    this.hp = 100;
    this.alive = true;
    this.recoil = 0;
    this.fireT = 0;
    this.flashT = 0;
    this.aiming = false;
    this.hitFlash = 0;
    this.deathT = 0;
    this.lean = 0;
    this.aimOffset = 0;
    this.walkPhase = 0;
    this.headParts = new THREE.Group();
    this.hitMeshes = [];

    this._build();
  }

  _mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color, roughness: 0.42, metalness: 0.68, ...opts,
    });
  }

  _build() {
    const shell = this._mat(0xd9e7ee, { roughness: 0.34, metalness: 0.72 });
    const dark = this._mat(0x1a2b3a, { roughness: 0.5, metalness: 0.65 });
    const cyan = this._mat(0x58e8ff, { emissive: 0x58e8ff, emissiveIntensity: 2.2, roughness: 0.25 });
    this.cyanMat = cyan;
    const amber = this._mat(0xffb257, { emissive: 0xffb257, emissiveIntensity: 1.8, roughness: 0.3 });
    this.flashMats = [shell];
    this.baseShellColor = new THREE.Color(0xd9e7ee);

    // legs
    this.legs = [];
    [-1, 1].forEach((side) => {
      const leg = new THREE.Group();
      leg.position.set(side * 0.24, 0.72, 0);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.28, 3, 8), shell);
      thigh.position.y = -0.2; thigh.castShadow = true; leg.add(thigh);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), dark);
      knee.position.y = -0.42; leg.add(knee);
      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.24, 3, 8), shell);
      shin.position.y = -0.6; shin.castShadow = true; leg.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.4), dark);
      foot.position.set(0, -0.7, 0.1); foot.castShadow = true; leg.add(foot);
      this.root.add(leg);
      this.legs.push(leg);
    });

    // torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.34, 5, 12), shell);
    torso.position.y = 1.16; torso.scale.z = 0.82; torso.castShadow = true;
    this.root.add(torso);
    this.torso = torso;

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.24, 0.08), dark);
    chest.position.set(0, 1.22, 0.31); this.root.add(chest);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 16), cyan);
    core.rotation.x = Math.PI / 2; core.position.set(0, 1.22, 0.36); this.root.add(core);
    this.core = core;

    // belt
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 16), dark);
    belt.position.y = 0.83; this.root.add(belt);

    // arms
    this.arms = [];
    [-1, 1].forEach((side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.42, 1.42, 0);
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), cyan);
      shoulder.material = this._mat(0x58e8ff, { emissive: 0x58e8ff, emissiveIntensity: 1.2 });
      arm.add(shoulder);
      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.24, 3, 8), shell);
      upper.position.set(side * 0.06, -0.24, 0); upper.castShadow = true; arm.add(upper);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), dark);
      elbow.position.set(side * 0.07, -0.42, 0); arm.add(elbow);
      const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.2, 3, 8), shell);
      lower.position.set(side * 0.08, -0.58, 0.05); lower.castShadow = true; arm.add(lower);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), dark);
      hand.position.set(side * 0.09, -0.72, 0.08); arm.add(hand);
      this.root.add(arm);
      this.arms.push(arm);
    });

    // gun, held at hand height and pointing toward the player (+z)
    this.gun = new THREE.Group();
    this.gun.position.set(0.51, 1.46, 0.52);
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.16, 0.42), dark);
    gunBody.position.z = 0.16; this.gun.add(gunBody);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 10), dark);
    barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.45; this.gun.add(barrel);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.2), amber);
    glow.position.set(0, 0.09, 0.16); this.gun.add(glow);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0, 0.6);
    this.gun.add(this.muzzle);
    this.muzzleFlash = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc266, toneMapped: false }),
    );
    this.muzzleFlash.renderOrder = 10;
    this.muzzleFlash.position.set(0, 0, 0.95);
    this.gun.add(this.muzzleFlash);
    this.root.add(this.gun);

    // head: big, friendly, glowing eyes
    this.headParts.position.y = 1.82;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), shell);
    head.scale.set(1, 0.95, 0.92); head.castShadow = true; this.headParts.add(head);
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0.72, 0.9),
      this._mat(0x0b1a26, { roughness: 0.18, metalness: 0.85 }),
    );
    visor.position.z = 0.075; visor.scale.z = 0.72; this.headParts.add(visor);
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), cyan);
      eye.position.set(side * 0.125, 0.02, 0.28);
      eye.scale.z = 0.55;
      this.headParts.add(eye);
      if (side === 1) this.rightEye = eye;
    });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.02), amber);
    mouth.position.set(0, -0.16, 0.29); this.headParts.add(mouth);
    this.mouth = mouth;

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.3, 6), dark);
    antenna.position.set(0.15, 0.4, -0.04); this.headParts.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), amber);
    tip.position.set(0.15, 0.56, -0.04); this.headParts.add(tip);
    this.antennaTip = tip;
    // ears
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), cyan);
      ear.scale.set(0.55, 1, 0.7);
      ear.position.set(side * 0.36, 0.03, 0);
      this.headParts.add(ear);
    });
    this.root.add(this.headParts);

    // invisible hit proxies (transparent but raycastable)
    const proxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const headProxy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), proxyMat);
    headProxy.position.set(0, 1.84, 0); headProxy.userData.zone = 'head';
    this.root.add(headProxy);
    const bodyProxy = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.92, 0.62), proxyMat);
    bodyProxy.position.set(0, 1.16, 0); bodyProxy.userData.zone = 'body';
    this.root.add(bodyProxy);
    this.hitMeshes = [headProxy, bodyProxy];
  }

  /** The AI is only allowed to move along x. */
  setMoveTarget(x) {
    this.targetX = THREE.MathUtils.clamp(x, CONFIG.minX, CONFIG.maxX);
  }

  /** Slow aim tracking, used for the robot's body orientation. */
  aimAt(playerX) {
    // robot faces +z; turning slightly toward the player's lane
    this.aimOffset = THREE.MathUtils.clamp((this.x - playerX) * 0.045, -0.32, 0.32);
  }

  getMuzzlePosition(out = new THREE.Vector3()) {
    return this.muzzle.getWorldPosition(out);
  }

  fire() {
    if (!this.alive) return;
    this.recoil = 1;
    this.fireT = 0.3;
    this.flashT = 0.16; // long enough to actually be seen at 60fps
    this.mouth.scale.y = 2.2;
  }

  /** Called while the robot is winding up a shot, so the player can read the tell. */
  setAiming(on) { this.aiming = on; }

  hit(damage, zone) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - damage);
    this.hitFlash = 1;
    this.lean += (Math.random() - 0.5) * 0.3;
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.deathT = 0.0001;
    this.targetX = this.x;
  }

  reset() {
    this.x = 0; this.targetX = 0; this.velocity = 0;
    this.hp = 100; this.alive = true;
    this.recoil = 0; this.hitFlash = 0; this.deathT = 0;
    this.fireT = 0; this.flashT = 0; this.aiming = false;
    this.lean = 0; this.walkPhase = 0;
    this.root.position.set(0, 0, CONFIG.z);
    this.root.scale.setScalar(CONFIG.scale);
    this.root.rotation.set(0, 0, 0);
    this.headParts.rotation.set(0, 0, 0);
    this.headParts.position.y = 1.82;
    this.arms.forEach((arm) => arm.rotation.set(-Math.PI / 2 - 0.16, 0, 0));
    this.gun.rotation.set(0, 0, 0);
    this.gun.position.set(0.51, 1.46, 0.52);
    this.aimBlend = 0;
    this.muzzleFlash.visible = false;
    this.core.material.emissiveIntensity = 2.2;
    this.cyanMat.emissiveIntensity = 2.2;
    shellReset(this);
  }

  update(dt, t) {
    // movement with acceleration and clamping
    const diff = this.targetX - this.x;
    const accel = Math.abs(diff) > 0.12 ? 12 : 7;
    const desired = THREE.MathUtils.clamp(diff * 3.2, -2.5, 2.5);
    this.velocity = THREE.MathUtils.damp(this.velocity, desired, accel, dt);
    this.x = THREE.MathUtils.clamp(this.x + this.velocity * dt, CONFIG.minX, CONFIG.maxX);
    this.root.position.x = this.x;
    this.walkPhase += Math.abs(this.velocity) * dt * 5.5;

    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 9, dt);
    this.fireT = Math.max(0, this.fireT - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.aimBlend = THREE.MathUtils.damp(this.aimBlend || 0, this.aiming ? 1 : 0, 16, dt);
    const kick = this.fireT / 0.3; // 1 immediately after a shot, decays to 0
    const aim = this.aimBlend;
    this.hitFlash = THREE.MathUtils.damp(this.hitFlash, 0, 7, dt);
    this.lean = THREE.MathUtils.damp(this.lean, 0, 5, dt);
    this.mouth.scale.y = THREE.MathUtils.damp(this.mouth.scale.y, 1, 8, dt);

    if (!this.alive) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.8);
      const e = 1 - Math.pow(1 - k, 3);
      this.root.rotation.x = -e * 1.42;
      this.root.rotation.z = e * 0.25;
      this.root.position.y = -e * 0.32;
      this.headParts.rotation.z = e * 0.4;
      this.core.material.emissiveIntensity = 2.2 * (1 - e) + Math.max(0, Math.sin(this.deathT * 18)) * 0.4;
      return;
    }

    // idle breathing and walk swing
    const bob = Math.sin(t * 2.3) * 0.018 + Math.abs(Math.sin(this.walkPhase)) * 0.035;
    this.headParts.position.y = 1.82 + bob;
    this.headParts.rotation.z = Math.sin(t * 1.6) * 0.035 + this.lean;
    this.headParts.rotation.y = THREE.MathUtils.damp(this.headParts.rotation.y, this.aimOffset, 4, dt);
    this.headParts.rotation.x = -kick * 0.14 + aim * 0.03;
    this.torso.position.y = 1.16 + bob * 0.4;

    this.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.walkPhase + i * Math.PI) * Math.min(0.45, Math.abs(this.velocity) * 0.22);
    });
    this.arms.forEach((arm, i) => {
      const base = -Math.PI / 2 - 0.16;
      const swing = Math.sin(this.walkPhase + i * Math.PI) * Math.min(0.16, Math.abs(this.velocity) * 0.08);
      // The gun arm snaps back on recoil; both arms settle into an aim pose first.
      const firePose = i === 1 ? -kick * 0.62 - aim * 0.16 : kick * 0.12 - aim * 0.1;
      arm.rotation.x = THREE.MathUtils.damp(arm.rotation.x, base + swing + firePose, 18, dt);
      arm.rotation.z = THREE.MathUtils.damp(arm.rotation.z, i === 1 ? -aim * 0.12 : aim * 0.12, 14, dt);
    });
    this.gun.rotation.x = -kick * 0.45 - aim * 0.05;
    this.gun.rotation.y = this.aimOffset * 0.6;
    this.gun.position.z = 0.52 - kick * 0.2;
    this.gun.position.y = 1.46 + aim * 0.05 - kick * 0.04;
    this.muzzleFlash.visible = this.flashT > 0;
    this.muzzleFlash.scale.setScalar(0.85 + Math.random() * 0.45);
    // Eyes, ears and chest core flare on every shot — readable even at a distance.
    this.cyanMat.emissiveIntensity = 2.2 + kick * 4.5;
    this.antennaTip.scale.setScalar(1 + Math.sin(t * 5) * 0.18);

    // hit flash: whiten the shell
    const f = this.hitFlash;
    this.flashMats[0].color.copy(this.baseShellColor).lerp(new THREE.Color(0xffffff), f * 0.9);
    this.flashMats[0].emissive.setHex(0xff5c6a);
    this.flashMats[0].emissiveIntensity = f * 1.6;
  }
}

function shellReset(robot) {
  robot.flashMats[0].color.copy(robot.baseShellColor);
  robot.flashMats[0].emissive.setHex(0x000000);
  robot.flashMats[0].emissiveIntensity = 0;
}

export const ROBOT_CONFIG = CONFIG;
