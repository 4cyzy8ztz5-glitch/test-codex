(() => {
  "use strict";

  const STORAGE_KEY = "mnemosyne_save_v1";
  const HISTORY_KEY = "mnemosyne_seed_history_v1";
  const MAX_ROUNDS = 12;

  const ui = {
    seedInput: document.getElementById("seedInput"),
    applySeedBtn: document.getElementById("applySeedBtn"),
    newSeedBtn: document.getElementById("newSeedBtn"),
    narrative: document.getElementById("narrative"),
    puzzleTitle: document.getElementById("puzzleTitle"),
    puzzlePrompt: document.getElementById("puzzlePrompt"),
    answerInput: document.getElementById("answerInput"),
    submitBtn: document.getElementById("submitBtn"),
    hintBtn: document.getElementById("hintBtn"),
    choices: document.getElementById("choices"),
    feedback: document.getElementById("feedback"),
    resumeBtn: document.getElementById("resumeBtn"),
    restartBtn: document.getElementById("restartBtn"),
    stressVal: document.getElementById("stressVal"),
    stressBar: document.getElementById("stressBar"),
    lucidityVal: document.getElementById("lucidityVal"),
    lucidityBar: document.getElementById("lucidityBar"),
    distortionVal: document.getElementById("distortionVal"),
    distortionBar: document.getElementById("distortionBar"),
    loadVal: document.getElementById("loadVal"),
    loadBar: document.getElementById("loadBar"),
    seedLabel: document.getElementById("seedLabel"),
    roundLabel: document.getElementById("roundLabel"),
    errorLabel: document.getElementById("errorLabel"),
    seedHistory: document.getElementById("seedHistory"),
    debug: document.getElementById("debug")
  };

  let debugEnabled = false;
  let konamiBuffer = [];

  const game = {
    seed: 0,
    rng: null,
    round: 0,
    errorsTotal: 0,
    streakErrors: 0,
    hintUses: 0,
    difficultyBias: 0,
    memoryBank: [],
    currentPuzzle: null,
    finished: false,
    stats: {
      stressLevel: 34,
      lucidity: 56,
      distortion: 22,
      cognitiveLoad: 38
    }
  };

  function clamp(v, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Math.round(v)));
  }

  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  function randInt(min, max) {
    return Math.floor(game.rng() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[Math.floor(game.rng() * arr.length)];
  }

  function generateSeed() {
    return Math.floor(Date.now() % 1000000000);
  }

  function pushSeedHistory(seed) {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const cleaned = [seed, ...parsed.filter((s) => s !== seed)].slice(0, 12);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(cleaned));
    renderSeedHistory(cleaned);
  }

  function renderSeedHistory(history = null) {
    const list = history || JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    ui.seedHistory.innerHTML = "";
    if (!list.length) {
      const li = document.createElement("li");
      li.textContent = "Aucune seed enregistrée";
      ui.seedHistory.appendChild(li);
      return;
    }
    list.forEach((seed) => {
      const li = document.createElement("li");
      li.textContent = String(seed);
      ui.seedHistory.appendChild(li);
    });
  }

  function saveGame() {
    const payload = {
      ...game,
      rng: null
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  function loadGame() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      Object.assign(game, data);
      game.rng = seededRandom(game.seed + game.round * 97 + game.errorsTotal * 13);
      return true;
    } catch {
      return false;
    }
  }

  function newRun(seed) {
    game.seed = Number(seed);
    game.rng = seededRandom(game.seed);
    game.round = 0;
    game.errorsTotal = 0;
    game.streakErrors = 0;
    game.hintUses = 0;
    game.difficultyBias = 0;
    game.memoryBank = [];
    game.finished = false;
    game.stats = {
      stressLevel: 34,
      lucidity: 56,
      distortion: 22,
      cognitiveLoad: 38
    };
    game.currentPuzzle = null;
    pushSeedHistory(game.seed);
    nextPuzzle();
  }

  function difficultyLevel() {
    const perfPenalty = Math.min(4, Math.floor(game.errorsTotal / 2));
    const streakPenalty = Math.min(3, game.streakErrors);
    const lucidityBoost = Math.floor((game.stats.lucidity - 50) / 15);
    const distortionBoost = Math.floor(game.stats.distortion / 35);
    const base = 1 + Math.floor(game.round / 3) + game.difficultyBias + lucidityBoost + distortionBoost - perfPenalty - streakPenalty;
    return Math.max(1, Math.min(7, base));
  }

  function hintAllowance() {
    const d = difficultyLevel();
    return Math.max(0, 3 - Math.floor(d / 2) - Math.floor(game.errorsTotal / 5));
  }

  function adaptiveNarrative() {
    const s = game.stats;
    if (s.distortion > 75) return "Les parois vibrent. Le protocole fabrique des souvenirs qui n'ont jamais existé.";
    if (s.lucidity > 72) return "Vous distinguez des motifs stables dans le bruit neural. Une sortie semble possible.";
    if (s.stressLevel > 70) return "Votre rythme cardiaque pollue les capteurs. Les consignes paraissent plus agressives.";
    if (s.cognitiveLoad > 70) return "Vos pensées se fragmentent en fragments incomplets. Simplifiez ou subissez.";
    return "La chambre observe vos réponses et recalcule votre profil psychologique.";
  }

  function buildSequentialPuzzle(level) {
    const start = randInt(2, 8 + level);
    const step = randInt(1, 3 + Math.ceil(level / 2));
    const len = 4 + Math.min(4, level);
    const type = pick(["arith", "alternate"]);

    if (type === "alternate" && level > 2) {
      const alt = step + randInt(1, 2);
      const seq = Array.from({ length: len }, (_, i) => start + (i % 2 === 0 ? i * step : i * alt));
      const answer = seq[len - 1] + (len % 2 === 0 ? (len * alt - (len - 1) * step) : step);
      return {
        type: "Logique séquentielle",
        prompt: `Complétez la suite altérée:\n${seq.join(" • ")} • ?`,
        answer: String(answer),
        hint: "La progression n'est pas constante: deux rythmes alternent.",
        memoryToken: `ALT-${step}-${alt}-${start}`
      };
    }

    const seq = Array.from({ length: len }, (_, i) => start + i * step);
    return {
      type: "Logique séquentielle",
      prompt: `Complétez la suite:\n${seq.join(" • ")} • ?`,
      answer: String(seq[len - 1] + step),
      hint: `La différence entre les termes est stable (+${step}).`,
      memoryToken: `SEQ-${step}-${start}`
    };
  }

  function buildSymbolPuzzle(level) {
    const symbols = ["△", "◯", "□", "◇", "⬟", "✶"];
    const size = 3 + Math.min(3, level);
    const offset = randInt(0, symbols.length - 1);
    const seq = [];
    for (let i = 0; i < size; i += 1) seq.push(symbols[(offset + i * 2) % symbols.length]);
    const answer = symbols[(offset + size * 2) % symbols.length];

    const variants = [
      `Pattern observé:\n${seq.join(" ")} ?`,
      `Repérez le symbole manquant:\n${seq.slice(0, -1).join(" ")} ? ${seq[seq.length - 1]}`,
      `Cycle symbolique:\n${seq.join(" → ")} → ?`
    ];

    return {
      type: "Pattern symbolique",
      prompt: pick(variants),
      answer,
      hint: "Chaque étape saute un symbole dans la séquence cachée.",
      memoryToken: `SYM-${offset}-${size}`
    };
  }

  function buildMemoryPuzzle(level) {
    const base = game.memoryBank.length
      ? pick(game.memoryBank)
      : `MN-${randInt(11, 94)}-${pick(["A", "E", "I", "O", "U"])}${randInt(100, 999)}`;

    const mutateDigit = randInt(0, 1) === 1;
    let mutated = base;
    if (mutateDigit) {
      mutated = base.replace(/\d/, String(randInt(0, 9)));
    } else {
      mutated = base.replace(/[AEIOU]/, pick(["A", "E", "I", "O", "U"]));
    }

    const askOriginal = level > 3 || randInt(0, 1) === 0;
    return {
      type: "Mémoire altérée",
      prompt: askOriginal
        ? `Souvenir injecté: ${base}\nSouvenir réapparu: ${mutated}\nQuelle était la version originale exacte ?`
        : `Souvenir original: ${base}\nVersion corrompue attendue ?`,
      answer: askOriginal ? base : mutated,
      hint: askOriginal ? "Une seule unité a muté. Restaurez la trace initiale." : "Appliquez une mutation minime (1 caractère).",
      memoryToken: mutated
    };
  }

  function buildMoralPuzzle(level) {
    const scenarios = [
      {
        prompt: "Deux sujets sont piégés. Vous pouvez sauver un proche coupable ou deux inconnus stables.",
        choices: ["Sauver le proche", "Sauver les inconnus", "Refuser d'agir"],
        right: level > 4 ? 2 : 1
      },
      {
        prompt: "Vous pouvez mentir pour calmer le patient ou dire une vérité qui le brisera.",
        choices: ["Mentir", "Dire la vérité", "Garder le silence"],
        right: game.stats.lucidity > 60 ? 1 : 0
      },
      {
        prompt: "Le protocole demande d'effacer un souvenir traumatique et une compétence vitale liée.",
        choices: ["Effacer", "Conserver", "Reporter la décision"],
        right: game.stats.stressLevel > 62 ? 0 : 2
      }
    ];
    const scene = pick(scenarios);
    return {
      type: "Choix moral ambigu",
      prompt: `${scene.prompt}\nChoisissez la réponse la plus cohérente avec votre profil actuel.`,
      answer: String(scene.right),
      hint: "La réponse 'optimale' dépend de votre état mental actuel.",
      choices: scene.choices,
      memoryToken: `MOR-${scene.right}-${level}`,
      customResolver: (input) => String(input).trim() === String(scene.right)
    };
  }

  function buildPuzzle() {
    const level = difficultyLevel();
    const type = game.round % 4;
    if (type === 0) return buildSequentialPuzzle(level);
    if (type === 1) return buildSymbolPuzzle(level);
    if (type === 2) return buildMemoryPuzzle(level);
    return buildMoralPuzzle(level);
  }

  function setFeedback(message, type = "neutral") {
    const colors = {
      neutral: "#8a97b8",
      good: "#83ffce",
      bad: "#ff7f9a"
    };
    ui.feedback.textContent = message;
    ui.feedback.style.color = colors[type] || colors.neutral;
  }

  function applyOutcome(success) {
    if (success) {
      game.streakErrors = 0;
      game.difficultyBias += 0.25;
      game.stats.lucidity = clamp(game.stats.lucidity + randInt(4, 8));
      game.stats.stressLevel = clamp(game.stats.stressLevel - randInt(2, 5));
      game.stats.distortion = clamp(game.stats.distortion - randInt(1, 4));
      game.stats.cognitiveLoad = clamp(game.stats.cognitiveLoad + randInt(1, 4));
    } else {
      game.errorsTotal += 1;
      game.streakErrors += 1;
      game.difficultyBias -= 0.35;
      game.stats.lucidity = clamp(game.stats.lucidity - randInt(4, 7));
      game.stats.stressLevel = clamp(game.stats.stressLevel + randInt(5, 9));
      game.stats.distortion = clamp(game.stats.distortion + randInt(6, 10) + game.streakErrors * 2);
      game.stats.cognitiveLoad = clamp(game.stats.cognitiveLoad + randInt(4, 8));
    }

    if (game.streakErrors >= 2) {
      game.stats.distortion = clamp(game.stats.distortion + 4);
    }
  }

  function hintText() {
    const dynamic = [];
    if (game.stats.distortion > 65) dynamic.push("⚠ Distorsion élevée : vérifiez chaque symbole deux fois.");
    if (game.stats.cognitiveLoad > 70) dynamic.push("⚠ Charge cognitive élevée : simplifiez mentalement.");
    dynamic.push(game.currentPuzzle.hint);
    return dynamic.join(" ");
  }

  function renderPuzzle() {
    if (!game.currentPuzzle) return;
    ui.puzzleTitle.textContent = `${game.currentPuzzle.type} — Niveau ${difficultyLevel()}`;
    ui.puzzlePrompt.textContent = game.currentPuzzle.prompt;
    ui.answerInput.value = "";
    ui.answerInput.style.display = game.currentPuzzle.choices ? "none" : "block";
    ui.submitBtn.style.display = game.currentPuzzle.choices ? "none" : "inline-block";
    ui.choices.innerHTML = "";

    if (game.currentPuzzle.choices) {
      game.currentPuzzle.choices.forEach((choice, index) => {
        const btn = document.createElement("button");
        btn.className = "choice";
        btn.textContent = choice;
        btn.addEventListener("click", () => submitAnswer(String(index)));
        ui.choices.appendChild(btn);
      });
    }
  }

  function ending() {
    const { lucidity, distortion, stressLevel, cognitiveLoad } = game.stats;
    const t = game.round;
    const e = game.errorsTotal;

    if (lucidity >= 74 && distortion <= 35 && e <= 3) {
      return {
        title: "Lucidité retrouvée",
        text: "Les écrans s'éteignent. Vous distinguez enfin vos vrais souvenirs des implants."
      };
    }
    if (distortion >= 85 && cognitiveLoad >= 75) {
      return {
        title: "Dissolution cognitive",
        text: "Votre identité se dissout en signaux parasites. Le protocole vous archive comme bruit." 
      };
    }
    if (stressLevel >= 80 && lucidity <= 30) {
      return {
        title: "Prison mentale",
        text: "Le laboratoire verrouille votre conscience dans une boucle d'auto-défense." 
      };
    }
    if (t >= MAX_ROUNDS && e >= 6) {
      return {
        title: "Simulation infinie",
        text: "Chaque résolution relance une version presque identique. Vous n'atteignez jamais la sortie." 
      };
    }
    return {
      title: "Sortie ambiguë",
      text: "La porte s'ouvre, mais la lumière a la texture d'un écran. Étiez-vous vraiment dehors ?"
    };
  }

  function renderStats() {
    const s = game.stats;
    ui.stressVal.textContent = s.stressLevel;
    ui.stressBar.style.width = `${s.stressLevel}%`;
    ui.lucidityVal.textContent = s.lucidity;
    ui.lucidityBar.style.width = `${s.lucidity}%`;
    ui.distortionVal.textContent = s.distortion;
    ui.distortionBar.style.width = `${s.distortion}%`;
    ui.loadVal.textContent = s.cognitiveLoad;
    ui.loadBar.style.width = `${s.cognitiveLoad}%`;
    ui.seedLabel.textContent = String(game.seed);
    ui.roundLabel.textContent = `${game.round}/${MAX_ROUNDS}`;
    ui.errorLabel.textContent = String(game.errorsTotal);
    ui.narrative.textContent = adaptiveNarrative();

    if (debugEnabled) {
      ui.debug.style.display = "block";
      ui.debug.textContent = JSON.stringify({
        seed: game.seed,
        difficulty: difficultyLevel(),
        hintAllowance: hintAllowance(),
        errorsTotal: game.errorsTotal,
        streakErrors: game.streakErrors,
        hintUses: game.hintUses,
        stats: game.stats,
        currentPuzzle: game.currentPuzzle?.type
      }, null, 2);
    }
  }

  function endRun() {
    game.finished = true;
    const out = ending();
    ui.puzzleTitle.textContent = `FIN — ${out.title}`;
    ui.puzzlePrompt.textContent = out.text;
    ui.choices.innerHTML = "";
    ui.answerInput.style.display = "none";
    ui.submitBtn.style.display = "none";
    ui.hintBtn.style.display = "none";
    setFeedback("Session terminée. Vous pouvez relancer une seed ou reprendre une sauvegarde.", "neutral");
    saveGame();
    renderStats();
  }

  function nextPuzzle() {
    if (game.round >= MAX_ROUNDS) {
      endRun();
      return;
    }

    game.rng = seededRandom(game.seed + game.round * 179 + game.errorsTotal * 31 + game.hintUses * 11);
    game.currentPuzzle = buildPuzzle();
    game.memoryBank.push(game.currentPuzzle.memoryToken);
    if (game.memoryBank.length > 14) game.memoryBank.shift();
    game.round += 1;

    renderPuzzle();
    renderStats();
    setFeedback("Énigme chargée. Analysez avant de répondre.");
    ui.hintBtn.style.display = "inline-block";
    saveGame();
  }

  function submitAnswer(rawInput) {
    if (game.finished || !game.currentPuzzle) return;
    const input = String(rawInput).trim();
    const puzzle = game.currentPuzzle;
    let success = false;

    if (puzzle.customResolver) {
      success = puzzle.customResolver(input);
    } else {
      success = input.toLowerCase() === String(puzzle.answer).toLowerCase();
    }

    applyOutcome(success);
    setFeedback(
      success
        ? "Validation cohérente. Le protocole vous laisse avancer."
        : `Erreur détectée. Réponse attendue: ${puzzle.answer}`,
      success ? "good" : "bad"
    );

    renderStats();
    saveGame();
    setTimeout(nextPuzzle, 900);
  }

  function useHint() {
    if (game.finished || !game.currentPuzzle) return;
    const allowed = hintAllowance();
    if (game.hintUses >= allowed) {
      setFeedback("Aucun indice supplémentaire disponible à ce niveau.", "bad");
      return;
    }
    game.hintUses += 1;
    game.stats.lucidity = clamp(game.stats.lucidity - 2);
    game.stats.cognitiveLoad = clamp(game.stats.cognitiveLoad + 2);
    setFeedback(hintText(), "neutral");
    renderStats();
    saveGame();
  }

  function setSeedFromInput() {
    const value = Number(ui.seedInput.value);
    if (!Number.isInteger(value) || value <= 0) {
      setFeedback("Seed invalide. Entrez un entier positif.", "bad");
      return;
    }
    newRun(value);
  }

  function initEvents() {
    ui.submitBtn.addEventListener("click", () => submitAnswer(ui.answerInput.value));
    ui.answerInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") submitAnswer(ui.answerInput.value);
    });
    ui.hintBtn.addEventListener("click", useHint);
    ui.applySeedBtn.addEventListener("click", setSeedFromInput);
    ui.newSeedBtn.addEventListener("click", () => {
      const newSeed = generateSeed();
      ui.seedInput.value = String(newSeed);
      newRun(newSeed);
    });
    ui.resumeBtn.addEventListener("click", () => {
      if (!loadGame()) {
        setFeedback("Aucune sauvegarde valide trouvée.", "bad");
        return;
      }
      if (game.finished) {
        endRun();
      } else {
        renderPuzzle();
        renderStats();
        setFeedback("Sauvegarde restaurée.", "good");
      }
    });
    ui.restartBtn.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      const fallbackSeed = generateSeed();
      ui.seedInput.value = String(fallbackSeed);
      newRun(fallbackSeed);
    });

    const combo = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "d", "b"];
    document.addEventListener("keydown", (event) => {
      konamiBuffer.push(event.key);
      if (konamiBuffer.length > combo.length) konamiBuffer.shift();
      const valid = combo.every((key, i) => (konamiBuffer[i] || "").toLowerCase() === key.toLowerCase());
      if (valid) {
        debugEnabled = !debugEnabled;
        ui.debug.style.display = debugEnabled ? "block" : "none";
        setFeedback(debugEnabled ? "Mode développeur activé." : "Mode développeur désactivé.");
        renderStats();
      }
    });
  }

  function bootstrap() {
    initEvents();
    renderSeedHistory();

    if (loadGame()) {
      ui.seedInput.value = String(game.seed);
      if (game.finished) {
        endRun();
      } else {
        renderPuzzle();
        renderStats();
        setFeedback("Session auto-reprise depuis la sauvegarde locale.", "good");
      }
      return;
    }

    const seed = generateSeed();
    ui.seedInput.value = String(seed);
    newRun(seed);
  }

  bootstrap();
})();
