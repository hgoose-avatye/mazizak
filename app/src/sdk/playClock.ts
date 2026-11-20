/**
 * "판" for the SDK missions (owner, 2026-11-20): 만지작 has no rounds or results, so one 판 = one minute of actually playing
 * with the toys. Pure logic over timestamps so it is unit-tested (test/playClock.test.ts); gf.ts feeds it the real clock.
 *
 * - Playing = a touch / key on the toy within the last IDLE_MS, while nothing covers the toy (settings sheet, ad sheet,
 *   SDK windows) and the page is visible. Leaving a toy alone for IDLE_MS stops the clock (play_30m counts the same way —
 *   the SDK measures real play from setRoundActive).
 * - Every ROUND_MS of playing ends a 판 (gameEnd) and the next one starts at once. Time does not carry over between visits
 *   (an unfinished minute is dropped when the app closes, as a quit round would be).
 * - Switching toys does not end a 판: the minute is about playing, not one toy.
 */
export const ROUND_MS = 60_000;
export const IDLE_MS = 8_000;

export interface PlayClockEvents {
  /** a 판 starts (first input after none was open) → reward.beginRound() */
  begin(): void;
  /** playing state changed → reward.setRoundActive(active) */
  active(on: boolean): void;
  /** ROUND_MS of play done → reward.gameEnd() */
  end(): void;
}

export class PlayClock {
  private open = false;
  private playing = false;
  private covered = false;
  private lastInput = -Infinity;
  private since = 0; // when the current playing stretch started
  private banked = 0; // play time of the open 판 before the current stretch

  constructor(private readonly on: PlayClockEvents) {}

  /** the user touched / pressed the toy at `now` */
  input(now: number): void {
    this.lastInput = now;
    if (this.covered) return;
    if (!this.open) { this.open = true; this.banked = 0; this.on.begin(); }
    if (!this.playing) { this.playing = true; this.since = now; this.on.active(true); }
  }

  /** something covers the toy (sheet, SDK window, hidden page) — or not any more */
  cover(on: boolean, now: number): void {
    if (this.covered === on) return;
    this.covered = on;
    if (on) this.stop(now);
  }

  /** advance the clock (call every second or so): ends 판 and notices idling */
  tick(now: number): void {
    if (!this.playing) return;
    const idleAt = this.lastInput + IDLE_MS;
    const until = Math.min(now, idleAt);
    // every full minute of play in [since, until] closes a 판
    while (this.banked + (until - this.since) >= ROUND_MS) {
      const doneAt = this.since + (ROUND_MS - this.banked);
      this.on.end();
      this.on.begin();
      this.since = doneAt;
      this.banked = 0;
    }
    if (now >= idleAt) this.stop(idleAt);
  }

  /** seconds of play in the open 판 (for a progress display / tests) */
  progress(now: number): number {
    return this.banked + (this.playing ? Math.min(now, this.lastInput + IDLE_MS) - this.since : 0);
  }

  get isPlaying(): boolean { return this.playing; }

  private stop(at: number): void {
    if (!this.playing) return;
    this.banked += Math.max(0, at - this.since);
    this.playing = false;
    this.on.active(false);
  }
}
