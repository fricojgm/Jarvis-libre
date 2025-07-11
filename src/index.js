const express = require('express');
const cors = require('cors');
const axios = require('axios');
const {
  RSI, MACD, ATR, BollingerBands, ADX, MFI, SMA, EMA, VWAP
} = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

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

    // Indicadores
    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdResult = MACD.calculate({
      values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
      SimpleMAOscillator: false, SimpleMASignal: false
    }).at(-1);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).at(-1);
    const adx = ADX.calculate({ close: closes, high: highs, low: lows, period: 14 }).at(-1)?.adx;
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }).at(-1);
    const sma20 = SMA.calculate({ values: closes, period: 20 }).at(-1);
    const ema20 = EMA.calculate({ values: closes, period: 20 }).at(-1);
    const vwap = VWAP.calculate({ close: closes, high: highs, low: lows, volume: volumes }).at(-1);

    // Última vela
    const velaActual = datos.at(-1);

    // Velas agrupadas (solo OHLCV)
    const velas = {
      day: datos.slice(-4).map(p => ({ o: p.o, h: p.h, l: p.l, c: p.c, v: p.v, t: p.t })),
      week: [
        {
          o: datos[0].o,
          h: Math.max(...highs),
          l: Math.min(...lows),
          c: velaActual.c,
          v: volumes.reduce((a, b) => a + b, 0),
          t: datos.at(0).t
        }
      ],
      month: [
        {
          o: datos[0].o,
          h: Math.max(...highs),
          l: Math.min(...lows),
          c: velaActual.c,
          v: volumes.reduce((a, b) => a + b, 0),
          t: datos.at(0).t
        }
      ],
      hour: []
    };

    // Noticias desde Polygon v2
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
    } catch (e) {
      noticias = [];
    }

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
        bollingerBands: {
          superior: bb?.upper,
          inferior: bb?.lower
        },
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
        volumenActual: velaActual.v,
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
        estado: "Desconocido",
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
