#!/usr/bin/env node
/*
 * Offline projection backtest for the FPL AI Agent.
 *
 * Purpose: measure how well point-in-time projection signals predict real FPL
 * points, per position, so the model can be calibrated with evidence instead of
 * hand-tuned constants. This is the missing feedback loop flagged in
 * docs/KNOWN_LIMITATIONS.md and GAP_ANALYSIS.md.
 *
 * It walks each sampled player's element-summary history and, for each gameweek
 * t, builds a projection from ONLY the gameweeks before t, then compares it to
 * the actual points scored in t. It reports MAE, bias and a calibration
 * multiplier per position for a few candidate models, plus a minutes-model
 * error check (minutes are the biggest driver of FPL points).
 *
 * Run it on a machine that can reach the FPL API (the API blocks datacenter IPs):
 *   npm run backtest                 # default sample
 *   node scripts/backtest.mjs 60 3   # 60 players/position, min 3 prior GWs
 *
 * It makes no changes to the app; it only reads the public FPL API and prints a
 * report (and writes backtest-report.json).
 */

import { writeFileSync } from 'node:fs';

const BASE = 'https://fantasy.premierleague.com/api';
const UA = {
  'User-Agent': 'Mozilla/5.0 (compatible; fpl-ai-agent-backtest/1.0)',
  Accept: 'application/json',
};

const PER_POSITION = Number(process.argv[2] || 50);
const MIN_PRIOR_GWS = Number(process.argv[3] || 4);
const CONCURRENCY = 4;
const POS_NAMES = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Run tasks with a small concurrency cap so we do not hammer the API.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (err) {
        out[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

const per90 = (v, mins) => (mins >= 90 ? (v / mins) * 90 : 0);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const num = (v) => Number(v || 0);

/*
 * Candidate projections for gameweek `t`, using only history[0..t-1].
 * Each returns an expected-points number.
 */
function projections(history, t) {
  const prior = history.slice(0, t);
  const recent = prior.slice(-6);
  const recent4 = prior.slice(-4);

  const recentMinutes = recent.map((h) => num(h.minutes));
  const predictedMinutes = Math.min(90, mean(recentMinutes) || 0);
  const minutesShare = predictedMinutes / 90;

  // Points per 90 from recent games with minutes.
  const played = recent.filter((h) => num(h.minutes) > 0);
  const pointsPer90 = played.length
    ? mean(played.map((h) => per90(num(h.total_points), num(h.minutes))))
    : 0;

  // Cumulative attacking rate (xGI/90 -> ~ points contribution).
  const cumMinutes = prior.reduce((s, h) => s + num(h.minutes), 0);
  const cumXgi = prior.reduce(
    (s, h) => s + num(h.expected_goal_involvements ?? (num(h.expected_goals) + num(h.expected_assists))),
    0,
  );
  const xgi90 = per90(cumXgi, cumMinutes);

  return {
    // Naive: average of the last four gameweek scores.
    naive: mean(recent4.map((h) => num(h.total_points))),
    // Form x minutes: recent points-per-90 scaled by expected minutes.
    formMinutes: pointsPer90 * minutesShare,
    // Adds an xGI-based attacking expectation on top of a base.
    xgiBlend: 1.5 * minutesShare + xgi90 * 3.5 * minutesShare,
    predictedMinutes,
  };
}

function agg() {
  return { n: 0, absErr: 0, err: 0, sumPred: 0, sumActual: 0 };
}
function add(a, pred, actual) {
  a.n += 1;
  a.absErr += Math.abs(pred - actual);
  a.err += pred - actual;
  a.sumPred += pred;
  a.sumActual += actual;
}
function summarize(a) {
  if (!a.n) return null;
  return {
    n: a.n,
    mae: +(a.absErr / a.n).toFixed(3),
    bias: +(a.err / a.n).toFixed(3),
    calibrationMultiplier: a.sumPred > 0 ? +(a.sumActual / a.sumPred).toFixed(3) : null,
  };
}

async function main() {
  console.log('Fetching bootstrap-static ...');
  const boot = await getJson(`${BASE}/bootstrap-static/`);
  const finished = boot.events.filter((e) => e.finished).length;
  console.log(`Finished gameweeks this season: ${finished}`);
  if (finished < MIN_PRIOR_GWS + 1) {
    console.log(
      `\nNot enough finished gameweeks for a per-GW backtest yet ` +
        `(need > ${MIN_PRIOR_GWS}). Run this once the season is a few GWs in; ` +
        `element-summary per-GW history is required and is empty in pre-season.`,
    );
    return;
  }

  // Sample the most-played players per position to bound API calls.
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const el of boot.elements) byPos[el.element_type]?.push(el);
  const sample = [];
  for (const pos of Object.keys(byPos)) {
    byPos[pos].sort((a, b) => b.minutes - a.minutes);
    sample.push(...byPos[pos].slice(0, PER_POSITION));
  }
  console.log(`Sampling ${sample.length} players (${PER_POSITION}/position), concurrency ${CONCURRENCY} ...`);

  const models = ['naive', 'formMinutes', 'xgiBlend'];
  const stats = {};
  for (const p of Object.values(POS_NAMES)) {
    stats[p] = { minutesMae: agg() };
    for (const m of models) stats[p][m] = agg();
  }

  let done = 0;
  await mapLimit(sample, CONCURRENCY, async (el) => {
    const summary = await getJson(`${BASE}/element-summary/${el.id}/`);
    const history = (summary.history || []).filter((h) => h.round != null);
    const posName = POS_NAMES[el.element_type];
    for (let t = MIN_PRIOR_GWS; t < history.length; t++) {
      const actual = num(history[t].total_points);
      const actualMinutes = num(history[t].minutes);
      const proj = projections(history, t);
      for (const m of models) add(stats[posName][m], proj[m], actual);
      add(stats[posName].minutesMae, proj.predictedMinutes, actualMinutes);
    }
    done += 1;
    if (done % 20 === 0) console.log(`  ...${done}/${sample.length}`);
  });

  const report = { generatedFor: 'season-to-date', finishedGameweeks: finished, perPosition: {} };
  console.log('\n=== Projection accuracy by position (lower MAE = better) ===');
  for (const posName of Object.values(POS_NAMES)) {
    report.perPosition[posName] = {
      minutesModel: summarize(stats[posName].minutesMae),
      models: {},
    };
    console.log(`\n[${posName}]  minutes-model MAE: ${summarize(stats[posName].minutesMae)?.mae ?? 'n/a'} min`);
    for (const m of models) {
      const s = summarize(stats[posName][m]);
      report.perPosition[posName].models[m] = s;
      if (s) {
        console.log(
          `  ${m.padEnd(12)} MAE ${String(s.mae).padStart(6)}  bias ${String(s.bias).padStart(7)}  ` +
            `calMult ${String(s.calibrationMultiplier).padStart(6)}  (n=${s.n})`,
        );
      }
    }
  }

  writeFileSync('backtest-report.json', JSON.stringify(report, null, 2));
  console.log('\nWrote backtest-report.json');
  console.log(
    '\nHow to read this: the model with the lowest MAE per position is the best predictor. ' +
      '`bias` > 0 means the projection over-predicts (apply calMult < 1); `calMult` is the ' +
      'actual/predicted ratio you can multiply that position\'s projection by to remove bias. ' +
      'Share backtest-report.json (or this table) to calibrate lib/fpl.ts.',
  );
}

main().catch((err) => {
  console.error('Backtest failed:', err.message);
  process.exit(1);
});
