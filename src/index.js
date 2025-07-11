const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 5000 } = req.query;

  // Simulación de datos: reemplaza esto con tus llamadas reales a Polygon
  const precios = [201, 201.5, 200.3, 201.56, 201, 201.08, 205.17, 207.82, 212.44, 213.55, 209.95, 210.01, 211.14, 212.41];
  const precioRealVivo = 212.4;
  const rsi = 38.22;
  const macd = 3.79;
  const patron = "Sin patrón";
  const atr = 2.49;
  const adx = 25.65;
  const vwap = 84.23;
  const mfi = 52.9;
  const bb = { superior: 215.41, inferior: 191.99 };
  const tecnicoCombo = "Precaución: RSI y MFI neutros. MACD bajista";

  const fundamentales = {
    marketCap: 9664219753200,
    peRatio: 32.981366459627324,
    eps: 6.44,
    dividendYield: 0.015
  };

  const shortVolume = {
    shortVolume: 5683713,
    shortVolumeRatio: 34.95,
    totalVolume: 16264662
  };

  const shortData = {
    shortInterestTotal: 45746430,
    avgDailyVolume: 23901107,
    daysToCover: 1.91
  };

  const volumenAcum = "275031354359.00";

  const ohlcCompleto = [{ volumen: 44443503 }];

  const velas = {
    diario: [],
    semanal: [],
    mensual: [],
    hora: []
  };

  const resumenDiario = {
    afterHours: "N/A",
    preMarket: "N/A",
    volumen: "N/A"
  };

  const resumenAyer = {
    apertura: 210.505,
    minimo: 210.03,
    maximo: 213.48,
    cierre: 212.41
  };

  const noticias = [
    {
      titulo: "ROSEN, LEADING TRIAL ATTORNEYS...",
      sentimiento: "negative",
      resumen: "Rosen Law Firm alerts Apple investors...",
      url: "https://www.globenewswire.com/news-release/2025/07/11/3113781/673/en/...",
      fuente: "GlobeNewswire Inc.",
      fecha: "2025-07-11T00:50:00Z"
    }
  ];

  const horaNY = new Date();
  const horaLocal = new Date();
  const estado = "Cerrado";
  const tiempoParaEvento = "00:00:18";

  res.json({
    symbol,
    timeframe,
    precioActual: precioRealVivo !== "N/A" ? precioRealVivo : precios.at(-1),
    historico: precios.slice(-14),

    tecnico: {
      rsi,
      macd,
      patron,
      atr,
      adx,
      vwap,
      mfi,
      bollingerBands: bb,
      tecnicoCombinado: tecnicoCombo
    },

    fundamental: {
      marketCap: fundamentales.marketCap,
      peRatio: fundamentales.peRatio,
      eps: fundamentales.eps,
      dividendYield: fundamentales.dividendYield
    },

    shortInterest: {
      shortFloat: "N/A",
      shortVolume: shortVolume.shortVolume,
      shortVolumeRatio: shortVolume.shortVolumeRatio,
      totalVolume: shortVolume.totalVolume,
      shortInterestTotal: shortData.shortInterestTotal,
      avgDailyVolume: shortData.avgDailyVolume,
      daysToCover: shortData.daysToCover
    },

    volumen: {
      volumenActual: ohlcCompleto.at(-1)?.volumen || "N/A",
      volumenPromedio30Dias: (
        ohlcCompleto
          .slice(-30)
          .map(c => c.volumen)
          .reduce((a, b) => a + b, 0) / Math.min(ohlcCompleto.length, 30)
      ).toFixed(2),
      volumenAcumulado: volumenAcum
    },

    velas: {
      diario: velas.diario,
      semanal: velas.semanal,
      mensual: velas.mensual,
      hora: velas.hora
    },

    resumenDia: {
      afterHours: resumenDiario.afterHours,
      preMarket: resumenDiario.preMarket,
      aperturaDiaAnterior: resumenAyer.apertura,
      minimoDiaAnterior: resumenAyer.minimo,
      maximoDiaAnterior: resumenAyer.maximo,
      cierreDiaAnterior: resumenAyer.cierre,
      volumenResumenDiario: resumenDiario.volumen
    },

    noticias,

    horaNY: horaNY.toISOString(),
    horaLocal: horaLocal.toISOString(),
    mercado: {
      estado,
      tiempoParaEvento
    }
  });
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
