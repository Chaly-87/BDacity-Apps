import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.runInNewContext(
  fs.readFileSync(new URL('./race-logic.js', import.meta.url), 'utf8'),
  context
);
const R = context.RaceLogic;

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeRacer(overrides = {}) {
  return R.makeRacerState({
    userId: overrides.userId ?? overrides.username ?? 'u0',
    username: overrides.username ?? 'Racer',
    avatar: overrides.avatar ?? '',
    team: overrides.team ?? 'blue',
    currentLap: overrides.currentLap ?? overrides.completedLaps ?? 1,
    completedLaps: overrides.completedLaps ?? overrides.currentLap ?? 0,
    trackProgress: overrides.trackProgress ?? 0,
    position: overrides.position ?? 0,
    speed: overrides.speed ?? 0,
    tier: overrides.tier ?? 'standard',
    boost: overrides.boost ?? 0,
    status: overrides.status ?? 'ready',
    finished: Boolean(overrides.finished),
    finishPosition: overrides.finishPosition ?? null,
    finishTime: overrides.finishTime ?? null,
    ...overrides
  });
}

// V4 LIVE: cap absoluto de 5 minutos (MAX_RACE_DURATION = 300 s).
test('MAX_RACE_DURATION exposto e igual a 300', () => {
  assert.equal(R.MAX_RACE_DURATION, 300);
});

test('timeoutRanking: terminados por posição, restantes por voltas+progresso', () => {
  const finishedP2 = R.makeRacerState({ userId: 'u1', username: 'P2', finished: true, finishPosition: 2, completedLaps: 10 });
  const leader = R.makeRacerState({ userId: 'u2', username: 'LIDER', completedLaps: 8, currentLap: 9, trackProgress: 0.9 });
  const mid = R.makeRacerState({ userId: 'u3', username: 'MEIO', completedLaps: 9, currentLap: 10, trackProgress: 0.1 });
  const tail = R.makeRacerState({ userId: 'u4', username: 'CAUDA', completedLaps: 6, currentLap: 7, trackProgress: 0.3 });
  const ranked = R.timeoutRanking([tail, finishedP2, leader, mid]);
  assert.deepEqual(toPlain(ranked.map((r) => r.username)), ['P2', 'MEIO', 'LIDER', 'CAUDA']);
});

test('timeoutRanking: líder no limite vence (empate de voltas resolvido por trackProgress)', () => {
  const a = R.makeRacerState({ userId: 'ua', username: 'A', completedLaps: 7, currentLap: 8, trackProgress: 0.99 });
  const b = R.makeRacerState({ userId: 'ub', username: 'B', completedLaps: 7, currentLap: 8, trackProgress: 0.01 });
  const ranked = R.timeoutRanking([b, a]);
  assert.equal(ranked[0].username, 'A');
  assert.equal(ranked[1].username, 'B');
});

test('1. dois racers em voltas diferentes', () => {
  const joao = makeRacer({ username: 'João', userId: 'u1', completedLaps: 4, currentLap: 5, trackProgress: 0.8 });
  const ana = makeRacer({ username: 'Ana', userId: 'u2', completedLaps: 7, currentLap: 8, trackProgress: 0.15 });
  const ranked = R.rankRacers([joao, ana], 1000);
  assert.deepEqual(toPlain(ranked.map((r) => r.username)), ['Ana', 'João']);
});

test('2. três racers em voltas diferentes', () => {
  const hugo = makeRacer({ username: 'Hugo', completedLaps: 2, currentLap: 3, trackProgress: 0.3 });
  const maria = makeRacer({ username: 'Maria', completedLaps: 6, currentLap: 7, trackProgress: 0.4 });
  const ana = makeRacer({ username: 'Ana', completedLaps: 4, currentLap: 5, trackProgress: 0.9 });
  assert.deepEqual(toPlain(R.rankRacers([hugo, maria, ana], 1000).map((r) => r.username)), ['Maria', 'Ana', 'Hugo']);
});

test('3. ordenação por laps + progress', () => {
  const racers = [
    makeRacer({ username: 'A', completedLaps: 3, trackProgress: 0.70 }),
    makeRacer({ username: 'B', completedLaps: 3, trackProgress: 0.90 }),
    makeRacer({ username: 'C', completedLaps: 4, trackProgress: 0.10 })
  ];
  assert.deepEqual(toPlain(R.rankRacers(racers, 1000).map((r) => r.username)), ['C', 'B', 'A']);
});

test('4. P1 termina e outros continuam', () => {
  const p1 = makeRacer({ username: 'P1', completedLaps: 9, currentLap: 10, trackProgress: 0.90 });
  const p2 = makeRacer({ username: 'P2', completedLaps: 8, currentLap: 9, trackProgress: 0.40 });
  assert.equal(R.finishRacer(p1, 1, 98000), true);
  assert.equal(p1.finished, true);
  assert.equal(p1.finishPosition, 1);
  assert.equal(R.rankRacers([p1, p2], 1000)[0].username, 'P1');
  assert.equal(R.raceShouldEnd([p1, p2], 100000, 110000, 45000), false);
});

test('5. P2 termina depois', () => {
  const p1 = makeRacer({ username: 'P1', finished: true, finishPosition: 1, finishTime: 98000 });
  const p2 = makeRacer({ username: 'P2', completedLaps: 9, currentLap: 10, trackProgress: 0.95 });
  assert.equal(R.finishRacer(p2, 2, 104000), true);
  assert.equal(p2.finishPosition, 2);
  assert.equal(R.raceShouldEnd([p1, p2], 98000, 104000, 45000), true);
});

test('6. finishPosition não muda', () => {
  const p1 = makeRacer({ username: 'P1', finished: true, finishPosition: 1, finishTime: 98000 });
  const p2 = makeRacer({ username: 'P2', completedLaps: 9, currentLap: 10, trackProgress: 0.90 });
  R.finishRacer(p2, 2, 104000);
  assert.equal(p2.finishPosition, 2);
  p2.trackProgress = 1;
  assert.deepEqual(toPlain(R.rankRacers([p1, p2], 1000).map((r) => r.finishPosition ?? r.username)), [1, 2]);
});

test('7. grace period', () => {
  const p1 = makeRacer({ username: 'P1', finished: true, finishPosition: 1, finishTime: 100000 });
  const p2 = makeRacer({ username: 'P2', completedLaps: 8, currentLap: 9, trackProgress: 0.35 });
  assert.equal(R.raceShouldEnd([p1, p2], 100000, 139999, 45000), false);
  assert.equal(R.raceShouldEnd([p1, p2], 100000, 145000, 45000), true);
});

test('8. TOP10', () => {
  const racers = Array.from({ length: 12 }, (_, i) =>
    makeRacer({ username: `R${i + 1}`, completedLaps: i % 4, trackProgress: (i % 7) / 10, finished: i < 3 })
  );
  racers[0].finishPosition = 1;
  racers[1].finishPosition = 2;
  racers[2].finishPosition = 3;
  const top10 = R.getTop10(racers, 10);
  assert.equal(top10.length, 10);
  assert.deepEqual(toPlain(top10.slice(0, 3).map((r) => r.username)), ['R1', 'R2', 'R3']);
});

test('9. Final Sprint individual', () => {
  const leader = makeRacer({ username: 'L', completedLaps: 9, currentLap: 10, trackProgress: 0.16 });
  const runner = makeRacer({ username: 'R', completedLaps: 8, currentLap: 9, trackProgress: 0.90 });
  assert.equal(R.shouldStartFinalSprint(leader, [leader, runner]), true);
  assert.equal(R.shouldStartFinalSprint(runner, [leader, runner]), false);
});

test('10. start grid', () => {
  const racers = [
    makeRacer({ username: 'A', userId: 'u1' }),
    makeRacer({ username: 'B', userId: 'u2' }),
    makeRacer({ username: 'C', userId: 'u3' })
  ];
  const grid = R.buildStartGrid(racers, 3);
  assert.equal(grid.length, 3);
  assert.deepEqual(toPlain(grid.map((entry) => entry.username)), ['A', 'B', 'C']);
  assert.ok(grid.every((entry) => entry.slot >= 1));
});

test('11. 1000 likes cria racer', () => {
  const likesByUser = {};
  const racers = [];
  const result = R.applyLikeMilestones({ likesByUser, racers, userId: 'u100', likesDelta: 1000, username: 'Novo' });
  assert.equal(result.created, true);
  assert.equal(likesByUser.u100, 1000);
  assert.equal(racers.length, 1);
});

test('12. 2000 likes não duplica', () => {
  const likesByUser = { u200: 1000 };
  const racers = [makeRacer({ userId: 'u200', username: 'Existente' })];
  const result = R.applyLikeMilestones({ likesByUser, racers, userId: 'u200', likesDelta: 1000, username: 'Existente' });
  assert.equal(result.created, false);
  assert.equal(racers.length, 1);
  assert.equal(likesByUser.u200, 2000);
});

test('13. Rose turbo demo', () => {
  const rose = R.giftFor('rose', 'rose');
  assert.equal(rose.effect, 'turbo');
  assert.equal(R.canGiftCompete(R.MODES.FULL_INTERACTION_DEMO, 'gift'), true);
  assert.equal(R.applyGiftEffect({ mode: R.MODES.FULL_INTERACTION_DEMO, gift: rose, source: 'u1', target: 'u2' }).effect, 'turbo');
});

test('14. gift cooldown', () => {
  const rose = R.giftFor('rose');
  const now = 1000;
  const cooldown = { rose: { until: now + 1000 } };
  assert.equal(R.isGiftOnCooldown('rose', cooldown, now), true);
  assert.equal(R.isGiftOnCooldown('rose', cooldown, now + 5000), false);
  assert.equal(rose.cooldown > 0, true);
});

test('15. Galaxy FULL_INTERACTION_DEMO', () => {
  const galaxy = R.giftFor('galaxy');
  const result = R.applyGiftEffect({ mode: R.MODES.FULL_INTERACTION_DEMO, gift: galaxy, source: 'u1', target: 'u2' });
  assert.equal(result.effect, 'galaxy');
  assert.ok(result.impact > 0);
});

test('16. Galaxy bloqueada em LIVE_COMPLIANT', () => {
  const galaxy = R.giftFor('galaxy');
  const result = R.applyGiftEffect({ mode: R.MODES.LIVE_COMPLIANT, gift: galaxy, source: 'u1', target: 'u2' });
  assert.equal(result.blocked, true);
  assert.equal(result.effect, 'neutral');
});

test('17. finish parking slots', () => {
  const p1 = R.parkingSlot(1);
  const p2 = R.parkingSlot(2);
  const p3 = R.parkingSlot(3);
  assert.equal(p1[0] !== p2[0] || p1[1] !== p2[1], true);
  assert.equal(p2[0] !== p3[0] || p2[1] !== p3[1], true);
  assert.equal(p1[0] >= 0 && p1[1] >= 0, true);
});

// ---------------------------------------------------------------------------
// REGRA ABSOLUTA: 1 player = 1 racer
// ---------------------------------------------------------------------------
function simulateJoin(R, state, username, { userId = null, team = 1 } = {}) {
  const user = { username, userId: userId || username.toLowerCase().replace(/^@/, '') };
  const outcome = R.admitRacer({
    racers: state.racers,
    queue: state.queue,
    user: { username: user.username, userId: user.userId },
    team,
    maxRacers: 16,
    makeRacer: (index, name, teamId) => ({
      userId: user.userId,
      username: name,
      teamId,
      completedLaps: 0,
      trackProgress: 0,
      finished: false,
      finishPosition: null
    })
  });
  return outcome;
}

function freshState() {
  return { racers: [], queue: new Map(), likesByUser: {} };
}

test('18. @HUGO: comentários x4 + 1000 likes + gift + reconnect = SEMPRE 1 racer', () => {
  const state = freshState();

  // 1.º comentário -> entra
  const first = simulateJoin(R, state, '@HUGO');
  assert.equal(first.admitted, true);
  assert.equal(first.queued, false);
  assert.equal(state.racers.length, 1);

  // comentário repetido (mesmo userId, outro casing) NÃO cria outro carro
  simulateJoin(R, state, '@HUGO');
  simulateJoin(R, state, 'HUGO');
  simulateJoin(R, state, '@hugo');
  assert.equal(state.racers.length, 1, 'comentários repetidos não criam carros');

  // 1000 likes NÃO criam outro carro (milestone sobre utilizador existente)
  R.recordLike({ likesByUser: state.likesByUser, userId: R.racerKey({ userId: 'hugo' }), amount: 1000 });
  const likesOutcome = R.admitRacer({
    racers: state.racers,
    queue: state.queue,
    user: { username: '@HUGO', userId: 'hugo' },
    team: 1,
    makeRacer: () => ({})
  });
  assert.equal(likesOutcome.admitted, false, 'likes de quem já tem carro não admitem nada');
  assert.equal(state.racers.length, 1);

  // gift NÃO cria carro
  const giftOutcome = R.admitRacer({
    racers: state.racers,
    queue: state.queue,
    user: { username: '@HUGO', userId: 'hugo' },
    makeRacer: () => ({})
  });
  assert.equal(giftOutcome.admitted, false);
  assert.equal(state.racers.length, 1);

  // reconnect (uniqueId em vez de userId) NÃO duplica — mesma chave
  const reconnect = simulateJoin(R, state, 'HUGO', { userId: 'hugo' });
  assert.equal(reconnect.admitted, false, 'reconnect não cria segundo carro');
  assert.equal(state.racers.length, 1);

  // fim de corrida: continua 1 racer associado, não pode reaparecer como 2.º
  const racer = state.racers[0];
  R.finishRacer(racer, 1, 95000);
  const afterFinish = simulateJoin(R, state, '@HUGO');
  assert.equal(afterFinish.admitted, false, 'terminado mantém-se ligado ao mesmo racer');
  assert.equal(state.racers.length, 1);

  assert.equal(R.countDuplicateRacers(state.racers), 0);
});

test('19. 16 utilizadores = 16 racers; 17.º vai para a fila; zero duplicados', () => {
  const state = freshState();
  for (let i = 1; i <= 16; i += 1) {
    const outcome = simulateJoin(R, state, `@USER${i}`, { userId: `user-${i}` });
    assert.equal(outcome.admitted, true);
    assert.equal(outcome.queued, false);
  }
  assert.equal(state.racers.length, 16);
  assert.equal(R.countDuplicateRacers(state.racers), 0, '16 users = 16 racers únicos');

  // 17.º entra na fila
  const seventeenth = simulateJoin(R, state, '@USER17', { userId: 'user-17' });
  assert.equal(seventeenth.queued, true);
  assert.equal(state.queue.size, 1);
  assert.equal(state.racers.length, 16);

  // tentativas repetidas de quem já cá está (16 keys) não mudam nada
  for (let i = 1; i <= 16; i += 1) {
    simulateJoin(R, state, `@USER${i}`, { userId: `user-${i}` });
  }
  assert.equal(state.racers.length, 16);
  assert.equal(state.queue.size, 1);
  assert.equal(R.countDuplicateRacers(state.racers), 0);
});

test('20. queue dedupe + transição queue->racer única', () => {
  const state = freshState();
  // encher a grelha
  for (let i = 1; i <= 16; i += 1) simulateJoin(R, state, `@U${i}`, { userId: `u${i}` });

  // queued: comentários/likes repetidos NÃO duplicam a queue
  const firstQueued = simulateJoin(R, state, '@ESPERA', { userId: 'espera' });
  assert.equal(firstQueued.queued, true);
  simulateJoin(R, state, '@ESPERA');
  simulateJoin(R, state, 'espera', { userId: 'espera' });
  assert.equal(state.queue.size, 1, 'queue sem duplicados');
  assert.equal(state.racers.length, 16);

  // libertar um slot: o mesmo user não pode voltar a admitir-se a si próprio
  state.racers = state.racers.filter((r) => r.userId !== 'u1');
  const again = simulateJoin(R, state, '@ESPERA', { userId: 'espera' });
  assert.equal(again.admitted, false, 'quem está em queue não admite direto (transição é do host/round)');
  assert.equal(state.racers.length, 15);
});

test('21. racerKey: userId > uniqueId > username fallback seguro', () => {
  assert.equal(R.racerKey({ userId: 'Hugo-PT', uniqueId: 'outro', username: '@x' }), 'hugo-pt');
  assert.equal(R.racerKey({ uniqueId: 'Hugo_PT', username: '@y' }), 'hugo_pt');
  assert.equal(R.racerKey({ username: '@Hugo' }), 'hugo');
  assert.equal(R.racerKey('  @HUGO  '), 'hugo');
  assert.equal(R.racerKey(null), '');
  assert.equal(R.racerKey({ userId: '  ', username: '@Ana' }), 'ana');
});

// ---------------------------------------------------------------------------
// NOVA REGRA: QUALQUER interação real = 1 racer (entrada imediata)
// ---------------------------------------------------------------------------
test('LIVE_INTERACTIVE applies gifts with the same cooldown guarantees',()=>{
  const cooldownMap={};
  for(const id of ['rose','bomb','emp','galaxy']){
    const applied=R.applyGiftEffect({mode:R.MODES.LIVE_INTERACTIVE,gift:R.GIFT_RULES[id],source:'gift',target:'hugo',now:1000,cooldownMap});
    assert.equal(applied.blocked,false);assert.equal(applied.effect,R.GIFT_RULES[id].effect);
    const repeated=R.applyGiftEffect({mode:R.MODES.LIVE_INTERACTIVE,gift:R.GIFT_RULES[id],source:'gift',target:'hugo',now:1100,cooldownMap});
    assert.equal(repeated.cooldown,true);
  }
});
test('22. entrada: 1 like cria racer; likes/comment/gift extra = SEMPRE 1', () => {
  const state = freshState();
  const admit = (username, userId) => R.admitRacer({
    racers: state.racers, queue: state.queue,
    user: { username, userId }, team: 1, maxRacers: 16,
    makeRacer: (i, n, t, ident) => ({ userId: R.racerKey(ident ?? userId ?? username), username: n, teamId: t })
  });
  const already = (u) => !!R.findRacerForUser(state.racers, u) || state.queue.has(R.racerKey(u ?? {}));

  // 1.º like → 1 racer
  assert.equal(admit('@HUGO', 'hugo').admitted, true);
  assert.equal(state.racers.length, 1);
  // mais likes → continua 1
  assert.equal(already({ userId: 'hugo', username: '@HUGO' }), true);
  assert.equal(state.racers.length, 1);
  // comment depois → continua 1
  assert.equal(admit('@HUGO', 'hugo').admitted, false);
  assert.equal(state.racers.length, 1);
  // gift depois → continua 1
  assert.equal(admit('@HUGO', 'hugo').admitted, false);
  assert.equal(state.racers.length, 1);
  assert.equal(R.countDuplicateRacers(state.racers), 0);
});

test('23. gift como 1.ª interação cria o racer do próprio user', () => {
  const state = freshState();
  const outcome = R.admitRacer({
    racers: state.racers, queue: state.queue,
    user: { username: '@NOVO', userId: 'novo' }, team: 1, maxRacers: 16,
    makeRacer: (i, n, t, ident) => ({ userId: R.racerKey(ident), username: n, teamId: t })
  });
  assert.equal(outcome.admitted, true);
  assert.equal(outcome.queued, false);
  assert.equal(outcome.racer.userId, 'novo', 'racer associado à identidade real');
  assert.equal(state.racers.length, 1);
  assert.equal(R.countDuplicateRacers(state.racers), 0);
});

test('24. 16 utilizadores interagentes = 16 racers; 17.º = queue', () => {
  const state = freshState();
  const admit = (username, userId) => R.admitRacer({
    racers: state.racers, queue: state.queue,
    user: { username, userId }, team: 1, maxRacers: 16,
    makeRacer: (i, n, t, ident) => ({ userId: R.racerKey(ident), username: n, teamId: t })
  });
  for (let i = 1; i <= 16; i += 1) {
    const o = admit(`@U${i}`, `u${i}`);
    assert.equal(o.admitted, true);
    assert.equal(o.queued, false);
  }
  assert.equal(state.racers.length, 16);
  const q = admit('@U17', 'u17');
  assert.equal(q.queued, true);
  assert.equal(state.racers.length, 16);
  assert.equal(state.queue.size, 1);
  assert.equal(R.countDuplicateRacers(state.racers), 0);
});
