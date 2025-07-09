const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

const getHoraNY = () => new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
const getHoraRD = () => new Date().toLocaleString("es-DO", { timeZone: "America/Santo_Domingo" });

async function safeGet(url, nombre) {
  try {
    const r = await axios.get(url);
    return r?.data || null;
  } catch (e) {
    console.warn(`❌ ${nombre} falló (${e.response?.status || e.message}) -> ${url}`);
    return null;
  }
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  const urls = {
    snapshot: `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`,
    openClose: `https://api.polygon.io/v1/open-close/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`,
    financials: `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${POLYGON_API_KEY}`,
    fundamentals: `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`,
    news: `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${POLYGON_API_KEY}`,
    shortData: `https://api.polygon.io/v3/reference/shorts?ticker=${symbol}&apiKey=${POLYGON_API_KEY}`,
    velasDia: `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=365&apiKey=${POLYGON_API_KEY}`,
    velasSem: `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/week/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=52&apiKey=${POLYGON_API_KEY}`,
    velasMes: `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/month/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=12&apiKey=${POLYGON_API_KEY}`,
  };

  try {
    const [
      snapshot, openClose, financials, fundamentals, news, shortData,
      velasDia, velasSem, velasMes
    ] = await Promise.all([
      safeGet(urls.snapshot, "snapshot"),
      safeGet(urls.openClose, "openClose"),
      safeGet(urls.financials, "financials"),
      safeGet(urls.fundamentals, "fundamentals"),
      safeGet(urls.news, "news"),
      safeGet(urls.shortData, "shortData"),
      safeGet(urls.velasDia, "velasDia"),
      safeGet(urls.velasSem, "velasSem"),
      safeGet(urls.velasMes, "velasMes")
    ]);

    const ticker = snapshot?.ticker;
    const precioActual = ticker?.lastTrade?.p || null;
    const cierrePrevio = openClose?.close || ticker?.day?.c || null;

    const resumen = (precioActual && cierrePrevio)
      ? (precioActual > cierrePrevio
        ? 'Tendencia alcista leve, se sugiere observar o comprar con cautela'
        : 'Tendencia bajista leve, se sugiere mantener o esperar confirmación')
      : 'Datos insuficientes para generar resumen';

    const noticias = news?.results?.map(n => ({
      titulo: n.title,
      resumen: n.description,
      url: n.article_url,
      fecha: n.published_utc
    })) || [];

    res.json({
      symbol,
      horaNY: getHoraNY(),
      horaRD: getHoraRD(),
      precioActual,
      cierrePrevio,
      resumen,
      noticias,
      velas: {
        dia: velasDia?.results || [],
        semana: velasSem?.results || [],
        mes: velasMes?.results || []
      },
      fundamentos: fundamentals?.results || null,
      financials: financials?.results || null,
      shortInterest: shortData?.results || null
    });

  } catch (e) {
    console.error("❌ Error general:", e.message);
    res.status(500).json({ error: "Error al obtener datos del mercado (catch general)." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Jarvis Mercado blindado y estable en puerto ${PORT}`);
});