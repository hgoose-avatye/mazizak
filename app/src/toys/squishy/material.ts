import * as THREE from 'three';

/**
 * MeshPhysicalMaterial + vertex-shader analytic deformation (2 contacts)
 * + finite-difference normals + cheap fake subsurface tint.
 * No per-frame vertex buffer upload: only uniforms change.
 */
export interface SquishyUniforms {
  uAnchor: { value: THREE.Vector3[] };
  uCNormal: { value: THREE.Vector3[] };
  uDepth: { value: number[] };
  uSlide: { value: THREE.Vector3[] };
  uRadius: { value: number };
  uBulge: { value: number };
  uSquash: { value: number };
  uBaseY: { value: number };
  uSSS: { value: THREE.Color };
  uSSSAmt: { value: number };
  uPressTint: { value: THREE.Color };
  uStretch: { value: number };
  uStretchAxis: { value: THREE.Vector3 };
  uCenter: { value: THREE.Vector3 };
}

const VERT_PARS = /* glsl */ `
uniform vec3 uAnchor[6];
uniform vec3 uCNormal[6];
uniform float uDepth[6];
uniform vec3 uSlide[6];
uniform float uRadius;
uniform float uBulge;
uniform float uSquash;
uniform float uBaseY;
uniform float uStretch;
uniform vec3 uStretchAxis;
uniform vec3 uCenter;
varying float vPress;
varying float vBaseH;

vec3 mzkDeform(vec3 p, vec3 n, out float press) {
  vec3 d = vec3(0.0);
  press = 0.0;
  for (int i = 0; i < 6; i++) {
    vec3 r = p - uAnchor[i];
    float s = length(r) / uRadius;
    // two-scale profile: narrow fingertip core + wide soft shoulder
    float w = 0.0;
    if (s < 1.0) { float q = 1.0 - s * s; w = 0.45 * q * q * q; }
    float sc = s / 0.42;
    if (sc < 1.0) { float qc = 1.0 - sc * sc; w += 0.55 * qc * qc; }
    // drag carries a wider region than the dent
    float ws = 0.0;
    if (s < 1.25) { float qs = 1.0 - (s / 1.25) * (s / 1.25); ws = qs * qs; }
    d += -uCNormal[i] * uDepth[i] * w + uSlide[i] * ws;
    // broad, faint bulge around the dent (volume preservation approximation)
    float g = exp(-pow((s - 0.95) / 0.55, 2.0));
    d += n * g * max(uDepth[i], 0.0) * uBulge;
    press += w * max(uDepth[i], 0.0);
  }
  vec3 q = p + d;
  // global squash/jiggle about the base, approx. volume-preserving
  float sy = 1.0 - uSquash;
  float sxz = inversesqrt(max(sy, 0.3));
  q.y = uBaseY + (q.y - uBaseY) * sy;
  q.xz *= sxz;
  // two-finger stretch along an axis, perpendicular necking (≈ volume-preserving)
  vec3 rel = q - uCenter;
  float along = dot(rel, uStretchAxis);
  vec3 perp = rel - along * uStretchAxis;
  q = uCenter + uStretchAxis * along * uStretch + perp * pow(max(uStretch, 0.3), -0.35);
  q.y = max(q.y, uBaseY);
  return q;
}
`;

const VERT_NORMAL = /* glsl */ `
vec3 mzkN = normalize(normal);
vec3 mzkT = normalize(cross(mzkN, abs(mzkN.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
vec3 mzkB = cross(mzkN, mzkT);
float mzkPress; float mzkTmp;
vec3 mzkP0 = mzkDeform(position, mzkN, mzkPress);
vec3 mzkP1 = mzkDeform(position + mzkT * 0.008, mzkN, mzkTmp);
vec3 mzkP2 = mzkDeform(position + mzkB * 0.008, mzkN, mzkTmp);
vec3 objectNormal = normalize(cross(mzkP1 - mzkP0, mzkP2 - mzkP0));
if (dot(objectNormal, mzkN) < 0.0) objectNormal = -objectNormal;
vPress = mzkPress;
vBaseH = mzkP0.y - uBaseY;
`;

const FRAG_PARS = /* glsl */ `
uniform vec3 uSSS;
uniform float uSSSAmt;
uniform vec3 uPressTint;
varying float vPress;
varying float vBaseH;
`;

const FRAG_OUT = /* glsl */ `
{
  vec3 mzkV = normalize(vViewPosition);
  float mzkFres = pow(1.0 - clamp(dot(normal, mzkV), 0.0, 1.0), 2.0);
  // contact occlusion near the floor (grounding)
  outgoingLight *= mix(0.68, 1.0, smoothstep(0.0, 0.42, vBaseH));
  // fake subsurface: soft fill + rim glow
  outgoingLight += uSSS * uSSSAmt * (0.08 + 0.55 * mzkFres);
  // pressed region: compressed foam cells look denser / slightly darker
  outgoingLight = mix(outgoingLight, outgoingLight * uPressTint, clamp(vPress * 2.6, 0.0, 0.75));
}
#include <opaque_fragment>
`;

export function createSquishyMaterial(color: THREE.ColorRepresentation, sss: THREE.ColorRepresentation): {
  material: THREE.MeshPhysicalMaterial;
  uniforms: SquishyUniforms;
} {
  const uniforms: SquishyUniforms = {
    uAnchor: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
    uCNormal: { value: Array.from({ length: 6 }, () => new THREE.Vector3(0, 1, 0)) },
    uDepth: { value: [0, 0, 0, 0, 0, 0] },
    uSlide: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
    uRadius: { value: 0.6 },
    uBulge: { value: 0.2 },
    uSquash: { value: 0 },
    uBaseY: { value: -1 },
    uSSS: { value: new THREE.Color(sss) },
    uSSSAmt: { value: 0.16 },
    uPressTint: { value: new THREE.Color(1.12, 0.9, 0.95) },
    uStretch: { value: 1 },
    uStretchAxis: { value: new THREE.Vector3(1, 0, 0) },
    uCenter: { value: new THREE.Vector3() },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.62,
    metalness: 0,
    clearcoat: 0.22,
    clearcoatRoughness: 0.45,
    sheen: 0.7,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xffffff),
    envMapIntensity: 1.0,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', 'vec3 transformed = mzkP0;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('#include <opaque_fragment>', FRAG_OUT);
  };
  material.customProgramCacheKey = () => 'mzk-squishy-foam-v1';
  return { material, uniforms };
}
