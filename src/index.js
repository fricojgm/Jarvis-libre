const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

const getHoraNY = () => {
  const ahora = new Date();
  return ahora.toLocaleString("en-US", { timeZone: "America/New_York" });
};
const getHoraRD = () => {
  const ahora = new Date();
  return ahora.toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" });
};

async function safeGet(url, nombre) {
  try {
    const r = await axios.get(url);
    return r;
  } catch (e) {
    console.error(`❌ Error en ${nombre}:`, url, "->", e.response?.status || e.message);
    return { data: null };
  }
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  const urlSnapshot = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
  const urlOpenClose = `https://api.polygon.io/v1/open-close/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
  const urlFinancials = `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${POLYGON_API_KEY}`;
  const urlFundamentals = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
  const urlNews = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${POLYGON_API_KEY}`;
  const urlShortData = `https://api.polygon.io/v3/reference/shorts?ticker=${symbol}&apiKey=${POLYGON_API_KEY}`;
  const urlShortVol = urlSnapshot;
  const urlVelasDia = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=365&apiKey=${POLYGON_API_KEY}`;
  const urlVelasSem = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/week/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=52&apiKey=${POLYGON_API_KEY}`;
  const urlVelasMes = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/month/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=12&apiKey=${POLYGON_API_KEY}`;

  try {
    const [
      snapshot, openClose, financials, fundamentals, news, shortData,
      shortVol, velasDia, velasSem, velasMes
    ] = await Promise.all([
      safeGet(urlSnapshot, "snapshot"),
      safeGet(urlOpenClose, "openClose"),
      safeGet(urlFinancials, "financials"),
      safeGet(urlFundamentals, "fundamentals"),
      safeGet(urlNews, "news"),
      safeGet(urlShortData, "shortData"),
      safeGet(urlShortVol, "shortVol"),
      safeGet(urlVelasDia, "velasDia"),
      safeGet(urlVelasSem, "velasSem"),
      safeGet(urlVelasMes, "velasMes")
    ]);

    const ticker = snapshot.data?.ticker;
    const precioActual = ticker?.lastTrade?.p || null;
    const cierrePrevio = openClose.data?.close || null;

    if (!precioActual || !cierrePrevio) {
      return res.status(500).json({ error: "Precio actual o cierre previo no disponible." });
    }

    const resumen = precioActual > cierrePrevio
      ? 'Tendencia alcista leve, se sugiere observar o comprar con cautela'
      : 'Tendencia bajista leve, se sugiere mantener o esperar confirmación';

    const noticias = news.data?.results?.map(n => ({
      titulo: n.title,
      resumen: n.description,
      url: n.article_url,
      fecha: n.published_utc
    }));

    res.json({
      symbol,
      horaNY: getHoraNY(),
      horaRD: getHoraRD(),
      precioActual,
      cierrePrevio,
      resumen,
      noticias
    });

  } catch (e) {
    console.warn(`Error al llamar a API: ${e.response?.status || e.message}`);
    res.status(500).json({ error: "Error al obtener datos del mercado." });
  }
});

app.listen(PORT, () => {
  console.log(`🧪 Jarvis Mercado con logging activo en puerto ${PORT}`);
});