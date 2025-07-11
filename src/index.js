const express = require('express');
const cors = require('cors');
const axios = require('axios');
const {
  RSI,
  MACD,
  ATR,
  BollingerBands,
  ADX,
  MFI,
  // Candle pattern detection (pseudocódigo)
} = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

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
    } : null;
  } catch {
    return null;
  }
}

async function getShortInterest(symbol) {
  try {
    const url = `https://api.polygon.io/vX/reference/tickers?symbol=${symbol}&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    // Suponemos que short_interest está en resp.data.results[0].short_interest
    const si = resp.data.results?.[0]?.short_interest;
    return si ? {
      shortFloat: si.short_percent_of_float,
      shortVolume: si.short_volume,
      shortVolumeRatio: si.short_volume_ratio,
      totalVolume: si.volume,
      daysToCover: si.days_to_cover
    } : null;
  } catch {
    return null;
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

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  let { timeframe = 'day', cantidad = 100 } = req.query;
  cantidad = Math.max(parseInt(cantidad), 30);

  try {
    const fechaHasta = new Date();
    const desde = new Date();
    desde.setDate(fechaHasta.getDate() - cantidad);
    const dateFrom = desde.toISOString().split('T')[0];
    const dateTo = fechaHasta.toISOString().split('T')[0];

    const u = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${dateFrom}/${dateTo}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const datos = (await axios.get(u)).data.results;

    if (!datos?.length) {
      return res.status(400).json({ error: 'No hay suficientes datos históricos' });
    }

    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const volumes = datos.map(p => p.v);

    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdR = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).at(-1);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).at(-1);
    const adxR = ADX.calculate({ close: closes, high: highs, low: lows, period: 14 }).at(-1);
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }).at(-1);

    const tp = datos.map(p => (p.h + p.l + p.c) / 3);
    const totVol = volumes.reduce((a, b) => a + b, 0);
    const vwap = tp.map((t, i) => t * volumes[i]).reduce((a, b) => a + b, 0) / totVol;

    const fundamental = await getFundamentales(symbol) || {};
    const shortI = await getShortInterest(symbol) || {};
    const noticias = await getNoticias(symbol);

    const patron = detectarPatron(datos);

    res.json({
      symbol,
      timeframe,
      precioActual: closes.at(-1),
      historico: closes.slice(-14),

      tecnico: {
        rsi,
        macd: macdR?.MACD || "N/A",
        atr,
        adx: adxR?.adx || "N/A",
        vwap,
        mfi,
        bollingerBands: { superior: bb?.upper || "N/A", inferior: bb?.lower || "N/A" },
        patron,
        tecnicoCombinado: `Patrón: ${patron}, RSI=${rsi.toFixed(2)}, MACD=${macdR?.MACD?.toFixed(2)}`,
        soportes: [Math.min(...closes.slice(-14))],
        resistencias: [Math.max(...closes.slice(-14))],
        tendencia: closes.at(-1) > closes[0] ? "Alcista" : "Bajista",
        entradaSugerida: patron === 'Doji' ? 'Posible reversión' : 'Esperar confirmación'
      },

      fundamental,

      shortInterest: shortI,

      volumen: {
        volumenActual: volumes.at(-1),
        volumenPromedio30Dias: (volumes.slice(-30).reduce((a, b) => a + b, 0) / 30).toFixed(2),
        volumenAcumulado: volumes.reduce((a, b) => a + b, 0).toFixed(2)
      },

      resumenDia: {
        afterHours: "N/A",
        preMarket: "N/A",
        aperturaDiaAnterior: datos.at(-2)?.o,
        minimoDiaAnterior: datos.at(-2)?.l,
        maximoDiaAnterior: datos.at(-2)?.h,
        cierreDiaAnterior: datos.at(-2)?.c,
        volumenResumenDiario: datos.at(-2)?.v
      },

      noticias,

      horaNY: new Date().toISOString(),
      horaLocal: new Date().toISOString(),
      mercado: {
        estado: "Desconocido",
        tiempoParaEvento: "N/A"
      }
    });

  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

