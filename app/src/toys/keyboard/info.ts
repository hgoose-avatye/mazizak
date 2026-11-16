import type { KeyPresetId } from '../../audio/keyPresets';
import { LOCAL_KEY_PRESETS, isClearedKeyPreset } from '../../audio/localKeyPresets';

/** Light-weight (no three.js): the home screen needs the labels without loading the keyboard toy. */
export const KEY_PRESET_INFO: Record<KeyPresetId, { label: string; desc: string }> = {
  pebble: { label: '조약돌', desc: '둥글고 묵직한 저음' },
  clack: { label: '얼음', desc: '맑고 경쾌한 고음' },
  'creamy-thocky': { label: '크림', desc: '부드럽고 크리미한 타건음' },
  topre: { label: '마시멜로', desc: '폭신하고 도톰한 타건음' },
  'turquoise-tealios': { label: '민트', desc: '산뜻하고 또렷한 타건음' },
  'ibm-buckling-spring': { label: '타자기', desc: '경쾌하고 선명한 클릭음' },
  // retired / dev-only presets keep the generated "sensory · onomatopoeia" line; the shipped ones are overridden below
  ...Object.fromEntries(Object.entries(LOCAL_KEY_PRESETS).map(([id, p]) => [id, { label: p.label, desc: `${p.sensoryExpression} · ${p.onomatopoeia}${isClearedKeyPreset(id) ? '' : ' · 로컬 검토용'}` }])) as Record<keyof typeof LOCAL_KEY_PRESETS, { label: string; desc: string }>,
  'box-jade': { label: '옥구슬', desc: '유리구슬이 부딪히는 맑은 소리' },
  'silent-peach-v3': { label: '복숭아', desc: '솜사탕처럼 폭신한 소리' },
  'mongdol-pl87w': { label: '몽돌', desc: '바둑알이 부딪히는 소리' },
  'jjigae-topre': { label: '찌개', desc: '보글보글 끓어오르는 소리' },
  'dojagi-space65': { label: '도자기', desc: '도자기를 두드리는 맑은 소리' },
};
