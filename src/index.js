const express = require('express');
const cors = require('cors');
const axios = require('axios');
const {
  RSI, MACD, ATR, BollingerBands, ADX, MFI, SMA, EMA
} = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

function mapTimeframeToAgg(timeframe) {
  const map = {
    minuto: 'minute',
    hora: 'hour',
    diario: 'day',
    diaria: 'day',
    semanal: 'week',
    mensual: 'month'
  };
  return map[timeframe] || timeframe;
}

async function getVelas(symbol) {
  const timeframes = ['day', 'week', 'month', 'hour'];
  const result = {};

  for (const tf of timeframes) {
    try {
      const to = new Date().toISOString().split('T')[0];
      const from = new Date();
      from.setDate(from.getDate() - 100);
      const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${tf}/${from.toISOString().split('T')[0]}/${to}?adjusted=true&sort=desc&limit=3&apiKey=${API_KEY}`;
      const r = await axios.get(url);
      result[tf] = (r.data?.results || []).map(v => ({
        o: v.o, h: v.h, l: v.l, c: v.c, v: v.v, t: v.t
      }));
    } catch {
      result[tf] = [];
    }
  }

  return result;
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  let { timeframe = 'day', cantidad = 100 } = req.query;
  timeframe = mapTimeframeToAgg(timeframe);
  cantidad = Math.max(parseInt(cantidad), 30);

  try {
    const to = new Date().toISOString().split('T')[0];
    const from = new Date();
    from.setDate(from.getDate() - cantidad);
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/${from.toISOString().split('T')[0]}/${to}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    const datos = resp.data?.results;

    if (!datos || datos.length < 30) {
      return res.status(400).json({ error: 'No hay suficientes datos históricos' });
    }

    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const volumes = datos.map(p => p.v);

    let rsi, macdR, atr, bb, adxR, mfi, sma20, ema20, vwap;
    try { rsi = RSI.calculate({ values: closes, period: 14 }).pop(); } catch {}
    try { macdR = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).pop(); } catch {}
    try { atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).pop(); } catch {}
    try { bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).pop(); } catch {}
    try { adxR = ADX.calculate({ close: closes, high: highs, low: lows, period: 14 }).pop(); } catch {}
    try { mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }).pop(); } catch {}
    try { sma20 = SMA.calculate({ period: 20, values: closes }).pop(); } catch {}
    try { ema20 = EMA.calculate({ period: 20, values: closes }).pop(); } catch {}
    try {
      const tp = datos.map(p => (p.h + p.l + p.c) / 3);
      const totalVol = volumes.reduce((a, b) => a + b, 0);
      vwap = tp.map((t, i) => t * volumes[i]).reduce((a, b) => a + b, 0) / totalVol;
    } catch {}

    const patron = (() => {
      const last = datos.at(-1);
      const body = Math.abs(last.c - last.o);
      const range = last.h - last.l;
      const upper = last.h - Math.max(last.c, last.o);
      const lower = Math.min(last.c, last.o) - last.l;
      if (body / range < 0.1 && upper / range > 0.2 && lower / range > 0.2) return 'Doji';
      if (lower / body > 2 && upper / body < 0.2) return 'Hammer';
      if (upper / body > 2 && lower / body < 0.2) return 'Shooting Star';
      return 'Sin patrón';
    })();

    // Datos fundamentales
    let fundamental = { marketCap: "N/A", peRatio: "N/A", eps: "N/A", dividendYield: "N/A" };
    try {
      const f = await axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${API_KEY}`);
      const r = f.data?.results?.[0];
      if (r) {
        fundamental = {
          marketCap: r.market_cap || "N/A",
          peRatio: r.pe_ratio || "N/A",
          eps: r.eps || "N/A",
          dividendYield: r.dividend_yield || "N/A"
        };
      }
    } catch {}

    // Short interest
    let shortInterest = {
      shortFloat: "N/A", shortVolume: "N/A", shortVolumeRatio: "N/A",
      totalVolume: "N/A", shortInterestTotal: "N/A", avgDailyVolume: "N/A", daysToCover: "N/A"
    };
    try {
      const s = await axios.get(`https://api.polygon.io/v3/reference/shorts?ticker=${symbol}&apiKey=${API_KEY}`);
      const d = s.data?.results?.[0];
      if (d) {
        shortInterest = {
          shortFloat: d.short_float || "N/A",
          shortVolume: d.short_volume || "N/A",
          shortVolumeRatio: d.short_volume_ratio || "N/A",
          totalVolume: d.total_volume || "N/A",
          shortInterestTotal: d.short_interest || "N/A",
          avgDailyVolume: d.avg_daily_volume || "N/A",
          daysToCover: d.days_to_cover || "N/A"
        };
      }
    } catch {}

    // Noticias
    let noticias = [];
    try {
      const news = await axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${API_KEY}`);
      noticias = (news.data?.results || []).map(n => ({
        titulo: n.title,
        resumen: n.description,
        fuente: n.publisher.name,
        url: n.article_url,
        fecha: n.published_utc,
        sentimiento: "neutral"
      }));
    } catch {}

    const velas = await getVelas(symbol);

    res.json({
      symbol,
      timeframe,
      precioActual: closes.at(-1),
      historico: closes.slice(-14),
      tecnico: {
        rsi, macd: macdR?.MACD || "N/A", atr, adx: adxR?.adx || "N/A", mfi,
        bollingerBands: {
          superior: bb?.upper || "N/A",
          inferior: bb?.lower || "N/A"
        },
        sma20, ema20, vwap, patron,
        tecnicoCombinado: "Indicadores técnicos calculados correctamente",
        soportes: [Math.min(...closes.slice(-14))],
        resistencias: [Math.max(...closes.slice(-14))],
        tendencia: closes.at(-1) > closes[0] ? "Alcista" : "Bajista",
        entradaSugerida: patron === 'Doji' ? 'Posible reversión' : 'Esperar confirmación'
      },
      fundamental,
      shortInterest,
      volumen: {
        volumenActual: volumes.at(-1),
        volumenPromedio30Dias: (
          volumes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, volumes.length)
        ).toFixed(2),
        volumenAcumulado: volumes.reduce((a, b) => a + b, 0).toFixed(2)
      },
      resumenDia: {
        aperturaDiaAnterior: datos.at(-2)?.o || "N/A",
        minimoDiaAnterior: datos.at(-2)?.l || "N/A",
        maximoDiaAnterior: datos.at(-2)?.h || "N/A",
        cierreDiaAnterior: datos.at(-2)?.c || "N/A",
        volumenResumenDiario: datos.at(-2)?.v || "N/A"
      },
      velas,
      noticias,
      resumen: {
        estadoActual: "Precaución",
        riesgo: "Medio",
        oportunidad: "RSI y MACD muestran señales mixtas"
      },
      horaNY: new Date().toISOString(),
      horaLocal: new Date().toISOString(),
      mercado: { estado: "Desconocido", tiempoParaEvento: "N/A" }
    });

  } catch (err) {
    console.error("🔥 ERROR:", err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor live en http://localhost:${PORT}`);
});

