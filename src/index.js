const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const {
  RSI, MACD, ATR, BollingerBands, ADX, MFI, SMA, EMA, VWAP
} = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// ——— Scraper Target Analistas desde MarketWatch ———
async function obtenerTargetAnalistas(symbol) {
  try {
    const url = `https://www.marketwatch.com/investing/stock/${symbol}`;
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(res.data);
    const text = $('li:contains("Target Price")').text();
    const match = text.match(/Target Price\s+([\d.]+)/);
    const target = match ? parseFloat(match[1]) : null;
    return isNaN(target) ? null : target;
  } catch {
    return null;
  }
}

// ——— Helper: fundamentales ———
async function obtenerFundamentales(symbol, precioReal) {
  try {
    const url = `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${API_KEY}`;
    const r = await axios.get(url);
    const d = r.data.results?.[0] || {};
    const ds = d.financials?.income_statement?.diluted_average_shares?.value;
    const eps = d.financials?.income_statement?.basic_earnings_per_share?.value;
    return {
      marketCap: ds && precioReal ? ds * precioReal : 'N/A',
      eps: eps || 'N/A',
      peRatio: eps && precioReal ? precioReal / eps : 'N/A'
    };
  } catch {
    return { marketCap: 'N/A', eps: 'N/A', peRatio: 'N/A' };
  }
}

// ——— Helper: short interest ———
async function obtenerShortInterest(symbol) {
  try {
    const url = `https://api.polygon.io/stocks/v1/short-interest?ticker=${symbol}&limit=1000&sort=settlement_date.desc&apiKey=${API_KEY}`;
    const r = await axios.get(url);
    const latest = r.data.results?.[0];
    if (!latest) return {};
    return {
      settlement_date: latest.settlement_date,
      shortInterest: latest.short_interest,
      avgDailyVolumeSI: latest.avg_daily_volume,
      daysToCoverSI: latest.days_to_cover
    };
  } catch {
    return {};
  }
}

// ——— Helper: short volume ———
async function obtenerShortVolume(symbol) {
  try {
    const url = `https://api.polygon.io/stocks/v1/short-volume?ticker=${symbol}&limit=1000&sort=date.desc&apiKey=${API_KEY}`;
    const r = await axios.get(url);
    const latest = r.data.results?.[0];
    if (!latest) return {};
    return {
      dateSV: latest.date,
      shortVolume: latest.short_volume,
      shortVolumeRatio: latest.short_volume_ratio,
      totalVolumeSV: latest.total_volume
    };
  } catch {
    return {};
  }
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 250 } = req.query;
  try {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - cantidad);
    const base = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}`;
    const urlAggs = `${base}/${from.toISOString().split('T')[0]}/${now.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const resp = await axios.get(urlAggs);
    const datos = resp.data.results;
    if (!datos || datos.length < 30) return res.status(400).json({ error: 'No suficientes datos' });

    const closes = datos.map(p => p.c), highs = datos.map(p => p.h), lows = datos.map(p => p.l), vols = datos.map(p => p.v);
    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdR = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).at(-1);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).at(-1);
    const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1)?.adx;
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: vols, period: 14 }).at(-1);
    const sma20 = SMA.calculate({ values: closes, period: 20 }).at(-1);
    const sma200 = closes.length >= 200 ? SMA.calculate({ values: closes, period: 200 }).at(-1) : null;
    const ema20 = EMA.calculate({ values: closes, period: 20 }).at(-1);
    const vwap = VWAP.calculate({ high: highs, low: lows, close: closes, volume: vols }).at(-1);

    if (
      rsi == null || isNaN(rsi) ||
      macdR?.MACD == null || isNaN(macdR.MACD) ||
      adx == null || isNaN(adx) ||
      mfi == null || isNaN(mfi)
    ) {
      return res.status(500).json({
        error: 'Faltan indicadores técnicos críticos (RSI, MACD, ADX o MFI)'
      });
    }

    const vela = datos.at(-1);
    const soporte = Math.min(...closes.slice(-14));
    const resistencia = Math.max(...closes.slice(-14));
    const sma200Delta = sma200 ? parseFloat((((vela.c - sma200) / sma200) * 100).toFixed(2)) : null;

    const tecnico = {
      rsi, macd: macdR?.MACD, atr, adx, mfi,
      bollingerBands: { superior: bb?.upper, inferior: bb?.lower },
      sma20, sma200, ema20, vwap,
      patron: "Sin patrón", tecnicoCombinado: "Calculado",
      soportes: [soporte], resistencias: [resistencia],
      tendencia: closes.at(-1) > closes[0] ? "Alcista" : "Bajista",
      entradaSugerida: "Esperar"
    };

    const velas = {
      day: datos.slice(-4).map(p => ({ o: p.o, h: p.h, l: p.l, c: p.c, v: p.v, t: p.t })),
      week: [{ o: datos[0].o, h: Math.max(...highs), l: Math.min(...lows), c: vela.c, v: vols.reduce((a, b) => a + b, 0), t: datos[0].t }],
      month: [{ o: datos[0].o, h: Math.max(...highs), l: Math.min(...lows), c: vela.c, v: vols.reduce((a, b) => a + b, 0), t: datos[0].t }],
      hour: []
    };

    let noticias = [];
    try {
      const n = await axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&sort=published_utc&order=desc&apiKey=${API_KEY}`);
      noticias = n.data.results.map(n => ({
        titulo: n.title, resumen: n.description, url: n.article_url,
        fuente: n.publisher?.name || "Desconocido", fecha: n.published_utc,
        sentimiento: n.insights?.sentiment || "neutral"
      }));
    } catch (e) {
      console.error("Error al obtener noticias:", e.message);
    }

    const fundamental = await obtenerFundamentales(symbol, vela.c);
    const si = await obtenerShortInterest(symbol);
    const sv = await obtenerShortVolume(symbol);
    const targetAnalistas = await obtenerTargetAnalistas(symbol);

    const swingCandidate =
      sma200Delta < 0 &&
      targetAnalistas && targetAnalistas > vela.c * 1.2 &&
      fundamental.marketCap > 10e9 &&
      fundamental.eps > 0;

    res.json({
      symbol, timeframe,
      precioActual: vela.c,
      historico: closes.slice(-14),
      tecnico,
      targetAnalistas,
      sma200Delta,
      swingCandidate,
      fundamental, shortInterest: si, shortVolume: sv,
      volumen: {
        volumenActual: vela.v,
        volumenPromedio30Dias: (vols.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, vols.length)).toFixed(2),
        volumenAcumulado: vols.reduce((a, b) => a + b, 0).toFixed(2)
      },
      resumenDia: {
        aperturaDiaAnterior: datos.at(-2)?.o || "N/A",
        minimoDiaAnterior: datos.at(-2)?.l || "N/A",
        maximoDiaAnterior: datos.at(-2)?.h || "N/A",
        cierreDiaAnterior: datos.at(-2)?.c || "N/A",
        volumenResumenDiario: datos.at(-2)?.v || "N/A"
      },
      velas, noticias,
      resumen: { estadoActual: "Precaución", riesgo: "Medio", oportunidad: "Mixtas" },
      horaNY: new Date().toISOString(),
      horaLocal: new Date().toISOString(),
      mercado: { estado: "Desconocido", tiempoParaEvento: "N/A" }
    });

  } catch (e) {
    console.error("Error interno:", e.message);
    res.status(500).json({ error: "Error interno" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
