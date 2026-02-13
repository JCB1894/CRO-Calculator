const el = {
  method: document.getElementById('method'),
  confidenceField: document.getElementById('confidenceField'),
  confidenceTarget: document.getElementById('confidenceTarget'),
  visitorsA: document.getElementById('visitorsA'),
  conversionsA: document.getElementById('conversionsA'),
  visitorsB: document.getElementById('visitorsB'),
  conversionsB: document.getElementById('conversionsB'),
  calculateBtn: document.getElementById('calculateBtn'),
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

  const draws = 12000;
  let bBetter = 0;
  let upliftSum = 0;
  const upliftSamples = [];

  for (let i = 0; i < draws; i += 1) {
    const sampleA = betaSample(alphaA, betaA);
    const sampleB = betaSample(alphaB, betaB);
    const uplift = (sampleB - sampleA) / sampleA;
    if (sampleB > sampleA) bBetter += 1;
    upliftSum += uplift;
    upliftSamples.push(uplift * 100);
  }

  const pA = cA / vA;
  const pB = cB / vB;
  const upliftObserved = pA === 0 ? NaN : ((pB - pA) / pA) * 100;

  return {
    methodName: 'Bayesiano',
    pA,
    pB,
    uplift: upliftObserved,
    probBBetter: (bBetter / draws) * 100,
    expectedUplift: (upliftSum / draws) * 100,
    upliftSamples,
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
    <div class="chart-block">
      <h3>Gráfico de tasas de conversión</h3>
      <div class="bar-row"><span>A</span><div class="bar-track"><div class="bar a" style="width:${widthA}%"></div></div><strong>${asPct(pA * 100)}</strong></div>
      <div class="bar-row"><span>B</span><div class="bar-track"><div class="bar b" style="width:${widthB}%"></div></div><strong>${asPct(pB * 100)}</strong></div>
    </div>
  `;
}

function renderFrequentistChart(z) {
  const clippedZ = Math.max(-4, Math.min(4, z));
  const markerLeft = ((clippedZ + 4) / 8) * 100;
  return `
    <div class="chart-block">
      <h3>Enfoque frecuentista: distribución normal estándar</h3>
      <svg viewBox="0 0 500 180" class="dist-chart" role="img" aria-label="Curva normal estándar con marcador z-score">
        <path d="M10,160 C70,160 110,20 250,20 C390,20 430,160 490,160" fill="none" stroke="#6d6cf6" stroke-width="4"/>
        <line x1="10" y1="160" x2="490" y2="160" stroke="#9ca3af" stroke-width="2"/>
        <line x1="${(markerLeft / 100) * 480 + 10}" y1="20" x2="${(markerLeft / 100) * 480 + 10}" y2="160" stroke="#ef4444" stroke-width="3"/>
        <text x="${(markerLeft / 100) * 480 + 14}" y="34" font-size="13" fill="#111827">z=${z.toFixed(2)}</text>
        <text x="12" y="176" font-size="12" fill="#6b7280">-4σ</text>
        <text x="242" y="176" font-size="12" fill="#6b7280">0</text>
        <text x="468" y="176" font-size="12" fill="#6b7280">+4σ</text>
      </svg>
    </div>
  `;
}

function renderBayesianChart(samples) {
  const bins = 24;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = max - min || 1;
  const step = span / bins;
  const hist = Array.from({ length: bins }, () => 0);

  samples.forEach((value) => {
    const idx = Math.min(bins - 1, Math.floor((value - min) / step));
    hist[idx] += 1;
  });

  const maxBin = Math.max(...hist, 1);
  const bars = hist.map((count, i) => {
    const height = Math.round((count / maxBin) * 120);
    const x = 12 + i * 19;
    const y = 140 - height;
    return `<rect x="${x}" y="${y}" width="14" height="${height}" fill="#4f46e5" opacity="0.85"/>`;
  }).join('');

  return `
    <div class="chart-block">
      <h3>Enfoque bayesiano: histograma del uplift posterior</h3>
      <svg viewBox="0 0 500 180" class="dist-chart" role="img" aria-label="Histograma de uplift posterior">
        <line x1="10" y1="140" x2="490" y2="140" stroke="#9ca3af" stroke-width="2"/>
        <line x1="250" y1="20" x2="250" y2="140" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 4"/>
        ${bars}
        <text x="12" y="158" font-size="12" fill="#6b7280">${min.toFixed(1)}%</text>
        <text x="230" y="158" font-size="12" fill="#6b7280">0%</text>
        <text x="442" y="158" font-size="12" fill="#6b7280">${max.toFixed(1)}%</text>
      </svg>
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
    ${renderBayesianChart(result.upliftSamples)}
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

el.calculateBtn.addEventListener('click', calculate);
el.method.addEventListener('change', () => {
  syncMethodUi();
  calculate();
});
[el.visitorsA, el.conversionsA, el.visitorsB, el.conversionsB, el.confidenceTarget].forEach((input) => {
  input.addEventListener('change', calculate);
});

syncMethodUi();
calculate();