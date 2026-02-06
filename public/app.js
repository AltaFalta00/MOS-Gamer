const creatorScreen = document.getElementById('creator');
const loadingScreen = document.getElementById('loading');
const gameScreen = document.getElementById('game');
const galleryScreen = document.getElementById('gallery');
const promptInput = document.getElementById('prompt-input');
const generateBtn = document.getElementById('generate-btn');
const galleryBtn = document.getElementById('nav-gallery-btn');
const backBtn = document.getElementById('back-btn');
const galleryBackBtn = document.getElementById('gallery-back-btn');
const gameFrame = document.getElementById('game-frame');
const charCount = document.getElementById('char-count');
const categoryBtns = document.querySelectorAll('.category-btn');
const shareLink = document.getElementById('share-link');
const galleryList = document.getElementById('gallery-list');
const galleryEmpty = document.getElementById('gallery-empty');
const codeOutput = document.getElementById('code-output');
const codeLines = document.getElementById('code-lines');
const loadingPhase = document.getElementById('loading-phase');
const nameInput = document.getElementById('name-input');
const suggestionsPanel = document.getElementById('suggestions-panel');
const suggestionsList = document.getElementById('suggestions-list');
const suggestionsClose = document.getElementById('suggestions-close');
const applyBtn = document.getElementById('apply-suggestions-btn');

// Aktuelles Spiel merken fuer Verbesserungen
let currentGame = { prompt: '', html: '', id: null };

// API-Key Modal
const keyModal = document.getElementById('key-modal');
const keyInput = document.getElementById('key-input');
const keySave = document.getElementById('key-save');
const keyCancel = document.getElementById('key-cancel');
const keyError = document.getElementById('key-error');
const keySuccess = document.getElementById('key-success');
const keyBtn = document.getElementById('key-btn');

function showKeyModal() {
  keyModal.style.display = '';
  keyError.style.display = 'none';
  keySuccess.style.display = 'none';
  keyInput.value = '';
  keyInput.focus();
}

function hideKeyModal() {
  keyModal.style.display = 'none';
}

keyBtn.addEventListener('click', showKeyModal);
keyCancel.addEventListener('click', hideKeyModal);
keyModal.addEventListener('click', (e) => {
  if (e.target === keyModal) hideKeyModal();
});

keySave.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  if (!key) return;
  keySave.disabled = true;
  keySave.textContent = 'Prüfe...';
  keyError.style.display = 'none';
  keySuccess.style.display = 'none';

  try {
    const res = await fetch('/api/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (!res.ok) {
      keyError.textContent = data.error;
      keyError.style.display = '';
    } else {
      keySuccess.style.display = '';
      setTimeout(hideKeyModal, 1000);
    }
  } catch {
    keyError.textContent = 'Verbindungsfehler.';
    keyError.style.display = '';
  } finally {
    keySave.disabled = false;
    keySave.textContent = 'Speichern';
  }
});

// Beim Start pruefen ob Key gesetzt ist
fetch('/api/key-status').then(r => r.json()).then(data => {
  if (!data.hasKey) showKeyModal();
});

// Dark Mode
const themeToggle = document.getElementById('theme-toggle');
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
themeToggle.textContent = savedTheme === 'dark' ? '\u2600' : '\u263E';

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  themeToggle.textContent = next === 'dark' ? '\u2600' : '\u263E';
});

// Fullscreen
const fullscreenBtn = document.getElementById('fullscreen-btn');
fullscreenBtn.addEventListener('click', () => {
  const frame = document.getElementById('game-frame');
  if (frame.requestFullscreen) frame.requestFullscreen();
  else if (frame.webkitRequestFullscreen) frame.webkitRequestFullscreen();
  else if (frame.msRequestFullscreen) frame.msRequestFullscreen();
});

function showScreen(screen) {
  [creatorScreen, loadingScreen, gameScreen, galleryScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// Kategorie-Buttons
categoryBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    categoryBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    promptInput.value = btn.dataset.prompt;
    charCount.textContent = promptInput.value.length;
  });
});

// Zeichenzaehler
promptInput.addEventListener('input', () => {
  charCount.textContent = promptInput.value.length;
});

// Fehlermeldung entfernen
function clearError() {
  const existing = document.querySelector('.error-msg');
  if (existing) existing.remove();
}

// Fehlermeldung anzeigen
function showError(msg) {
  clearError();
  const el = document.createElement('div');
  el.className = 'error-msg';
  el.textContent = msg;
  generateBtn.insertAdjacentElement('afterend', el);
}

// Phasen-Erkennung anhand des generierten Codes
const phases = [
  { pattern: /<!DOCTYPE|<html/i, label: 'HTML-Grundgerüst wird erstellt...' },
  { pattern: /<title/i, label: 'Spieltitel wird gesetzt...' },
  { pattern: /<style/i, label: 'Design wird erstellt...' },
  { pattern: /<canvas/i, label: 'Spielfeld wird aufgebaut...' },
  { pattern: /<script/i, label: 'Spiellogik wird programmiert...' },
  { pattern: /function\s+draw|\.fillRect|\.arc\(|\.stroke/i, label: 'Grafiken werden gezeichnet...' },
  { pattern: /addEventListener|onkey|onclick/i, label: 'Steuerung wird eingebaut...' },
  { pattern: /requestAnimationFrame|gameLoop|setInterval/i, label: 'Spielschleife wird gestartet...' },
  { pattern: /score|punkt/i, label: 'Punktesystem wird eingebaut...' },
  { pattern: /collision|kollision|intersect|overlap/i, label: 'Kollisionserkennung...' },
  { pattern: /<\/script>/i, label: 'Code wird abgeschlossen...' },
  { pattern: /<\/html>/i, label: 'Fast fertig...' },
];

let lastPhaseIndex = -1;

function detectPhase(fullText) {
  for (let i = phases.length - 1; i > lastPhaseIndex; i--) {
    if (phases[i].pattern.test(fullText)) {
      lastPhaseIndex = i;
      loadingPhase.textContent = phases[i].label;
      return;
    }
  }
}

// Code-Anzeige aktualisieren (nur letzte ~80 Zeilen anzeigen)
const MAX_DISPLAY_LINES = 80;
let lineCount = 0;

function appendCode(chunk) {
  codeOutput.textContent += chunk;
  lineCount = codeOutput.textContent.split('\n').length;
  codeLines.textContent = `${lineCount} Zeilen`;

  // Nur die letzten Zeilen anzeigen fuer Performance
  const lines = codeOutput.textContent.split('\n');
  if (lines.length > MAX_DISPLAY_LINES) {
    codeOutput.textContent = lines.slice(-MAX_DISPLAY_LINES).join('\n');
  }

  // Auto-scroll
  codeOutput.scrollTop = codeOutput.scrollHeight;
}

function resetCodeDisplay() {
  codeOutput.textContent = '';
  codeLines.textContent = '0 Zeilen';
  loadingPhase.textContent = 'Verbinde mit Claude...';
  lastPhaseIndex = -1;
  lineCount = 0;
}

// Share-Link anzeigen
function showShareLink(id) {
  const url = `${location.origin}/game/${id}`;
  shareLink.style.display = '';
  shareLink.textContent = url;
  shareLink.title = 'Klicken zum Kopieren';
  shareLink.onclick = () => {
    navigator.clipboard.writeText(url).then(() => {
      const original = shareLink.textContent;
      shareLink.textContent = 'Link kopiert!';
      setTimeout(() => { shareLink.textContent = original; }, 2000);
    });
  };
}

// Galerie laden und rendern
let allGames = [];
let activeFilter = null;
const sortSelect = document.getElementById('sort-select');

function sortGames(games) {
  const sorted = [...games];
  switch (sortSelect.value) {
    case 'ki-best': sorted.sort((a, b) => (b.complexity || 0) - (a.complexity || 0)); break;
    case 'ki-worst': sorted.sort((a, b) => (a.complexity || 0) - (b.complexity || 0)); break;
    case 'user-best': sorted.sort((a, b) => (b.user_rating || 0) - (a.user_rating || 0)); break;
    case 'user-worst': sorted.sort((a, b) => (a.user_rating || 0) - (b.user_rating || 0)); break;
    case 'votes': sorted.sort((a, b) => (b.votes || 0) - (a.votes || 0)); break;
    default: break;
  }
  return sorted;
}

function applyFilterAndSort() {
  let filtered = activeFilter
    ? allGames.filter(g => g.tags && g.tags.split(',').includes(activeFilter))
    : allGames;
  renderGallery(sortGames(filtered));
}

sortSelect.addEventListener('change', applyFilterAndSort);

async function loadGallery() {
  try {
    const res = await fetch('/api/games');
    allGames = await res.json();
    activeFilter = null;
    sortSelect.value = 'newest';
    renderTagFilter(allGames);
    renderGallery(allGames);
  } catch {
    galleryList.innerHTML = '<p style="color:var(--text-muted)">Fehler beim Laden der Galerie.</p>';
  }
}

function renderTagFilter(games) {
  const tagSet = new Set();
  for (const g of games) {
    if (g.tags) g.tags.split(',').forEach(t => tagSet.add(t));
  }
  const container = document.getElementById('tag-filter');
  container.innerHTML = '';
  if (tagSet.size === 0) return;

  const allBtn = document.createElement('button');
  allBtn.className = 'tag-filter-btn active';
  allBtn.textContent = 'Alle';
  allBtn.addEventListener('click', () => {
    activeFilter = null;
    container.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
    allBtn.classList.add('active');
    applyFilterAndSort();
  });
  container.appendChild(allBtn);

  for (const tag of [...tagSet].sort()) {
    const btn = document.createElement('button');
    btn.className = 'tag-filter-btn';
    btn.textContent = tag;
    btn.addEventListener('click', () => {
      activeFilter = tag;
      container.querySelectorAll('.tag-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyFilterAndSort();
    });
    container.appendChild(btn);
  }
}

function renderGallery(games) {
  galleryList.innerHTML = '';
  if (games.length === 0) {
    galleryEmpty.style.display = '';
    return;
  }
  galleryEmpty.style.display = 'none';
  for (const game of games) {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.dataset.id = game.id;
    const date = new Date(game.created_at + 'Z');
    const displayTitle = game.title || game.prompt;
    const votes = game.votes || 0;
    const complexity = game.complexity || 0;
    const userRating = game.user_rating || 0;
    const complexityStars = '\u2605'.repeat(complexity) + '\u2606'.repeat(5 - complexity);

    let userStarsHtml = '';
    for (let i = 1; i <= 5; i++) {
      const filled = i <= userRating;
      userStarsHtml += `<span class="user-star ${filled ? 'filled' : ''}" data-id="${game.id}" data-rating="${i}">\u2605</span>`;
    }

    const gameTags = game.tags ? game.tags.split(',') : [];
    const tagsHtml = gameTags.map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('');

    card.innerHTML = `
      <a href="/game/${game.id}" class="gallery-card-title">${escapeHtml(displayTitle)}</a>
      <div class="gallery-card-meta">
        <span class="gallery-card-date">${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      ${tagsHtml ? `<div class="gallery-card-tags">${tagsHtml}</div>` : ''}
      <div class="gallery-card-ratings">
        <div class="rating-row">
          <span class="rating-label">KI</span>
          <span class="complexity" title="KI-Komplexität: ${complexity}/5">${complexityStars}</span>
        </div>
        <div class="rating-row">
          <span class="rating-label">Mensch</span>
          <span class="user-rating" data-id="${game.id}">${userStarsHtml}</span>
        </div>
      </div>
      <div class="gallery-card-actions">
        <div class="vote-controls">
          <button class="vote-btn vote-up" data-id="${game.id}" data-delta="1" title="Upvote">&#9650;</button>
          <span class="vote-count" data-id="${game.id}">${votes}</span>
          <button class="vote-btn vote-down" data-id="${game.id}" data-delta="-1" title="Downvote">&#9660;</button>
        </div>
        <div class="card-tools">
          <button class="tool-btn rename-btn" data-id="${game.id}" title="Umbenennen">&#9998;</button>
          <button class="tool-btn delete-btn" data-id="${game.id}" title="Löschen">&#128465;</button>
        </div>
      </div>
    `;
    galleryList.appendChild(card);
  }
}

// Galerie-Aktionen (Event Delegation)
galleryList.addEventListener('click', async (e) => {
  const userStar = e.target.closest('.user-star');
  const voteBtn = e.target.closest('.vote-btn');
  const deleteBtn = e.target.closest('.delete-btn');
  const renameBtn = e.target.closest('.rename-btn');

  if (userStar) {
    e.preventDefault();
    const id = userStar.dataset.id;
    const rating = Number(userStar.dataset.rating);
    try {
      const res = await fetch(`/api/games/${id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      });
      if (res.ok) {
        const container = galleryList.querySelector(`.user-rating[data-id="${id}"]`);
        if (container) {
          container.querySelectorAll('.user-star').forEach(s => {
            s.classList.toggle('filled', Number(s.dataset.rating) <= rating);
          });
        }
      }
    } catch { /* ignore */ }
  }

  if (voteBtn) {
    e.preventDefault();
    const id = voteBtn.dataset.id;
    const delta = Number(voteBtn.dataset.delta);
    try {
      const res = await fetch(`/api/games/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta })
      });
      const data = await res.json();
      if (res.ok) {
        const counter = galleryList.querySelector(`.vote-count[data-id="${id}"]`);
        if (counter) counter.textContent = data.votes;
      }
    } catch { /* ignore */ }
  }

  if (deleteBtn) {
    e.preventDefault();
    const id = deleteBtn.dataset.id;
    if (!confirm('Spiel wirklich löschen?')) return;
    try {
      const res = await fetch(`/api/games/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const card = deleteBtn.closest('.gallery-card');
        card.remove();
        if (!galleryList.children.length) galleryEmpty.style.display = '';
      }
    } catch { /* ignore */ }
  }

  if (renameBtn) {
    e.preventDefault();
    const id = renameBtn.dataset.id;
    const card = renameBtn.closest('.gallery-card');
    const titleEl = card.querySelector('.gallery-card-title');
    const newTitle = prompt('Neuer Titel:', titleEl.textContent);
    if (!newTitle || !newTitle.trim()) return;
    try {
      const res = await fetch(`/api/games/${id}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      if (res.ok) {
        titleEl.textContent = newTitle.trim();
      }
    } catch { /* ignore */ }
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Verbesserungsvorschlaege laden
async function fetchSuggestions() {
  suggestionsPanel.style.display = '';
  suggestionsList.innerHTML = '<span class="suggestions-loading">Vorschläge werden geladen...</span>';
  applyBtn.disabled = true;

  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: currentGame.prompt, html: currentGame.html })
    });
    const data = await res.json();
    if (!res.ok || !data.suggestions) throw new Error();
    renderSuggestions(data.suggestions);
  } catch {
    suggestionsList.innerHTML = '<span class="suggestions-loading">Vorschläge konnten nicht geladen werden.</span>';
  }
}

function renderSuggestions(suggestions) {
  suggestionsList.innerHTML = '';
  for (const s of suggestions) {
    const chip = document.createElement('label');
    chip.className = 'suggestion-chip';
    chip.innerHTML = `
      <input type="checkbox" class="suggestion-cb" checked>
      <span class="suggestion-content">
        <strong>${escapeHtml(s.title)}</strong>
        <span>${escapeHtml(s.description)}</span>
      </span>
    `;
    chip.dataset.title = s.title;
    chip.dataset.description = s.description;
    suggestionsList.appendChild(chip);
  }
  updateApplyBtn();
}

function getSelectedSuggestions() {
  const chips = suggestionsList.querySelectorAll('.suggestion-chip');
  const selected = [];
  chips.forEach(chip => {
    if (chip.querySelector('.suggestion-cb').checked) {
      selected.push({ title: chip.dataset.title, description: chip.dataset.description });
    }
  });
  return selected;
}

function updateApplyBtn() {
  applyBtn.disabled = getSelectedSuggestions().length === 0;
  suggestionsList.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.classList.toggle('checked', chip.querySelector('.suggestion-cb').checked);
  });
}

suggestionsList.addEventListener('change', updateApplyBtn);

const suggestionsToggle = document.getElementById('suggestions-toggle');
const suggestionsBody = document.getElementById('suggestions-body');

suggestionsToggle.addEventListener('click', (e) => {
  if (e.target.closest('.suggestions-close')) return;
  suggestionsBody.classList.toggle('collapsed');
  const arrow = suggestionsPanel.querySelector('.suggestions-arrow');
  arrow.style.transform = suggestionsBody.classList.contains('collapsed') ? '' : 'rotate(90deg)';
});

suggestionsClose.addEventListener('click', () => {
  suggestionsPanel.style.display = 'none';
});

// Verbesserungen anwenden
applyBtn.addEventListener('click', async () => {
  const selected = getSelectedSuggestions();
  if (!selected.length) return;

  suggestionsPanel.style.display = 'none';
  resetCodeDisplay();
  showScreen(loadingScreen);
  loadingPhase.textContent = 'Verbesserungen werden eingebaut...';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('/api/improve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: currentGame.prompt,
        html: currentGame.html,
        suggestions: selected,
        gameId: currentGame.id
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Unbekannter Fehler');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const data = JSON.parse(part.slice(6));
        if (data.error) throw new Error(data.error);
        if (data.chunk) {
          fullText += data.chunk;
          appendCode(data.chunk);
          detectPhase(fullText);
        }
        if (data.done) result = data;
      }
    }

    if (buffer.trim().startsWith('data: ')) {
      const data = JSON.parse(buffer.trim().slice(6));
      if (data.error) throw new Error(data.error);
      if (data.done) result = data;
    }

    if (!result || !result.html) {
      throw new Error('Verbesserung unvollständig. Bitte versuche es nochmal.');
    }

    currentGame.html = result.html;
    currentGame.id = result.id;
    gameFrame.srcdoc = result.html;
    showScreen(gameScreen);
    if (result.id) showShareLink(result.id);
    fetchSuggestions();
  } catch (err) {
    showScreen(gameScreen);
    if (err.name === 'AbortError') {
      alert('Verbesserung hat zu lange gedauert.');
    } else {
      alert(err.message || 'Verbesserung fehlgeschlagen.');
    }
  } finally {
    clearTimeout(timeout);
  }
});

// Spiel generieren (mit Streaming)
async function generateGame() {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    showError('Bitte beschreibe zuerst dein Spiel!');
    return;
  }

  clearError();
  generateBtn.disabled = true;
  resetCodeDisplay();
  showScreen(loadingScreen);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, title: nameInput.value.trim() }),
      signal: controller.signal
    });

    // Validierungsfehler kommen noch als JSON
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Unbekannter Fehler');
    }

    // SSE-Stream lesen
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let result = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const data = JSON.parse(part.slice(6));

        if (data.error) {
          throw new Error(data.error);
        }

        if (data.chunk) {
          fullText += data.chunk;
          appendCode(data.chunk);
          detectPhase(fullText);
        }

        if (data.done) {
          result = data;
        }
      }
    }

    // Restlichen Buffer verarbeiten (letztes Event)
    if (buffer.trim().startsWith('data: ')) {
      const data = JSON.parse(buffer.trim().slice(6));
      if (data.error) throw new Error(data.error);
      if (data.done) result = data;
    }

    if (!result || !result.html) {
      throw new Error('Das generierte Spiel ist unvollständig. Bitte versuche es nochmal.');
    }

    currentGame = { prompt, html: result.html, id: result.id };
    gameFrame.srcdoc = result.html;
    showScreen(gameScreen);
    if (result.id) {
      showShareLink(result.id);
    }
    fetchSuggestions();
  } catch (err) {
    showScreen(creatorScreen);
    if (err.name === 'AbortError') {
      showError('Die Anfrage hat zu lange gedauert. Bitte versuche es nochmal.');
    } else {
      showError(err.message || 'Etwas ist schiefgelaufen. Bitte versuche es nochmal.');
    }
  } finally {
    clearTimeout(timeout);
    generateBtn.disabled = false;
  }
}

generateBtn.addEventListener('click', generateGame);

// Enter-Taste im Textfeld (Shift+Enter fuer neue Zeile)
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    generateGame();
  }
});

// Neues Spiel
backBtn.addEventListener('click', () => {
  gameFrame.srcdoc = '';
  shareLink.style.display = 'none';
  suggestionsPanel.style.display = 'none';
  showScreen(creatorScreen);
});

// Galerie
galleryBtn.addEventListener('click', () => {
  showScreen(galleryScreen);
  loadGallery();
});

galleryBackBtn.addEventListener('click', () => {
  showScreen(creatorScreen);
});
