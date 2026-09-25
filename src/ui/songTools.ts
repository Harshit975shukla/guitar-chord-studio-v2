import { saveCustomSong } from '../storage';
import { importSong, searchSongs, type CatalogSong, type FinderFilters } from '../songs/catalog';
import { validateTiming, type SongTiming } from '../songs/timing';

interface SongTools {
  catalog(): CatalogSong[];
  open(id: string, part?: 'notes' | 'chords'): void;
  editing(): { song: CatalogSong; timing: SongTiming } | null;
  pause(): void;
}
function input(id: string): HTMLInputElement { return document.getElementById(id) as HTMLInputElement; }
function message(id: string, text: string): void { document.getElementById(id)!.textContent = text; }
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function initSongTools(tools: SongTools): void {
  const editor = document.getElementById('song-timing-editor') as HTMLDialogElement;
  const textarea = document.getElementById('song-timing-json') as HTMLTextAreaElement;
  const importModal = document.getElementById('custom-song-modal')!;
  let importOpener: HTMLElement | null = null;
  const closeImport = () => { importModal.style.display = 'none'; importOpener?.focus(); };
  const openImport = () => {
    tools.pause();
    importOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    importModal.style.display = 'flex';
    input('custom-song-title-input').focus();
  };
  importModal.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeImport(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...importModal.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  importModal.querySelectorAll<HTMLButtonElement>('button[onclick]').forEach(button => { button.onclick = closeImport; });
  document.querySelectorAll('[data-open-song-import]').forEach(button => button.addEventListener('click', openImport));
  document.getElementById('song-edit-timing')!.addEventListener('click', () => {
    const current = tools.editing();
    if (!current) return;
    tools.pause();
    textarea.value = JSON.stringify(current.timing, null, 2);
    input('song-timing-title').value = current.song.title;
    input('song-timing-source').value = current.song.source || '';
    input('song-timing-version').value = current.song.versionLabel || '';
    message('song-editor-status', 'Edit beats, note positions, rests and tempo changes. Saving does not verify this against a recording.');
    editor.showModal();
  });
  document.getElementById('song-editor-close')!.onclick = () => editor.close();
  const readEditor = () => {
    const current = tools.editing();
    if (!current) throw new Error('Choose a song first.');
    let raw: unknown;
    try { raw = JSON.parse(textarea.value); } catch { throw new Error('Invalid JSON. Nothing was saved.'); }
    const timing = validateTiming(raw);
    const title = input('song-timing-title').value.trim();
    if (!title) throw new Error('Enter a title.');
    return { ...current.song, title, timing, bpm: timing.bpm, isCustom: true,
      id: current.song.isCustom ? current.song.id : `custom_${crypto.randomUUID()}`,
      source: input('song-timing-source').value.trim(), versionLabel: input('song-timing-version').value.trim() };
  };
  document.getElementById('song-editor-save')!.onclick = () => {
    try {
      const song = readEditor();
      saveCustomSong(song);
      tools.open(song.id);
      editor.close();
    } catch (error) { message('song-editor-status', errorText(error)); }
  };
  document.getElementById('song-editor-export')!.onclick = () => {
    try {
      const song = readEditor();
      const url = URL.createObjectURL(new Blob([JSON.stringify(song, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'guitar-studio-song.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      message('song-editor-status', 'Exported timing and metadata. Import the JSON to restore it.');
    } catch (error) { message('song-editor-status', errorText(error)); }
  };
  document.getElementById('btn-save-custom-song')!.onclick = () => {
    try {
      const song = importSong((document.getElementById('custom-song-lyrics') as HTMLTextAreaElement).value, {
        title: input('custom-song-title-input').value.trim(), artist: input('custom-song-artist-input').value.trim(),
        key: input('custom-song-key').value, bpm: Number(input('custom-song-bpm').value),
        strum: input('custom-song-strum').value, source: input('custom-song-source').value.trim(),
        versionLabel: input('custom-song-version').value.trim(),
      }, `custom_${crypto.randomUUID()}`);
      saveCustomSong(song);
      document.getElementById('custom-song-modal')!.style.display = 'none';
      tools.open(song.id);
    } catch (error) { message('custom-song-status', errorText(error)); }
  };

  const searchInput = input('search-song-input');
  const field = document.getElementById('song-search-field') as HTMLSelectElement;
  const content = document.getElementById('song-search-content') as HTMLSelectElement;
  const results = document.getElementById('search-results')!;
  const search = () => {
    results.replaceChildren();
    results.style.display = 'block';
    const filters: FinderFilters = {
      field: field.value === 'title' || field.value === 'artist' ? field.value : 'all',
      content: content.value === 'chords' || content.value === 'tabs' || content.value === 'imported' ? content.value : 'all',
    };
    try {
      const songs = searchSongs(tools.catalog(), searchInput.value, filters);
      message('song-search-status', songs.length ? `${songs.length} local results. Chord charts and melody excerpts are not verified full arrangements.` : 'No local matches. Try a title or artist, or import your own chart/timing JSON. This is not an online tab search.');
      for (const song of songs) {
        const card = document.createElement('article');
        card.className = 'song-search-result';
        const title = document.createElement('h3'); title.textContent = song.title;
        const artist = document.createElement('p'); artist.textContent = song.artist;
        const capability = document.createElement('p'); capability.textContent = song.availability.labels.join(' · ');
        const provenance = document.createElement('p'); provenance.textContent = [song.source, song.versionLabel].filter(Boolean).join(' · ');
        const button = document.createElement('button');
        button.className = 'btn btn-secondary'; button.dataset.songId = song.id;
        const part = filters.content === 'tabs' ? 'notes' : song.availability.chords ? 'chords' : 'notes';
        button.textContent = song.availability.chords || song.availability.tabs ? 'Open available chart' : 'Open source text';
        button.onclick = () => tools.open(song.id, part);
        card.append(title, artist, capability, provenance, button);
        results.append(card);
      }
    } catch (error) { message('song-search-status', errorText(error)); }
  };
  document.getElementById('btn-search-song')!.onclick = search;
  searchInput.onkeydown = event => { if (event.key === 'Enter') search(); };
  field.onchange = search; content.onchange = search;
  let timer: number | null = null;
  searchInput.oninput = () => {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(search, 120);
  };
}
