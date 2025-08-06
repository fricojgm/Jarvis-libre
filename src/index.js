const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const { WilliamsR } = require('technicalindicators');

const app = express();
app.use(cors());

const API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// Scrape Yahoo Finance (Sales Growth y Revenue Estimate)
async function scrapYahooAnalysis(symbol) {
  const url = `https://finance.yahoo.com/quote/${symbol}/analysis`;
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const revenueText = $('span:contains("Revenue Estimate")')
    .parent()
    .next()
    .find('td')
    .eq(1)
    .text()
    .trim();

  const salesGrowthText = $('td:contains("Sales Growth")')
    .next()
    .text()
    .trim();

  const revenueEstimateNext = parseFloat(revenueText.replace(/[^\d.]/g, ''));
  const salesGrowth = parseFloat(salesGrowthText.replace('%', '')) / 100;

  return { revenueEstimateNext, salesGrowth };
}

// Scrape Finviz (Target Price, Profit Margin, Cash, etc.)
async function scrapFinviz(symbol, price) {
  const url = `https://finviz.com/quote.ashx?t=${symbol}`;
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  const $ = cheerio.load(data);
  let target, sma200Pct, pm, cashSh, shsOut, debtEq;

  $('table.snapshot-table2 tr').each((_, row) => {
    $(row)
      .find('td')
      .each((i, cell) => {
        const label = $(cell).text().trim();
        const val = $(cell.next).text().trim();

        if (label === 'Target Price') target = parseFloat(val);
        if (label === 'SMA200') sma200Pct = parseFloat(val.replace('%', ''));
        if (label === 'Profit Margin') pm = parseFloat(val.replace('%', '')) / 100;
        if (label === 'Cash/sh') cashSh = parseFloat(val);
        if (label === 'Shs Outstand') {
          const m = val.match(/([\d.]+)([MB])/);
          if (m) shsOut = parseFloat(m[1]) * (m[2] === 'B' ? 1e9 : 1e6);
        }
        if (label === 'Debt/Eq') debtEq = parseFloat(val);
      });
  });

  const sma200 = price / (1 + sma200Pct / 100);
  const totalCash = cashSh && shsOut ? cashSh * shsOut : null;
  const totalDebt = debtEq && totalCash ? totalCash * debtEq : null;

  return { target, sma200, pm, totalCash, totalDebt };
}

// Scrape PE ratio promedio 6m desde public.com
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
  } catch {
    return null;
  }
}

app.get('/principios/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // 5 años atrás
    const fechaInicio = new Date();
    fechaInicio.setFullYear(fechaInicio.getFullYear() - 5);
    const from = fechaInicio.toISOString().split('T')[0];
    const to = new Date().toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000&apiKey=${API_KEY}`;
    const resp = await axios.get(url);
    const data = resp.data.results;

    const closes = data.map(p => p.c);
    const highs = data.map(p => p.h);
    const lows = data.map(p => p.l);
    const precioActual = closes.at(-1);

    const ya = await scrapYahooAnalysis(symbol);
    const fz = await scrapFinviz(symbol, precioActual);
    const peProm = await obtenerPromedioPERatio(symbol);

    // Principio 1
    const p1 = precioActual <= fz.target * 0.8;

    // Principio 2
    const p2 = ya.salesGrowth >= 0.03 && ya.salesGrowth <= 0.19;

    // Principio 3
    const p3 = precioActual < fz.sma200;

    // Principio 4 (eventos clave en noticias)
    const n = await axios.get(`https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=3&sort=published_utc&order=desc&apiKey=${API_KEY}`);
    const noticias = n.data.results.map(n => ({
      titulo: n.title,
      sentimiento: n.insights?.sentiment || 'neutral',
    }));
    const p4 = noticias.some(n => /earnings|guidance|merge|acquisition/i.test(n.titulo));

    // Principio 5
    const eps = precioActual / fz.pm;
    const peRatio = precioActual / eps;
    const opMensual = (eps * fz.pm || 1) / 12;
    const cashLevel = fz.totalCash && opMensual ? fz.totalCash / opMensual : null;
    const deudaSaludable = fz.totalDebt != null ? (eps * fz.pm - fz.totalDebt) > 0 : null;
    const gananciaEstimada = ya.revenueEstimateNext * fz.pm;
    const marketCapFuturo = gananciaEstimada * peProm;
    const marketCapActual = precioActual * (gananciaEstimada / fz.pm / precioActual);
    const retornoPct = marketCapFuturo && marketCapActual ? (marketCapFuturo / marketCapActual - 1) * 100 : null;

    const p5 = {
      peRatio,
      pePromedio6m: peProm,
      cashLevel,
      deudaSaludable,
      gananciaEstimada,
      marketCapFuturo,
      marketCapActual,
      retornoPct: retornoPct ? parseFloat(retornoPct.toFixed(2)) : null
    };

    // Principio 6
    const soporte = Math.min(...closes.slice(-14));
    const resistencia = Math.max(...closes.slice(-14));

    // Principio 7: Williams %R con timeframe 5 años (últimos 14 días)
    const will = WilliamsR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14
    }).at(-1);

    const p7 = will >= -41 && will <= -40;

    // Principio 8: noticias negativas
    const p8 = noticias.filter(n => n.sentimiento === 'negative').length === 0;

    res.json({
      symbol,
      precioActual,
      principios: {
        principio1: p1,
        principio2: p2,
        principio3: p3,
        principio4: p4,
        principio5: p5,
        principio6: { soporte, resistencia },
        principio7: { williamsR: will, cumple: p7 },
        principio8: p8
      },
      noticias
    });
  } catch (e) {
    console.error('ERROR PRINCIPIOS:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(3000, () => console.log('Servidor AbacusPrincipios corriendo en puerto 3000'));

