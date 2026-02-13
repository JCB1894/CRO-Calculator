const el = {
  method: document.getElementById('method'),
  confidenceField: document.getElementById('confidenceField'),
  confidenceTarget: document.getElementById('confidenceTarget'),
  visitorsA: document.getElementById('visitorsA'),
  conversionsA: document.getElementById('conversionsA'),
  visitorsB: document.getElementById('visitorsB'),
  conversionsB: document.getElementById('conversionsB'),
  resultContent: document.getElementById('resultContent')
};

function clampConversions(visitors, conversions) {
  return Math.max(0, Math.min(visitors, conversions));
}

function erf(x) {
  const sign = Math.sign(x);
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return sign * y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function betaSample(alpha, beta) {
  function gammaSample(k) {
    if (k < 1) {
      const u = Math.random();
      return gammaSample(k + 1) * Math.pow(u, 1 / k);
    }

    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const v = Math.pow(1 + c * z, 3);
      if (v <= 0) continue;
      const u = Math.random();
      if (u < 1 - 0.0331 * Math.pow(z, 4)) return d * v;
      if (Math.log(u) < 0.5 * z * z + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

function frequentistResult(vA, cA, vB, cB, target) {
  const pA = cA / vA;
  const pB = cB / vB;
  const pooled = (cA + cB) / (vA + vB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / vA + 1 / vB));

  if (se === 0) {
    return { error: 'No se puede calcular la desviación estándar (SE = 0).' };
  }

  const z = (pB - pA) / se;
  const pValueTwoSided = 2 * (1 - normalCdf(Math.abs(z)));
  const confidence = (1 - pValueTwoSided) * 100;
  const uplift = pA === 0 ? NaN : ((pB - pA) / pA) * 100;
  const upliftSd = pA === 0 ? NaN : (se / pA) * 100;

  return {
    methodName: 'Frecuentista',
    pA,
    pB,
    uplift,
    upliftSd,
    z,
    pValueTwoSided,
    confidence,
    se,
    isWinner: confidence >= target && pB > pA
  };
}

function bayesianResult(vA, cA, vB, cB) {
  const alphaA = cA + 1;
  const betaA = vA - cA + 1;
  const alphaB = cB + 1;
  const betaB = vB - cB + 1;

  const draws = 10000;
  let bBetter = 0;
  let upliftSum = 0;
  let upliftSqSum = 0;

  for (let i = 0; i < draws; i += 1) {
    const sampleA = betaSample(alphaA, betaA);
    const sampleB = betaSample(alphaB, betaB);
    const uplift = ((sampleB - sampleA) / sampleA) * 100;
    if (sampleB > sampleA) bBetter += 1;
    upliftSum += uplift;
    upliftSqSum += uplift * uplift;
  }

  const pA = cA / vA;
  const pB = cB / vB;
  const upliftObserved = pA === 0 ? NaN : ((pB - pA) / pA) * 100;

  const meanA = alphaA / (alphaA + betaA);
  const meanB = alphaB / (alphaB + betaB);
  const varA = (alphaA * betaA) / (((alphaA + betaA) ** 2) * (alphaA + betaA + 1));
  const varB = (alphaB * betaB) / (((alphaB + betaB) ** 2) * (alphaB + betaB + 1));

  const expectedUplift = upliftSum / draws;
  const upliftPosteriorVariance = Math.max(0, upliftSqSum / draws - expectedUplift ** 2);

  return {
    methodName: 'Bayesiano',
    pA,
    pB,
    uplift: upliftObserved,
    upliftSd: Math.sqrt(upliftPosteriorVariance),
    probBBetter: (bBetter / draws) * 100,
    expectedUplift,
    posteriorA: { mean: meanA, sd: Math.sqrt(varA) },
    posteriorB: { mean: meanB, sd: Math.sqrt(varB) },
    isWinner: bBetter / draws >= 0.95
  };
}

function asPct(value, digits = 2) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : '—';
}

function validateInputs(vA, cA, vB, cB) {
  if (vA <= 0 || vB <= 0) return 'Los visitantes deben ser > 0.';
  if (cA < 0 || cB < 0) return 'Las conversiones no pueden ser negativas.';
  if (cA > vA || cB > vB) return 'Las conversiones no pueden superar a los visitantes.';
  return null;
}

function metricValueWithSd(value, sd) {
  return `${asPct(value)}<span class="metric-sub">σ: ${asPct(sd)}</span>`;
}

function renderRateBars(pA, pB) {
  const maxRate = Math.max(pA, pB, 0.001);
  const widthA = (pA / maxRate) * 100;
  const widthB = (pB / maxRate) * 100;

  return `
    <div class="chart-block glassy">
      <h3>Tasas de conversión</h3>
      <div class="bar-row"><span>A</span><div class="bar-track"><div class="bar a" style="width:${widthA}%"></div></div><strong>${asPct(pA * 100)}</strong></div>
      <div class="bar-row"><span>B</span><div class="bar-track"><div class="bar b" style="width:${widthB}%"></div></div><strong>${asPct(pB * 100)}</strong></div>
    </div>
  `;
}

function gaussianPdf(x, mean, sd) {
  const sigma = Math.max(sd, 1e-6);
  const z = (x - mean) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

function makeCurvePath(mean, sd, xMin, xMax, yMax) {
  const points = [];
  const n = 90;

  for (let i = 0; i <= n; i += 1) {
    const x = xMin + ((xMax - xMin) * i) / n;
    const y = gaussianPdf(x, mean, sd);
    points.push({ x, y });
  }

  const path = points.map((p, idx) => {
    const px = 30 + ((p.x - xMin) / (xMax - xMin)) * 440;
    const py = 160 - (p.y / yMax) * 120;
    return `${idx === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`;
  }).join(' ');

  const fill = `${path} L470,160 L30,160 Z`;
  return { path, fill };
}

function frequentistBoxStats(p, n) {
  const sd = Math.sqrt((p * (1 - p)) / n);
  const zQ = 0.67448975;
  return {
    whiskerLow: Math.max(0, p - 1.96 * sd),
    q1: Math.max(0, p - zQ * sd),
    median: p,
    q3: Math.min(1, p + zQ * sd),
    whiskerHigh: Math.min(1, p + 1.96 * sd),
    sd
  };
}

function renderFrequentistChart(pA, pB, nA, nB, uplift) {
  const boxA = frequentistBoxStats(pA, nA);
  const boxB = frequentistBoxStats(pB, nB);
  const xMin = Math.max(0, Math.min(boxA.whiskerLow, boxB.whiskerLow) - 0.01);
  const xMax = Math.min(1, Math.max(boxA.whiskerHigh, boxB.whiskerHigh) + 0.01);
  const xPos = (p) => 40 + ((p - xMin) / (xMax - xMin || 1)) * 420;

  const drawBox = (box, y, color) => `
    <line x1="${xPos(box.whiskerLow)}" y1="${y}" x2="${xPos(box.q1)}" y2="${y}" stroke="${color}" stroke-width="1"/>
    <line x1="${xPos(box.q3)}" y1="${y}" x2="${xPos(box.whiskerHigh)}" y2="${y}" stroke="${color}" stroke-width="1"/>
    <line x1="${xPos(box.whiskerLow)}" y1="${y - 8}" x2="${xPos(box.whiskerLow)}" y2="${y + 8}" stroke="${color}" stroke-width="1"/>
    <line x1="${xPos(box.whiskerHigh)}" y1="${y - 8}" x2="${xPos(box.whiskerHigh)}" y2="${y + 8}" stroke="${color}" stroke-width="1"/>
    <rect x="${xPos(box.q1)}" y="${y - 12}" width="${Math.max(2, xPos(box.q3) - xPos(box.q1))}" height="24" fill="${color}" opacity="0.25" stroke="${color}" stroke-width="1"/>
    <line x1="${xPos(box.median)}" y1="${y - 12}" x2="${xPos(box.median)}" y2="${y + 12}" stroke="${color}" stroke-width="1"/>
  `;

  return `
    <div class="chart-block glassy">
      <h3>Frecuentista: box-plot de tasas (aprox.)</h3>
      <svg viewBox="0 0 500 190" class="dist-chart" role="img" aria-label="Box-plot aproximado de tasas de conversión para A y B">
        <line x1="40" y1="150" x2="460" y2="150" stroke="#9ca3af" stroke-width="1"/>
        ${drawBox(boxA, 75, '#06b6d4')}
        ${drawBox(boxB, 115, '#4f46e5')}
        <text x="12" y="79" font-size="12" fill="#0e7490">A</text>
        <text x="12" y="119" font-size="12" fill="#3730a3">B</text>
        <text x="40" y="172" font-size="12" fill="#6b7280">${(xMin * 100).toFixed(2)}%</text>
        <text x="420" y="172" font-size="12" fill="#6b7280">${(xMax * 100).toFixed(2)}%</text>
      </svg>
      <div class="legend-inline">
        <span class="pill a">A: Q1 ${asPct(boxA.q1 * 100)} · <strong>Med ${asPct(boxA.median * 100)}</strong> · Q3 ${asPct(boxA.q3 * 100)}</span>
        <span class="pill b">B: Q1 ${asPct(boxB.q1 * 100)} · <strong>Med ${asPct(boxB.median * 100)}</strong> · Q3 ${asPct(boxB.q3 * 100)}</span>
        <span class="pill b"><strong>Uplift: ${asPct(uplift)}</strong></span>
      </div>
    </div>
  `;
}

function renderBayesianChart(posteriorA, posteriorB, uplift) {
  const combinedSd = Math.max(posteriorA.sd, posteriorB.sd, 0.003);
  const xMin = Math.max(0, Math.min(posteriorA.mean, posteriorB.mean) - 4 * combinedSd);
  const xMax = Math.min(1, Math.max(posteriorA.mean, posteriorB.mean) + 4 * combinedSd);
  const yMax = Math.max(
    gaussianPdf(posteriorA.mean, posteriorA.mean, posteriorA.sd),
    gaussianPdf(posteriorB.mean, posteriorB.mean, posteriorB.sd)
  );

  const curveA = makeCurvePath(posteriorA.mean, posteriorA.sd, xMin, xMax, yMax);
  const curveB = makeCurvePath(posteriorB.mean, posteriorB.sd, xMin, xMax, yMax);
  const meanX = (mean) => 30 + ((mean - xMin) / (xMax - xMin || 1)) * 440;
  const sigmaBand = (post) => {
    const low = Math.max(xMin, post.mean - post.sd);
    const high = Math.min(xMax, post.mean + post.sd);
    return { low: meanX(low), high: meanX(high) };
  };
  const bandA = sigmaBand(posteriorA);
  const bandB = sigmaBand(posteriorB);

  return `
    <div class="chart-block glassy">
      <h3>Bayesiano: campanas posteriores y desviación típica</h3>
      <svg viewBox="0 0 500 190" class="dist-chart" role="img" aria-label="Campanas de Gauss para las distribuciones posteriores de A y B con bandas de desviación típica">
        <line x1="30" y1="160" x2="470" y2="160" stroke="#9ca3af" stroke-width="1"/>
        <rect x="${bandA.low}" y="30" width="${Math.max(1, bandA.high - bandA.low)}" height="130" fill="rgba(6, 182, 212, 0.08)"/>
        <rect x="${bandB.low}" y="30" width="${Math.max(1, bandB.high - bandB.low)}" height="130" fill="rgba(79, 70, 229, 0.08)"/>
        <path d="${curveA.fill}" class="posterior-fill-a"/>
        <path d="${curveB.fill}" class="posterior-fill-b"/>
        <path d="${curveA.path}" class="posterior-line-a"/>
        <path d="${curveB.path}" class="posterior-line-b"/>
        <line x1="${meanX(posteriorA.mean)}" y1="34" x2="${meanX(posteriorA.mean)}" y2="160" class="mean-line-a"/>
        <line x1="${meanX(posteriorB.mean)}" y1="34" x2="${meanX(posteriorB.mean)}" y2="160" class="mean-line-b"/>
        <text x="36" y="178" font-size="12" fill="#6b7280">${(xMin * 100).toFixed(2)}%</text>
        <text x="425" y="178" font-size="12" fill="#6b7280">${(xMax * 100).toFixed(2)}%</text>
      </svg>
      <div class="legend-inline">
        <span class="pill a">A media: ${asPct(posteriorA.mean * 100, 3)} · σ: ${asPct(posteriorA.sd * 100, 3)}</span>
        <span class="pill b">B media: ${asPct(posteriorB.mean * 100, 3)} · σ: ${asPct(posteriorB.sd * 100, 3)}</span>
        <span class="pill b"><strong>Uplift posterior esperado: ${asPct(uplift)}</strong></span>
      </div>
    </div>
  `;
}

function renderResult(result, target, vA, vB) {
  if (result.error) {
    el.resultContent.innerHTML = `<p class="error">${result.error}</p>`;
    return;
  }

  const rateBars = renderRateBars(result.pA, result.pB);

  if (result.methodName === 'Frecuentista') {
    el.resultContent.innerHTML = `
      <div class="result-grid">
        <div class="metric">Tasa A<strong>${asPct(result.pA * 100)}</strong></div>
        <div class="metric">Tasa B<strong>${asPct(result.pB * 100)}</strong></div>
        <div class="metric">Uplift observado<strong>${metricValueWithSd(result.uplift, result.upliftSd)}</strong></div>
        <div class="metric">z-score<strong>${result.z.toFixed(3)}</strong></div>
        <div class="metric">p-value (2 colas)<strong>${result.pValueTwoSided.toFixed(5)}</strong></div>
        <div class="metric">Confianza estadística<strong>${asPct(result.confidence)}</strong></div>
      </div>
      ${rateBars}
      ${renderFrequentistChart(result.pA, result.pB, vA, vB, result.uplift)}
      <div class="decision-box ${result.isWinner ? 'success' : 'neutral'}"><span class="decision-label">Decisión</span><strong>${result.isWinner ? '✅ B gana con el umbral seleccionado' : `ℹ️ No alcanza el umbral del ${target.toFixed(2)}%`}</strong></div>
    `;
    return;
  }

  el.resultContent.innerHTML = `
    <div class="result-grid">
      <div class="metric">Tasa A<strong>${asPct(result.pA * 100)}</strong></div>
      <div class="metric">Tasa B<strong>${asPct(result.pB * 100)}</strong></div>
      <div class="metric">Uplift observado<strong>${metricValueWithSd(result.uplift, result.upliftSd)}</strong></div>
      <div class="metric">P(B > A)<strong>${asPct(result.probBBetter)}</strong></div>
      <div class="metric">Uplift esperado (posterior)<strong>${asPct(result.expectedUplift)}</strong></div>
    </div>
    ${rateBars}
    ${renderBayesianChart(result.posteriorA, result.posteriorB, result.expectedUplift)}
    <div class="decision-box ${result.isWinner ? 'success' : 'neutral'}"><span class="decision-label">Decisión</span><strong>${result.isWinner ? '✅ B tiene al menos 95% de probabilidad de ser mejor' : 'ℹ️ B aún no alcanza 95% de probabilidad de mejora'}</strong></div>
  `;
}

function syncMethodUi() {
  const isFrequentist = el.method.value === 'frequentist';
  el.confidenceField.classList.toggle('hidden', !isFrequentist);
}

function calculate() {
  const method = el.method.value;
  const target = Number(el.confidenceTarget.value) || 95;

  const vA = Number(el.visitorsA.value);
  const vB = Number(el.visitorsB.value);
  const cA = clampConversions(vA, Number(el.conversionsA.value));
  const cB = clampConversions(vB, Number(el.conversionsB.value));

  el.conversionsA.value = String(cA);
  el.conversionsB.value = String(cB);

  const inputError = validateInputs(vA, cA, vB, cB);
  if (inputError) {
    el.resultContent.innerHTML = `<p class="error">${inputError}</p>`;
    return;
  }

  const result = method === 'frequentist'
    ? frequentistResult(vA, cA, vB, cB, target)
    : bayesianResult(vA, cA, vB, cB);

  renderResult(result, target, vA, vB);
}

el.method.addEventListener('change', () => {
  syncMethodUi();
  calculate();
});

[el.visitorsA, el.conversionsA, el.visitorsB, el.conversionsB, el.confidenceTarget].forEach((input) => {
  input.addEventListener('input', calculate);
  input.addEventListener('change', calculate);
});

syncMethodUi();
calculate();
