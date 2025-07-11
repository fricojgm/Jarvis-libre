const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { RSI, MACD, ATR, ADX, MFI, BollingerBands, SMA, EMA, VWAP } = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 100 } = req.query;

  try {
    const hoy = new Date();
    const desde = new Date();
    desde.setDate(hoy.getDate() - cantidad);
    const dateFrom = desde.toISOString().split('T')[0];
    const dateTo = hoy.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/${dateFrom}/${dateTo}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const response = await axios.get(url);

    const datos = response.data.results;

    if (!datos || datos.length < 30) {
      return res.status(400).json({ error: 'No hay suficientes datos históricos' });
    }

    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const volumes = datos.map(p => p.v);

    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdObj = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    }).at(-1);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const adxObj = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }).at(-1);
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).at(-1);
    const sma20 = SMA.calculate({ period: 20, values: closes }).at(-1);
    const ema20 = EMA.calculate({ period: 20, values: closes }).at(-1);
    const vwap = VWAP.calculate({ close: closes, high: highs, low: lows, volume: volumes }).at(-1);

    // Fundamentales desde Polygon
    let fundamental = {
      marketCap: "N/A", peRatio: "N/A", eps: "N/A", dividendYield: "N/A"
    };
    try {
      const finResp = await axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&apiKey=${API_KEY}`);
      const f = finResp.data.results?.[0]?.financials?.income_statement;
      const mcap = finResp.data.results?.[0]?.market_cap;
      if (f && mcap) {
        fundamental = {
          marketCap: mcap,
          peRatio: f.pe_ratio || "N/A",
          eps: f.eps || "N/A",
          dividendYield: f.dividend_yield || "N/A"
        };
      }
    } catch (e) {
      console.warn("⚠️ Fallo en fundamentales:", e.message);
    }

    // Short Interest
    let shortInterest = {
      shortFloat: "N/A", shortVolume: "N/A", shortVolumeRatio: "N/A",
      totalVolume: "N/A", shortInterestTotal: "N/A", avgDailyVolume: "N/A", daysToCover: "N/A"
    };
    try {
      const siResp = await axios.get(`https://api.polygon.io/v3/reference/shorts?ticker=${symbol}&apiKey=${API_KEY}`);
      const d = siResp.data.results?.[0];
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
    } catch (e) {
      console.warn("⚠️ Fallo en short interest:", e.message);
    }

    // Noticias
    let noticias = [];
    try {
      const newsResp = await axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${API_KEY}`);
      noticias = newsResp.data.results.map(n => ({
        titulo: n.title,
        resumen: n.description,
        fuente: n.publisher?.name || "N/A",
        url: n.article_url,
        fecha: n.published_utc,
        sentimiento: "neutral"
      }));
    } catch (e) {
      console.warn("⚠️ Fallo en noticias:", e.message);
    }

    // Velas multiframe (últimas 3)
    const obtenerVelas = async (tf) => {
      try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${tf}/${dateFrom}/${dateTo}?adjusted=true&sort=desc&limit=3&apiKey=${API_KEY}`;
        const r = await axios.get(url);
        return r.data.results?.map(x => ({
          o: x.o, h: x.h, l: x.l, c: x.c, v: x.v, t: x.t
        })) || [];
      } catch {
        return [];
      }
    };

    const velas = {
      day: await obtenerVelas("day"),
      week: await obtenerVelas("week"),
      month: await obtenerVelas("month"),
      hour: await obtenerVelas("hour")
    };

    res.json({
      symbol,
      timeframe,
      precioActual: closes.at(-1),
      historico: closes.slice(-14),
      tecnico: {
        rsi, macd: macdObj?.MACD, atr,
        adx: adxObj?.adx || "N/A", mfi,
        bollingerBands: { superior: bb?.upper, inferior: bb?.lower },
        sma20, ema20, vwap,
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
        volumenActual: volumes.at(-1),
        volumenPromedio30Dias: (volumes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, volumes.length)).toFixed(2),
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
        estado: "Desconocido",
        tiempoParaEvento: "N/A"
      }
    });

  } catch (err) {
    console.error("❌ Error general:", err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
