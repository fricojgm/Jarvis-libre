const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

const apiKey = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

app.get('/reporte-mercado/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();
  const symbol = ticker?.toUpperCase();
  if (!symbol) {
    return res.status(400).json({ error: true, mensaje: 'Ticker no válido o no provisto' });
  }

  const hoy = new Date().toISOString().split('T')[0];

  const endpoints = {
    openClose: `https://api.polygon.io/v1/open-close/${symbol}/${hoy}?apiKey=${apiKey}`,
    snapshot: `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`,
    shortInterest: `https://api.polygon.io/v3/reference/shorts?ticker=${symbol}&apiKey=${apiKey}`,
    news: `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${apiKey}`,
    technicalRSI: `https://api.polygon.io/v1/indicators/rsi/${symbol}?timespan=day&window=14&series_type=close&order=desc&apiKey=${apiKey}`,
    technicalMACD: `https://api.polygon.io/v1/indicators/macd/${symbol}?timespan=day&long_window=26&short_window=12&signal_window=9       &series_type=close&order=desc&apiKey=${apiKey}`,
    technicalBollinger: `https://api.polygon.io/v1/indicators/bollinger_bands/${symbol}?timespan=day&window=20&series_type=close&order=desc&apiKey=${apiKey}`,
    technicalATR: `https://api.polygon.io/v1/indicators/atr/${symbol}?timespan=day&window=14&order=desc&apiKey=${apiKey}`,
    technicalADX: `https://api.polygon.io/v1/indicators/adx/${symbol}?timespan=day&window=14&order=desc&apiKey=${apiKey}`,
    technicalMFI: `https://api.polygon.io/v1/indicators/mfi/${symbol}?timespan=day&window=14&order=desc&apiKey=${apiKey}`,
    technicalVWAP: `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
  };

  const safeGet = async (url) => {
    try {
      const res = await axios.get(url);
      return res.data;
    } catch (e) {
      console.warn(⚠️ Error al llamar: ${url} => ${e.response?.status || e.message}`);
      return null;
    }
  };

  try {
  const [
  oc, 
  snap, 
  short, 
  newsRaw,
  rsiRaw,
  macdRaw,
  bollingerRaw,
  atrRaw,
  adxRaw,
  mfiRaw,
  vwapRaw
] = await Promise.all([
  safeGet(endpoints.openClose),
  safeGet(endpoints.snapshot),
  safeGet(endpoints.shortInterest),
  safeGet(endpoints.news),
  safeGet(endpoints.technicalRSI),
  safeGet(endpoints.technicalMACD),
  safeGet(endpoints.technicalBollinger),
  safeGet(endpoints.technicalATR),
  safeGet(endpoints.technicalADX),
  safeGet(endpoints.technicalMFI),
  safeGet(endpoints.technicalVWAP)
]);

    const news = Array.isArray(newsRaw?.results) ? newsRaw.results : [];

    const noticias = news.map(n => ({
      titulo: n.title,
      resumen: n.description,
      url: n.article_url,
      fuente: n.publisher?.name || null,
      fecha: n.published_utc
    })) || [];

const indicadoresTecnicos = {
  RSI: rsiRaw?.results?.values?.[0]?.value || null,
  MACD: {
    macd: macdRaw?.results?.values?.[0]?.value || null,
    signal: macdRaw?.results?.values?.[0]?.signal || null,
    histogram: macdRaw?.results?.values?.[0]?.histogram || null
  },
  Bollinger: {
    upper: bollingerRaw?.results?.values?.[0]?.upper || null,
    middle: bollingerRaw?.results?.values?.[0]?.middle || null,
    lower: bollingerRaw?.results?.values?.[0]?.lower || null
  },
  ATR: atrRaw?.results?.values?.[0]?.value || null,
  ADX: adxRaw?.results?.values?.[0]?.value || null,
  MFI: mfiRaw?.results?.values?.[0]?.value || null,
  VWAP: vwapRaw?.results?.values?.[0]?.value || null
};

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
      indicadoresTecnicos,
      noticias
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
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});