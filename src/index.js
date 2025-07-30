const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const {
  RSI, MACD, ATR, BollingerBands, ADX, MFI, SMA, EMA, VWAP
} = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// Scrape P/E Ratio histórico desde public.com
async function obtenerPromedioPERatio(symbol) {
  try {
    const { data } = await axios.get(`https://public.com/stocks/${symbol}/pe-ratio`);
    const $ = cheerio.load(data);

    const valores = [];
    $('table tbody tr').each((_, row) => {
      const val = $(row).find('td').eq(1).text().trim();
      const pe = parseFloat(val.replace(',', ''));
      if (!isNaN(pe)) valores.push(pe);
    });

    const ultimos6 = valores.slice(0, 6);
    const promedio = ultimos6.reduce((a, b) => a + b, 0) / ultimos6.length;
    return parseFloat(promedio.toFixed(2));
  } catch (e) {
    console.error("Error scraping PE promedio:", e.message);
    return null;
  }
}

// Scrape Finviz y extrae SMA200, Target, Profit Margin, Debt/Eq, Cash/sh, Shs Outstand
async function obtenerFinvizData(symbol, precioActual) {
  try {
    const url = `https://finviz.com/quote.ashx?t=${symbol}`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);

    let target = null, sma200 = null, profitMargin = null;
    let cashSh = null, shsOut = null, debtEq = null;

    $('table.snapshot-table2 tr').each((_, row) => {
      $(row).find('td').each((i, cell) => {
        const label = $(cell).text().trim();
        const val = $(cell.next).text().trim();

        if (label === 'Target Price') target = parseFloat(val);
        if (label === 'SMA200') {
          const num = parseFloat(val.replace('%', ''));
          if (!isNaN(num)) sma200 = parseFloat((precioActual / (1 + num / 100)).toFixed(2));
        }
        if (label === 'Profit Margin') {
          const num = parseFloat(val.replace('%', ''));
          if (!isNaN(num)) profitMargin = num / 100;
        }
        if (label === 'Cash/sh') cashSh = parseFloat(val);
        if (label === 'Shs Outstand') {
          const match = val.match(/([\d.]+)([MB])/);
          if (match) {
            const num = parseFloat(match[1]);
            const mult = match[2] === 'B' ? 1e9 : 1e6;
            shsOut = num * mult;
          }
        }
        if (label === 'Debt/Eq') debtEq = parseFloat(val);
      });
    });

    const sma200Delta = sma200 ? parseFloat(((precioActual - sma200) / sma200 * 100).toFixed(2)) : null;
    const totalCash = cashSh && shsOut ? cashSh * shsOut : null;
    const totalDebt = null; // Opcional: debtEq * total equity si se puede scrapear
    return {
      targetAnalistas: target,
      sma200,
      sma200Delta,
      profitMargin,
      totalCash,
      totalDebt
    };
  } catch (e) {
    console.error("Error scraping Finviz:", e.message);
    return {};
  }
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 250 } = req.query;

  try {
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - cantidad);

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/${from.toISOString().split('T')[0]}/${now.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    const datos = resp.data.results;
    if (!datos || datos.length < 30) return res.status(400).json({ error: 'No suficientes datos' });

    const closes = datos.map(p => p.c);
    const highs = datos.map(p => p.h);
    const lows = datos.map(p => p.l);
    const vols = datos.map(p => p.v);
    const vela = datos.at(-1);

    const rsi = RSI.calculate({ values: closes, period: 14 }).at(-1);
    const macdR = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).at(-1);
    const atr = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1);
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes }).at(-1);
    const adx = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).at(-1)?.adx;
    const mfi = MFI.calculate({ high: highs, low: lows, close: closes, volume: vols, period: 14 }).at(-1);
    const sma20 = SMA.calculate({ values: closes, period: 20 }).at(-1);
    const ema20 = EMA.calculate({ values: closes, period: 20 }).at(-1);
    const vwap = VWAP.calculate({ high: highs, low: lows, close: closes, volume: vols }).at(-1);

    const soporte = Math.min(...closes.slice(-14));
    const resistencia = Math.max(...closes.slice(-14));

    const tecnico = {
      rsi, macd: macdR?.MACD, atr, adx, mfi,
      bollingerBands: { superior: bb?.upper, inferior: bb?.lower },
      sma20, ema20, vwap,
      patron: "Sin patrón", tecnicoCombinado: "Calculado",
      soportes: [soporte], resistencias: [resistencia],
      tendencia: closes.at(-1) > closes[0] ? "Alcista" : "Bajista",
      entradaSugerida: "Esperar"
    };

    const finviz = await obtenerFinvizData(symbol, vela.c);
    const pePromedio6m = await obtenerPromedioPERatio(symbol);

    const r = await axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&sort=filing_date&apiKey=${API_KEY}`);
    const d = r.data.results?.[0]?.financials || {};

    const revenue = d.income_statement?.revenues?.value || null;
    const netIncome = d.income_statement?.net_income_loss?.value || null;
    const eps = d.income_statement?.basic_earnings_per_share?.value || null;
    const opEx = d.income_statement?.operating_expenses?.value || null;
    const shares = d.income_statement?.diluted_average_shares?.value || null;

    const marketCap = shares && vela.c ? shares * vela.c : null;
    const peRatio = eps && vela.c ? vela.c / eps : null;
    const monthlyExp = opEx ? opEx / 12 : null;
    const cashToMonthlyOps = finviz.totalCash && monthlyExp ? finviz.totalCash / monthlyExp : null;
    const profitMarginFinal = finviz.profitMargin || (revenue && netIncome ? netIncome / revenue : null);

    const fundamental = {
      totalRevenue: revenue,
      netIncome,
      eps,
      totalCash: finviz.totalCash,
      totalDebt: finviz.totalDebt,
      operatingExpenses: opEx,
      profitMargin: profitMarginFinal,
      sharesOutstanding: shares,
      marketCap,
      peRatio,
      cashToMonthlyOps
    };

    const principio5 = {
      peRatio,
      pePromedio6m,
      category: peRatio >= 30 ? "Medium/High Growth" : peRatio >= 15 ? "Medium Growth" : "Value",
      totalCash: finviz.totalCash,
      totalDebt: finviz.totalDebt,
      opEx,
      profitMargin: profitMarginFinal,
      marketCapFuturo: netIncome && pePromedio6m ? netIncome * pePromedio6m : null,
      retornoPct: marketCap && netIncome && pePromedio6m ?
        ((netIncome * pePromedio6m - marketCap) / marketCap) * 100 : null
    };

    // puedes mantener los otros bloques (shortInterest, velas, noticias, etc.) iguales a tu index original...

    res.json({
      symbol, timeframe,
      precioActual: vela.c,
      historico: closes.slice(-14),
      tecnico: { ...tecnico, sma200: finviz.sma200 },
      targetAnalistas: finviz.targetAnalistas,
      sma200Delta: finviz.sma200Delta,
      fundamental,
      principiosAbacus: {
        principio1: {
          targetAnalistas: finviz.targetAnalistas,
          cumple: vela.c < finviz.targetAnalistas * 0.8
        },
        principio2: {
          salesGrowth: null,
          categoria: "Estable"
        },
        principio3: {
          sma200: finviz.sma200,
          precioActual: vela.c,
          cumple: vela.c < finviz.sma200
        },
        principio4: {
          news: [] // llenar con noticias si quieres
        },
        principio5,
        principio6: {
          soporte, resistencia
        },
        principio7: {
          williamsR: null
        }
      }
    });

  } catch (e) {
    console.error("Error interno:", e.message);
    res.status(500).json({ error: "Error interno" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
