import * as THREE from "three";
import type { Toy, ToyContext } from "../../core/toy";
import type { InputEvt } from "../../core/runtime";
import { radialShadowTexture, studioEnvironment } from "../../core/studio";
import type { FidgetSpec } from "./catalog";
import { FidgetModel, FractureModel, GrainModel } from "./model";
import { FidgetAudio } from "./audio";
function grainTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    img = ctx.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const n = 175 + ((i * 7919 + i * i * 13) % 80);
    img.data.set([n, n, n, 255], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
}
function bodyGeometry(s: FidgetSpec) {
  const g = new THREE.SphereGeometry(1, 40, 28),
    p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const theta = Math.atan2(z, x);
    if (s.shape === "foam") {
      x = Math.sign(x) * Math.pow(Math.abs(x), 0.5);
      y = Math.sign(y) * Math.pow(Math.abs(y), 0.5);
      z = Math.sign(z) * Math.pow(Math.abs(z), 0.5);
    }
    if (s.shape === "cream") {
      const l = 1 + 0.13 * Math.sin(theta * 7 + y * 6);
      x *= l * (1 - y * 0.18);
      z *= l * (1 - y * 0.18);
      y += 0.14 * Math.pow(Math.max(0, y), 4);
    }
    if (s.shape === "mango") {
      const r = 1 + 0.08 * Math.sin(theta * 3 + 0.7);
      x *= r;
      z *= r;
      y *= 1 - 0.2 * Math.abs(x);
    }
    if (s.shape === "apple") {
      const r = Math.sqrt(x * x + z * z);
      x *= 1 + 0.12 * Math.sin(y * 2);
      z *= 1 + 0.12 * Math.sin(y * 2);
      y -= 0.18 * Math.exp((-r * r) / 0.09) * Math.max(0, y);
    }
    p.setXYZ(i, x * s.width, Math.max(y, -0.8) * s.height, z * s.depth);
  }
  g.computeVertexNormals();
  return g;
}
export interface FidgetToy extends Toy {
  action(name: string): void;
}
export function createFidget(ctx: ToyContext, spec: FidgetSpec): FidgetToy {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xece7e0);
  scene.environment = studioEnvironment(ctx.renderer);
  scene.environmentIntensity = 0.8;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100),
    target = new THREE.Vector3(0, 0.7, 0);
  const light = new THREE.DirectionalLight(0xfff1dc, 2.4);
  light.position.set(-3, 5, 3);
  scene.add(light, new THREE.HemisphereLight(0xfff8ea, 0xa59ba6, 0.8));
  const model = new FidgetModel(spec),
    sound = new FidgetAudio(ctx.audio, spec);
  const material = new THREE.MeshPhysicalMaterial({
    color: spec.family === "wax" ? spec.inner : spec.color,
    roughness: spec.roughness,
    metalness: 0,
    clearcoat: spec.roughness < 0.5 ? 0.65 : 0.05,
    clearcoatRoughness: 0.18,
    transparent: spec.opacity < 1,
    opacity: spec.opacity,
    depthWrite: spec.opacity >= 0.9,
    side: THREE.DoubleSide,
  });
  if (["foam", "cream", "mochi"].includes(spec.shape)) {
    material.bumpMap = grainTexture();
    material.bumpScale = spec.shape === "foam" ? 0.045 : 0.012;
  }
  const geometry = bodyGeometry(spec);
  if (spec.family === "wax") geometry.scale(0.88, 0.88, 0.88);
  const base = Float32Array.from(geometry.getAttribute("position").array),
    blob = new THREE.Mesh(geometry, material);
  blob.position.y = spec.height * 0.84;
  blob.frustumCulled = false;
  scene.add(blob);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 5),
    new THREE.MeshBasicMaterial({
      map: radialShadowTexture(0.7, 0.4),
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);
  const ray = new THREE.Raycaster(),
    plane = new THREE.Plane(),
    anchors = new Map<number, THREE.Vector3>(),
    tmp = new THREE.Vector3(),
    p0 = new THREE.Vector3();
  const ndc = (x: number, y: number) => {
    const { w, h } = ctx.size();
    return new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2);
  };
  let frames = 0,
    active = false,
    crunchClock = 0,
    bubbleClock = 0,
    pops = 0,
    compressClock = 0,
    grainMotion = 0,
    coreTouches = 0;
  let shell: THREE.Mesh<
      THREE.BufferGeometry,
      THREE.MeshPhysicalMaterial
    > | null = null,
    fracture: FractureModel | null = null,
    shellBase: Float32Array | null = null;
  const shards: {
      offset: THREE.Vector3;
      velocity: THREE.Vector3;
      spin: number;
    }[] = [],
    centers: THREE.Vector3[] = [];
  if (spec.family === "wax") {
    const g = new THREE.IcosahedronGeometry(1, spec.shape === "apple" ? 3 : 1),
      a = g.getAttribute("position");
    for (let i = 0; i < a.count; i++)
      a.setXYZ(
        i,
        a.getX(i) * spec.width * 1.035,
        a.getY(i) * spec.height * 1.035,
        a.getZ(i) * spec.depth * 1.035,
      );
    for (let i = 0; i < a.count; i += 3) {
      const c = new THREE.Vector3();
      for (let j = 0; j < 3; j++)
        c.add(new THREE.Vector3(a.getX(i + j), a.getY(i + j), a.getZ(i + j)));
      c.multiplyScalar(1 / 3);
      centers.push(c);
      shards.push({
        offset: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        spin: 0,
      });
    }
    shellBase = Float32Array.from(a.array);
    fracture = new FractureModel(centers, spec.shape === "chocolate");
    shell = new THREE.Mesh(
      g,
      new THREE.MeshPhysicalMaterial({
        color: spec.color,
        roughness: spec.roughness,
        clearcoat: spec.shape === "apple" ? 0.75 : 0.1,
        side: THREE.DoubleSide,
      }),
    );
    shell.position.copy(blob.position);
    shell.frustumCulled = false;
    scene.add(shell);
    if (spec.shape === "apple") {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.07, 0.26, 8),
        new THREE.MeshStandardMaterial({ color: 0x65503c }),
      );
      stem.position.set(0, blob.position.y + spec.height, 0.02);
      stem.rotation.z = -0.2;
      scene.add(stem);
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 8),
        new THREE.MeshStandardMaterial({ color: 0x426b32, roughness: 0.65 }),
      );
      leaf.scale.set(0.3, 0.025, 0.12);
      leaf.position.set(0.21, stem.position.y + 0.06, 0.01);
      leaf.rotation.z = 0.3;
      scene.add(leaf);
    }
  }
  const grains =
    spec.family === "particles" ? new GrainModel(spec.shape === "soap") : null;
  let grainMesh: THREE.InstancedMesh | null = null;
  const matrix = new THREE.Object3D();
  if (grains) {
    grainMesh = new THREE.InstancedMesh(
      spec.shape === "soap"
        ? new THREE.BoxGeometry(0.19, 0.13, 0.23)
        : new THREE.SphereGeometry(0.065, 8, 6),
      new THREE.MeshPhysicalMaterial({
        roughness: spec.shape === "soap" ? 0.75 : 0.2,
        clearcoat: 0.25,
      }),
      grains.grains.length * 4,
    );
    grainMesh.count = grains.grains.length;
    grainMesh.position.copy(blob.position);
    grainMesh.frustumCulled = false;
    scene.add(grainMesh);
    for (let i = 0; i < grains.grains.length * 4; i++)
      grainMesh.setColorAt(
        i,
        new THREE.Color([spec.inner, 0xf5e9d0, 0xc5abd5, 0x94c9c1][i % 4]),
      );
    grainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const bubbles: THREE.Mesh[] = [];
  if (spec.shape === "ball" || spec.shape === "mango")
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 + (i % 3) * 0.015, 10, 6),
        new THREE.MeshPhysicalMaterial({
          color: 0xfff1d5,
          transparent: true,
          opacity: 0.42,
          roughness: 0.1,
        }),
      );
      b.position.set(
        Math.sin(i * 2.4) * 0.6,
        blob.position.y + ((i % 3) - 0.8) * 0.3,
        Math.cos(i * 2.4) * 0.6,
      );
      scene.add(b);
      bubbles.push(b);
    }
  let fitDistance = 5.8;
  const positionCamera = () => {
    const zoom = spec.family === "viscous" ? Math.max(1, model.stretch.x * .75) : 1;
    camera.position.copy(target).addScaledVector(new THREE.Vector3(0, 1.25, 2).normalize(), fitDistance * zoom);
    camera.lookAt(target); camera.updateMatrixWorld();
  };
  const resize = (w: number, h: number) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dist = Math.max(
      5.8,
      (spec.width * 1.3) /
        (Math.tan(THREE.MathUtils.degToRad(17)) * camera.aspect * 0.85),
    );
    fitDistance = dist;
    positionCamera();
  };
  const hit = (x: number, y: number) => {
    ray.setFromCamera(ndc(x, y), camera);
    blob.updateMatrixWorld();
    shell?.updateMatrixWorld();
    for (const h of ray.intersectObjects(
      shell ? [shell, blob] : [blob],
      false,
    )) {
      if (h.object === shell && fracture && fracture.broken[h.faceIndex ?? 0])
        continue;
      return h;
    }
    return null;
  };
  const inputImmediate = (e: InputEvt, _raw: Event) => {
    if (e.kind === "down") {
      const h = hit(e.x, e.y);
      if (!h) return;
      const local = h.point.clone().sub(blob.position),
        normal = (h.face?.normal ?? local.clone().normalize()).clone();
      if (!model.press(e.id, local, normal)) return;
      anchors.set(e.id, h.point.clone());
      if (spec.family === "wax" && h.object === blob) coreTouches++;
      sound.play(
        spec.family === "wax"
          ? h.object === blob
            ? "knead"
            : "press"
          : "press",
        0.4,
      );
      ctx.haptic(7);
      compressClock = 0;
    } else if (e.kind === "move") {
      const a = anchors.get(e.id);
      if (!a) return;
      ray.setFromCamera(ndc(e.x, e.y), camera);
      plane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(tmp).negate(),
        a,
      );
      const h = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (h) model.drag(e.id, h.sub(a));
    } else {
      if (!anchors.has(e.id)) return;
      model.release(e.id);
      anchors.delete(e.id);
      if (e.kind === "up") sound.play("release", model.compression);
      ctx.requestFrame();
    }
  };
  const reset = () => {
    model.reset();
    fracture?.reset();
    grains?.reset();
    for (const s of shards) {
      s.offset.set(0, 0, 0);
      s.velocity.set(0, 0, 0);
      s.spin = 0;
    }
    anchors.clear();
    sound.stop();
    for (const b of bubbles) b.visible = true;
    compressClock = 0;
    bubbleClock = 0;
    pops = 0;
    coreTouches = 0;
    ctx.requestFrame();
  };
  const frame = (dt: number) => {
    frames++;
    let moving = model.step(dt);
    if (spec.family === "viscous") positionCamera();
    const held = model.held,
      a = geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      p0.fromArray(base, i * 3);
      model.deform(p0, tmp);
      a.setXYZ(i, tmp.x, tmp.y, tmp.z);
    }
    a.needsUpdate = true;
    if (frames % 2 === 0) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    if (held.length) {
      compressClock += dt;
      if (compressClock > 0.28) {
        if (spec.family !== "wax") sound.play("compress", model.compression);
        else if (fracture && fracture.brokenCount > 0)
          sound.play("knead", model.compression);
        compressClock = -0.6;
      }
    }
    if (fracture && shell && shellBase) {
      const before = fracture.crackEvents,
        broken = fracture.step(dt, held);
      if (fracture.crackEvents > before || broken.length) {
        sound.play("crack", Math.min(1, 0.4 + broken.length * 0.1));
        ctx.haptic(12);
      }
      for (const i of broken) {
        const c = centers[i];
        shards[i].velocity.set(c.x * 0.6, 0.8 + (i % 3) * 0.15, c.z * 0.7);
        shards[i].spin = (i % 2 ? 1 : -1) * 0.1;
      }
      const a = shell.geometry.getAttribute(
        "position",
      ) as THREE.BufferAttribute;
      for (let i = 0; i < centers.length; i++) {
        const state = shards[i],
          c = centers[i],
          dam = fracture.damage[i];
        if (fracture.broken[i]) {
          if (c.y + state.offset.y + shell.position.y > 0.07) {
            state.velocity.y -= dt * 4;
            state.offset.addScaledVector(state.velocity, dt);
            moving = true;
          } else {
            state.offset.y = 0.07 - shell.position.y - c.y;
            state.velocity.multiplyScalar(0.8);
          }
        }
        for (let j = 0; j < 3; j++) {
          const k = i * 3 + j;
          p0.fromArray(shellBase, k * 3);
          p0.sub(c).multiplyScalar(
            fracture.broken[i] ? 0.84 : 1 - Math.max(0, dam - 0.12) * 0.1,
          );
          if (fracture.broken[i])
            p0.applyAxisAngle(tmp.set(0, 1, 0), state.spin * model.time * 2);
          p0.add(c).add(state.offset);
          a.setXYZ(k, p0.x, p0.y, p0.z);
        }
      }
      a.needsUpdate = true;
      shell.geometry.computeVertexNormals();
      shell.geometry.computeBoundingSphere();
      if (held.length) moving = true;
    }
    if (grains && grainMesh) {
      const events = grains.step(dt, model);
      crunchClock -= dt;
      if (events && crunchClock <= 0 && held.length) {
        sound.play("crunch", Math.min(1, events * 0.1));
        crunchClock = spec.shape === "soap" ? 0.1 : 0.075;
      }
      let count = grains.grains.length;
      grainMotion = 0;
      grains.grains.forEach((g, i) => {
        matrix.position.copy(g.pos);
        matrix.rotation.set(
          i * 0.7 + g.velocity.x,
          i * 0.3,
          i * 0.4 + g.velocity.z,
        );
        matrix.scale.setScalar(
          spec.shape === "soap" && g.integrity <= 0 ? 0.4 : 1,
        );
        matrix.updateMatrix();
        grainMesh!.setMatrixAt(i, matrix.matrix);
        grainMotion += g.velocity.lengthSq();
        if (spec.shape === "soap" && g.integrity <= 0)
          for (let j = 0; j < 3; j++) {
            matrix.position
              .copy(g.pos)
              .add(
                tmp.set(
                  Math.sin(i + j) * 0.13,
                  -0.09,
                  Math.cos(i * 2 + j) * 0.13,
                ),
              );
            matrix.scale.setScalar(0.28);
            matrix.updateMatrix();
            grainMesh!.setMatrixAt(count, matrix.matrix);
            count++;
          }
      });
      grainMesh.count = count;
      grainMesh.instanceMatrix.needsUpdate = true;
      moving = moving || grainMotion > 0.0001;
    }
    if (spec.shape === "mango" && held.length) {
      bubbleClock += dt;
      if (bubbleClock > 0.65) {
        pops++;
        sound.play("bubble", 0.5);
        bubbles[pops % bubbles.length].visible = false;
        bubbleClock = 0;
      }
    }
    for (const b of bubbles)
      if (spec.shape !== "mango" || bubbleClock > 0.25) b.visible = true;
    for (const e of model.events.splice(0))
      if (e === "fold") sound.play("fold", 0.7);
    sound.continuous(
      spec.family === "viscous" && held.length > 1
        ? Math.min(
            0.45,
            Math.abs(model.stretch.target - model.stretch.x) * 0.5 +
              model.motion * 0.12,
          )
        : 0,
      held.length ? model.motion * 0.07 : 0,
    );
    return active && (moving || held.length > 0);
  };
  return {
    id: spec.id,
    scene,
    camera,
    resize,
    inputImmediate,
    frame,
    reset,
    action(name) {
      if (name === "fold") model.foldNow();
      if (name === "gather") model.gather();
      ctx.requestFrame();
    },
    enter() {
      active = true;
      sound.enter();
      ctx.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      ctx.requestFrame();
    },
    leave() {
      active = false;
      sound.leave();
      for (const c of model.held) model.release(c.id);
      anchors.clear();
    },
    stats() {
      return {
        toy: spec.id,
        compression: model.compression.toFixed(3),
        stretch: model.stretch.x.toFixed(2),
        folds: model.foldCount,
        broken: fracture?.brokenCount ?? 0,
        crushed: grains?.crushed ?? 0,
        audio: sound.state,
      };
    },
    report() {
      return {
        id: spec.id,
        family: spec.family,
        shape: spec.shape,
        contacts: model.held.length,
        compression: model.compression,
        peakCompression: model.peakCompression,
        stretch: model.stretch.x,
        folds: model.foldCount,
        brokenFaces: fracture?.brokenCount ?? 0,
        crackEvents: fracture?.crackEvents ?? 0,
        totalFaces: centers.length,
        crushedParticles: grains?.crushed ?? 0,
        particleCollisions: grains?.collisions ?? 0,
        coreTouches,
        pops,
        audio: sound.state,
        vertices: geometry.getAttribute("position").count,
        visualStatus: "procedural-prototype",
        soundPlays: ctx.audio.playLogs
          .filter((l) => l.name.startsWith(`fg:${spec.id}:`))
          .slice(-20),
      };
    },
  };
}
