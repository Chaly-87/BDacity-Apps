/* Pure race rules shared by the browser and the local Node test suite. */
(function (root) {
  'use strict';

  const TOTAL_LAPS = 10;
  const TRACK_LENGTH = 1000;
  const FINISH_GRACE_MS = 45000;
  // REGRA ABSOLUTA (V4 LIVE): nenhuma corrida excede 5 minutos. TOTAL_LAPS
  // mantém-se 10; o cap decide quando ninguém chega aos 10 antes do limite.
  const MAX_RACE_DURATION = 300;
  const MODES = Object.freeze({
    LIVE_COMPLIANT: 'LIVE_COMPLIANT',
    LIVE_INTERACTIVE: 'LIVE_INTERACTIVE',
    FULL_INTERACTION_DEMO: 'FULL_INTERACTION_DEMO'
  });

  const GIFT_RULES = Object.freeze({
    rose: Object.freeze({
      id: 'rose',
      minValue: 1,
      name: 'ROSE',
      valueTier: 1,
      effect: 'turbo',
      duration: 2800,
      cooldown: 4500,
      visualKey: 'nitro',
      audioKey: 'boost',
      impact: 0.18,
      tier: 'TIER 1'
    }),
    donut: Object.freeze({
      id: 'donut',
      minValue: 5,
      name: 'DONUT',
      valueTier: 2,
      effect: 'slow',
      duration: 3600,
      cooldown: 7500,
      visualKey: 'neon-oil',
      audioKey: 'slide',
      impact: 0.22,
      tier: 'TIER 2'
    }),
    rocket: Object.freeze({
      id: 'rocket',
      minValue: 20,
      name: 'ROCKET',
      valueTier: 3,
      effect: 'boost',
      duration: 4300,
      cooldown: 11000,
      visualKey: 'drone',
      audioKey: 'flyby',
      impact: 0.28,
      tier: 'TIER 3'
    }),
    bomb: Object.freeze({
      id: 'bomb',
      minValue: 50,
      name: 'BOMB',
      valueTier: 4,
      effect: 'hazard',
      duration: 3800,
      cooldown: 16000,
      visualKey: 'barrier',
      audioKey: 'impact',
      impact: 0.35,
      tier: 'TIER 4'
    }),
    emp: Object.freeze({
      id: 'emp',
      minValue: 100,
      name: 'EMP',
      valueTier: 4,
      effect: 'shock',
      duration: 2200,
      cooldown: 18000,
      visualKey: 'pulse',
      audioKey: 'zap',
      impact: 0.38,
      tier: 'TIER 4'
    }),
    tornado: Object.freeze({
      id: 'tornado',
      minValue: 150,
      name: 'TORNADO',
      valueTier: 4,
      effect: 'slow',
      duration: 3000,
      cooldown: 20000,
      visualKey: 'vortex',
      audioKey: 'wind',
      impact: 0.42,
      tier: 'TIER 4'
    }),
    galaxy: Object.freeze({
      id: 'galaxy',
      minValue: 500,
      name: 'GALAXY',
      valueTier: 5,
      effect: 'galaxy',
      duration: 5000,
      cooldown: 30000,
      visualKey: 'portal',
      audioKey: 'ultra',
      impact: 1,
      tier: 'TIER 5'
    })
  });

  const VALUE_ORDER = ['rose', 'donut', 'rocket', 'bomb', 'emp', 'tornado', 'galaxy'];

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeString(value, fallback = '') {
    return String(value ?? fallback).trim();
  }

  function makeRacerState(overrides = {}) {
    const userId = normalizeString(overrides.userId || overrides.playerId || overrides.username || 'unknown-user');
    const username = normalizeString(overrides.username || userId);
    const completedLaps = clamp(asNumber(overrides.completedLaps ?? overrides.laps ?? overrides.currentLap ?? 0), 0, TOTAL_LAPS);
    const currentLap = clamp(asNumber(overrides.currentLap ?? completedLaps), 1, TOTAL_LAPS);
    const trackProgress = clamp(asNumber(overrides.trackProgress ?? overrides.progressWithinCurrentLap ?? 0), 0, 1);
    const finished = Boolean(overrides.finished);
    const finishPosition = overrides.finishPosition ?? null;
    const finishTime = overrides.finishTime ?? null;
    return {
      userId,
      username,
      avatar: overrides.avatar ?? '',
      team: overrides.team ?? 'neutral',
      currentLap: finished ? TOTAL_LAPS : currentLap,
      completedLaps: finished ? TOTAL_LAPS : completedLaps,
      trackProgress: finished ? 1 : trackProgress,
      position: asNumber(overrides.position ?? 0),
      speed: asNumber(overrides.speed ?? 0),
      tier: overrides.tier ?? 'standard',
      boost: asNumber(overrides.boost ?? 0),
      status: overrides.status ?? (finished ? 'finished' : 'ready'),
      finished,
      finishPosition: finished ? finishPosition ?? 0 : null,
      finishTime: finished ? finishTime : null,
      totalProgress: asNumber(overrides.totalProgress ?? ((finished ? TOTAL_LAPS : completedLaps) * TRACK_LENGTH + (finished ? TRACK_LENGTH : trackProgress * TRACK_LENGTH)))
    };
  }

  function racerProgress(racer, trackLength = TRACK_LENGTH) {
    const completed = clamp(asNumber(racer.completedLaps ?? racer.currentLap ?? racer.laps ?? 0), 0, TOTAL_LAPS);
    const within = clamp(asNumber(racer.trackProgress ?? racer.progressWithinCurrentLap ?? 0), 0, 1);
    const finished = Boolean(racer.finished);
    return (finished ? TOTAL_LAPS : completed) * trackLength + within * trackLength;
  }

  function rankRacers(racers, trackLength = TRACK_LENGTH) {
    return [...racers].sort((a, b) => {
      const aFinished = Boolean(a.finished);
      const bFinished = Boolean(b.finished);
      if (aFinished && bFinished) {
        const aPos = Number.isFinite(a.finishPosition) ? Number(a.finishPosition) : Number.MAX_SAFE_INTEGER;
        const bPos = Number.isFinite(b.finishPosition) ? Number(b.finishPosition) : Number.MAX_SAFE_INTEGER;
        return aPos - bPos;
      }
      if (aFinished && !bFinished) return -1;
      if (!aFinished && bFinished) return 1;

      const gap = racerProgress(b, trackLength) - racerProgress(a, trackLength);
      if (gap !== 0) return gap;

      const aKey = normalizeString(a.userId || a.playerId || a.username || '');
      const bKey = normalizeString(b.userId || b.playerId || b.username || '');
      return aKey.localeCompare(bKey);
    });
  }

  function finishRacer(racer, position, elapsedMs) {
    if (!racer || racer.finished) return false;
    racer.finished = true;
    racer.status = 'finished';
    racer.finishPosition = position;
    racer.finishTime = Math.max(0, Math.round(asNumber(elapsedMs, 0)));
    racer.currentLap = TOTAL_LAPS;
    racer.completedLaps = TOTAL_LAPS;
    racer.trackProgress = 1;
    racer.totalProgress = TOTAL_LAPS * TRACK_LENGTH + TRACK_LENGTH;
    racer.progress = TOTAL_LAPS * TRACK_LENGTH + TRACK_LENGTH;
    racer.progressTotal = TOTAL_LAPS * TRACK_LENGTH + TRACK_LENGTH;
    return true;
  }

  function raceShouldEnd(racers, firstFinishAt, now, graceMs = FINISH_GRACE_MS) {
    const list = Array.isArray(racers) ? racers : [];
    if (!list.length) return false;
    if (list.every((racer) => racer && racer.finished)) return true;
    return Number.isFinite(firstFinishAt) && Number.isFinite(now) && now - firstFinishAt >= graceMs;
  }

  // Ranking no limite dos 5 minutos (ordem final, sem mutar racers):
  // 1.º terminados por finishPosition; restantes por voltas completas +
  // trackProgress — exatamente a ordem de rankRacers. O chamador atribui
  // as posições finais (i+1) aos não-terminados.
  function timeoutRanking(racers, trackLength = TRACK_LENGTH) {
    return rankRacers(Array.isArray(racers) ? racers : [], trackLength);
  }

  function crossedLikeMilestones(previous, delta, step = 1000) {
    const before = Math.max(0, Math.floor(asNumber(previous, 0)));
    const after = before + Math.max(0, Math.floor(asNumber(delta, 0)));
    const milestones = [];
    const start = Math.floor(before / step) + 1;
    const end = Math.floor(after / step);
    for (let index = start; index <= end; index += 1) {
      milestones.push(index * step);
    }
    return milestones;
  }

  function likeMilestoneAction(mode, milestone, hasRacer, queued) {
    if (mode !== MODES.FULL_INTERACTION_DEMO) return 'social';
    if (milestone === 1000 && !hasRacer && !queued) return 'spawn';
    return 'upgrade';
  }

  function giftFor(value, explicit) {
    const key = normalizeString(explicit || value?.id || value?.name || value || '').toLowerCase();
    if (Object.hasOwn(GIFT_RULES, key)) {
      return { ...GIFT_RULES[key], id: key };
    }

    const numeric = Math.max(1, asNumber(value, 1));
    let chosen = 'rose';
    for (const ruleId of VALUE_ORDER) {
      const rule = GIFT_RULES[ruleId];
      if (Number.isFinite(rule.minValue) && numeric >= rule.minValue) {
        chosen = ruleId;
      }
    }
    return { ...GIFT_RULES[chosen], id: chosen };
  }

  function canGiftCompete(mode, source) {
    if (![MODES.FULL_INTERACTION_DEMO, MODES.LIVE_INTERACTIVE].includes(mode)) return false;
    return source === 'gift' || source === 'demo' || source === 'sender';
  }

  function canAffectRace(source) {
    if (!source) return false;
    const key = String(source).toLowerCase();
    return key !== 'blocked' && key !== 'neutralized' && key !== 'compliance';
  }

  function isGiftOnCooldown(giftId, cooldownMap, now) {
    const key = String(giftId || '').toLowerCase();
    const expiresAt = cooldownMap?.[key]?.until ?? cooldownMap?.[key];
    if (!Number.isFinite(expiresAt)) return false;
    return Number(expiresAt) > Number(now ?? 0);
  }

  function shouldStartFinalSprint(racer, racers) {
    const leader = rankRacers(racers)[0];
    if (!leader || !racer) return false;
    if (racer.finished || leader.finished) return false;
    return racer.userId === leader.userId && racer.completedLaps >= TOTAL_LAPS - 1;
  }

  function getTop10(racers, limit = 10) {
    const list = rankRacers(racers);
    const result = [];
    for (const racerEntry of list) {
      if (result.length >= limit) break;
      result.push(racerEntry);
    }
    return result;
  }

  function buildStartGrid(racers, slotCount = 8) {
    const list = [...racers].sort((a, b) => {
      const aKey = normalizeString(a.userId || a.username);
      const bKey = normalizeString(b.userId || b.username);
      return aKey.localeCompare(bKey);
    });

    return list.map((racerEntry, index) => ({
      ...racerEntry,
      slot: index % slotCount + 1,
      startOrder: index + 1,
      lane: Math.floor(index / 2) % slotCount,
      username: racerEntry.username
    }));
  }

  function applyLikeMilestones({ likesByUser, racers, userId, likesDelta, username, avatar, team }) {
    const normalizedUserId = normalizeString(userId || 'unknown-user');
    const previousValue = asNumber(likesByUser?.[normalizedUserId] ?? 0, 0);
    const nextValue = previousValue + asNumber(likesDelta, 0);
    likesByUser[normalizedUserId] = nextValue;

    const milestones = crossedLikeMilestones(previousValue, likesDelta, 1000);
    const existingRacer = (racers || []).find((racer) => normalizeString(racer.userId) === normalizedUserId);
    let created = false;
    let racer = existingRacer || null;

    if (!existingRacer && milestones.includes(1000)) {
      racer = makeRacerState({
        userId: normalizedUserId,
        username: username || normalizedUserId,
        avatar: avatar || '',
        team: team || 'blue',
        completedLaps: 0,
        currentLap: 1,
        trackProgress: 0,
        status: 'ready'
      });
      racers.push(racer);
      created = true;
    }

    return { created, milestones, racer, likesByUser, totalLikes: nextValue };
  }

  function applyGiftEffect({ mode, gift, source, target, now = 0, cooldownMap = {} }) {
    const selectedGift = giftFor(gift?.id || gift?.name || gift || 'rose', gift?.id || gift?.name || 'rose');
    const safeTarget = normalizeString(target || '');
    const safeSource = normalizeString(source || '');

    if (!canGiftCompete(mode, 'gift')) {
      return { blocked: true, effect: 'neutral', impact: 0, target: safeTarget, source: safeSource };
    }

    if (isGiftOnCooldown(selectedGift.id, cooldownMap, now)) {
      return { blocked: true, effect: 'neutral', cooldown: true, impact: 0, target: safeTarget, source: safeSource };
    }

    const effect = selectedGift.effect;
    const impact = asNumber(selectedGift.impact, 0.1);
    const duration = asNumber(selectedGift.duration, 0);
    const cooldown = asNumber(selectedGift.cooldown, 0);
    cooldownMap[selectedGift.id] = { until: now + cooldown };

    return {
      effect,
      impact,
      duration,
      cooldown,
      target: safeTarget,
      source: safeSource,
      blocked: false
    };
  }

  function parkingSlot(position) {
    const slots = [
      [360, 798],
      [282, 838],
      [438, 838],
      [175, 876],
      [530, 876],
      [120, 916],
      [590, 916]
    ];
    return slots[(position - 1) % slots.length] || [180 + ((position - 4) % 7) * 60, 884 + Math.floor((position - 4) / 7) * 37];
  }

  function avatarDisplay(url, name) {
    if (url && String(url).trim()) return url;
    const initial = String(name || '?').replace(/^@/, '').trim().charAt(0).toUpperCase();
    return initial || '?';
  }

  function canPlayFunny(lastAt, now, speaking, cooldown = 30000) {
    return !speaking && (lastAt == null || now - lastAt >= cooldown);
  }

  // ---------------------------------------------------------------------------
  // REGRA ABSOLUTA: 1 player = 1 racer.
  // Chave única: userId (do server) → uniqueId → username, normalizada
  // (trim, sem '@', minúsculas). O app.js usa SEMPRE estas funções para
  // admits/lookup — nunca compara usernames diretamente.
  // ---------------------------------------------------------------------------
  function racerKey(value) {
    // Resolução por prioridade: userId → uniqueId → username → playerId.
    // Candidato vazio/só-espaços NÃO pára o fallback (ex.: userId:'  ' cai
    // para username). Normalização: trim, sem '@', minúsculas.
    const candidates = value && typeof value === 'object'
      ? [value.userId, value.uniqueId, value.username, value.playerId]
      : [value];
    for (const candidate of candidates) {
      const key = normalizeString(candidate, '').replace(/^@+/, '').toLowerCase();
      if (key) return key;
    }
    return '';
  }

  function findRacerForUser(racers, user) {
    const key = racerKey(user);
    if (!key) return null;
    const list = Array.isArray(racers) ? racers : [];
    return list.find((racer) => racerKey({ userId: racer?.userId ?? racer?.username }) === key) || null;
  }

  function canJoinRace({ racers, queue, user } = {}) {
    const key = racerKey(user ?? {});
    if (!key) return false;
    if (findRacerForUser(racers, key)) return false;   // já tem carro (ativo OU terminado)
    // Map-like sem `instanceof` (falha cross-realm em harness vm): o que importa
    // é o contrato .has() — a regra de fila mantém-se integralmente.
    if (queue && typeof queue.has === 'function' && queue.has(key)) return false; // já está na fila
    return true;
  }

  function admitRacer({ racers = [], queue = new Map(), user, team = 'neutral', maxRacers = 16, makeRacer } = {}) {
    if (typeof makeRacer !== 'function') {
      return { admitted: false, queued: false, racer: null, reason: 'no-factory' };
    }
    if (!canJoinRace({ racers, queue, user })) {
      return { admitted: false, queued: false, racer: null, reason: 'duplicate' };
    }
    const key = racerKey(user ?? {});
    const display = normalizeString(user?.username ?? user?.uniqueId ?? (typeof user === 'string' ? user : key), key);
    if (racers.length < maxRacers) {
      // 4.º argumento: identidade original — a fábrica deve guardar a CHAVE
      // canónica no racer (nunca derivar userId do nome de exibição).
      const racer = makeRacer(racers.length, display, team, user ?? key);
      racers.push(racer);
      return { admitted: true, queued: false, racer, reason: 'joined' };
    }
    queue.set(key, { username: display, teamId: typeof team === 'number' ? team : 1 });
    return { admitted: true, queued: true, racer: null, reason: 'queued' };
  }

  function countDuplicateRacers(racers) {
    const counts = new Map();
    for (const racer of Array.isArray(racers) ? racers : []) {
      const key = racerKey({ userId: racer?.userId ?? racer?.username });
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    let duplicates = 0;
    for (const count of counts.values()) {
      if (count > 1) duplicates += count - 1;
    }
    return duplicates;
  }

  function recordLike({ likesByUser, userId, amount = 1 }) {
    const normalizedUserId = normalizeString(userId || 'unknown-user');
    likesByUser[normalizedUserId] = asNumber(likesByUser[normalizedUserId] ?? 0, 0) + asNumber(amount, 1);
    return likesByUser[normalizedUserId];
  }

  root.RaceLogic = Object.freeze({
    TOTAL_LAPS,
    TRACK_LENGTH,
    FINISH_GRACE_MS,
    MAX_RACE_DURATION,
    MODES,
    GIFT_RULES,
    makeRacerState,
    racerProgress,
    rankRacers,
    finishRacer,
    raceShouldEnd,
    timeoutRanking,
    crossedLikeMilestones,
    likeMilestoneAction,
    giftFor,
    canGiftCompete,
    canAffectRace,
    isGiftOnCooldown,
    shouldStartFinalSprint,
    getTop10,
    buildStartGrid,
    applyLikeMilestones,
    applyGiftEffect,
    racerKey,
    findRacerForUser,
    canJoinRace,
    admitRacer,
    countDuplicateRacers,
    parkingSlot,
    avatarDisplay,
    canPlayFunny,
    recordLike
  });
})(typeof window !== 'undefined' ? window : globalThis);
