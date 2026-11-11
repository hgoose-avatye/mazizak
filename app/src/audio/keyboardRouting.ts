/** kbsim fullsize row indices: function=0, number=1, Q=2, A=3, Z=4; bottom/default=4. */
const ROWS = [
  ['Escape', ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`), 'PrintScreen', 'ScrollLock', 'Pause'],
  ['Backquote', ...Array.from({ length: 10 }, (_, i) => `Digit${i}`), 'Minus', 'Equal', 'Insert', 'Home', 'PageUp', 'NumLock', 'NumpadDivide', 'NumpadMultiply', 'NumpadSubtract'],
  ['Tab', ...'QWERTYUIOP'.split('').map(k => `Key${k}`), 'BracketLeft', 'BracketRight', 'Backslash', 'Delete', 'End', 'PageDown', 'Numpad7', 'Numpad8', 'Numpad9', 'NumpadAdd'],
  ['CapsLock', ...'ASDFGHJKL'.split('').map(k => `Key${k}`), 'Semicolon', 'Quote', 'Numpad4', 'Numpad5', 'Numpad6'],
  ['ShiftLeft', ...'ZXCVBNM'.split('').map(k => `Key${k}`), 'Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp', 'Numpad1', 'Numpad2', 'Numpad3', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'ContextMenu', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Numpad0', 'NumpadDecimal', 'IntlBackslash'],
];

export function topreRow(code: string): number | undefined {
  const row = ROWS.findIndex(keys => keys.includes(code));
  return row < 0 ? undefined : row;
}

export function topreRole(code: string, phase: 'Down' | 'Up'): string | undefined {
  if (code === 'Space') return `space${phase}`;
  if (code === 'Enter' || code === 'NumpadEnter') return `enter${phase}`;
  if (code === 'Backspace') return `backspace${phase}`;
  const row = topreRow(code);
  return row === undefined ? undefined : phase === 'Down' ? `downR${row}` : 'up';
}
