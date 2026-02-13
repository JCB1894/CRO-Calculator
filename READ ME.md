# CRO Calculator

Calculadora A/B en frontend puro que permite elegir entre:

- Enfoque **frecuentista** (z-test de dos proporciones, confianza a partir de p-value).
- Enfoque **bayesiano** (modelo Beta-Binomial y simulación Monte Carlo para estimar `P(B > A)`).

Incluye gráficos por enfoque:

- Frecuentista: barras de tasas + curva normal con marcador del z-score.
- Bayesiano: barras de tasas + histograma del uplift posterior.

## Ejecutar localmente

```bash
python3 -m http.server 4173
```

Abre `http://localhost:4173`.