import type { KeyPresetId } from '../../audio/keyPresets';
import { LOCAL_KEY_PRESETS, isClearedKeyPreset } from '../../audio/localKeyPresets';

/** Light-weight (no three.js): the home screen needs the labels without loading the keyboard toy. */
export const KEY_PRESET_INFO: Record<KeyPresetId, { label: string; desc: string }> = {
  pebble: { label: '조약돌', desc: '묵직하고 둥근 저음' },
  clack: { label: '얼음', desc: '선명하고 경쾌한 고음' },
  'creamy-thocky': { label: '크림', desc: '부드럽고 크리미한 타건음 (My Sound Pack · Chevy · CC BY 4.0)' },
  topre: { label: '마시멜로', desc: 'kbs.im Topre · 행별 타건음과 전용 특수키 (MIT)' },
  'turquoise-tealios': { label: '민트', desc: 'K06 · kbsim 실록 · 행별 누름/공통 키업 · 특수키 전용 (MIT)' },
  'ibm-buckling-spring': { label: '타자기', desc: 'K10 · kbsim Buckling Spring 실록 · 행별 누름/공통 키업 · 특수키 전용 (MIT)' },
  ...Object.fromEntries(Object.entries(LOCAL_KEY_PRESETS).map(([id, p]) => [id, { label: p.label, desc: `${p.sensoryExpression} · ${p.onomatopoeia}${isClearedKeyPreset(id) ? '' : ' · 로컬 검토용'}` }])) as Record<keyof typeof LOCAL_KEY_PRESETS, { label: string; desc: string }>,
};
