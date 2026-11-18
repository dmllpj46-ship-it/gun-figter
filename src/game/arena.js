import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CONFIG = {
  stageRadius: 9,
  audienceTiers: [
    { inner: 10.2, outer: 11.8, y: 0.55, count: 58 },
    { inner: 11.8, outer: 13.4, y: 1.25, count: 70 },
    { inner: 13.4, outer: 15.0, y: 1.95, count: 80 },
    { inner: 15.0, outer: 16.6, y: 2.65, count: 88 },
  ],
};

function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#111d2b';
  g.fillRect(0, 0, 1024, 1024);
  const cx = 512, cy = 512;

  // radial boards
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 512, a, a + Math.PI * 2 / 48);
    g.closePath();
    g.fillStyle = i % 2 ? '#132132' : '#162436';
    g.fill();
    g.strokeStyle = 'rgba(90,150,180,.10)';
    g.lineWidth = 2;
    g.stroke();
  }
  // concentric rings
  [0.26, 0.48, 0.70, 0.90].forEach((r, i) => {
    g.beginPath(); g.arc(cx, cy, 512 * r, 0, Math.PI * 2);
    g.strokeStyle = i === 2 ? 'rgba(88,232,255,.45)' : 'rgba(150,200,220,.16)';
    g.lineWidth = i === 2 ? 9 : 4; g.stroke();
  });
  // center mark
  g.beginPath(); g.arc(cx, cy, 68, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(255,178,87,.65)'; g.lineWidth = 8; g.stroke();
  g.font = 'bold 44px monospace'; g.fillStyle = 'rgba(255,178,87,.5)';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('07', cx, cy);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeScreenTexture(title, sub) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#07111e'; g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 8) {
    g.fillStyle = `rgba(88,232,255,${0.015 + (y % 16 ? 0 : 0.02)})`;
    g.fillRect(0, y, 512, 4);
  }
  g.strokeStyle = 'rgba(88,232,255,.5)'; g.lineWidth = 4;
  g.strokeRect(12, 12, 488, 232);
  g.textAlign = 'center';
  g.fillStyle = '#58e8ff';
  g.font = 'bold 96px sans-serif';
  g.fillText(title, 256, 130);
  g.fillStyle = '#ffb257';
  g.font = 'bold 28px monospace';
  g.fillText(sub, 256, 190);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A merged low-poly spectator, origin at feet. */
function spectatorGeometry() {
  const body = new THREE.CylinderGeometry(0.19, 0.28, 0.72, 6);
  body.translate(0, 0.72, 0);
  const head = new THREE.SphereGeometry(0.17, 7, 5);
  head.translate(0, 1.32, 0);
  const arms = new THREE.CylinderGeometry(0.055, 0.055, 0.55, 5);
  const la = arms.clone(); la.rotateZ(0.35); la.translate(-0.26, 0.85, 0);
  const ra = arms.clone(); ra.rotateZ(-0.35); ra.translate(0.26, 0.85, 0);
  const merged = mergeGeometries([body, head, la, ra], false);
  merged.computeVertexNormals();
  return merged;
}

/** Stem with leaves — rendered in green, matching every flower placement. */
function flowerStemGeometry() {
  const stem = new THREE.CylinderGeometry(0.016, 0.024, 0.36, 5);
  stem.translate(0, 0.18, 0);
  const parts = [stem];
  [-1, 1].forEach((side) => {
    const leaf = new THREE.SphereGeometry(1, 6, 4);
    leaf.scale(0.075, 0.02, 0.035);
    leaf.rotateZ(side * 0.35);
    leaf.translate(side * 0.07, 0.19, 0);
    parts.push(leaf);
  });
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  return merged;
}

/** Bloom: five rounded petals around a raised centre. */
function flowerBloomGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(1, 7, 5);
    petal.scale(0.072, 0.042, 0.105);
    petal.rotateY(-a);
    petal.translate(Math.sin(a) * 0.085, 0.42, Math.cos(a) * 0.085);
    parts.push(petal);
  }
  const centre = new THREE.SphereGeometry(0.056, 8, 6);
  centre.translate(0, 0.445, 0);
  parts.push(centre);
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  return merged;
}

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.spectators = [];
    this.pulseLights = [];
    this.time = 0;
    this._build();
  }

  _build() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x050a12);
    scene.fog = new THREE.FogExp2(0x050a12, 0.017);

    scene.add(new THREE.HemisphereLight(0x7fb8d8, 0x0a1018, 0.85));

    const key = new THREE.SpotLight(0xdff3ff, 900, 46, Math.PI / 5.2, 0.55, 1.7);
    key.position.set(0, 18, 10);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2; key.shadow.camera.far = 42;
    key.shadow.bias = -0.0006;
    scene.add(key, key.target);

    const fill = new THREE.SpotLight(0x58e8ff, 520, 44, Math.PI / 4.6, 0.7, 1.7);
    fill.position.set(-11, 14, -12);
    fill.target.position.set(0, 0, -4);
    scene.add(fill, fill.target);

    const warm = new THREE.SpotLight(0xffa860, 420, 40, Math.PI / 5, 0.75, 1.7);
    warm.position.set(12, 13, -10);
    warm.target.position.set(2, 0, -3);
    scene.add(warm, warm.target);

    // ---- stage ----
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(CONFIG.stageRadius, 96),
      new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.78, metalness: 0.12 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(CONFIG.stageRadius + 0.5, CONFIG.stageRadius + 1.1, 1.2, 96),
      new THREE.MeshStandardMaterial({ color: 0x0b1624, roughness: 0.6, metalness: 0.55 }),
    );
    base.position.y = -0.62;
    base.receiveShadow = true;
    scene.add(base);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(CONFIG.stageRadius + 0.06, 0.12, 8, 96),
      new THREE.MeshStandardMaterial({ color: 0x58e8ff, emissive: 0x58e8ff, emissiveIntensity: 2.4, roughness: 0.3 }),
    );
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.09;
    scene.add(rim);
    this.rim = rim;

    // LED blocks around the stage edge
    const ledGeo = new THREE.BoxGeometry(0.42, 0.1, 0.18);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x1a3a4c, emissive: 0x2fbfe0, emissiveIntensity: 1.1 });
    const leds = new THREE.InstancedMesh(ledGeo, ledMat, 72);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const r = CONFIG.stageRadius + 0.42;
      m.makeRotationY(-a);
      m.setPosition(Math.sin(a) * r, 0.2, Math.cos(a) * r);
      leds.setMatrixAt(i, m);
    }
    scene.add(leds);

    // ---- stands + spectators ----
    const tierMat = new THREE.MeshStandardMaterial({ color: 0x101c2b, roughness: 0.9, metalness: 0.1 });
    const tierEdgeMat = new THREE.MeshStandardMaterial({ color: 0x1b3145, emissive: 0x123c52, emissiveIntensity: 0.6, roughness: 0.7 });
    CONFIG.audienceTiers.forEach((t) => {
      const top = new THREE.Mesh(new THREE.RingGeometry(t.inner, t.outer, 72), tierMat);
      top.rotation.x = -Math.PI / 2; top.position.y = t.y;
      top.receiveShadow = true;
      scene.add(top);

      const side = new THREE.Mesh(
        new THREE.CylinderGeometry(t.outer, t.outer, t.y, 72, 1, true),
        tierMat,
      );
      side.position.y = t.y / 2;
      scene.add(side);

      const edge = new THREE.Mesh(new THREE.TorusGeometry(t.inner, 0.045, 6, 72), tierEdgeMat);
      edge.rotation.x = -Math.PI / 2; edge.position.y = t.y + 0.02;
      scene.add(edge);
    });

    const totalAudience = CONFIG.audienceTiers.reduce((s, t) => s + t.count, 0);
    const crowd = new THREE.InstancedMesh(
      spectatorGeometry(),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.02 }),
      totalAudience,
    );
    crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.Color();
    const palette = [0x4f6f92, 0x8b5b7a, 0x5d8b7a, 0x9a8058, 0x6d6fa0, 0x3f6677, 0xa35f5f];
    let idx = 0;
    CONFIG.audienceTiers.forEach((t, ti) => {
      for (let i = 0; i < t.count; i++) {
        const a = (i / t.count) * Math.PI * 2 + ti * 0.08 + (Math.random() - 0.5) * 0.02;
        const r = t.inner + 0.55 + Math.random() * (t.outer - t.inner - 1.0);
        this.spectators.push({
          x: Math.sin(a) * r, y: t.y, z: Math.cos(a) * r,
          phase: Math.random() * Math.PI * 2, speed: 1.4 + Math.random() * 2.2,
          amp: 0.05 + Math.random() * 0.11, sway: (Math.random() - 0.5) * 0.25,
        });
        color.setHex(palette[(Math.random() * palette.length) | 0]);
        crowd.setColorAt(idx++, color);
      }
    });
    crowd.castShadow = false;
    scene.add(crowd);
    this.crowd = crowd;

    // ---- flowers around the ring ----
    const flowerPalette = [0xff7fa8, 0xffd166, 0xf2f5ff, 0xb98cff, 0xff9f6e];
    const placements = [];
    const addFlower = (x, y, z, scale, rot, ci) => placements.push({ x, y, z, scale, rot, ci });

    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.35;
      const r = CONFIG.stageRadius - 0.5 - Math.random() * 1.4;
      addFlower(Math.sin(a) * r, 0.02, Math.cos(a) * r, 0.95 + Math.random() * 0.4, a, (Math.random() * 5) | 0);
    }
    // foreground bouquets: deliberately placed inside the camera's view
    const bouquets = [
      [-7.1, 2.2], [7.1, 2.2], [-6.3, -3.2], [6.3, -3.2],
      [-3.4, -6.4], [3.4, -6.4], [0, -7.3], [-1.2, -7.1], [1.2, -7.1],
    ];
    bouquets.forEach(([bx, bz], bi) => {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.45;
        addFlower(bx + Math.sin(a) * r, 0.02, bz + Math.cos(a) * r, 1.0 + Math.random() * 0.35, a, (bi + i) % 5);
      }
    });
    for (let i = 0; i < 20; i++) {
      const t = CONFIG.audienceTiers[i % CONFIG.audienceTiers.length];
      const a = (i / 20) * Math.PI * 2 + 0.2;
      const r = t.inner + 0.4;
      addFlower(Math.sin(a) * r, t.y, Math.cos(a) * r, 1.1, a, i % 5);
    }

    const stems = new THREE.InstancedMesh(
      flowerStemGeometry(),
      new THREE.MeshStandardMaterial({ color: 0x4d9b6a, roughness: 0.9, metalness: 0 }),
      placements.length,
    );
    const counts = new Array(flowerPalette.length).fill(0);
    const blooms = flowerPalette.map((hex, ci) => {
      const mesh = new THREE.InstancedMesh(
        flowerBloomGeometry(),
        new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, metalness: 0.02, emissive: hex, emissiveIntensity: 0.12, side: THREE.DoubleSide }),
        placements.filter((p) => p.ci === ci).length,
      );
      return { mesh, ci };
    });

    placements.forEach((f, i) => {
      const m = new THREE.Matrix4();
      m.makeRotationY(f.rot);
      m.scale(new THREE.Vector3(f.scale, f.scale, f.scale));
      m.setPosition(f.x, f.y, f.z);
      stems.setMatrixAt(i, m);
      const b = blooms.find((b) => b.ci === f.ci);
      b.mesh.setMatrixAt(counts[f.ci]++, m);
    });
    stems.instanceMatrix.needsUpdate = true;
    scene.add(stems);
    blooms.forEach(({ mesh, ci }) => {
      mesh.count = counts[ci];
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    });

    // ---- light truss ----
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x1b2733, metalness: 0.8, roughness: 0.42 });
    const bulbGeo = new THREE.SphereGeometry(0.13, 8, 6);
    const bulbMats = [
      new THREE.MeshStandardMaterial({ color: 0x58e8ff, emissive: 0x58e8ff, emissiveIntensity: 2.5 }),
      new THREE.MeshStandardMaterial({ color: 0xffb257, emissive: 0xffb257, emissiveIntensity: 2.2 }),
      new THREE.MeshStandardMaterial({ color: 0xff5c6a, emissive: 0xff5c6a, emissiveIntensity: 2.0 }),
    ];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = 9.8;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 9, 6), trussMat);
      pole.position.set(Math.sin(a) * r, 4.5, Math.cos(a) * r);
      scene.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMats[i % 3]);
      bulb.position.set(Math.sin(a) * r, 9.1, Math.cos(a) * r);
      scene.add(bulb);
      this.pulseLights.push(bulb);
    }

    // ---- big screens ----
    const screenMat = new THREE.MeshBasicMaterial({ map: makeScreenTexture('07', 'DUEL ARENA'), toneMapped: false });
    [[0, 11.5, -17.5, 0], [-17.4, 11, 0, Math.PI / 2], [17.4, 11, 0, -Math.PI / 2]].forEach(([x, y, z, ry]) => {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 3.6), screenMat);
      screen.position.set(x, y, z); screen.rotation.y = ry;
      scene.add(screen);
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(7.7, 4.1, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x152331, metalness: 0.7, roughness: 0.5 }),
      );
      frame.position.set(x, y, z - (z < 0 ? 0.12 : 0)); frame.rotation.y = ry;
      if (ry === 0) frame.position.z = z - 0.15;
      scene.add(frame);
    });

    // outer dark wall for depth
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(26, 26, 22, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x080e18, roughness: 1, side: THREE.BackSide }),
    );
    wall.position.y = 9;
    scene.add(wall);
  }

  /** Audience wave + light pulsing. */
  update(t) {
    this.time = t;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.spectators.length; i++) {
      const a = this.spectators[i];
      const jump = Math.max(0, Math.sin(t * a.speed + a.phase)) * a.amp;
      p.set(a.x, a.y + jump, a.z);
      q.setFromEuler(new THREE.Euler(0, a.sway, Math.sin(t * a.speed * 0.7 + a.phase) * 0.05));
      m.compose(p, q, s);
      this.crowd.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.pulseLights.length; i++) {
      const f = 1.6 + Math.sin(t * 4 + i * 1.7) * 0.9;
      this.pulseLights[i].material.emissiveIntensity = f;
    }
    this.rim.material.emissiveIntensity = 1.9 + Math.sin(t * 2.2) * 0.5;
  }
}

export const ARENA = CONFIG;
