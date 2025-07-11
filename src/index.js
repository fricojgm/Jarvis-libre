const express = require('express');
const cors = require('cors');
const axios = require('axios');
const {
  RSI, MACD, ATR, BollingerBands, ADX, MFI,
  SMA, EMA, SuperTrend
} = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// Funciones auxiliares (fundamentales, shortInterest, noticias, patrón...)
async function getFundamentales(symbol) {
  try {
    const url = `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    const r = resp.data.results?.[0]?.financials;
    return r ? {
      marketCap: Number(r.balance_sheet?.assets?.value) || "N/A",
      peRatio: Number(r.valuation_ratios?.price_to_earnings) || "N/A",
      eps: Number(r.income_statement?.eps) || "N/A",
      dividendYield: Number(r.valuation_ratios?.dividend_yield) || "N/A"
    } : {};
  } catch {
    return {};
  }
}

async function getShortInterest(symbol) {
  try {
    const url = `https://api.polygon.io/vX/reference/tickers?symbol=${symbol}&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    const si = resp.data.results?.[0]?.short_interest;
    return si ? {
      shortFloat: si.short_percent_of_float,
      shortVolume: si.short_volume,
      shortVolumeRatio: si.short_volume_ratio,
      totalVolume: si.volume,
      daysToCover: si.days_to_cover
    } : {};
  } catch {
    return {};
  }
}

async function getNoticias(symbol) {
  try {
    const url = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    return resp.data.results.map(n => ({
      titulo: n.title,
      resumen: n.summary,
      fuente: n.publisher,
      url: n.article_url,
      fecha: n.published_utc,
      sentimiento: n.sentiment || "neutral"
    }));
  } catch {
    return [];
  }
}

function detectarPatron(candles) {
  const last = candles.at(-1);
  const body = Math.abs(last.c - last.o);
  const range = last.h - last.l;
  const upper = last.h - Math.max(last.c, last.o);
  const lower = Math.min(last.c, last.o) - last.l;
  if (body / range < 0.1 && upper / range > 0.2 && lower / range > 0.2) return 'Doji';
  if (lower / body > 2 && upper / body < 0.2) return 'Hammer';
  if (upper / body > 2 && lower / body < 0.2) return 'Shooting Star';
  return 'Sin patrón';
}

function mapTimeframeToAgg(timeframe) {
  switch (timeframe) {
    case 'minute': return { mult: 1, timespan: 'minute' };
    case 'hour': return { mult: 1, timespan: 'hour' };
    case 'week': return { mult: 1, timespan: 'week' };
    default: return { mult: 1, timespan: 'day' };
  }
}

// Endpoint principal
app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  let { timeframe = 'day', cantidad = 100 } = req.query;
timeframe = {
  diario: 'day',
  diaria: 'day',
  semanal: 'week',
  mensual: 'month',
  minuto: 'minute',
  hora: 'hour',
}[timeframe] || timeframe;

  cantidad = Math.max(parseInt(cantidad), 30);

  const { mult, timespan } = mapTimeframeToAgg(timeframe);
  
  try {
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - cantidad);
    const from = since.toISOString().split('T')[0];
    const to = today.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${mult}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const datos = (await axios.get(url)).data.results;
    if (!datos?.length) return res.status(400).json({ error: 'No hay suficientes datos' });

    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const volumes = datos.map(p => p.v);

    // Indicadores principales
    const rsi = RSI.calculate({ values: closes, period: 14 }).pop();
    const macdR = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).pop();
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).pop();
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).pop();
    const adxR = ADX.calculate({ close: closes, high: highs, low: lows, period: 14 }).pop();
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }).pop();

    // Indicadores adicionales
    const sma20 = SMA.calculate({ period: 20, values: closes }).pop();
    const ema20 = EMA.calculate({ period: 20, values: closes }).pop();
    const st = SuperTrend.calculate({
      high: highs, low: lows, close: closes,
      period: 10, multiplier: 3
    }).pop();

    // VWAP
    const tp = datos.map(p => (p.h + p.l + p.c) / 3);
    const totalVol = volumes.reduce((a, b) => a + b, 0);
    const vwap = tp.map((t, i) => t * volumes[i]).reduce((a, b) => a + b, 0) / totalVol;

    // Otras fuentes
    const fundamental = await getFundamentales(symbol);
    const shortI = await getShortInterest(symbol);
    const news = await getNoticias(symbol);
    const patron = detectarPatron(datos);

    res.json({
      symbol,
      timeframe,
      precioActual: closes.pop(),
      historico: closes.slice(-14),

      tecnico: {
        rsi, macd: macdR?.MACD || "N/A", atr, adx: adxR?.adx || "N/A",
        mfi, bollingerBands: { superior: bb?.upper || "N/A", inferior: bb?.lower || "N/A" },
        sma20, ema20, superTrend: st || "N/A",
        vwap, patron,
        tecnicoCombinado: `Rsi=${rsi.toFixed(2)}, MACD=${macdR?.MACD?.toFixed(2)}, SMA=${sma20?.toFixed(2)}, EMA=${ema20?.toFixed(2)}`,
        soportes: [Math.min(...closes.slice(-14))],
        resistencias: [Math.max(...closes.slice(-14))],
        tendencia: closes.at(-1) > closes[0] ? "Alcista" : "Bajista",
        entradaSugerida: patron === 'Doji' ? 'Posible reversión' : 'Esperar confirmación'
      },

      fundamental,
      shortInterest: shortI,

      volumen: {
        volumenActual: volumes.pop(),
        volumenPromedio30Dias: (volumes.slice(-30).reduce((a, b) => a + b, 0) / 30).toFixed(2),
        volumenAcumulado: volumes.reduce((a, b) => a + b, 0).toFixed(2)
      },

      resumenDia: {
        aperturaDiaAnterior: datos.at(-2)?.o,
        minimoDiaAnterior: datos.at(-2)?.l,
        maximoDiaAnterior: datos.at(-2)?.h,
        cierreDiaAnterior: datos.at(-2)?.c,
        volumenResumenDiario: datos.at(-2)?.v
      },

      noticias: news,
      horaNY: new Date().toISOString(),
      horaLocal: new Date().toISOString(),
      mercado: { estado: "Desconocido", tiempoParaEvento: "N/A" }
    });

  } catch (err) {
    console.error("ERROR COMPLETO:", err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor iniciado en puerto ${PORT}`));


