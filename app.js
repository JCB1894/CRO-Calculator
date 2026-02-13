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

  return {
    methodName: 'Frecuentista',
    pA,
    pB,
    uplift,
    z,
    pValueTwoSided,
    confidence,
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

  for (let i = 0; i < draws; i += 1) {
    const sampleA = betaSample(alphaA, betaA);
    const sampleB = betaSample(alphaB, betaB);
    const uplift = (sampleB - sampleA) / sampleA;
    if (sampleB > sampleA) bBetter += 1;
    upliftSum += uplift;
  }

  const pA = cA / vA;
  const pB = cB / vB;
  const upliftObserved = pA === 0 ? NaN : ((pB - pA) / pA) * 100;

  const meanA = alphaA / (alphaA + betaA);
  const meanB = alphaB / (alphaB + betaB);
  const varA = (alphaA * betaA) / (((alphaA + betaA) ** 2) * (alphaA + betaA + 1));
  const varB = (alphaB * betaB) / (((alphaB + betaB) ** 2) * (alphaB + betaB + 1));

  return {
    methodName: 'Bayesiano',
    pA,
    pB,
    uplift: upliftObserved,
    probBBetter: (bBetter / draws) * 100,
    expectedUplift: (upliftSum / draws) * 100,
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

function makeCurvePath(mean, sd, xMin, xMax, yMax, colorClass) {
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

  return { path, fill, colorClass };
}

function renderFrequentistChart(z) {
  const clippedZ = Math.max(-4, Math.min(4, z));
  const markerLeft = ((clippedZ + 4) / 8) * 440 + 30;

  return `
    <div class="chart-block glassy">
      <h3>Frecuentista: distribución normal y z-score</h3>
      <svg viewBox="0 0 500 190" class="dist-chart" role="img" aria-label="Curva normal estándar con marcador z-score">
        <defs>
          <linearGradient id="freqFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#6366f1" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#6366f1" stop-opacity="0.06"/>
          </linearGradient>
        </defs>
        <path d="M30,160 C90,160 130,22 250,22 C370,22 410,160 470,160 L470,160 L30,160 Z" fill="url(#freqFill)"/>
        <path d="M30,160 C90,160 130,22 250,22 C370,22 410,160 470,160" fill="none" stroke="#4f46e5" stroke-width="1"/>
        <line x1="30" y1="160" x2="470" y2="160" stroke="#9ca3af" stroke-width="1"/>
        <line x1="${markerLeft}" y1="26" x2="${markerLeft}" y2="160" stroke="#ef4444" stroke-width="1"/>
        <text x="${markerLeft + 6}" y="34" font-size="12" fill="#111827">z=${z.toFixed(2)}</text>
        <text x="32" y="178" font-size="12" fill="#6b7280">-4σ</text>
        <text x="245" y="178" font-size="12" fill="#6b7280">0</text>
        <text x="446" y="178" font-size="12" fill="#6b7280">+4σ</text>
      </svg>
    </div>
  `;
}

function renderBayesianChart(posteriorA, posteriorB) {
  const combinedSd = Math.max(posteriorA.sd, posteriorB.sd, 0.003);
  const xMin = Math.max(0, Math.min(posteriorA.mean, posteriorB.mean) - 4 * combinedSd);
  const xMax = Math.min(1, Math.max(posteriorA.mean, posteriorB.mean) + 4 * combinedSd);
  const yMax = Math.max(
    gaussianPdf(posteriorA.mean, posteriorA.mean, posteriorA.sd),
    gaussianPdf(posteriorB.mean, posteriorB.mean, posteriorB.sd)
  );

  const curveA = makeCurvePath(posteriorA.mean, posteriorA.sd, xMin, xMax, yMax, 'a');
  const curveB = makeCurvePath(posteriorB.mean, posteriorB.sd, xMin, xMax, yMax, 'b');

  const meanX = (mean) => 30 + ((mean - xMin) / (xMax - xMin)) * 440;

  return `
    <div class="chart-block glassy">
      <h3>Bayesiano: campanas posteriores por variación</h3>
      <svg viewBox="0 0 500 190" class="dist-chart" role="img" aria-label="Campanas de Gauss para las distribuciones posteriores de A y B">
        <line x1="30" y1="160" x2="470" y2="160" stroke="#9ca3af" stroke-width="1"/>
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
        <span class="pill a">A media: ${asPct(posteriorA.mean * 100, 3)}</span>
        <span class="pill b">B media: ${asPct(posteriorB.mean * 100, 3)}</span>
      </div>
    </div>
  `;
}

function renderResult(result, target) {
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
        <div class="metric">Uplift observado<strong>${asPct(result.uplift)}</strong></div>
        <div class="metric">z-score<strong>${result.z.toFixed(3)}</strong></div>
        <div class="metric">p-value (2 colas)<strong>${result.pValueTwoSided.toFixed(5)}</strong></div>
        <div class="metric">Confianza estadística<strong>${asPct(result.confidence)}</strong></div>
      </div>
      ${rateBars}
      ${renderFrequentistChart(result.z)}
      <p class="note">Decisión: ${result.isWinner ? '✅ B gana con el umbral seleccionado.' : `ℹ️ No alcanza el umbral del ${target.toFixed(2)}%.`}</p>
    `;
    return;
  }

  el.resultContent.innerHTML = `
    <div class="result-grid">
      <div class="metric">Tasa A<strong>${asPct(result.pA * 100)}</strong></div>
      <div class="metric">Tasa B<strong>${asPct(result.pB * 100)}</strong></div>
      <div class="metric">Uplift observado<strong>${asPct(result.uplift)}</strong></div>
      <div class="metric">P(B > A)<strong>${asPct(result.probBBetter)}</strong></div>
      <div class="metric">Uplift esperado (posterior)<strong>${asPct(result.expectedUplift)}</strong></div>
    </div>
    ${rateBars}
    ${renderBayesianChart(result.posteriorA, result.posteriorB)}
    <p class="note">Decisión: ${result.isWinner ? '✅ B tiene al menos 95% de probabilidad de ser mejor.' : 'ℹ️ B aún no alcanza 95% de probabilidad de mejora.'}</p>
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

  renderResult(result, target);
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
