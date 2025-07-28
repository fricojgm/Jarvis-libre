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

async function obtenerFinvizData(symbol, precioActual) {
  try {
    const url = `https://finviz.com/quote.ashx?t=${symbol}`;
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);

    let target = null, sma200 = null;

    $('table.snapshot-table2 tr').each((_, row) => {
      $(row).find('td').each((i, cell) => {
        const label = $(cell).text().trim();
        const val = $(cell.next).text().trim();

        if (label === 'Target Price') {
          target = parseFloat(val);
        }

        if (label === 'SMA200') {
          const num = parseFloat(val.replace('%', ''));
          if (!isNaN(num)) {
            sma200 = parseFloat((precioActual / (1 + num / 100)).toFixed(2));
          }
        }
      });
    });

    const sma200Delta = sma200 ? parseFloat(((precioActual - sma200) / sma200 * 100).toFixed(2)) : null;
    return { targetAnalistas: target, sma200, sma200Delta };
  } catch {
    return { targetAnalistas: null, sma200: null, sma200Delta: null };
  }
}

function calcularPrincipio5(datos) {
  const {
    eps, peRatio, totalCash, totalDebt,
    totalRevenue, netIncome, operatingExpenses
  } = datos;

  const peCategoria = peRatio >= 30 ? 'Medium/High Growth'
    : peRatio >= 15 ? 'Medium Growth'
    : 'Value/Slow Growth';

  const monthlyExp = operatingExpenses ? operatingExpenses / 12 : null;
  const cashMonths = (totalCash && monthlyExp) ? (totalCash / monthlyExp) : null;
  const cashLevel = cashMonths
    ? cashMonths > 12 ? 'Óptimo'
      : cashMonths > 6 ? 'Bueno'
        : 'Débil'
    : 'No disponible';

  const debtLevel = totalDebt ? 'Saludable' : 'No disponible';
  const profitMargin = (netIncome && totalRevenue)
    ? parseFloat((netIncome / totalRevenue * 100).toFixed(2))
    : null;

  return {
    paso1: { peRatio, categoria: peCategoria },
    paso2: {
      totalCash, totalDebt, operatingExpenses, monthlyExp,
      cashToMonthlyOps: cashMonths, cashLevel, debtLevel
    },
    paso3: { revenueProximoAno: null },
    paso4: { profitMargin },
    paso5: { peRatioPromedio: peRatio },
    paso6: { netIncome },
    paso7: {
      marketCapFuturo: (netIncome && peRatio) ? netIncome * peRatio : null
    },
    paso8: {
      posibleRetorno: (netIncome && peRatio && datos.marketCap)
        ? parseFloat((((netIncome * peRatio) / datos.marketCap - 1) * 100).toFixed(2))
        : null
    }
  };
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

    const r = await axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&apiKey=${API_KEY}`);
    const f = r.data.results?.[0]?.financials;
    const income = f?.income_statement || {};
    const balance = f?.balance_sheet || {};
    const cashflow = f?.cash_flow_statement || {};

    const eps = income.basic_earnings_per_share?.value || null;
    const netIncome = income.net_income?.value || null;
    const totalRevenue = income.revenue?.value || null;
    const operatingExpenses = income.operating_expenses?.value || null;
    const totalCash = balance.cash_and_cash_equivalents?.value || null;
    const totalDebt = balance.total_debt?.value || null;
    const sharesOutstanding = income.diluted_average_shares?.value || null;

    const marketCap = sharesOutstanding && vela.c ? sharesOutstanding * vela.c : null;
    const peRatio = eps && vela.c ? vela.c / eps : null;

    const fundamental = {
      totalRevenue, netIncome, eps, totalCash, totalDebt,
      operatingExpenses, profitMargin: null,
      sharesOutstanding, marketCap, peRatio,
      cashToMonthlyOps: (totalCash && operatingExpenses) ? totalCash / (operatingExpenses / 12) : null
    };

    const principio5 = calcularPrincipio5(fundamental);

    res.json({
      symbol, timeframe,
      precioActual: vela.c,
      historico: closes.slice(-14),
      tecnico: { ...tecnico, sma200: finviz.sma200 },
      targetAnalistas: finviz.targetAnalistas,
      sma200Delta: finviz.sma200Delta,
      fundamental,
      principio5
    });

  } catch (e) {
    console.error("Error:", e.message);
    res.status(500).json({ error: "Error interno" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));

