import { ANALYSIS_RATE, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, analysisToSong, type AudioAnalysis, type AnalysisResponse } from '../analysis/audioAnalysis';
import { youtubeVideoId } from '../analysis/youtube';
import { chordIdentity } from '../songs/timing';
import { saveCustomSong } from '../storage';
import { getStrummingPattern, patternNotation, type StrummingCandidate } from '../rhythm/strumming';

function element<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }

export class AudioAnalysisController {
  private worker: Worker | null = null;
  private generation = 0;
  private busy = false;
  private active = false;
  private result: AudioAnalysis | null = null;
  private audioUrl: string | null = null;
  private confirmedFile: File | null = null;
  private invalidRegions = new Set<number>();
  private abort = new AbortController();

  constructor(private openSong: (id: string) => void, private pauseSong: () => void, private practicePattern: (candidate: StrummingCandidate) => void) {
    const events = { signal: this.abort.signal };
    element<HTMLInputElement>('analysis-file').addEventListener('change', () => this.selectFile(), events);
    element<HTMLInputElement>('analysis-rights').checked = false;
    element('analysis-rights').addEventListener('change', () => this.confirmPermission(), events);
    element('analysis-start').addEventListener('click', () => { void this.analyze(); }, events);
    element('analysis-cancel').addEventListener('click', () => this.cancel('Analysis cancelled. Your file is still available for retry.'), events);
    element('analysis-clear').addEventListener('click', () => this.clear(), events);
    element('analysis-save').addEventListener('click', () => this.save(), events);
    element('youtube-load').addEventListener('click', () => this.loadYouTube(), events);
    element('youtube-clear').addEventListener('click', () => this.clearYouTube(), events);
    element<HTMLAudioElement>('analysis-audio').addEventListener('play', () => pauseSong(), events);
    window.addEventListener('pagehide', () => this.setActive(false), events);
    window.addEventListener('pageshow', () => this.setActive(element('pane-analysis').classList.contains('active')), events);
    this.syncControls();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      if (this.busy) this.cancel('Analysis cancelled when leaving this section. Return and choose Analyze to retry.');
      element<HTMLAudioElement>('analysis-audio').pause();
      this.clearYouTube();
    }
  }

  private status(text: string): void { element('analysis-status').textContent = text; }

  private hasPermission(file = element<HTMLInputElement>('analysis-file').files?.[0]): boolean {
    return !!file && this.confirmedFile === file && element<HTMLInputElement>('analysis-rights').checked;
  }

  private syncControls(): void {
    element<HTMLInputElement>('analysis-rights').disabled = !element<HTMLInputElement>('analysis-file').files?.length;
    element<HTMLButtonElement>('analysis-start').disabled = this.busy || !this.hasPermission();
    element<HTMLButtonElement>('analysis-cancel').disabled = !this.busy;
    element<HTMLButtonElement>('analysis-save').disabled = this.busy || !this.hasPermission() || !this.result?.regions.some(r => r.kind === 'chord') || this.invalidRegions.size > 0;
    element('audio-analysis').setAttribute('aria-busy', String(this.busy));
  }

  private clearResult(): void {
    this.result = null;
    this.invalidRegions.clear();
    element('analysis-key').textContent = '';
    element('analysis-regions').replaceChildren();
    element('analysis-strumming-results').replaceChildren();
    element('analysis-strumming-status').textContent = '';
    element('analysis-results').hidden = true;
    element<HTMLInputElement>('analysis-allow-unknown').checked = false;
    element<HTMLProgressElement>('analysis-progress').value = 0;
  }

  private selectFile(): void {
    this.confirmedFile = null;
    element<HTMLInputElement>('analysis-rights').checked = false;
    this.cancel('');
    this.clearResult();
    this.releaseAudio();
    const file = element<HTMLInputElement>('analysis-file').files?.[0];
    element('analysis-permission-file').textContent = file?.name || 'the selected recording';
    if (file) {
      element<HTMLInputElement>('analysis-title').value = file.name.replace(/\.[^.]+$/, '');
      this.status(`${file.name} selected. Confirm your rights or permission before previewing or analyzing this recording. No audio has been uploaded.`);
    } else this.status('Choose an MP3 or WAV recording, then confirm your permission to analyze it.');
    this.syncControls();
  }

  private releaseAudio(): void {
    const audio = element<HTMLAudioElement>('analysis-audio');
    audio.pause(); audio.removeAttribute('src'); audio.load(); audio.hidden = true;
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = null;
  }

  private validateFile(file: File): void {
    if (file.size > MAX_AUDIO_BYTES) throw new Error('Choose a file smaller than 30 MB. Nothing was uploaded.');
    if (!/\.(mp3|wav)$/i.test(file.name)) throw new Error('This first release supports MP3 and WAV files.');
  }

  private confirmPermission(): void {
    const file = element<HTMLInputElement>('analysis-file').files?.[0];
    this.confirmedFile = null;
    this.cancel('');
    this.clearResult();
    this.releaseAudio();
    if (!file || !element<HTMLInputElement>('analysis-rights').checked) {
      this.status('Permission is not confirmed. Preview and analysis are stopped; confirm only if you have the necessary rights.');
      this.syncControls();
      return;
    }
    try {
      this.validateFile(file);
      this.audioUrl = URL.createObjectURL(file);
      const audio = element<HTMLAudioElement>('analysis-audio');
      audio.src = this.audioUrl; audio.hidden = false;
      this.confirmedFile = file;
      this.status(`Permission confirmed for ${file.name}. Preview it or choose Analyze on this device. Results will be estimates.`);
    } catch (error) {
      this.releaseAudio();
      this.status(error instanceof Error ? error.message : String(error));
    }
    this.syncControls();
  }

  private cancel(message: string): void {
    this.generation++;
    this.worker?.terminate(); this.worker = null;
    this.busy = false;
    if (message) this.status(message);
    this.syncControls();
  }

  private clear(): void {
    element<HTMLInputElement>('analysis-file').value = '';
    element<HTMLInputElement>('analysis-title').value = '';
    this.selectFile();
  }

  async analyze(): Promise<void> {
    const file = element<HTMLInputElement>('analysis-file').files?.[0];
    if (!file || !this.active) return;
    if (!this.hasPermission(file)) {
      this.status('Confirm that you have the necessary rights or permission before analyzing this recording.');
      this.syncControls();
      element('analysis-rights').focus();
      return;
    }
    this.cancel('');
    this.clearResult();
    const generation = this.generation;
    this.busy = true; this.syncControls(); this.pauseSong();
    element<HTMLAudioElement>('analysis-audio').pause();
    try {
      this.validateFile(file);
      this.status('Decoding locally. Large recordings can take a moment; Cancel remains available.');
      const decoder = new OfflineAudioContext(1, 1, ANALYSIS_RATE);
      const bytes = await file.arrayBuffer();
      if (generation !== this.generation || !this.active || !this.hasPermission(file)) return;
      const decoded = await decoder.decodeAudioData(bytes);
      if (generation !== this.generation || !this.active || !this.hasPermission(file)) return;
      if (!decoded.length || decoded.duration > MAX_AUDIO_SECONDS) throw new Error('Choose a non-empty recording of at most 5 minutes. Longer files are not silently truncated.');
      const samples = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
        const data = decoded.getChannelData(channel);
        for (let i = 0; i < samples.length; i++) samples[i] += data[i] / decoded.numberOfChannels;
      }
      this.worker = new Worker(new URL('../analysis/audioWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
        if (generation !== this.generation || !this.active || !this.hasPermission(file)) return;
        const message = event.data;
        if (message.type === 'progress') {
          element<HTMLProgressElement>('analysis-progress').value = message.percent;
          this.status(`Analyzing on this device: ${message.percent}%`);
        } else if (message.type === 'error') this.fail(message.message);
        else {
          this.result = message.result;
          this.worker?.terminate(); this.worker = null;
          this.busy = false;
          this.renderResult();
          this.syncControls();
        }
      };
      this.worker.onerror = event => { if (generation === this.generation) this.fail(`Analysis worker failed: ${event.message || 'please retry'}`); };
      this.worker.postMessage({ samples }, [samples.buffer]);
    } catch (error) {
      if (generation === this.generation) this.fail(`Could not analyze this recording. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private fail(message: string): void {
    this.cancel(message);
    this.clearResult();
    this.syncControls();
  }

  private renderResult(): void {
    const result = this.result;
    if (!result) return;
    element('analysis-results').hidden = false;
    element('analysis-key').textContent = result.keys.length
      ? `${result.keyUncertain ? 'Uncertain — candidates' : 'Candidate'}: ${result.keys.map(k => `${k.root} ${k.mode}`).join(' · ')}`
      : 'No reliable major/minor key suggestion. Silence, noise or too few distinct notes.';
    const unknown = result.regions.filter(region => region.kind === 'uncertain').length;
    this.status(`Draft ready: ${result.regions.length} regions over ${result.duration.toFixed(1)} seconds; ${unknown} need review. Estimates are not verified song chords, rhythm or tabs.`);
    element('analysis-strumming-status').textContent = result.strumming?.message || 'No strumming suggestion is available for this recording.';
    const patterns = element('analysis-strumming-results');
    patterns.replaceChildren();
    for (const candidate of result.strumming?.candidates || []) {
      const pattern = getStrummingPattern(candidate.patternId);
      const item = document.createElement('div');
      item.className = 'strumming-suggestion';
      const label = document.createElement('p');
      label.textContent = `${pattern.name} · about ${candidate.bpm} BPM · rhythm fit ${Math.round(candidate.fit * 100)}/100 (not accuracy)`;
      const strokes = document.createElement('p');
      strokes.className = 'strumming-notation';
      strokes.textContent = patternNotation(pattern);
      const use = document.createElement('button');
      use.className = 'btn btn-secondary';
      use.dataset.patternId = candidate.patternId;
      use.textContent = 'Practise this pattern in Chord Changes';
      use.onclick = () => {
        if (!this.hasPermission() || this.result !== result) {
          this.status('Analyze the currently confirmed recording before using a suggestion.');
          return;
        }
        this.practicePattern(candidate);
      };
      item.append(label, strokes, use); patterns.append(item);
    }
    const rows = element('analysis-regions');
    rows.replaceChildren();
    result.regions.forEach((region, index) => {
      const row = document.createElement('tr');
      const time = document.createElement('td');
      time.textContent = `${region.start.toFixed(2)}–${region.end.toFixed(2)} s`;
      const chordCell = document.createElement('td'), chord = document.createElement('input');
      chord.value = region.chord || (region.kind === 'silence' ? 'Rest' : '?');
      chord.setAttribute('aria-label', `Estimated chord for region ${index + 1}, ${time.textContent}`);
      chord.setAttribute('list', 'analysis-chord-help');
      const match = document.createElement('td');
      match.textContent = region.match === null ? region.kind : `${Math.round(region.match)} (template match, not accuracy)`;
      chord.addEventListener('change', () => {
        const value = chord.value.trim();
        if (value !== '?' && value.toLowerCase() !== 'rest' && !chordIdentity(value)) {
          chord.setAttribute('aria-invalid', 'true'); this.invalidRegions.add(index);
          this.status('Enter a supported chord, Rest, or ? for an uncertain region.');
        } else {
          chord.removeAttribute('aria-invalid'); this.invalidRegions.delete(index);
          region.chord = value === '?' || value.toLowerCase() === 'rest' ? null : value;
          region.kind = value === '?' ? 'uncertain' : region.chord ? 'chord' : 'silence';
          region.match = null; match.textContent = 'Edited';
        }
        this.syncControls();
      });
      chordCell.append(chord); row.append(time, chordCell, match); rows.append(row);
    });
  }

  private save(): void {
    const file = element<HTMLInputElement>('analysis-file').files?.[0];
    if (!this.hasPermission(file)) {
      this.status('Confirm your permission for this recording before saving an analysis draft.');
      this.syncControls();
      return;
    }
    if (!file || !this.result || this.invalidRegions.size) {
      this.status('Analyze the confirmed recording and resolve invalid chord entries before saving.');
      return;
    }
    try {
      const song = analysisToSong(this.result, element<HTMLInputElement>('analysis-title').value, `User recording: ${file.name}`,
        Number(element<HTMLInputElement>('analysis-bpm').value), element<HTMLInputElement>('analysis-allow-unknown').checked, `custom_${crypto.randomUUID()}`);
      saveCustomSong(song);
      this.openSong(song.id);
    } catch (error) { this.status(error instanceof Error ? error.message : String(error)); }
  }

  private loadYouTube(): void {
    this.clearYouTube();
    const id = youtubeVideoId(element<HTMLInputElement>('youtube-url').value.trim());
    if (!id) {
      element('youtube-status').textContent = 'Enter a valid HTTPS YouTube video link (watch, short, live, or youtu.be).';
      return;
    }
    this.pauseSong();
    element<HTMLAudioElement>('analysis-audio').pause();
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}`;
    iframe.title = 'YouTube reference video';
    iframe.allow = 'encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    element('youtube-player').append(iframe);
    const link = element<HTMLAnchorElement>('youtube-external');
    link.href = `https://www.youtube.com/watch?v=${id}`; link.hidden = false;
    element('youtube-status').textContent = 'Reference player only. YouTube audio is not downloaded or analyzed. If embedding is unavailable, open it on YouTube. Use a matching authorized MP3 for chord analysis.';
  }

  private clearYouTube(): void {
    element('youtube-player').replaceChildren();
    element('youtube-external').hidden = true;
    element('youtube-status').textContent = 'No video loaded. The official player contacts YouTube only when you choose Load reference.';
  }

  dispose(): void {
    this.clear(); this.clearYouTube(); this.abort.abort();
  }
}
