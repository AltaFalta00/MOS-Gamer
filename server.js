import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { saveGame, getGame, listGames, deleteGame, renameGame, voteGame, rateGame, getUnratedGames, updateComplexity, updateTags, getAllGamesForTagging } from './db.js';

const app = express();
const PORT = 3000;

let apiKey = process.env.ANTHROPIC_API_KEY || '';
let client = null;

function initClient() {
  if (apiKey && apiKey !== 'your-api-key-here') {
    client = new Anthropic({ apiKey });
    return true;
  }
  return false;
}

initClient();
if (!client) {
  console.log('Kein API-Key gesetzt. Key kann ueber die App eingegeben werden.');
}

app.use(express.json({ limit: '500kb' }));
app.use(express.static('public'));

// API-Key Status pruefen
app.get('/api/key-status', (req, res) => {
  res.json({ hasKey: !!client });
});

// API-Key setzen
app.post('/api/key', async (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string' || !key.startsWith('sk-ant-')) {
    return res.status(400).json({ error: 'Ungueltiger API-Key. Muss mit sk-ant- beginnen.' });
  }

  // Key testen
  try {
    const testClient = new Anthropic({ apiKey: key });
    await testClient.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    });
  } catch (err) {
    if (err.status === 401) {
      return res.status(400).json({ error: 'API-Key ist ungueltig oder deaktiviert.' });
    }
  }

  // Key speichern
  apiKey = key;
  client = new Anthropic({ apiKey });

  // In .env schreiben fuer Persistenz
  const fs = await import('fs');
  fs.writeFileSync('.env', `ANTHROPIC_API_KEY=${key}\n`);
  console.log('API-Key gesetzt und in .env gespeichert.');

  res.json({ ok: true });
});

const SYSTEM_PROMPT = `Du bist ein Spiele-Entwickler der HTML5 Canvas Spiele erstellt.

Regeln:
- Generiere ein komplettes, eigenständiges HTML5-Dokument mit einem Spiel
- Nutze <canvas> für die Grafik
- Verwende einfache Formen (Rechtecke, Kreise, Dreiecke, Linien) statt Bilder
- Alles muss in EINEM einzigen HTML-Dokument funktionieren (inline CSS + JS)
- Implementiere Tastatur- und/oder Maus-Steuerung
- Füge ein Score-System hinzu wenn es zum Spiel passt
- Alle Texte im Spiel auf Deutsch
- Das Canvas soll sich an die verfügbare Größe anpassen (100% width/height des Viewports)
- Das Spiel soll spaßig und kinderfreundlich sein
- Das Spiel selbst soll modern und visuell ansprechend aussehen: saubere Grafik, weiche Farben, Schatten, Farbverlaeufe, Partikeleffekte wo passend. Keine grellen Neonfarben, aber auch nicht langweilig — cool und stylisch
- Verwende KEINE Emojis in Texten oder als Grafik-Ersatz. Zeichne stattdessen alles mit Canvas-Formen (Kreise, Rechtecke, Linien etc.)
- Füge eine kurze Anleitung am Anfang des Spiels ein (Overlay oder Startscreen)
- NUR der Startscreen soll im Retro-Arcade-Stil sein: grosse pixelige Schrift (bold, Uppercase), pulsierender/blinkender "Klicke zum Starten"-Text, dunkler Hintergrund mit dem Spieltitel prominent in der Mitte. Das eigentliche Spiel danach soll NICHT retro aussehen sondern modern und hochwertig
- WICHTIG: Der Startscreen muss per Mausklick UND per beliebiger Taste startbar sein. Registriere BEIDE Events: canvas.addEventListener('click') und window.addEventListener('keydown'). Der Text soll "Klicke oder druecke eine Taste zum Starten" heissen
- Das Spiel muss sofort spielbar sein nach dem Laden
- Wenn der Spieler verliert: zeige einen Game-Over-Screen mit dem erreichten Score und einem "Nochmal spielen"-Button der das Spiel komplett neustartet

WICHTIG: Antworte AUSSCHLIESSLICH mit dem reinen HTML-Code.
Kein Markdown, keine Erklärungen, keine \`\`\`html Code-Fences.
Die Antwort muss mit <!DOCTYPE html> oder <html beginnen und mit </html> enden.`;

function extractHtml(text) {
  // Falls Claude trotzdem Code-Fences nutzt, extrahieren
  const fenceMatch = text.match(/```html?\s*\n([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Falls der Text mit Erklaerung beginnt, HTML-Block extrahieren
  const htmlMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (htmlMatch) {
    return htmlMatch[1].trim();
  }

  // Fallback: ganzen Text nehmen
  return text.trim();
}

function analyzeComplexity(html) {
  let score = 0;
  const lines = html.split('\n').length;

  // Code-Umfang (0-2 Punkte) - strenger
  if (lines > 150) score++;
  if (lines > 350) score++;

  // Funktionen (0-2 Punkte) - strenger
  const funcCount = (html.match(/function\s+\w+|=>\s*\{/g) || []).length;
  if (funcCount >= 8) score++;
  if (funcCount >= 18) score++;

  // Event-Handling (0-1 Punkt) - strenger
  const events = (html.match(/addEventListener/gi) || []).length;
  if (events >= 4) score++;

  // Canvas-Operationen (0-2 Punkte) - strenger
  const canvasOps = (html.match(/\.(fillRect|arc|stroke|lineTo|drawImage|fillText|clearRect|beginPath|moveTo|bezierCurveTo|quadraticCurveTo|save|restore|translate|rotate)\(/g) || []).length;
  if (canvasOps >= 10) score++;
  if (canvasOps >= 25) score++;

  // Kollisionserkennung (0-1 Punkt)
  if (/collision|intersect|overlap|Math\.hypot|hitbox/i.test(html)) score++;

  // Mehrere Game-States (0-1 Punkt)
  if (/gameState|state\s*===|isRunning|isPaused/i.test(html)) score++;

  // Partikel-System (0-1 Punkt) - echtes Partikel-System
  if (/particle/i.test(html) && /\.push\(/g.test(html)) score++;

  // Mehrere Levels/Schwierigkeit (0-1 Punkt)
  if (/level|wave|difficulty|stufe|schwierigkeit/i.test(html)) score++;

  // KI/Gegner-Verhalten (0-1 Punkt)
  if (/enemy|gegner|opponent|feind|enemies/i.test(html) && funcCount >= 5) score++;

  // Max ~12 Punkte → 1-5 Sterne
  if (score <= 2) return 1;
  if (score <= 4) return 2;
  if (score <= 6) return 3;
  if (score <= 8) return 4;
  return 5;
}

const TAG_RULES = [
  { tag: 'Action', patterns: /shooter|schieß|shoot|kampf|fight|battle|angriff|waffe|sword|schwert|bombe|explo/i },
  { tag: 'Arcade', patterns: /fang|ausweich|sammle|catch|dodge|collect|fallend|snake|tetris|breakout|pong/i },
  { tag: 'Puzzle', patterns: /puzzle|raetsel|rätsel|logik|match|memory|sortier|knobel/i },
  { tag: 'Quiz', patterns: /quiz|frage|wissen|antwort|multiple.?choice|ratespiel/i },
  { tag: 'Sport', patterns: /ping.?pong|fussball|fußball|tennis|basketball|sport|ball|golf|hockey|rennen|race/i },
  { tag: 'Weltraum', patterns: /weltraum|space|rakete|asteroid|planet|alien|ufo|stern|galaxy|galaxie|raumschiff/i },
  { tag: 'Jump & Run', patterns: /jump|spring|plattform|huepf|hüpf|laufen|runner|parkour|mario/i },
  { tag: 'Strategie', patterns: /strategie|tower|defense|verteidig|aufbau|taktik|schach|chess/i },
  { tag: 'Labyrinth', patterns: /labyrinth|maze|irrgarten|weg.?find/i },
  { tag: 'Mehrspieler', patterns: /zwei.?spieler|multiplayer|2.?spieler|mehrspieler|coop|versus|gegeneinander/i },
  { tag: 'Kreativ', patterns: /mal|zeichen|paint|draw|bau|build|kreativ|design|kunst/i },
  { tag: 'Geschicklichkeit', patterns: /geschick|timing|reaktion|schnell|speed|flappy|click|klick|tippen/i },
];

function detectTags(prompt) {
  const tags = [];
  for (const rule of TAG_RULES) {
    if (rule.patterns.test(prompt)) {
      tags.push(rule.tag);
    }
  }
  if (tags.length === 0) tags.push('Sonstige');
  return tags.join(',');
}

// Retroaktive Komplexitaets-Analyse fuer bestehende Spiele
const unrated = getUnratedGames();
if (unrated.length > 0) {
  console.log(`Analysiere ${unrated.length} bestehende Spiele...`);
  for (const game of unrated) {
    const c = analyzeComplexity(game.html);
    updateComplexity(game.id, c);
  }
  console.log('Komplexitaets-Analyse abgeschlossen.');
}

// Retroaktives Tagging
const untagged = getAllGamesForTagging().filter(g => !g.tags);
if (untagged.length > 0) {
  console.log(`Tagge ${untagged.length} bestehende Spiele...`);
  for (const game of untagged) {
    updateTags(game.id, detectTags(game.prompt));
  }
  console.log('Tagging abgeschlossen.');
}

app.post('/api/generate', async (req, res) => {
  if (!client) {
    return res.status(400).json({ error: 'Kein API-Key gesetzt. Bitte zuerst in den Einstellungen eintragen.' });
  }
  const { prompt, title } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt fehlt oder ist ungültig.' });
  }

  if (prompt.length > 1000) {
    return res.status(400).json({ error: 'Prompt ist zu lang (max. 1000 Zeichen).' });
  }

  // SSE-Headers setzen und sofort senden
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let clientDisconnected = false;
  res.on('close', () => { clientDisconnected = true; });

  try {
    console.log(`Generiere Spiel für Prompt: "${prompt.substring(0, 80)}..."`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Erstelle folgendes Spiel: ${prompt}` }
      ]
    });

    let fullText = '';

    for await (const event of response) {
      if (clientDisconnected) break;

      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullText += text;
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      }
    }

    if (clientDisconnected) return;

    const html = extractHtml(fullText);
    const complexity = analyzeComplexity(html);
    const tags = detectTags(prompt);
    const id = saveGame(prompt, html, typeof title === 'string' ? title.trim() : '', complexity, tags);
    console.log(`Spiel generiert (${html.length} Zeichen, id: ${id}, complexity: ${complexity}/5, tags: ${tags})`);

    res.write(`data: ${JSON.stringify({ done: true, html, id })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Claude API Fehler:', err.status, err.message);

    let errorMsg = 'Spiel konnte nicht generiert werden. Bitte versuche es nochmal.';
    if (err.status === 401) errorMsg = 'API-Key ungültig. Bitte prüfe die .env Datei.';
    else if (err.status === 429) errorMsg = 'Zu viele Anfragen. Bitte warte kurz und versuche es nochmal.';
    else if (err.status === 529) errorMsg = 'Claude ist gerade überlastet. Bitte versuche es in einer Minute nochmal.';

    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    }
  }
});

// Verbesserungsvorschlaege generieren
app.post('/api/suggest', async (req, res) => {
  const { prompt, html } = req.body;
  if (!prompt || !html) {
    return res.status(400).json({ error: 'Prompt und HTML erforderlich.' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      system: `Du bist ein erfahrener Game-Designer der HTML5 Canvas Spiele analysiert und konkrete Verbesserungsvorschlaege macht.

Antworte AUSSCHLIESSLICH mit einem JSON-Array von genau 3 Vorschlaegen.
Jeder Vorschlag hat "title" (kurz, 3-6 Woerter) und "description" (1 Satz, was genau verbessert wird).

Die Vorschlaege sollen:
- Kreativ und spassig sein
- Das Spiel spuerbar besser machen
- Technisch machbar sein (Canvas, JS)
- Unterschiedliche Aspekte abdecken (Gameplay, Grafik, Features)

Beispiel-Format:
[
  {"title": "Partikel-Explosionen", "description": "Bunte Partikeleffekte wenn Objekte zerstoert werden."},
  {"title": "Power-Ups einbauen", "description": "Zufaellige Power-Ups die Geschwindigkeit oder Staerke boosten."},
  {"title": "Schwierigkeitsgrade", "description": "Das Spiel wird mit der Zeit schneller und schwieriger."}
]

NUR das JSON-Array, kein weiterer Text.`,
      messages: [
        { role: 'user', content: `Analysiere dieses Spiel (Prompt: "${prompt}") und schlage 3 konkrete Verbesserungen vor:\n\n${html.substring(0, 8000)}` }
      ]
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Vorschlaege konnten nicht generiert werden.' });
    }
    const suggestions = JSON.parse(jsonMatch[0]);
    res.json({ suggestions });
  } catch (err) {
    console.error('Suggest Fehler:', err.message);
    res.status(500).json({ error: 'Vorschlaege konnten nicht generiert werden.' });
  }
});

// Spiel mit Verbesserungen neu generieren (SSE Streaming)
app.post('/api/improve', async (req, res) => {
  const { prompt, html, suggestions, gameId } = req.body;
  if (!prompt || !html || !suggestions || !suggestions.length) {
    return res.status(400).json({ error: 'Prompt, HTML und Vorschlaege erforderlich.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let clientDisconnected = false;
  res.on('close', () => { clientDisconnected = true; });

  try {
    const improvementList = suggestions.map((s, i) => `${i + 1}. ${s.title}: ${s.description}`).join('\n');

    console.log(`Verbessere Spiel mit ${suggestions.length} Vorschlaegen...`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Erstelle folgendes Spiel: ${prompt}` },
        { role: 'assistant', content: html },
        { role: 'user', content: `Sehr gut! Bitte verbessere das Spiel mit folgenden Aenderungen:\n\n${improvementList}\n\nGeneriere das KOMPLETTE verbesserte HTML-Dokument neu. Behalte alles Gute bei und fuege die Verbesserungen hinzu.` }
      ]
    });

    let fullText = '';

    for await (const event of response) {
      if (clientDisconnected) break;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        const text = event.delta.text;
        fullText += text;
        res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      }
    }

    if (clientDisconnected) return;

    const improvedHtml = extractHtml(fullText);
    const complexity = analyzeComplexity(improvedHtml);

    const improvedTags = detectTags(prompt);
    const id = saveGame(prompt + ' (verbessert)', improvedHtml, '', complexity, improvedTags);

    console.log(`Spiel verbessert (${improvedHtml.length} Zeichen, id: ${id}, complexity: ${complexity}/5)`);

    res.write(`data: ${JSON.stringify({ done: true, html: improvedHtml, id })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Improve Fehler:', err.status, err.message);
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ error: 'Verbesserung fehlgeschlagen. Bitte versuche es nochmal.' })}\n\n`);
      res.end();
    }
  }
});

// Liste aller Spiele (ohne HTML)
app.get('/api/games', (req, res) => {
  res.json(listGames());
});

// Einzelnes Spiel als JSON
app.get('/api/games/:id', (req, res) => {
  const game = getGame(req.params.id);
  if (!game) {
    return res.status(404).json({ error: 'Spiel nicht gefunden.' });
  }
  res.json(game);
});

// Spiel loeschen
app.delete('/api/games/:id', (req, res) => {
  if (deleteGame(req.params.id)) {
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Spiel nicht gefunden.' });
  }
});

// Spiel umbenennen
app.patch('/api/games/:id/title', (req, res) => {
  const { title } = req.body;
  if (!title || typeof title !== 'string' || title.length > 200) {
    return res.status(400).json({ error: 'Titel ungueltig.' });
  }
  if (renameGame(req.params.id, title.trim())) {
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Spiel nicht gefunden.' });
  }
});

// Spiel voten (+1 oder -1)
app.post('/api/games/:id/vote', (req, res) => {
  const { delta } = req.body;
  if (delta !== 1 && delta !== -1) {
    return res.status(400).json({ error: 'Delta muss 1 oder -1 sein.' });
  }
  if (voteGame(req.params.id, delta)) {
    const game = getGame(req.params.id);
    res.json({ votes: game.votes });
  } else {
    res.status(404).json({ error: 'Spiel nicht gefunden.' });
  }
});

// Spiel bewerten (1-5 Sterne)
app.post('/api/games/:id/rate', (req, res) => {
  const { rating } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Bewertung muss zwischen 1 und 5 sein.' });
  }
  if (rateGame(req.params.id, rating)) {
    res.json({ user_rating: rating });
  } else {
    res.status(404).json({ error: 'Spiel nicht gefunden.' });
  }
});

// Share-Seite: Spiel im iframe
app.get('/game/:id', (req, res) => {
  const game = getGame(req.params.id);
  if (!game) {
    return res.status(404).send('Spiel nicht gefunden.');
  }
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MOSGAMER - ${game.prompt.substring(0, 60)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f2f4f7; height: 100vh; display: flex; flex-direction: column; font-family: 'Segoe UI', system-ui, sans-serif; }
    .header { padding: 0.5rem 1rem; background: #3968a8; display: flex; align-items: center; gap: 1rem; }
    .header a { color: #fff; text-decoration: none; font-weight: 500; padding: 0.4rem 1.2rem; border: 1.5px solid rgba(255,255,255,0.4); border-radius: 50px; background: transparent; transition: all 0.2s; font-size: 0.88rem; }
    .header a:hover { background: rgba(255,255,255,0.15); border-color: #fff; }
    .header span { color: rgba(255,255,255,0.75); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    iframe { flex: 1; width: 100%; border: none; background: #fff; }
  </style>
</head>
<body>
  <div class="header">
    <a href="/">Neues Spiel</a>
    <span>${game.prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
  </div>
  <iframe sandbox="allow-scripts" srcdoc="${game.html.replace(/"/g, '&quot;')}"></iframe>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`PromptGame Server läuft auf http://localhost:${PORT}`);
});
