import { COUNT_IN_VOICE, GROOVE_LANES, LANE_ORDER, type DrumGroove, type GrooveLane, type GrooveLanes, type GrooveSection, type MixGroup } from './drumGrooves';
import type { PercussionVoice } from './percussion';

export const MIN_BPM = 30, MAX_BPM = 260;
export const FILL_CHOICES = [0, 2, 4, 8] as const;
export interface GrooveSettings {
  bpm: number;
  /** Requested count-in bars; short meters are extended to at least three clicks. */
  countInBars: number;
  /** 0 plays fills only when asked. */
  fillEvery: number;
  /** 0.5 is straight; 0.667 is triplet swing. */
  swing: number;
  humanize: boolean;
  /** Speed trainer: add step BPM every everyBars musical bars until target. */
  ramp: { step: number; everyBars: number; target: number } | null;
  /** Silent-bar trainer: play bars, then mute bars. */
  gap: { play: number; mute: number } | null;
  seed: number;
}
export type BarKind = 'count-in' | 'groove' | 'fill' | 'gap';
export interface GrooveHit { time: number; voice: PercussionVoice; velocity: number; group: MixGroup | 'count'; lane: GrooveLane | 'count' }
export interface GrooveCue {
  time: number; bar: number; step: number; beat: number; kind: BarKind; section: GrooveSection; pending: GrooveSection | null;
  patternBar: number; bpm: number; lanes: GrooveLanes; crash: boolean;
}

export function effectiveCountIn(groove: DrumGroove, requested: number): number {
  return requested <= 0 ? 0 : Math.max(requested, Math.ceil(3 / groove.beatsPerBar));
}

/** Seconds a step is delayed by swing. Only straight sixteenth grids swing. */
export function swingOffset(groove: DrumGroove, step: number, swing: number, beatSeconds: number): number {
  if (!groove.swingUnit || groove.stepsPerBeat !== 4 || swing <= .5) return 0;
  const amount = Math.min(.75, swing) - .5, position = step % 4;
  if (groove.swingUnit === 16) return position % 2 === 1 ? amount * beatSeconds / 2 : 0;
  return position === 2 ? amount * beatSeconds : position % 2 === 1 ? amount * beatSeconds / 2 : 0;
}

export function validateGrooveSettings(settings: GrooveSettings): void {
  const fail = (message: string) => { throw new Error(message); };
  if (!Number.isFinite(settings.bpm) || settings.bpm < MIN_BPM || settings.bpm > MAX_BPM) fail(`Tempo must be between ${MIN_BPM} and ${MAX_BPM} BPM.`);
  if (!Number.isInteger(settings.countInBars) || settings.countInBars < 0 || settings.countInBars > 4) fail('Count-in must be 0 to 4 bars.');
  if (!(FILL_CHOICES as readonly number[]).includes(settings.fillEvery)) fail('Choose a supported fill interval.');
  if (!Number.isFinite(settings.swing) || settings.swing < .5 || settings.swing > .75) fail('Swing must be between 50% and 75%.');
  const ramp = settings.ramp;
  if (ramp && (!Number.isInteger(ramp.step) || ramp.step < 1 || ramp.step > 20 || !Number.isInteger(ramp.everyBars) || ramp.everyBars < 1
    || ramp.everyBars > 16 || !Number.isFinite(ramp.target) || ramp.target < MIN_BPM || ramp.target > MAX_BPM)) fail('Check the speed trainer steps and target tempo.');
  const gap = settings.gap;
  if (gap && (!Number.isInteger(gap.play) || !Number.isInteger(gap.mute) || gap.play < 1 || gap.mute < 1 || gap.play > 8 || gap.mute > 8)) fail('Silent bars must play and mute 1 to 8 bars.');
}

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BarPlan { kind: BarKind; lanes: GrooveLanes; patternBar: number; crash: boolean }

/**
 * Produces sample-accurate drum hits and display cues ahead of an audio clock. Pure and
 * clock-injected: callers pass the time they want scheduled up to, so tests need no timers.
 */
export class GrooveSequencer {
  private settings: GrooveSettings;
  private sectionNow: GrooveSection;
  private pending: GrooveSection | null = null;
  private fillQueued = false;
  // Steps are timed from the last tempo change, so long sessions never accumulate rounding drift.
  private anchorTime: number;
  private anchorStep = 0;
  private globalStep = 0;
  private stepSeconds: number;
  private bar: number;
  private step = 0;
  private plan: BarPlan | null = null;
  private random: () => number;
  private bars: Record<GrooveSection, GrooveLanes[]>;
  readonly musicStart: number;

  constructor(readonly groove: DrumGroove, settings: GrooveSettings, readonly startTime: number, section: GrooveSection = 'verse') {
    validateGrooveSettings(settings);
    if (!Number.isFinite(startTime) || startTime < 0) throw new Error('Invalid groove start time.');
    this.settings = { ...settings };
    this.sectionNow = groove.loop ? 'verse' : section;
    this.anchorTime = startTime;
    this.stepSeconds = 60 / settings.bpm / groove.stepsPerBeat;
    const countIn = effectiveCountIn(groove, settings.countInBars);
    this.bar = -countIn;
    this.musicStart = startTime + countIn * groove.beatsPerBar * 60 / settings.bpm;
    this.random = mulberry(settings.seed);
    const slice = (lanes: GrooveLanes, bar: number): GrooveLanes => Object.fromEntries(Object.entries(lanes)
      .map(([lane, steps]) => [lane, steps!.slice(bar * groove.stepsPerBar, (bar + 1) * groove.stepsPerBar)]));
    this.bars = {
      verse: Array.from({ length: groove.bars }, (_, bar) => slice(groove.main, bar)),
      chorus: Array.from({ length: groove.bars }, (_, bar) => slice(groove.chorus, bar)),
    };
  }

  get bpm(): number { return this.settings.bpm; }
  get section(): GrooveSection { return this.sectionNow; }
  get pendingSection(): GrooveSection | null { return this.pending; }
  get fillPending(): boolean { return this.fillQueued; }
  private get nextTime(): number { return this.anchorTime + (this.globalStep - this.anchorStep) * this.stepSeconds; }
  /** Steps already generated keep their length; the new tempo starts at the next step. */
  private retime(): void {
    const stepSeconds = 60 / this.settings.bpm / this.groove.stepsPerBeat;
    if (stepSeconds === this.stepSeconds) return;
    this.anchorTime = this.nextTime; this.anchorStep = this.globalStep; this.stepSeconds = stepSeconds;
  }

  update(changes: Partial<Omit<GrooveSettings, 'seed' | 'countInBars'>>): void {
    const next = { ...this.settings, ...changes };
    validateGrooveSettings(next);
    this.settings = next;
    this.retime();
  }
  setBpm(bpm: number): void { this.update({ bpm }); }
  queueFill(): boolean {
    if (this.groove.loop) return false;
    this.fillQueued = true;
    return true;
  }
  /** Changes section after a transition fill, like a drummer setting up a chorus. */
  setSection(section: GrooveSection): void {
    if (this.groove.loop) return;
    if (section === this.sectionNow) { this.pending = null; return; }
    this.pending = section;
    this.fillQueued = true;
  }

  private planBar(): void {
    const groove = this.groove, bar = this.bar, previous = this.plan?.kind ?? null;
    if (bar < 0) { this.plan = { kind: 'count-in', lanes: this.bars[this.sectionNow][0], patternBar: 0, crash: false }; return; }
    const ramp = this.settings.ramp;
    if (ramp && bar > 0 && bar % ramp.everyBars === 0 && this.settings.bpm < ramp.target) {
      this.settings = { ...this.settings, bpm: Math.min(ramp.target, this.settings.bpm + ramp.step) };
      this.retime();
    }
    let crash = previous === 'fill';
    if (previous === 'fill' && this.pending) { this.sectionNow = this.pending; this.pending = null; this.fillQueued = false; }
    const patternBar = bar % groove.bars, gap = this.settings.gap;
    if (gap && bar % (gap.play + gap.mute) >= gap.play) {
      this.plan = { kind: 'gap', lanes: this.bars[this.sectionNow][patternBar], patternBar, crash: false };
      return;
    }
    const fillDue = this.settings.fillEvery > 0 && (bar + 1) % this.settings.fillEvery === 0;
    crash &&= groove.kitGroove;
    if (!groove.loop && (this.fillQueued || fillDue)) {
      this.fillQueued = false;
      this.plan = { kind: 'fill', lanes: groove.fill, patternBar, crash: crash && !groove.fill.crash?.[0] };
      return;
    }
    const lanes = this.bars[this.sectionNow][patternBar];
    this.plan = { kind: 'groove', lanes, patternBar, crash: crash && !lanes.crash?.[0] };
  }

  private hit(lane: GrooveLane, level: number, time: number): GrooveHit {
    let velocity = level, at = time;
    if (this.settings.humanize) {
      const timing = this.random() * 2 - 1, dynamics = this.random() * 2 - 1;
      const anchor = lane === 'kick' || lane === 'snare' || lane === 'cajonBass' || lane === 'cajonSnare';
      at += timing * (anchor ? .003 : .006);
      velocity = Math.min(1, Math.max(.05, velocity * (1 + dynamics * .07)));
    }
    return { time: at, voice: GROOVE_LANES[lane].voice, velocity, group: GROOVE_LANES[lane].group, lane };
  }

  /** Generates every step whose grid time is before until. */
  advance(until: number): { hits: GrooveHit[]; cues: GrooveCue[] } {
    const hits: GrooveHit[] = [], cues: GrooveCue[] = [], groove = this.groove;
    for (let guard = 0; this.nextTime < until && guard < 4096; guard++) {
      if (this.step === 0) this.planBar();
      const plan = this.plan!, beatSeconds = 60 / this.settings.bpm, time = this.nextTime;
      const beat = Math.floor(this.step / groove.stepsPerBeat);
      cues.push({ time, bar: this.bar, step: this.step, beat, kind: plan.kind, section: this.sectionNow, pending: this.pending,
        patternBar: plan.patternBar, bpm: this.settings.bpm, lanes: plan.lanes, crash: plan.crash });
      if (plan.kind === 'count-in') {
        if (this.step % groove.stepsPerBeat === 0) hits.push({ time, voice: COUNT_IN_VOICE, velocity: beat === 0 ? 1 : .62, group: 'count', lane: 'count' });
      } else if (plan.kind !== 'gap') {
        const swung = time + swingOffset(groove, this.step, this.settings.swing, beatSeconds);
        if (plan.crash && this.step === 0) hits.push(this.hit('crash', 1, time));
        for (const lane of LANE_ORDER) {
          const level = plan.lanes[lane]?.[this.step];
          if (level) hits.push(this.hit(lane, level, swung));
        }
      }
      this.globalStep++;
      if (++this.step === groove.stepsPerBar) { this.step = 0; this.bar++; }
    }
    return { hits, cues };
  }
}
