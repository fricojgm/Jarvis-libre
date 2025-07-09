const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Clave API de Polygon
const apiKey = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

app.get('/reporte-mercado/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const endpoint = `https://jarvis-libre.onrender.com/reporte-mercado/${ticker}`;

  try {
    const response = await axios.get(endpoint);

    if (response.status !== 200 || !response.data) {
      return res.status(502).json({
        error: true,
        mensaje: 'Error al obtener datos del puente',
        detalle: response.statusText
      });
    }

    return res.json(response.data);

  } catch (error) {
    return res.status(500).json({
      error: true,
      mensaje: 'Error interno al procesar el reporte',
      detalle: error.message
    });
  }
});

  try {
    const [ocRes, snapRes, shortRes, newsRes] = await Promise.all([
      axios.get(endpoints.openClose),
      axios.get(endpoints.snapshot),
      axios.get(endpoints.shortInterest),
      axios.get(endpoints.news)
    ]);

    const oc = ocRes.data;
    const snap = snapRes.data.ticker || {};
    const short = shortRes.data.results ? shortRes.data.results[0] : {};
    const news = newsRes.data.results || [];

    const reporte = {
      status: 'OK',
      symbol: ticker,
      fecha: hoy,

      precioActual: snap.lastTrade?.p || oc.close || null,

      dailySummary: {
        open: oc.open || null,
        high: oc.high || null,
        low: oc.low || null,
        close: oc.close || null,
        afterHours: oc.afterHours || null,
        preMarket: oc.preMarket || null,
        volume: oc.volume || null
      },

      previousDay: {
        open: snap.day?.o || null,
        high: snap.day?.h || null,
        low: snap.day?.l || null,
        close: snap.day?.c || null,
        volume: snap.day?.v || null
      },

      shortInterest: {
        totalShort: short.total_short_interest || null,
        shortFloat: short.short_interest_ratio || null,
        dailyShortVolume: short.short_volume || null,
        daysToCover: short.days_to_cover || null
      },

      fundamentales: {
        marketCap: snap.market_cap || null,
        peRatio: snap.pe || null,
        eps: snap.eps || null,
        dividendYield: snap.dividend_yield || null
      },

      noticias: news.map(n => ({
        titulo: n.title,
        resumen: n.description,
        url: n.article_url,
        fuente: n.publisher?.name || null,
        fecha: n.published_utc
      }))
    };

    return res.json(reporte);
  } catch (error) {
    return res.status(500).json({
      error: true,
      mensaje: 'Error interno al procesar el reporte',
      detalle: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`âœ… Servidor corriendo en el puerto ${PORT}`);
});