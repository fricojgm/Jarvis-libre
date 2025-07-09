const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Clave API de Polygon
const apiKey = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

app.get('/reporte-mercado/:ticker', async (req, res) => {
  const { ticker } = req.params.ticker.toUpperCase();
  const hoy = new Date().toISOString().split('T')[0];

  const endpoints = {
    openClose: `https://api.polygon.io/v1/open-close/${symbol}/${hoy}?apiKey=${apiKey}`,
    snapshot: `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`,
    shortInterest: `https://api.polygon.io/v3/reference/shorts?ticker=${symbol}&apiKey=${apiKey}`,
    news: `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${apiKey}`
  };

  // Función para hacer cada request con manejo de errores
  const safeGet = async (url) => {
    try {
      const res = await axios.get(url);
      return res.data;
    } catch (e) {
      console.warn(`⚠️ Error al llamar: ${url} => ${e.response?.status || e.message}`);
      return null;
    }
  };

  // Obtener datos individualmente sin romper todo si uno falla
  const [oc, snap, shortRaw, newsRaw] = await Promise.all([
    safeGet(endpoints.openClose),
    safeGet(endpoints.snapshot),
    safeGet(endpoints.shortInterest),
    safeGet(endpoints.news)
  ]);

  // Construir el reporte con lo que esté disponible
  const short = shortRaw?.results?.[0] || {};
  const snapData = snap?.ticker || {};
  const news = newsRaw?.results || [];

  const reporte = {
    status: 'OK',
    symbol: ticker,
    fecha: hoy,
    precioActual: snapData.lastTrade?.p || oc?.close || null,
    dailySummary: {
      open: oc?.open || null,
      high: oc?.high || null,
      low: oc?.low || null,
      close: oc?.close || null,
      afterHours: oc?.afterHours || null,
      preMarket: oc?.preMarket || null,
      volume: oc?.volume || null
    },
    previousDay: {
      open: snapData?.day?.o || null,
      high: snapData?.day?.h || null,
      low: snapData?.day?.l || null,
      close: snapData?.day?.c || null,
      volume: snapData?.day?.v || null
    },
    shortInterest: {
      totalShort: short?.total_short_interest || null,
      shortFloat: short?.short_interest_ratio || null,
      dailyShortVolume: short?.short_volume || null,
      daysToCover: short?.days_to_cover || null
    },
    fundamentales: {
      marketCap: snapData?.market_cap || null,
      peRatio: snapData?.pe || null,
      eps: snapData?.eps || null,
      dividendYield: snapData?.dividend_yield || null
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
});

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});