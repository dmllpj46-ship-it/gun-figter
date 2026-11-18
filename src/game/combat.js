import * as THREE from 'three';
import { audio } from './audio.js';

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class Combat {
  constructor(scene, camera, player, robot, hud) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.robot = robot;
    this.hud = hud;
    this.raycaster = new THREE.Raycaster();
    this.tracers = [];
    this.sparks = [];
    this.petals = [];
    this.shake = 0;
    this.freeze = 0;
    this.onBotHit = null;
    this.onPlayerHit = null;
  }

  /** Player pulls the trigger. Returns 'head' | 'body' | 'miss' | null. */
  playerFire() {
    if (!this.player.fire()) return null;
    audio.shot();
    this.shake = Math.min(1, this.shake + 0.35);
    this.player.addRecoil(0.75);

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    this.raycaster.set(origin, dir);
    this.raycaster.far = 90;
    const hits = this.raycaster.intersectObjects(this.robot.hitMeshes, false);

    if (hits.length && this.robot.alive) {
      const hit = hits[0];
      const zone = hit.object.userData.zone;
      const damage = zone === 'head' ? 42 : 24;
      this.robot.hit(damage, zone);
      this.spawnSparks(hit.point, zone === 'head' ? 0xff5c6a : 0xffd166, 12);
      this.hud.showDamage(damage, zone === 'head', hit.point, this.camera);
      this.hud.hitmarker(zone === 'head');
      audio.impact(zone === 'head');
      this.freeze = 0.045;
      if (this.onBotHit) this.onBotHit(damage, zone);
      return zone;
    }

    // miss: put a puff where the ray crosses the floor
    if (dir.y < -0.001) {
      const dist = -origin.y / dir.y;
      if (dist > 0 && dist < 90) {
        const p = origin.clone().addScaledVector(dir, dist);
        if (Math.hypot(p.x, p.z) < 9.2) this.spawnSparks(p, 0x9fd4e8, 5);
      }
    }
    return 'miss';
  }

  /** Robot pulls the trigger; accuracy comes from the brain's decision. */
  botFire(accuracy = 0.62) {
    if (!this.robot.alive) return;
    this.robot.fire();
    audio.botShot();
    this.spawnTracer(this.robot.getMuzzlePosition(tmpV).clone(), this.player.getMuzzlePosition(tmpV2).clone(), 0xffb257);

    const hit = Math.random() < accuracy;
    if (hit) {
      const dmg = 12 + ((Math.random() * 6) | 0);
      this.player.hpCurrent = Math.max(0, (this.player.hpCurrent ?? 100) - dmg);
      this.player.takeDamage();
      this.shake = Math.min(1.4, this.shake + 0.8);
      audio.hurt();
      this.hud.playerHit(dmg);
      if (this.onPlayerHit) this.onPlayerHit(dmg);
    } else {
      // near miss: tracer still flies past, no damage
      this.shake = Math.min(0.6, this.shake + 0.2);
    }
  }

  spawnTracer(from, to, color = 0x58e8ff) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.11, max: 0.11 });
  }

  spawnSparks(pos, color = 0xffd166, count = 10) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.018 + Math.random() * 0.022, 5, 4),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3.4, (Math.random() - 0.5) * 4),
        life: 0.42 + Math.random() * 0.28,
        max: 0.7,
      });
    }
  }

  celebrate() {
    const colors = [0xff7fa8, 0xffd166, 0xf2f5ff, 0xb98cff, 0x58e8ff];
    for (let i = 0; i < 90; i++) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.07, 0.12),
        new THREE.MeshBasicMaterial({ color: colors[(Math.random() * colors.length) | 0], side: THREE.DoubleSide, transparent: true, depthWrite: false }),
      );
      mesh.position.set((Math.random() - 0.5) * 15, 8 + Math.random() * 6, (Math.random() - 0.5) * 14);
      this.scene.add(mesh);
      this.petals.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 1.4, -0.5 - Math.random(), (Math.random() - 0.5) * 1.4),
        spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        life: 7 + Math.random() * 3,
      });
    }
  }

  clearPetals() {
    this.petals.forEach(({ mesh }) => {
      this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
    });
    this.petals.length = 0;
  }

  update(dt) {
    this.shake = THREE.MathUtils.damp(this.shake, 0, 8, dt);
    if (this.shake > 0.002) {
      const s = this.shake * 0.008;
      this.camera.rotation.z = Math.sin(performance.now() * 0.07) * s;
      this.camera.position.x += Math.sin(performance.now() * 0.11) * s;
      this.camera.position.y += Math.cos(performance.now() * 0.09) * s;
    } else {
      this.camera.rotation.z = 0;
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / t.max) * 0.92;
      if (t.life <= 0) {
        this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vel.y -= 11 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.material.opacity = Math.max(0, s.life / s.max);
      if (s.life <= 0) {
        this.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
    for (let i = this.petals.length - 1; i >= 0; i--) {
      const p = this.petals[i];
      p.life -= dt;
      p.vel.y -= 1.4 * dt;
      p.vel.x += Math.sin(p.life * 3 + i) * 0.6 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.z += p.spin.z * dt;
      if (p.life <= 0 || p.mesh.position.y < 0) {
        this.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose();
        this.petals.splice(i, 1);
      }
    }
  }
}
