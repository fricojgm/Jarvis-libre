const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { WilliamsR } = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

async function getHistoricalBars(symbol) {
  const to = new Date().toISOString().split('T')[0];
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 5);
  const from = fromDate.toISOString().split('T')[0];

  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=10000&apiKey=${API_KEY}`;
  const response = await axios.get(url);
  return response.data.results || [];
}

async function getFinvizData(symbol, precioActual) {
  const html = await axios.get(`https://finviz.com/quote.ashx?t=${symbol}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const $ = cheerio.load(html.data);

  let data = {};
  $('table.snapshot-table2 td').each((i, el) => {
    const label = $(el).text();
    const val = $(el).next().text();
    if (label === 'Target Price') data.targetPrice = parseFloat(val);
    if (label === 'SMA200') {
      const pct = parseFloat(val.replace('%', ''));
      if (!isNaN(pct)) data.sma200 = +(precioActual / (1 + pct / 100)).toFixed(2);
    }
    if (label === 'Profit Margin') {
      const pct = parseFloat(val.replace('%', ''));
      if (!isNaN(pct)) data.profitMargin = pct / 100;
    }
    if (label === 'Cash/sh') data.cashSh = parseFloat(val);
    if (label === 'Shs Outstand') {
      const match = val.match(/([\d.]+)([MB])/);
      if (match) {
        const num = parseFloat(match[1]);
        const mult = match[2] === 'B' ? 1e9 : 1e6;
        data.shsOut = num * mult;
      }
    }
    if (label === 'Debt/Eq') data.debtEq = parseFloat(val);
  });

  data.totalCash = data.cashSh && data.shsOut ? data.cashSh * data.shsOut : null;
  return data;
}

async function getNewsSentiment(symbol) {
  try {
    const res = await axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&sort=published_utc&order=desc&apiKey=${API_KEY}`);
    const articles = res.data.results || [];
    const summary = articles.map(n => ({
      titulo: n.title,
      sentimiento: n?.insights?.sentiment || "neutral"
    }));
    const hayNegativas = summary.filter(s => s.sentimiento === "bearish").length >= 2;
    return { resumen: summary, hayNegativas };
  } catch {
    return { resumen: [], hayNegativas: false };
  }
}

app.get('/principios/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;

    const barras = await getHistoricalBars(symbol);
    if (!barras.length) return res.status(404).json({ error: 'No hay datos históricos' });

    const highs = barras.map(b => b.h);
    const lows = barras.map(b => b.l);
    const closes = barras.map(b => b.c);
    const currentPrice = closes.at(-1);

    const williamsR = WilliamsR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);

    const finviz = await getFinvizData(symbol, currentPrice);
    const news = await getNewsSentiment(symbol);

    const target = finviz.targetPrice;
    const cumple1 = currentPrice < target * 0.8;

    const sma200 = finviz.sma200;
    const cumple3 = currentPrice < sma200;

    const profitMargin = finviz.profitMargin;
    const cashLevel = finviz.totalCash && finviz.shsOut && finviz.cashSh
      ? finviz.totalCash / (26.11e9 / 12)
      : null;

    const deudaSaludable = finviz.totalCash && finviz.debtEq
      ? 28.19e9 - (finviz.debtEq * 1000000000) > 0
      : null;

    const cumple7 = williamsR >= -41 && williamsR <= -40;

    res.json({
      symbol,
      precioActual: currentPrice,
      principiosAbacus: {
        principio1: {
          cumple: cumple1,
          targetPrice: target,
          actual: currentPrice
        },
        principio2: {
          salesGrowthAnual: 0.12, // placeholder
          categoria: "Madura"
        },
        principio3: {
          cumple: cumple3,
          sma200
        },
        principio4: {
          observacion: "Revisar conference call y resultados earnings más recientes"
        },
        principio5: {
          peRatio: +(currentPrice / 2.33).toFixed(2),
          cashLevel: cashLevel?.toFixed(2),
          deudaSaludable,
          clasificacion: currentPrice / 2.33 < 20 ? 'Conservador' : currentPrice / 2.33 < 40 ? 'Moderado' : 'Riesgoso'
        },
        principio6: {
          soporte: Math.min(...closes.slice(-30)),
          resistencia: Math.max(...closes.slice(-30))
        },
        principio7: {
          williamsR,
          cumple: cumple7
        },
        principio8: {
          sentimientoNoticias: news.hayNegativas ? "Negativo" : "Neutro o Positivo",
          noticias: news.resumen,
          sugerencia: news.hayNegativas ? "Esperar" : "Apta para evaluación"
        }
      }
    });
  } catch (e) {
    console.error(e.message);
    res.status(500).json({ error: "Error interno" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));

