(() => {
  'use strict';

  const STORAGE_KEY = 'architecteVie2x:data';
  const state = {
    mode: 'introspection',
    history: [],
    debugVisible: false,
    lastAnalysis: null,
  };

  const weights = {
    discipline: 0.24,
    clarte: 0.21,
    energie: 0.2,
    coherence: 0.2,
    friction: 0.15,
  };

  const refs = {
    modeIntrospection: document.getElementById('modeIntrospection'),
    modeRapide: document.getElementById('modeRapide'),
    introspectionForm: document.getElementById('introspectionForm'),
    rapidForm: document.getElementById('rapidForm'),
    runAnalysis: document.getElementById('runAnalysis'),
    exportPdf: document.getElementById('exportPdf'),
    scoreCircle: document.getElementById('scoreCircle'),
    scoreValue: document.getElementById('scoreValue'),
    gaps: document.getElementById('gaps'),
    levers: document.getElementById('levers'),
    timeline: document.getElementById('timeline'),
    scenarios: document.getElementById('scenarios'),
    primary: document.getElementById('actionsPrimary'),
    secondary: document.getElementById('actionsSecondary'),
    adaptiveNote: document.getElementById('adaptiveNote'),
    metricBars: document.getElementById('metricBars'),
    radarCanvas: document.getElementById('radarCanvas'),
    debugConsole: document.getElementById('debugConsole'),
  };

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const toPercent = (n) => `${Math.round(n)}%`;

  function getInputValue(id, fallback = '') {
    const el = document.getElementById(id);
    return el ? el.value.trim() || fallback : fallback;
  }

  function parseInputScore(id, fallback) {
    const raw = Number(getInputValue(id, String(fallback)));
    return Number.isFinite(raw) ? raw : fallback;
  }

  function parseTags(txt) {
    return txt
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function renderPills(container, items, colorClass = '') {
    container.innerHTML = '';
    items.forEach((txt) => {
      const span = document.createElement('span');
      span.className = `pill ${colorClass}`.trim();
      span.textContent = txt;
      container.appendChild(span);
    });
  }

  function computeMetrics(payload) {
    const required = {
      discipline: clamp(5 + payload.goalComplexity * 0.45, 4, 10),
      clarte: clamp(6 + payload.priorityDensity * 0.4, 4, 10),
      energie: clamp(5 + payload.constraintLoad * 0.35, 4, 10),
      coherence: clamp(6 + payload.habitGap * 0.4, 4, 10),
      friction: clamp(3 + payload.constraintLoad * 0.5, 2, 10),
    };

    const current = {
      discipline: payload.discipline,
      clarte: payload.clarte,
      energie: payload.energie,
      coherence: payload.coherence,
      friction: payload.friction,
    };

    const normalized = {
      discipline: current.discipline / required.discipline,
      clarte: current.clarte / required.clarte,
      energie: current.energie / required.energie,
      coherence: current.coherence / required.coherence,
      friction: required.friction / Math.max(current.friction, 1),
    };

    const score = Object.keys(weights).reduce((acc, key) => {
      const v = clamp(normalized[key], 0, 1.35);
      return acc + (v * 100 * weights[key]);
    }, 0);

    const gaps = Object.keys(current)
      .map((key) => ({
        key,
        delta: key === 'friction' ? current[key] - required[key] : required[key] - current[key],
        current: current[key],
        required: required[key],
      }))
      .sort((a, b) => b.delta - a.delta);

    return {
      score: clamp(score, 0, 100),
      current,
      required,
      gaps,
    };
  }

  function inferPayloadFromMode() {
    if (state.mode === 'rapid') {
      const goal = getInputValue('objectifRapide', 'Objectif stratégique');
      const obstacle = getInputValue('obstacleRapide', 'dispersion');
      const tempsLibre = parseInputScore('tempsLibre', 12);
      const energie = parseInputScore('energieRapide', 6);
      const constance = parseInputScore('constanceRapide', 5);
      const obstaclePenalty = { fatigue: 2, dispersion: 1.5, charge: 1.8, environnement: 2.2 }[obstacle] || 1.5;

      return {
        objectifs: [goal],
        habitudes: ['mode rapide'],
        contraintes: [`obstacle:${obstacle}`],
        priorites: ['vitesse', 'focalisation'],
        discipline: clamp(constance + (tempsLibre > 10 ? 1 : 0), 1, 10),
        clarte: clamp(constance + 1, 1, 10),
        energie: clamp(energie, 1, 10),
        coherence: clamp(constance, 1, 10),
        friction: clamp(obstaclePenalty + (tempsLibre < 8 ? 2 : 1), 1, 10),
        successRate: clamp((constance * 10) + (energie * 4), 10, 95),
        goalComplexity: clamp(goal.length / 30, 1, 10),
        priorityDensity: 4,
        constraintLoad: clamp((20 - tempsLibre) / 2 + obstaclePenalty, 1, 10),
        habitGap: clamp(7 - constance + obstaclePenalty * 0.6, 1, 10),
      };
    }

    const objectifs = parseTags(getInputValue('objectifs'));
    const habitudes = parseTags(getInputValue('habitudes'));
    const contraintes = parseTags(getInputValue('contraintes'));
    const priorites = parseTags(getInputValue('priorites'));

    const discipline = clamp(parseInputScore('discipline', 6), 1, 10);
    const clarte = clamp(parseInputScore('clarte', 6), 1, 10);
    const energie = clamp(parseInputScore('energie', 6), 1, 10);
    const coherence = clamp(parseInputScore('coherence', 6), 1, 10);
    const friction = clamp(parseInputScore('friction', 4), 1, 10);
    const successRate = clamp(parseInputScore('reussite', 62), 0, 100);

    return {
      objectifs,
      habitudes,
      contraintes,
      priorites,
      discipline,
      clarte,
      energie,
      coherence,
      friction,
      successRate,
      goalComplexity: clamp(objectifs.join(' ').length / 25, 1, 10),
      priorityDensity: clamp(priorites.length + (objectifs.length / 2), 1, 10),
      constraintLoad: clamp(contraintes.length * 1.6 + (friction / 2), 1, 10),
      habitGap: clamp(Math.max(2, objectifs.length * 1.1 - habitudes.length * 0.7 + 5), 1, 10),
    };
  }

  function buildGapInsights(gaps) {
    const labels = {
      discipline: 'Discipline instable',
      clarte: 'Vision à clarifier',
      energie: 'Réserves d\'énergie insuffisantes',
      coherence: 'Actions quotidiennes incohérentes',
      friction: 'Friction environnementale élevée',
    };

    return gaps.slice(0, 5).map((g) => {
      const detail = g.delta > 1.6 ? 'écart critique' : g.delta > 0.8 ? 'écart notable' : 'à surveiller';
      return `${labels[g.key]} • ${detail}`;
    });
  }

  function buildLevers(gaps, payload) {
    const topKeys = gaps.slice(0, 3).map((g) => g.key);
    const map = {
      discipline: 'Créer un rituel fixe matin/soir + bloc focus protégé',
      clarte: 'Définir 1 indicateur de victoire hebdomadaire',
      energie: 'Verrouiller sommeil/récupération + micro-pauses actives',
      coherence: 'Mapper chaque habitude à un objectif précis',
      friction: 'Modifier l\'environnement (notifications, espace, déclencheurs)',
    };

    const levers = topKeys.map((k) => map[k]);
    if (payload.successRate < 50) {
      levers[2] = 'Réduire l\'ambition hebdo de 20% pour retrouver la constance';
    }
    return levers;
  }

  function simulateSixMonths(score, payload) {
    const baseProgress = score / 100;
    const fatigue = clamp((payload.constraintLoad + (10 - payload.energie)) / 20, 0.08, 0.75);
    const momentum = clamp((payload.successRate / 100) * 0.65 + (payload.discipline / 10) * 0.35, 0.2, 0.95);

    const scenarios = [
      { name: 'Conservateur', factor: 0.8, risk: 0.35 },
      { name: 'Progressif', factor: 1, risk: 0.22 },
      { name: 'Intensif', factor: 1.18, risk: 0.3 },
    ].map((scenario) => {
      const probability = clamp(
        (baseProgress * 0.45 + momentum * 0.45 - fatigue * scenario.risk * 0.4) * scenario.factor,
        0.1,
        0.96,
      );
      return {
        ...scenario,
        probability,
      };
    });

    const timeline = Array.from({ length: 6 }).map((_, idx) => {
      const month = idx + 1;
      const adaptiveGain = (momentum * 8) - (fatigue * 5) + (idx * 0.9);
      const projected = clamp(score + adaptiveGain * month, 12, 100);
      return {
        month,
        score: projected,
        focus: month % 2 ? 'Constance & clarté' : 'Systèmes & exécution',
      };
    });

    return { scenarios, timeline, fatigue, momentum };
  }

  function generateWeeklyUpgrades(payload, metrics, sim) {
    const stagnation = metrics.score < 55 ? 0.7 : metrics.score < 75 ? 0.4 : 0.18;
    const fatigueLevel = sim.fatigue;
    const successRate = payload.successRate / 100;

    const priority = [
      'Bloc de 45 min de travail profond/jour',
      '1 revue stratégique de 15 min en fin de journée',
      'Ancrage santé: sommeil + hydratation + mobilité',
    ];

    const secondary = [
      'Audit hebdomadaire des distractions + suppression d\'un déclencheur',
      'Préparer 3 actions à haut rendement le dimanche',
    ];

    let optional = 'Session créative libre de 60 min (exploration/opportunités).';

    if (fatigueLevel > 0.55) {
      priority[0] = 'Remplacer un bloc intense par 2 sprints de 20 min + récupération';
      secondary[1] = 'Décharger une tâche non essentielle pour protéger l\'énergie';
      optional = 'Marche stratégique sans écran pour reset cognitif.';
    }

    if (successRate < 0.5 || stagnation > 0.6) {
      priority[1] = 'Réduire le plan hebdo à 1 objectif maître + 2 sous-actions';
      secondary[0] = 'Mesurer uniquement une métrique de progrès (anti-dispersion)';
    }

    return {
      primary: priority,
      secondary: [...secondary, optional],
      note: `Ajustement dynamique: réussite ${Math.round(successRate * 100)}%, fatigue simulée ${Math.round(fatigueLevel * 100)}%, stagnation ${Math.round(stagnation * 100)}%.`,
    };
  }

  function renderBars(current, required) {
    refs.metricBars.innerHTML = '';
    Object.keys(current).forEach((key) => {
      const row = document.createElement('div');
      row.className = 'bar-line';
      const name = document.createElement('span');
      name.textContent = key[0].toUpperCase() + key.slice(1);
      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      const ratio = key === 'friction'
        ? clamp((required[key] / Math.max(current[key], 1)) * 100, 0, 100)
        : clamp((current[key] / required[key]) * 100, 0, 100);
      fill.style.width = `${ratio}%`;
      const val = document.createElement('span');
      val.textContent = `${Math.round(current[key] * 10) / 10}`;
      track.appendChild(fill);
      row.append(name, track, val);
      refs.metricBars.appendChild(row);
    });
  }

  function drawRadar(current, required) {
    const canvas = refs.radarCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const keys = Object.keys(current);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 120;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let lvl = 1; lvl <= 4; lvl += 1) {
      ctx.beginPath();
      keys.forEach((_, i) => {
        const a = (Math.PI * 2 / keys.length) * i - Math.PI / 2;
        const r = (radius / 4) * lvl;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(180, 146, 168, 0.25)';
      ctx.stroke();
    }

    function drawPoly(values, color) {
      ctx.beginPath();
      keys.forEach((key, i) => {
        const a = (Math.PI * 2 / keys.length) * i - Math.PI / 2;
        const r = (clamp(values[key], 0, 10) / 10) * radius;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = color.replace('0.26', '0.8').replace('0.2', '0.8');
      ctx.stroke();
    }

    drawPoly(required, 'rgba(185, 201, 255, 0.2)');
    drawPoly(current, 'rgba(242, 168, 190, 0.26)');

    keys.forEach((key, i) => {
      const a = (Math.PI * 2 / keys.length) * i - Math.PI / 2;
      const x = cx + Math.cos(a) * (radius + 17);
      const y = cy + Math.sin(a) * (radius + 17);
      ctx.fillStyle = '#6a5865';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(key, x, y);
    });
  }

  function renderTimeline(timeline) {
    refs.timeline.innerHTML = '';
    timeline.forEach((m) => {
      const block = document.createElement('div');
      block.className = 'month';
      block.innerHTML = `<strong>Mois ${m.month}</strong><span>${toPercent(m.score)}</span><span class="tiny">${m.focus}</span>`;
      refs.timeline.appendChild(block);
    });
  }

  function renderScenarios(scenarios) {
    renderPills(
      refs.scenarios,
      scenarios.map((s) => `${s.name}: ${Math.round(s.probability * 100)}% de réalisation`),
    );
  }

  function persist(payload, analysis) {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"entries":[]}');
    const next = {
      createdAt: existing.createdAt || new Date().toISOString(),
      entries: [
        ...existing.entries,
        {
          date: new Date().toISOString(),
          payload,
          score: analysis.metrics.score,
          momentum: analysis.sim.momentum,
        },
      ].slice(-40),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state.history = next.entries;
  }

  function loadPersisted() {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"entries":[]}');
    state.history = existing.entries || [];
    if (state.history.length) {
      const last = state.history[state.history.length - 1];
      refs.scoreCircle.style.setProperty('--score', Math.round(last.score));
      refs.scoreValue.textContent = toPercent(last.score);
    }
  }

  function runAnalysis() {
    const payload = inferPayloadFromMode();
    const metrics = computeMetrics(payload);
    const majorGaps = buildGapInsights(metrics.gaps);
    const levers = buildLevers(metrics.gaps, payload);
    const sim = simulateSixMonths(metrics.score, payload);
    const upgrades = generateWeeklyUpgrades(payload, metrics, sim);

    refs.scoreCircle.style.setProperty('--score', Math.round(metrics.score));
    refs.scoreValue.textContent = toPercent(metrics.score);
    renderPills(refs.gaps, majorGaps);
    renderPills(refs.levers, levers);
    renderBars(metrics.current, metrics.required);
    drawRadar(metrics.current, metrics.required);
    renderScenarios(sim.scenarios);
    renderTimeline(sim.timeline);
    renderPills(refs.primary, upgrades.primary);
    renderPills(refs.secondary, upgrades.secondary);
    refs.adaptiveNote.textContent = upgrades.note;

    state.lastAnalysis = { payload, metrics, sim, upgrades };
    persist(payload, state.lastAnalysis);
    logDebug(`Analyse ${new Date().toLocaleString()} | score=${metrics.score.toFixed(1)} | mode=${state.mode}`);
  }

  function setMode(mode) {
    state.mode = mode;
    const introspection = mode === 'introspection';
    refs.introspectionForm.style.display = introspection ? 'grid' : 'none';
    refs.rapidForm.style.display = introspection ? 'none' : 'grid';
    refs.modeIntrospection.classList.toggle('active', introspection);
    refs.modeRapide.classList.toggle('active', !introspection);
  }

  function exportAsPdf() {
    if (!state.lastAnalysis) {
      runAnalysis();
    }
    window.print();
  }

  function logDebug(message) {
    const stamp = `[${new Date().toLocaleTimeString()}] ${message}`;
    refs.debugConsole.textContent += `${stamp}\n`;
    refs.debugConsole.scrollTop = refs.debugConsole.scrollHeight;
  }

  function bindEvents() {
    refs.modeIntrospection.addEventListener('click', () => setMode('introspection'));
    refs.modeRapide.addEventListener('click', () => setMode('rapid'));
    refs.runAnalysis.addEventListener('click', runAnalysis);
    refs.exportPdf.addEventListener('click', exportAsPdf);

    window.addEventListener('keydown', (event) => {
      const isToggle = event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd';
      if (isToggle) {
        state.debugVisible = !state.debugVisible;
        refs.debugConsole.style.display = state.debugVisible ? 'block' : 'none';
        logDebug(`Console debug ${state.debugVisible ? 'ouverte' : 'fermée'}`);
      }
    });
  }

  function init() {
    bindEvents();
    loadPersisted();
    runAnalysis();
  }

  init();
})();
