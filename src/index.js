const express = require('express');
const cors = require('cors');
const axios = require('axios');
const {
  RSI, MACD, ATR, ADX, MFI, BollingerBands, SMA, EMA, VWAP
} = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

const obtenerOHLC = async (symbol, tf, multiplier, days) => {
  const ahora = new Date();
  const desde = new Date();
  desde.setDate(ahora.getDate() - days);
  const from = desde.toISOString().split('T')[0];
  const to = ahora.toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${tf}/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${API_KEY}`;
  const { data } = await axios.get(url);
  return data.results?.map(d => ({
    o: d.o, h: d.h, l: d.l, c: d.c, v: d.v, t: d.t
  })) || [];
};

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 100 } = req.query;

  try {
    // 🔹 Velas por timeframe
    const [velasDay, velasWeek, velasMonth, velasHour] = await Promise.all([
      obtenerOHLC(symbol, 'day', 1, 30),
      obtenerOHLC(symbol, 'week', 1, 180),
      obtenerOHLC(symbol, 'month', 1, 730),
      obtenerOHLC(symbol, 'hour', 1, 3)
    ]);

    const datos = velasDay;
    if (!datos || datos.length < 30) {
      return res.status(400).json({ error: 'No hay suficientes datos históricos' });
    }

    // 🔹 Arrays de precios
    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const volumes = datos.map(p => p.v);

    // 🔹 Indicadores
    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdResult = MACD.calculate({
      values: closes, fastPeriod: 12, slowPeriod: 26,
      signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false
    }).at(-1);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }).at(-1);
    const bb = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 }).at(-1);
    const sma20 = SMA.calculate({ period: 20, values: closes }).at(-1);
    const ema20 = EMA.calculate({ period: 20, values: closes }).at(-1);
    const vwap = VWAP.calculate({ close: closes, high: highs, low: lows, volume: volumes }).at(-1);

    // 🔹 Precio actual
    const precioActual = closes.at(-1);

    // 🔹 Fundamentos reales
    let fundamental = {
      marketCap: "N/A", peRatio: "N/A", eps: "N/A", dividendYield: "N/A"
    };
    try {
      const finURL = `https://api.polygon.io/v3/reference/financials?ticker=${symbol.toUpperCase()}&limit=1&apiKey=${API_KEY}`;
      const finRes = await axios.get(finURL);
      const f = finRes.data?.results?.[0]?.financials || {};
      fundamental = {
        marketCap: parseFloat(f.market_cap) || "N/A",
        peRatio: parseFloat(f.pe_ratio) || "N/A",
        eps: parseFloat(f.eps) || "N/A",
        dividendYield: parseFloat(f.dividend_yield) || "N/A"
      };
    } catch (err) {
      console.warn("⚠️ Fundamentos no disponibles:", err.message);
    }

    // 🔹 Resumen día anterior
    const diaAnterior = datos.at(-2) || {};
    const resumenDia = {
      aperturaDiaAnterior: diaAnterior.o || "N/A",
      minimoDiaAnterior: diaAnterior.l || "N/A",
      maximoDiaAnterior: diaAnterior.h || "N/A",
      cierreDiaAnterior: diaAnterior.c || "N/A",
      volumenResumenDiario: diaAnterior.v || "N/A"
    };

    res.json({
      symbol,
      timeframe,
      precioActual,
      historico: closes.slice(-14),

      tecnico: {
        rsi,
        macd: macdResult?.MACD ?? "N/A",
        atr,
        adx: adx?.adx ?? "N/A",
        mfi,
        vwap,
        bollingerBands: {
          superior: bb?.upper ?? "N/A",
          inferior: bb?.lower ?? "N/A"
        },
        sma20,
        ema20,
        patron: "Sin patrón",
        tecnicoCombinado: "Indicadores técnicos calculados correctamente",
        soportes: [Math.min(...closes.slice(-14))],
        resistencias: [Math.max(...closes.slice(-14))],
        tendencia: (closes.at(-1) > closes[0]) ? "Alcista" : "Bajista",
        entradaSugerida: "Esperar confirmación"
      },

      fundamental,

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
        volumenActual: volumes.at(-1),
        volumenPromedio30Dias: (
          volumes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, volumes.length)
        ).toFixed(2),
        volumenAcumulado: volumes.reduce((a, b) => a + b, 0).toFixed(2)
      },

      resumenDia,
      velas: {
        day: velasDay.slice(-4),
        week: velasWeek.slice(-1),
        month: velasMonth.slice(-1),
        hour: velasHour.slice(-20)
      },

      noticias: [],
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

  } catch (error) {
    console.error("❌ Error general:", error.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API corriendo en http://localhost:${PORT}`));
