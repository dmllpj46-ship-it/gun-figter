import * as THREE from 'three';

const CONFIG = {
  z: 4.6,
  minX: -6.3,
  maxX: 6.3,
  eyeHeight: 1.62,
  moveAccel: 15,
  moveDamp: 11,
  maxSpeed: 4.4,
  mouseSensitivity: 0.0021,
  yawLimit: 0.82,
  pitchLimit: 0.42,
  magazine: 7,
  reloadTime: 1.25,
  fireCooldown: 0.19,
};

/** First-person player. x-only movement, mouse aim, click to fire. */
export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.x = 0;
    this.velocity = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.recoil = 0;
    this.recoilYaw = 0;
    this.swayT = 0;
    this.ammo = CONFIG.magazine;
    this.reloading = 0;
    this.cooldown = 0;
    this.alive = true;
    this.shells = [];
    camera.rotation.order = 'YXZ';
    this._buildGun();
  }

  _buildGun() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2733, metalness: 0.88, roughness: 0.32 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x93aab9, metalness: 0.92, roughness: 0.24 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x14202b, metalness: 0.3, roughness: 0.78 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xffb257, emissive: 0xffb257, emissiveIntensity: 1.6 });

    const gun = new THREE.Group();
    gun.position.set(0.3, -0.29, -0.62);
    gun.rotation.set(0, 0.12, 0);
    gun.scale.setScalar(0.72);

    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.085, 0.34), metal);
    slide.position.set(0, 0.045, -0.14); gun.add(slide);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.07, 0.26), dark);
    frame.position.set(0, -0.01, -0.08); gun.add(frame);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.09, 12), dark);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.045, -0.33); gun.add(barrel);
    const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.2, 0.1), grip);
    gripMesh.position.set(0, -0.13, 0.005); gripMesh.rotation.x = -0.28; gun.add(gripMesh);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.009, 6, 12, Math.PI), metal);
    guard.rotation.set(Math.PI / 2, 0, 0); guard.position.set(0, -0.06, -0.12); gun.add(guard);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, 0.012), amber);
    sight.position.set(0, 0.098, -0.28); gun.add(sight);
    for (let i = 0; i < 4; i++) {
      const serration = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.007, 0.008), dark);
      serration.position.set(0, 0.089, -0.005 - i * 0.021);
      gun.add(serration);
    }

    // support hand
    const hand = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.048, 0.12, 3, 8),
      new THREE.MeshStandardMaterial({ color: 0x9a7a63, roughness: 0.9, metalness: 0.02 }),
    );
    hand.rotation.set(0.5, 0, -0.25); hand.position.set(-0.06, -0.14, -0.16); gun.add(hand);

    this.muzzleFlash = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.22, 7),
      new THREE.MeshBasicMaterial({ color: 0xffd88a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.muzzleFlash.rotation.x = -Math.PI / 2;
    this.muzzleFlash.position.set(0, 0.045, -0.45);
    gun.add(this.muzzleFlash);

    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.045, -0.38);
    gun.add(this.muzzle);

    this.camera.add(gun);
    this.scene.add(this.camera);
    this.gun = gun;
    this.gunRest = gun.position.clone();
    this.flashT = 0;
  }

  getMuzzlePosition(out = new THREE.Vector3()) {
    return this.muzzle.getWorldPosition(out);
  }

  onMouseMove(dx, dy) {
    if (!this.alive) return;
    this.yaw = THREE.MathUtils.clamp(this.yaw - dx * CONFIG.mouseSensitivity, -CONFIG.yawLimit, CONFIG.yawLimit);
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * CONFIG.mouseSensitivity, -CONFIG.pitchLimit, CONFIG.pitchLimit);
  }

  updateMovement(keys, dt) {
    if (!this.alive) return;
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const desired = dir * CONFIG.maxSpeed;
    this.velocity = THREE.MathUtils.damp(this.velocity, desired, dir ? CONFIG.moveAccel : CONFIG.moveDamp, dt);
    this.x = THREE.MathUtils.clamp(this.x + this.velocity * dt, CONFIG.minX, CONFIG.maxX);
    this.swayT += Math.abs(this.velocity) * dt * 7;
  }

  canFire() {
    return this.alive && this.cooldown <= 0 && this.reloading <= 0 && this.ammo > 0;
  }

  fire() {
    if (!this.canFire()) return false;
    this.ammo--;
    this.cooldown = CONFIG.fireCooldown;
    this.recoil = 1;
    this.recoilYaw += (Math.random() - 0.5) * 0.012;
    this.flashT = 0.055;
    this._spawnShell();
    return true;
  }

  startReload() {
    if (!this.alive || this.reloading > 0 || this.ammo >= CONFIG.magazine) return false;
    this.reloading = CONFIG.reloadTime;
    return true;
  }

  _spawnShell() {
    const geo = new THREE.CylinderGeometry(0.012, 0.012, 0.044, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    this.gun.localToWorld(mesh.position.set(0.07, 0, 0.05));
    mesh.quaternion.copy(this.camera.quaternion);
    this.scene.add(mesh);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.shells.push({
      mesh,
      vel: right.multiplyScalar(1.9 + Math.random()).add(new THREE.Vector3(0, 1.7, 1.2)),
      spin: new THREE.Vector3(Math.random() * 18, Math.random() * 18, Math.random() * 18),
      life: 1.6,
    });
  }

  addRecoil(amount = 1) {
    this.recoil = Math.max(this.recoil, amount);
    this.pitch = Math.min(CONFIG.pitchLimit, this.pitch + amount * 0.022);
  }

  takeDamage() { this.hitT = 0.35; }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { this.reloading = 0; this.ammo = CONFIG.magazine; }
    }
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 10, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 6, dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.hitT = Math.max(0, (this.hitT || 0) - dt);

    this.camera.position.set(
      this.x + Math.sin(this.swayT * 0.5) * 0.018 * Math.min(1, Math.abs(this.velocity)),
      CONFIG.eyeHeight + Math.sin(this.swayT) * 0.012 * Math.min(1, Math.abs(this.velocity)) - this.recoil * 0.012,
      CONFIG.z,
    );
    this.camera.rotation.y = this.yaw + this.recoilYaw + Math.sin(this.swayT * 0.5) * 0.006;
    this.camera.rotation.x = this.pitch + Math.sin(this.swayT) * 0.005;

    // gun kick + reload animation
    const reloadK = this.reloading > 0 ? Math.sin((1 - this.reloading / CONFIG.reloadTime) * Math.PI) : 0;
    this.gun.position.set(
      this.gunRest.x - Math.sin(this.swayT) * 0.012 + this.recoil * 0.012,
      this.gunRest.y + Math.sin(this.swayT * 1.1) * 0.011 - this.recoil * 0.022 - reloadK * 0.18,
      this.gunRest.z + this.recoil * 0.09,
    );
    this.gun.rotation.set(
      this.recoil * 0.28 + reloadK * 0.5,
      0.12 + reloadK * 0.35,
      -reloadK * 0.28,
    );
    this.muzzleFlash.material.opacity = this.flashT > 0 ? Math.min(1, this.flashT / 0.03) : 0;
    this.muzzleFlash.scale.setScalar(0.8 + Math.random() * 0.5);

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.vel.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.spin.x * dt;
      s.mesh.rotation.y += s.spin.y * dt;
      if (s.life <= 0 || s.mesh.position.y < -1.5) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose(); s.mesh.material.dispose();
        this.shells.splice(i, 1);
      }
    }
  }

  resetRound() {
    this.x = 0; this.velocity = 0; this.yaw = 0; this.pitch = 0;
    this.ammo = CONFIG.magazine; this.reloading = 0; this.cooldown = 0;
    this.recoil = 0; this.alive = true; this.hitT = 0;
  }
}

export const PLAYER_CONFIG = CONFIG;
