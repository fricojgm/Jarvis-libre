const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { RSI, MACD, ATR } = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 100 } = req.query;

  try {
    // 1. Obtener datos históricos de Polygon (últimos 100 días)
    const hoy = new Date();
    const desde = new Date();
    desde.setDate(hoy.getDate() - cantidad);

    const dateFrom = desde.toISOString().split('T')[0];
    const dateTo = hoy.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${dateFrom}/${dateTo}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const response = await axios.get(url);

    const datos = response.data.results;
    if (!datos || datos.length < 30) {
      return res.status(400).json({ error: 'No hay suficientes datos históricos' });
    }

    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const volumes = datos.map(p => p.v);

    // 2. Cálculo de indicadores reales
    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdResult = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    }).at(-1);

    const atr = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14
    }).at(-1);

    // 3. Precio actual
    const precioActual = closes.at(-1);

    // 4. Estructura final
    res.json({
      symbol,
      timeframe,
      precioActual,
      historico: closes.slice(-14),

      tecnico: {
        rsi,
        macd: macdResult.MACD,
        atr,
        patron: "Sin patrón",
        adx: "N/A",
        vwap: "N/A",
        mfi: "N/A",
        bollingerBands: {
          superior: "N/A",
          inferior: "N/A"
        },
        tecnicoCombinado: "RSI y MACD calculados de forma real",
        soportes: [Math.min(...closes.slice(-14))],
        resistencias: [Math.max(...closes.slice(-14))],
        tendencia: (closes.at(-1) > closes[0]) ? "Alcista" : "Bajista",
        entradaSugerida: "Esperar confirmación de ruptura"
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
        volumenActual: volumes.at(-1),
        volumenPromedio30Dias: (
          volumes.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, volumes.length)
        ).toFixed(2),
        volumenAcumulado: volumes.reduce((a, b) => a + b, 0).toFixed(2)
      },

      resumenDia: {
        afterHours: "N/A",
        preMarket: "N/A",
        aperturaDiaAnterior: datos.at(-2)?.o || "N/A",
        minimoDiaAnterior: datos.at(-2)?.l || "N/A",
        maximoDiaAnterior: datos.at(-2)?.h || "N/A",
        cierreDiaAnterior: datos.at(-2)?.c || "N/A",
        volumenResumenDiario: datos.at(-2)?.v || "N/A"
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
    console.error("Error:", error.message);
    res.status(500).json({ error: 'Fallo al obtener datos o calcular indicadores' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});

