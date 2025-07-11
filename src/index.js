const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { RSI, MACD, ATR, ADX, MFI, BollingerBands, SMA, EMA, VWAP } = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

async function obtenerDatosHistoricos(symbol, timeframe, cantidad) {
  const hoy = new Date();
  const desde = new Date();
  desde.setDate(hoy.getDate() - cantidad);
  const from = desde.toISOString().split('T')[0];
  const to = hoy.toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/${from}/${to}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
  const { data } = await axios.get(url);
  return data.results || [];
}

function calcularIndicadores(datos) {
  const closes = datos.map(p => p.c);
  const highs = datos.map(p => p.h);
  const lows = datos.map(p => p.l);
  const volumes = datos.map(p => p.v);

  return {
    rsi: RSI.calculate({ values: closes, period: 14 }).at(-1),
    macd: MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    }).at(-1)?.MACD,
    atr: ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1),
    adx: ADX.calculate({ close: closes, high: highs, low: lows, period: 14 }).at(-1)?.adx,
    mfi: MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }).at(-1),
    bollingerBands: BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).at(-1),
    sma20: SMA.calculate({ values: closes, period: 20 }).at(-1),
    ema20: EMA.calculate({ values: closes, period: 20 }).at(-1),
    vwap: VWAP.calculate({ close: closes, high: highs, low: lows, volume: volumes }).at(-1)
  };
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 100 } = req.query;
  const tfPrioridad = [timeframe, 'week', 'month'];
  let velas = {};
  let historico = [];
  let tecnico = null;
  let seleccionado = null;

  for (const tf of tfPrioridad) {
    try {
      const datos = await obtenerDatosHistoricos(symbol, tf, cantidad);
      if (datos.length >= 20) {
        velas[tf] = datos;
        if (!seleccionado) {
          historico = datos.map(p => p.c);
          tecnico = calcularIndicadores(datos);
          seleccionado = tf;
        }
      }
    } catch (e) {
      console.warn(`Falló timeframe ${tf}: ${e.message}`);
    }
  }

  const cierre = historico.at(-1) || null;
  const anterior = velas[seleccionado]?.at(-2) || {};

  return res.json({
    symbol,
    timeframe: seleccionado,
    precioActual: cierre,
    historico: historico.slice(-14),
    tecnico: tecnico ? {
      ...tecnico,
      patron: "Sin patrón",
      tecnicoCombinado: "Indicadores técnicos calculados correctamente",
      soportes: [Math.min(...historico.slice(-14))],
      resistencias: [Math.max(...historico.slice(-14))],
      tendencia: (cierre > historico[0]) ? "Alcista" : "Bajista",
      entradaSugerida: "Esperar confirmación"
    } : "N/A",
    fundamental: {
      marketCap: "N/A",
      peRatio: "N/A",
      eps: "N/A",
      dividendYield: "N/A"
    },
    shortInterest: {
      shortFloat: "N/A",
      shortVolume: "N/A",
      shortVolumeRatio: "N/A",
      totalVolume: "N/A",
      shortInterestTotal: "N/A",
      avgDailyVolume: "N/A",
      daysToCover: "N/A"
    },
    volumen: {
      volumenActual: velas[seleccionado]?.at(-1)?.v || null,
      volumenPromedio30Dias: historico.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, historico.length),
      volumenAcumulado: historico.reduce((a, b) => a + b, 0)
    },
    resumenDia: {
      aperturaDiaAnterior: anterior.o || "N/A",
      minimoDiaAnterior: anterior.l || "N/A",
      maximoDiaAnterior: anterior.h || "N/A",
      cierreDiaAnterior: anterior.c || "N/A",
      volumenResumenDiario: anterior.v || "N/A"
    },
    velas,
    noticias: [],
    resumen: {
      estadoActual: "Precaución",
      riesgo: "Medio",
      oportunidad: tecnico ? "RSI y MACD muestran señales mixtas" : "No disponible"
    },
    horaNY: new Date().toISOString(),
    horaLocal: new Date().toISOString(),
    mercado: {
      estado: "Desconocido",
      tiempoParaEvento: "N/A"
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});

