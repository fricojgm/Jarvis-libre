const express = require('express');
const cors = require('cors');
const axios = require('axios');
const {
  RSI, MACD, ATR, BollingerBands, ADX, MFI, SMA, EMA, VWAP
} = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// 🔍 Obtener fundamentales
async function obtenerFundamentales(symbol, precioRealVivo) {
  try {
    const url = `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${API_KEY}`;
    const res = await axios.get(url);
    const d = res.data.results?.[0] || {};
    const dilutedShares = d.financials?.income_statement?.diluted_average_shares?.value;
    const eps = d.financials?.income_statement?.basic_earnings_per_share?.value;
    return {
      marketCap: (dilutedShares && precioRealVivo) ? (dilutedShares * precioRealVivo) : "N/A",
      eps: eps || "N/A",
      peRatio: (eps && precioRealVivo) ? (precioRealVivo / eps) : "N/A"
    };
  } catch {
    return { marketCap: "N/A", eps: "N/A", peRatio: "N/A" };
  }
}

// 📊 Obtener snapshot en tiempo real
async function obtenerSnapshot(symbol) {
  try {
    const url = `https://api.polygon.io/v3/snapshot?ticker=${symbol}&order=asc&limit=1&sort=ticker&apiKey=${API_KEY}`;
    const res = await axios.get(url);
    return res.data.results?.[0] || {};
  } catch {
    return {};
  }
}

// 📉 Obtener short interest más reciente
async function obtenerShortInterest(symbol) {
  try {
    const url = `https://api.polygon.io/stocks/v1/short-interest?ticker=${symbol}&limit=1000&sort=ticker.asc&apiKey=${API_KEY}`;
    const res = await axios.get(url);
    const recientes = res.data.results?.filter(x => x.short_interest && x.avg_daily_volume)?.at(-1);
    return {
      shortInterestTotal: recientes?.short_interest || "N/A",
      avgDailyVolume: recientes?.avg_daily_volume || "N/A",
      daysToCover: recientes?.days_to_cover || "N/A"
    };
  } catch {
    return {
      shortInterestTotal: "N/A",
      avgDailyVolume: "N/A",
      daysToCover: "N/A"
    };
  }
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 100 } = req.query;

  try {
    const ahora = new Date();
    const desde = new Date();
    desde.setDate(ahora.getDate() - cantidad);
    const from = desde.toISOString().split('T')[0];
    const to = ahora.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/${from}/${to}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const respuesta = await axios.get(url);
    const datos = respuesta.data.results;

    if (!datos || datos.length < 30) {
      return res.status(400).json({ error: 'No hay suficientes datos históricos' });
    }

    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const volumes = datos.map(p => p.v);
    const velaActual = datos.at(-1);

    const [
      fundamental,
      snapshot,
      shortInterest
    ] = await Promise.all([
      obtenerFundamentales(symbol, velaActual.c),
      obtenerSnapshot(symbol),
      obtenerShortInterest(symbol)
    ]);

    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdResult = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).at(-1);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 }).at(-1);
    const adx = ADX.calculate({ close: closes, high: highs, low: lows, period: 14 }).at(-1)?.adx;
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }).at(-1);
    const sma20 = SMA.calculate({ values: closes, period: 20 }).at(-1);
    const ema20 = EMA.calculate({ values: closes, period: 20 }).at(-1);
    const vwap = VWAP.calculate({ close: closes, high: highs, low: lows, volume: volumes }).at(-1);

    const velas = {
      day: datos.slice(-4).map(p => ({ o: p.o, h: p.h, l: p.l, c: p.c, v: p.v, t: p.t })),
      week: [{
        o: datos[0].o,
        h: Math.max(...highs),
        l: Math.min(...lows),
        c: velaActual.c,
        v: volumes.reduce((a, b) => a + b, 0),
        t: datos[0].t
      }],
      month: [{
        o: datos[0].o,
        h: Math.max(...highs),
        l: Math.min(...lows),
        c: velaActual.c,
        v: volumes.reduce((a, b) => a + b, 0),
        t: datos[0].t
      }],
      hour: []
    };

    let noticias = [];
    try {
      const newsRes = await axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&sort=published_utc&order=desc&apiKey=${API_KEY}`);
      noticias = newsRes.data.results.map(n => ({
        titulo: n.title,
        resumen: n.description,
        url: n.article_url,
        fuente: n.publisher?.name || "Desconocido",
        fecha: n.published_utc,
        sentimiento: n.insights?.sentiment || "neutral"
      }));
    } catch {}

    res.json({
      symbol,
      timeframe,
      precioActual: velaActual.c,
      historico: closes.slice(-14),
      tecnico: {
        rsi,
        macd: macdResult?.MACD,
        atr,
        adx,
        mfi,
        bollingerBands: { superior: bb?.upper, inferior: bb?.lower },
        sma20,
        ema20,
        vwap,
        patron: "Sin patrón",
        tecnicoCombinado: "Indicadores técnicos calculados correctamente",
        soportes: [Math.min(...closes.slice(-14))],
        resistencias: [Math.max(...closes.slice(-14))],
        tendencia: closes.at(-1) > closes[0] ? "Alcista" : "Bajista",
        entradaSugerida: "Esperar confirmación"
      },
      fundamental,
      shortInterest,
      volumen: {
        volumenActual: snapshot?.session?.volume || velaActual.v,
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
      mercado: {
        estado: snapshot.market_status || "Desconocido",
        tiempoParaEvento: "N/A"
      }
    });

  } catch (err) {
    console.error("Fallo general:", err.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
});
