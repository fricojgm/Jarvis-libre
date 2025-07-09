const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Clave API de Polygon
const apiKey = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

app.get('/reporte-mercado/:ticker', async (req, res) => {
  const { ticker } = req.params.ticker.toUpperCase();
  const symbol = ticker?.toUpperCase(); // ⚠️ Usa el operador opcional "?" por si viene undefined
  if (!symbol) {
    return res.status(400).json({ error: true, mensaje: 'Ticker no válido o no provisto' });
  }
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
  try {
  const [oc, snap, short, news] = await Promise.all([
    safeGet(endpoints.openClose),
    safeGet(endpoints.snapshot),
    safeGet(endpoints.shortInterest),
    safeGet(endpoints.news)
  ]);

  const reporte = {
    status: 'OK',
    symbol,
    fecha: hoy,
    precioActual: snap?.lastTrade?.p || oc?.close || null,
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
      open: snap?.day?.o || null,
      high: snap?.day?.h || null,
      low: snap?.day?.l || null,
      close: snap?.day?.c || null,
      volume: snap?.day?.v || null
    },
    shortInterest: {
      totalShort: short?.total_short_interest || null,
      shortFloat: short?.short_interest_ratio || null,
      dailyShortVolume: short?.short_volume || null,
      daysToCover: short?.days_to_cover || null
    },
    fundamentales: {
      marketCap: snap?.market_cap || null,
      peRatio: snap?.pe || null,
      eps: snap?.eps || null,
      dividendYield: snap?.dividend_yield || null
    },
    noticias: news?.map(n => ({
      titulo: n.title,
      resumen: n.description,
      url: n.article_url,
      fuente: n.publisher?.name || null,
      fecha: n.published_utc
    })) || []
  };

  return res.json(reporte);
} catch (error) {
  return res.status(500).json({
    error: true,
    mensaje: 'Error interno al procesar el reporte',
    detalle: error.message
  });
}

  return res.json(reporte);
});

app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});