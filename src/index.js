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

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const [snapshot, openClose, financials, fundamentals, news, shortData, shortVol,
           velasDia, velasSem, velasMes] = await Promise.all([
      axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/v1/open-close/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/v3/reference/shorts?ticker=${symbol}&apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=365&apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/week/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=52&apiKey=${POLYGON_API_KEY}`),
      axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/month/2024-01-01/2025-01-01?adjusted=true&sort=desc&limit=12&apiKey=${POLYGON_API_KEY}`)
    ]);

    const ticker = snapshot.data?.ticker;
    const precioActual = ticker?.lastTrade?.p || null;
    const cierrePrevio = openClose.data?.close || null;
    const open = openClose.data?.open;
    const high = openClose.data?.high;
    const low = openClose.data?.low;
    const volume = openClose.data?.volume;

    const validado = precioActual && cierrePrevio && Math.abs(precioActual - cierrePrevio) / cierrePrevio <= 0.015;
    if (!validado) {
      return res.status(400).json({ error: 'Precio actual inválido o fuera de rango aceptable.' });
    }

    const noticias = news.data?.results?.map(n => ({
      titulo: n.title,
      resumen: n.description,
      url: n.article_url,
      fecha: n.published_utc
    }));

    const resumen = precioActual > cierrePrevio
      ? 'Tendencia alcista leve, se sugiere observar o comprar con cautela'
      : 'Tendencia bajista leve, se sugiere mantener o esperar confirmación';

    res.json({
      symbol,
      horaNY: getHoraNY(),
      horaRD: getHoraRD(),
      precioActual,
      dailySummary: { open, high, low, close: cierrePrevio, volume },
      previousDay: openClose.data,
      shortInterest: {
        totalShort: shortData.data?.results?.short_interest,
        percentFloat: shortData.data?.results?.short_percent_float,
        shortVolume: shortVol.data?.ticker?.todaysChange,
        daysToCover: shortData.data?.results?.days_to_cover
      },
      fundamentos: {
        marketCap: fundamentals.data?.results?.[0]?.market_cap,
        peRatio: financials.data?.results?.[0]?.financials?.income_statement?.pe_ratio,
        eps: financials.data?.results?.[0]?.financials?.income_statement?.eps,
        dividendYield: financials.data?.results?.[0]?.financials?.income_statement?.dividends
      },
      tecnico: {
        rsi: "Pendiente integración",
        macd: "Pendiente integración",
        vwap: "Pendiente integración",
        atr: "Pendiente integración",
        adx: "Pendiente integración",
        mfi: "Pendiente integración",
        bollingerBands: {
          superior: "Pendiente",
          inferior: "Pendiente"
        }
      },
      velas: {
        diario: velasDia.data?.results ?? [],
        semanal: velasSem.data?.results ?? [],
        mensual: velasMes.data?.results ?? []
      },
      noticias,
      estadoMercado: ticker?.marketStatus,
      resumen,
      tecnicoCombinado: resumen,
      soportesResistencias: {
        soporte1: "Pendiente",
        resistencia1: "Pendiente"
      },
      patron: "Sin patrón técnico confirmado aún"
    });

  } catch (e) {
    console.warn(`Error al llamar a API: ${e.response?.status || e.message}`);
    res.status(500).json({ error: "Error al obtener datos del mercado." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Jarvis Mercado blindado completo activo en puerto ${PORT}`);
});