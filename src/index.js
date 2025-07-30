const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { RSI, MACD, ATR, BollingerBands, ADX, MFI, SMA, EMA, VWAP } = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// ——— FMI: Finviz scrap para targetAnalistas y sma200 etc.
async function obtenerFinvizData(symbol, precioActual) {
  try {
    const url = `https://finviz.com/quote.ashx?t=${symbol}`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    let target = null, sma200 = null;
    $('table.snapshot-table2 tr').each((_, row) => {
      $(row).find('td').each((i, cell) => {
        const label = $(cell).text().trim();
        const val = $(cell.next).text().trim();
        if (label === 'Target Price') target = parseFloat(val);
        if (label === 'SMA200') {
          const pct = parseFloat(val.replace('%',''));
          if (!isNaN(pct)) sma200 = parseFloat((precioActual / (1 + pct / 100)).toFixed(2));
        }
      });
    });
    const sma200Delta = sma200 ? parseFloat(((precioActual - sma200) / sma200 * 100).toFixed(2)) : null;
    return { targetAnalistas: target, sma200, sma200Delta };
  } catch { return { targetAnalistas: null, sma200: null, sma200Delta: null }; }
}

// ——— Historial PERatio en public.com scraping
async function obtenerPERhistoric(symbol) {
  try {
    const url = `https://public.com/stocks/${symbol.toLowerCase()}/pe-ratio`;
    const { data } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const ratios = [];
    $('table tbody tr').each((_, row) => {
      const cell = $(row).find('td').first().text().trim();
      const pr = parseFloat(cell);
      if (!isNaN(pr)) ratios.push(pr);
    });
    if (ratios.length === 0) return null;
    const sum = ratios.reduce((a,b)=>a+b,0);
    return parseFloat((sum / ratios.length).toFixed(2));
  } catch { return null; }
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { timeframe = 'day', cantidad = 250 } = req.query;
  try {
    const now = new Date(), from = new Date(now);
    from.setDate(now.getDate() - cantidad);
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/${from.toISOString().split('T')[0]}/${now.toISOString().split('T')[0]}?adjusted=true&sort=asc&limit=${cantidad}&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    const datos = resp.data.results;
    if (!datos || datos.length < 30) return res.status(400).json({ error: 'No suficientes datos' });

    const closes = datos.map(p=>p.c), highs = datos.map(p=>p.h), lows = datos.map(p=>p.l), vols = datos.map(p=>p.v);
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
    const pePromedio6m = await obtenerPERhistoric(symbol);

    const r = await axios.get(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=1&sort=filing_date&apiKey=${API_KEY}`);
    const d = r.data.results?.[0]?.financials || {};

    const revenue = d.income_statement?.revenues?.value || null;
    const netIncome = d.income_statement?.net_income_loss?.value || null;
    const eps = d.income_statement?.basic_earnings_per_share?.value || null;
    const totalCash = d.balance_sheet?.cash_and_cash_equivalents?.value || null;
    const totalDebt = d.balance_sheet?.debt?.value || null;
    const opEx = d.income_statement?.operating_expenses?.value || null;
    const shares = d.income_statement?.diluted_average_shares?.value || null;

    const marketCap = shares && vela.c ? shares * vela.c : null;
    const peRatio = eps && vela.c ? vela.c / eps : null;
    const monthlyExp = opEx ? opEx / 12 : null;
    const cashToMonthlyOps = totalCash && monthlyExp ? totalCash / monthlyExp : null;

    const fundamental = {
      totalRevenue: revenue,
      netIncome,
      eps,
      totalCash,
      totalDebt,
      operatingExpenses: opEx,
      profitMargin: revenue && netIncome ? netIncome / revenue : null,
      sharesOutstanding: shares,
      marketCap,
      peRatio,
      cashToMonthlyOps
    };

    const principiosAbacus = {
      principio1: {
        targetAnalistas: finviz.targetAnalistas,
        cumple: finviz.targetAnalistas && vela.c <= finviz.targetAnalistas * 0.8
      },
      principio2: {
        salesGrowth: null,
        categoria: revenue ? (revenue * 1.1 <= revenue ? "Madura" : (revenue * 1.2 <= revenue ? "Crecimiento" : "Estable")) : null
      },
      principio3: {
        sma200: finviz.sma200,
        precioActual: vela.c,
        cumple: finviz.sma200 ? vela.c < finviz.sma200 : null
      },
      principio4: {
        news: [] // aquí podrías volcar noticias o earning calls desde polygon
      },
      principio5: {
        peRatio,
        pePromedio6m,
        category: peRatio >= 30 ? "Medium/High Growth" :
                  peRatio >= 20 ? "Medium Growth" : "Value",
        totalCash, totalDebt, opEx,
        profitMargin: fundamental.profitMargin,
        marketCapFuturo: netIncome && pePromedio6m ? netIncome * pePromedio6m : null,
        retornoPct: marketCap && netIncome && pePromedio6m ? ((netIncome * pePromedio6m - marketCap) / marketCap * 100) : null
      },
      principio6: {
        soporte, resistencia
      },
      principio7: {
        williamsR: null // puedes calcular con technicalindicators si agregas como input
      }
    };

    let shortInterest = {}, shortVolume = [], noticias = [];
    try {
      const si = await axios.get(`https://api.polygon.io/stocks/v1/short-interest?ticker=${symbol}&limit=1&sort=settlement_date.desc&apiKey=${API_KEY}`);
      const s = si.data.results?.[0];
      if (s) shortInterest = { settlement_date: s.settlement_date, shortInterest: s.short_interest, avgDailyVolumeSI: s.avg_daily_volume, daysToCoverSI: s.days_to_cover };
    } catch {}
    try {
      const sv = await axios.get(`https://api.polygon.io/stocks/v1/short-volume?ticker=${symbol}&limit=1&sort=date.desc&apiKey=${API_KEY}`);
      const su = sv.data.results?.[0];
      if (su) shortVolume = { dateSV: su.date, shortVolume: su.short_volume, shortVolumeRatio: su.short_volume_ratio, totalVolumeSV: su.total_volume };
    } catch {}
    try {
      const n = await axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&sort=published_utc&order=desc&apiKey=${API_KEY}`);
      noticias = n.data.results.map(xx => ({ titulo: xx.title, resumen: xx.description, url: xx.article_url, fuente: xx.publisher?.name || "Desconocido", fecha: xx.published_utc, sentimiento: xx.insights?.sentiment || "neutral" }));
      principiosAbacus.principio4.news = noticias;
    } catch {}

    const velas = {
      day: datos.slice(-4).map(p=>({o:p.o,h:p.h,l:p.l,c:p.c,v:p.v,t:p.t})),
      week: [{o:datos[0].o, h:Math.max(...highs), l:Math.min(...lows), c:vela.c, v:vols.reduce((a,b)=>a+b,0), t:datos[0].t}],
      month: [{o:datos[0].o, h:Math.max(...highs), l:Math.min(...lows), c:vela.c, v:vols.reduce((a,b)=>a+b,0), t:datos[0].t}],
      hour: []
    };

    res.json({
      symbol, timeframe,
      precioActual: vela.c,
      historico: closes.slice(-14),
      tecnico: { ...tecnico, sma200: finviz.sma200 },
      targetAnalistas: finviz.targetAnalistas,
      sma200Delta: finviz.sma200Delta,
      fundamental,
      principiosAbacus,
      shortInterest,
      shortVolume,
      volumen: {
        volumenActual: vela.v,
        volumenPromedio30Dias: (vols.slice(-30).reduce((a,b)=>a+b,0)/Math.min(30,vols.length)).toFixed(2),
        volumenAcumulado: vols.reduce((a,b)=>a+b,0).toFixed(2)
      },
      resumenDia: {
        aperturaDiaAnterior: datos.at(-2)?.o || "N/A",
        minimoDiaAnterior: datos.at(-2)?.l || "N/A",
        maximoDiaAnterior: datos.at(-2)?.h || "N/A",
        cierreDiaAnterior: datos.at(-2)?.c || "N/A",
        volumenResumenDiario: datos.at(-2)?.v || "N/A"
      },
      velas,
      noticias,
      resumen: { estadoActual: "Precaución", riesgo: "Medio", oportunidad: "Mixtas" },
      horaNY: new Date().toISOString(),
      horaLocal: new Date().toISOString(),
      mercado: { estado: "Desconocido", tiempoParaEvento: "N/A" }
    });

  } catch (e) {
    console.error("Error interno:", e.message);
    res.status(500).json({ error: "Error interno" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
