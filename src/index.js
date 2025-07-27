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

// ——— Scraper desde Finviz ———
async function obtenerFinvizData(symbol, precioActual) {
  try {
    const url = `https://finviz.com/quote.ashx?t=${symbol}`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);

    let target = null, sma200 = null;

    $('table.snapshot-table2 tr').each((_, row) => {
      $(row).find('td').each((i, cell) => {
        const label = $(cell).text().trim();
        const val = $(cell.next).text().trim();

        if (label === 'Target Price') {
          target = parseFloat(val);
        }

        if (label === 'SMA200') {
          const num = parseFloat(val.replace('%', ''));
          if (!isNaN(num)) {
            sma200 = parseFloat((precioActual / (1 + num / 100)).toFixed(2));
          }
        }
      });
    });

    const sma200Delta = sma200 ? parseFloat(((precioActual - sma200) / sma200 * 100).toFixed(2)) : null;
    return { targetAnalistas: target, sma200, sma200Delta };
  } catch {
    return { targetAnalistas: null, sma200: null, sma200Delta: null };
  }
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 250 } = req.query;

  try {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - cantidad);

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/${from.toISOString().split('T')[0]}/${now.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    const datos = resp.data.results;

    if (!datos || datos.length < 30) return res.status(400).json({ error: 'No suficientes datos' });

    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const vols = datos.map(p => p.v);
    const vela = datos.at(-1);

    // Indicadores técnicos
    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdR = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).at(-1);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).at(-1);
    const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1)?.adx;
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: vols, period: 14 }).at(-1);
    const sma20 = SMA.calculate({ values: closes, period: 20 }).at(-1);
    const ema20 = EMA.calculate({ values: closes, period: 20 }).at(-1);
    const vwap = VWAP.calculate({ high: highs, low: lows, close: closes, volume: vols }).at(-1);

    const soporte = Math.min(...closes.slice(-14));
    const resistencia = Math.max(...closes.slice(-14));

    const tecnico = {
      rsi, macd: macdR?.MACD, atr, adx, mfi,
      bollingerBands: { superior: bb?.upper, inferior: bb?.lower },
      sma20, ema20, vwap,
      patron: "Sin patrón", tecnicoCombinado: "Calculado",
      soportes: [soporte], resistencias: [resistencia],
      tendencia: closes.at(-1) > closes[0] ? "Alcista" : "Bajista",
      entradaSugerida: "Esperar"
    };

    // Finviz extras
    const finviz = await obtenerFinvizData(symbol, vela.c);

    // Fundamental
    const r = await axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${API_KEY}`);
    const d = r.data.results?.[0] || {};
    const ds = d.financials?.income_statement?.diluted_average_shares?.value;
    const eps = d.financials?.income_statement?.basic_earnings_per_share?.value;
    const fundamental = {
      marketCap: ds && vela.c ? ds * vela.c : null,
      eps: eps || null,
      peRatio: eps && vela.c ? vela.c / eps : null
    };

    // Short interest
    let shortInterest = {};
    try {
      const r = await axios.get(`https://api.polygon.io/stocks/v1/short-interest?ticker=${symbol}&limit=1&sort=settlement_date.desc&apiKey=${API_KEY}`);
      const s = r.data.results?.[0];
      if (s) {
        shortInterest = {
          settlement_date: s.settlement_date,
          shortInterest: s.short_interest,
          avgDailyVolumeSI: s.avg_daily_volume,
          daysToCoverSI: s.days_to_cover
        };
      }
    } catch {}

    // Short volume
    let shortVolume = {};
    try {
      const r = await axios.get(`https://api.polygon.io/stocks/v1/short-volume?ticker=${symbol}&limit=1&sort=date.desc&apiKey=${API_KEY}`);
      const s = r.data.results?.[0];
      if (s) {
        shortVolume = {
          dateSV: s.date,
          shortVolume: s.short_volume,
          shortVolumeRatio: s.short_volume_ratio,
          totalVolumeSV: s.total_volume
        };
      }
    } catch {}

    // Noticias
    let noticias = [];
    try {
      const n = await axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&sort=published_utc&order=desc&apiKey=${API_KEY}`);
      noticias = n.data.results.map(n => ({
        titulo: n.title, resumen: n.description, url: n.article_url,
        fuente: n.publisher?.name || "Desconocido", fecha: n.published_utc,
        sentimiento: n.insights?.sentiment || "neutral"
      }));
    } catch {}

    // Velas
    const velas = {
      day: datos.slice(-4).map(p => ({ o: p.o, h: p.h, l: p.l, c: p.c, v: p.v, t: p.t })),
      week: [{
        o: datos[0].o,
        h: Math.max(...highs),
        l: Math.min(...lows),
        c: vela.c,
        v: vols.reduce((a, b) => a + b, 0),
        t: datos[0].t
      }],
      month: [{
        o: datos[0].o,
        h: Math.max(...highs),
        l: Math.min(...lows),
        c: vela.c,
        v: vols.reduce((a, b) => a + b, 0),
        t: datos[0].t
      }],
      hour: []
    };

    res.json({
      symbol, timeframe,
      precioActual: vela.c,
      historico: closes.slice(-14),
      tecnico: { ...tecnico, sma200: finviz.sma200 },
      targetAnalistas: finviz.targetAnalistas,
      sma200Delta: finviz.sma200Delta,
      fundamental,
      shortInterest,
      shortVolume,
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
      velas,
      noticias,
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
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));

