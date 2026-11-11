import * as THREE from "three";
import type { Toy, ToyContext } from "../../core/toy";
import type { InputEvt } from "../../core/runtime";
import { radialShadowTexture, studioEnvironment } from "../../core/studio";
import type { FidgetSpec } from "./catalog";
import { FidgetModel, FractureModel, GrainModel } from "./model";
import { FidgetAudio } from "./audio";
import {
  STAGES,
  surfaceTexture,
  bodyGeometry,
  shellPatches,
  sugarColor,
  sugarTexture,
} from "./visuals";
import { LOCAL_FIDGETS, referenceMesh } from "./references";
export interface FidgetToy extends Toy {
  action(name: string): void;
}
export function createFidget(ctx: ToyContext, spec: FidgetSpec): FidgetToy {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STAGES[spec.id]);
  scene.environment = studioEnvironment(ctx.renderer);
  scene.environmentIntensity = 0.48;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100),
    target = new THREE.Vector3(0, spec.height * 0.92, 0);
  const light = new THREE.DirectionalLight(0xfff8ef, 2.8);
  light.position.set(-3, 5, 3);
  scene.add(light, new THREE.HemisphereLight(0xfff8ea, 0xa9a1a3, 1.2));
  const model = new FidgetModel(spec),
    sound = new FidgetAudio(ctx.audio, spec);
  const material = new THREE.MeshPhysicalMaterial({
    color: spec.family === "wax" ? spec.inner : spec.color,
    roughness: spec.roughness,
    metalness: 0,
    clearcoat: spec.roughness < 0.5 ? 0.9 : 0.08,
    clearcoatRoughness: 0.12,
    transparent: spec.opacity < 1,
    opacity: spec.opacity,
    depthWrite: spec.opacity >= 0.9,
    sheen: spec.shape === "mochi" || spec.shape === "cream" ? 0.65 : 0,
    sheenColor: new THREE.Color(0xffe9d8),
    sheenRoughness: 0.8,
    side: THREE.DoubleSide,
  });
  if (spec.shape === "ball") {
    material.opacity = 1;
    material.transparent = false;
    material.transmission = 0.48;
    material.thickness = 0.8;
    material.ior = 1.34;
    material.roughness = 0.11;
    material.attenuationColor = new THREE.Color(0x5da98f);
    material.attenuationDistance = 2;
  }
  if (["foam", "cream", "mochi"].includes(spec.shape)) {
    material.bumpMap = surfaceTexture(spec.shape);
    material.bumpScale = spec.shape === "foam" ? 0.025 : 0.006;
  }
  let geometry: THREE.BufferGeometry = bodyGeometry(spec);
  if (spec.shape === "beads") {
    const a = geometry.getAttribute("position"),
      colors = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      const c = sugarColor(a.getX(i), a.getY(i), a.getZ(i));
      c.toArray(colors, i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const grit = sugarTexture();
    material.vertexColors = true;
    material.map = grit;
    material.bumpMap = null;
    material.bumpScale = 0;
    material.side = THREE.FrontSide;
    material.clearcoat = 0.05;
    material.roughness = 0.45;
    material.depthWrite = false;
  }

  if (spec.family === "wax") geometry.scale(0.88, 0.88, 0.88);
  let base = Float32Array.from(geometry.getAttribute("position").array);
  const blob = new THREE.Mesh(geometry, material);
  let visualSource = "reconstructed-material";
  blob.position.y = spec.height * 0.94;
  blob.frustumCulled = false;
  scene.add(blob);
  let softbox: THREE.Mesh | null = null;
  const softboxRest = new THREE.Vector3(-0.09, 0.45, 0.89)
    .normalize()
    .multiplyScalar(1.018);
  if (spec.shape === "beads") {
    const skin = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.42,
        envMap: scene.environment,
        envMapIntensity: 3,
        roughness: 0.025,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        ior: 1.38,
        depthWrite: false,
        side: THREE.FrontSide,
      }),
    );
    skin.position.copy(blob.position);
    skin.scale.setScalar(1.009);
    skin.frustumCulled = false;
    skin.renderOrder = 3;
    blob.renderOrder = 2;
    scene.add(skin);
    // Small studio-light reflection, approximated on the deforming clear skin.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const c = canvas.getContext("2d")!;
    const edge = c.createLinearGradient(0, 0, 64, 0);
    edge.addColorStop(0, "rgba(255,255,255,0)");
    edge.addColorStop(0.12, "white");
    edge.addColorStop(0.88, "white");
    edge.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = edge;
    c.fillRect(0, 0, 64, 64);
    c.globalCompositeOperation = "destination-in";
    const fade = c.createLinearGradient(0, 0, 0, 64);
    fade.addColorStop(0, "rgba(255,255,255,0)");
    fade.addColorStop(0.1, "white");
    fade.addColorStop(0.9, "white");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = fade;
    c.fillRect(0, 0, 64, 64);
    softbox = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.13),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    );
    softbox.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      softboxRest.clone().normalize(),
    );
    softbox.renderOrder = 4;
    scene.add(softbox);
  }

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 4),
    new THREE.MeshBasicMaterial({
      map: radialShadowTexture(0.7, 0.4),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);
  const gestureCamera = camera.clone();
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
  const corePointers = new Set<number>();
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
  let patchVertices: number[][] = [],
    faceToPatch = new Uint16Array();
  const buildShell = (
    source: THREE.BufferGeometry,
    map: THREE.Texture | null = null,
  ) => {
    if (shell) {
      scene.remove(shell);
      shell.geometry.dispose();
      shell.material.dispose();
    }
    const patches = shellPatches(source, spec),
      g = patches.geometry;
    centers.splice(0, centers.length, ...patches.centers);
    patchVertices = patches.vertices;
    faceToPatch = new Uint16Array(patches.faceToPatch);
    shards.splice(
      0,
      shards.length,
      ...centers.map(() => ({
        offset: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        spin: 0,
      })),
    );
    shellBase = Float32Array.from(g.getAttribute("position").array);
    fracture = new FractureModel(centers, spec.shape === "chocolate");
    shell = new THREE.Mesh(
      g,
      new THREE.MeshPhysicalMaterial({
        color: map ? 0xffffff : spec.color,
        map,
        roughness: spec.shape === "apple" ? 0.26 : 0.42,
        clearcoat: spec.shape === "apple" ? 0.75 : 0.3,
        clearcoatRoughness: 0.18,
        side: THREE.DoubleSide,
      }),
    );
    shell.position.copy(blob.position);
    shell.frustumCulled = false;
    scene.add(shell);
  };
  if (spec.family === "wax") {
    const g = bodyGeometry(spec);
    g.scale(1.035, 1.035, 1.035);
    buildShell(g);
    g.dispose();
    if (spec.shape === "apple") {
      // Rounded tied balloon neck, as observed in the installed wax-ball reference.
      const neck = new THREE.Mesh(
        new THREE.SphereGeometry(0.115, 24, 16),
        new THREE.MeshPhysicalMaterial({
          color: 0xf5f5dd,
          roughness: 0.3,
          clearcoat: 0.5,
        }),
      );
      neck.scale.set(1, 0.8, 1);
      neck.position.set(0, blob.position.y + spec.height + 0.015, 0);
      scene.add(neck);
      const cap = new THREE.Mesh(
        new THREE.TorusGeometry(0.095, 0.032, 10, 24),
        neck.material,
      );
      cap.rotation.x = Math.PI / 2;
      cap.position.copy(neck.position).y += 0.07;
      scene.add(cap);
    }
  }
  if (LOCAL_FIDGETS)
    void referenceMesh(spec)
      .then((result) => {
        if (!result) return;
        const old = geometry;
        geometry = result.geometry;
        if (spec.family === "wax") {
          buildShell(geometry, result.map);
          geometry = geometry.clone();
          geometry.scale(0.89, 0.89, 0.89);
        } else {
          material.map = result.map;
          material.color.set(0xffffff);
          material.roughness =
            spec.shape === "foam"
              ? 0.85
              : spec.shape === "mochi"
                ? 0.55
                : spec.roughness;
          material.opacity = 1;
          material.transparent = false;
          material.depthWrite = true;
          material.needsUpdate = true;
        }
        blob.geometry = geometry;
        base = Float32Array.from(geometry.getAttribute("position").array);
        old.dispose();
        visualSource = result.source;
        ctx.requestFrame();
      })
      .catch((e) => {
        visualSource = "reference-load-failed";
        console.warn(e);
      });
  const grains =
    spec.family === "particles" ? new GrainModel(spec.shape === "soap") : null;
  let grainMesh: THREE.InstancedMesh | null = null;
  const matrix = new THREE.Object3D(),
    visualGrains: THREE.Vector3[] = [],
    visualParents: number[] = [],
    flowOffsets: THREE.Vector3[] = [];
  if (grains && spec.shape === "beads") {
    const count = 1400;
    grainMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.0075, 0),
      new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 0.4 }),
      count,
    );
    grainMesh.count = count;
    grainMesh.position.copy(blob.position);
    grainMesh.frustumCulled = false;
    scene.add(grainMesh);
    for (let i = 0; i < count; i++) {
      const y = 1 - 2 * ((i + 0.5) / count),
        r = Math.sqrt(1 - y * y),
        angle = i * 2.399963,
        radius = 0.91 * Math.cbrt(0.08 + 0.92 * ((i * 0.75487766) % 1));
      const rest = new THREE.Vector3(
        Math.cos(angle) * r * radius,
        y * radius,
        Math.sin(angle) * r * radius,
      );
      visualGrains.push(rest);
      let closest = 0,
        best = Infinity;
      grains.grains.forEach((g, j) => {
        const d = rest.distanceToSquared(g.initial);
        if (d < best) {
          best = d;
          closest = j;
        }
      });
      visualParents.push(closest);
      grainMesh.setColorAt(
        i,
        sugarColor(rest.x, rest.y, rest.z).lerp(
          new THREE.Color(0xffffff),
          0.12 + (i % 4) * 0.08,
        ),
      );
    }
    grains.grains.forEach(() => flowOffsets.push(new THREE.Vector3()));
    grainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  const bubbles: THREE.Mesh[] = [];
  if (spec.shape === "ball" || spec.shape === "mango")
    for (let i = 0; i < (spec.shape === "ball" ? 24 : 9); i++) {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.025 + (i % 4) * 0.018, 12, 8),
        new THREE.MeshPhysicalMaterial({
          color: 0xeafdf5,
          transparent: true,
          opacity: 0.45,
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
  const bubbleRest = bubbles.map((b) => b.position.clone().sub(blob.position));
  let fitDistance = 5.8;
  const positionCamera = () => {
    camera.position
      .copy(target)
      .addScaledVector(
        new THREE.Vector3(0, 0.82, 2.2).normalize(),
        fitDistance *
          (spec.family === "viscous"
            ? Math.max(1, 1 + (model.stretch.x - 1) * 0.6)
            : 1),
      );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const resize = (w: number, h: number) => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dist = Math.max(
      5.8,
      (spec.width * 1.12) /
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
      if (
        h.object === shell &&
        fracture &&
        fracture.broken[faceToPatch[h.faceIndex ?? 0]]
      )
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
      if (!anchors.size) gestureCamera.copy(camera);
      if (!model.press(e.id, local, normal)) return;
      anchors.set(e.id, h.point.clone());
      if (spec.family === "wax" && h.object === blob) {
        coreTouches++;
        corePointers.add(e.id);
      }
      if (spec.family !== "particles")
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
      ray.setFromCamera(ndc(e.x, e.y), gestureCamera);
      plane.setFromNormalAndCoplanarPoint(
        gestureCamera.getWorldDirection(tmp).negate(),
        a,
      );
      const h = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (h) model.drag(e.id, h.sub(a));
    } else {
      if (!anchors.has(e.id)) return;
      model.release(e.id);
      corePointers.delete(e.id);
      anchors.delete(e.id);
      if (e.kind === "up" && spec.family !== "particles")
        sound.play("release", model.compression);
      if (!anchors.size && spec.family === "particles") sound.releaseGesture();
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
    corePointers.clear();
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
    if (softbox) {
      model.deform(softboxRest, tmp);
      softbox.position.copy(tmp).add(blob.position);
    }
    if (frames % 2 === 0) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    if (held.length) {
      compressClock += dt;
      if (compressClock > 0.28) {
        if (spec.family !== "wax" && spec.family !== "particles")
          sound.play("compress", model.compression);
        else if (corePointers.size > 0) sound.play("knead", model.compression);
        compressClock = -100;
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
        for (const k of patchVertices[i]) {
          p0.fromArray(shellBase, k * 3);
          p0.sub(c).multiplyScalar(
            fracture.broken[i] ? 0.94 : 1 - Math.max(0, dam - 0.16) * 0.055,
          );
          if (fracture.broken[i])
            p0.applyAxisAngle(tmp.set(0, 1, 0), state.spin * model.time * 2);
          p0.add(c).add(state.offset);
          if (!fracture.broken[i] && dam > 0.1)
            p0.addScaledVector(
              c,
              -Math.min(0.06, dam * 0.065) / Math.max(0.01, c.length()),
            );
          a.setXYZ(k, p0.x, p0.y, p0.z);
        }
      }
      a.needsUpdate = true;
      // Authored smooth normals stay continuous across intact curved wax patches.
      // Detached fragments keep their curved surface rather than becoming flat triangles.
      shell.geometry.computeBoundingSphere();
      if (held.length) moving = true;
    }
    if (grains) {
      const beforeCrush = grains.crushed,
        events = grains.step(dt, model);
      crunchClock -= dt;
      const pressureWork = grains.contactWork > 0.006;
      if (
        held.length &&
        crunchClock <= 0 &&
        (grains.crushed > beforeCrush ||
          (pressureWork && (events > 0 || model.compression > 0.025)))
      ) {
        sound.play("crunch", Math.min(1, 0.3 + grains.contactWork));
        crunchClock = 0.18;
      }
      grainMotion = 0;
      grains.grains.forEach((g, i) => {
        grainMotion += g.velocity.lengthSq();
        if (grainMesh) {
          model.deform(g.initial, tmp);
          flowOffsets[i].copy(g.pos).sub(tmp).clampLength(0, 0.07);
        }
      });
      if (grainMesh) {
        visualGrains.forEach((rest, i) => {
          model.deform(rest, tmp);
          matrix.position.copy(tmp).add(flowOffsets[visualParents[i]]);
          matrix.rotation.set(i * 0.7, i * 0.3, i * 0.4);
          matrix.scale.setScalar(0.65 + ((i * 17) % 13) * 0.065);
          matrix.updateMatrix();
          grainMesh!.setMatrixAt(i, matrix.matrix);
        });
        grainMesh.instanceMatrix.needsUpdate = true;
      }
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
    for (let i = 0; i < bubbles.length; i++) {
      model.deform(bubbleRest[i], tmp);
      bubbles[i].position.copy(tmp).add(blob.position);
      if (spec.shape !== "mango" || bubbleClock > 0.25)
        bubbles[i].visible = true;
    }
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
      corePointers.clear();
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
        enclosure: spec.family === "particles" ? "intact-elastic-skin" : null,
        grainPresentation:
          spec.shape === "soap"
            ? "concealed-filling"
            : spec.shape === "beads"
              ? "fine-embedded-rainbow"
              : null,
        visibleMicroGrains: visualGrains.length,
        internalRearrangements: grains?.rearrangements ?? 0,
        coreTouches,
        pops,
        audio: sound.state,
        audioSource: sound.source,
        vertices: geometry.getAttribute("position").count,
        visualStatus: visualSource,
        localReferenceAudio: LOCAL_FIDGETS,
        soundPlays: ctx.audio.playLogs
          .filter((l) => l.name.startsWith(`fg:${spec.id}:`))
          .slice(-20),
      };
    },
  };
}
