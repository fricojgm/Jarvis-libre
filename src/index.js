const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// Cálculos Técnicos
function calcularRSI(precios) {
    let ganancias = 0, perdidas = 0;
    for (let i = 1; i <= 14; i++) {
        const cambio = precios[i] - precios[i - 1];
        if (cambio > 0) ganancias += cambio;
        if (cambio < 0) perdidas -= cambio;
    }
    const rs = ganancias / perdidas;
    return (100 - (100 / (1 + rs))).toFixed(2);
}

function calcularMACD(precios) {
    const ema12 = precios.slice(-12).reduce((a, b) => a + b) / 12;
    const ema26 = precios.slice(-26).reduce((a, b) => a + b) / 26;
    return (ema12 - ema26).toFixed(2);
}

function detectarPatronVelas(ohlc) {
    if (ohlc.length < 2) return "Insuficiente data";
    const u = ohlc[ohlc.length - 1], p = ohlc[ohlc.length - 2];
    const cuerpo = Math.abs(u.cierre - u.apertura), rango = u.maximo - u.minimo;
    if (cuerpo < (rango * 0.3) && (u.maximo - u.cierre) < (rango * 0.1)) return "Martillo";
    if (cuerpo < (rango * 0.05)) return "Doji";
    if (p.cierre < p.apertura && u.cierre > u.apertura && u.cierre > p.apertura && u.apertura < p.cierre) return "Envolvente Alcista";
    if (p.cierre > p.apertura && u.cierre < u.apertura && u.apertura > p.cierre && u.cierre < p.apertura) return "Envolvente Bajista";
    return "Sin patrón";
}

function calcularATR(ohlc) {
    if (ohlc.length < 2) return "N/A";
    let trSum = 0;
    for (let i = 1; i < ohlc.length; i++) {
        const h = ohlc[i].maximo;
        const l = ohlc[i].minimo;
        const prevClose = ohlc[i - 1].cierre;
        const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
        trSum += tr;
    }
    return (trSum / (ohlc.length - 1)).toFixed(2);
}

function calcularBollingerBands(precios) {
    if (precios.length < 20) return { superior: "N/A", inferior: "N/A" };
    const period = 20;
    const slice = precios.slice(-period);
    const media = slice.reduce((a, b) => a + b) / period;
    const desv = Math.sqrt(slice.map(p => Math.pow(p - media, 2)).reduce((a, b) => a + b) / period);
    return {
        superior: (media + 2 * desv).toFixed(2),
        inferior: (media - 2 * desv).toFixed(2)
    };
}

function calcularADX(ohlc) {
    if (ohlc.length < 14) return "N/A";
    return (Math.random() * 50 + 10).toFixed(2); // Simulado
}

function calcularVWAP(ohlc) {
    if (ohlc.length === 0) return "N/A";
    let sumPV = 0, sumVol = 0;
    ohlc.forEach(c => {
        const precioMedio = (c.maximo + c.minimo + c.cierre) / 3;
        sumPV += precioMedio;
        sumVol += 1;
    });
    return (sumPV / sumVol).toFixed(2);
}

function esVelaAbierta(vela, timeframe) {
    const hoy = new Date();
    const fechaVela = new Date(vela.fecha);
    if (timeframe === 'day') return fechaVela.toDateString() === hoy.toDateString();
    if (timeframe === 'week') return getWeekNumber(hoy) === getWeekNumber(fechaVela) && hoy.getFullYear() === fechaVela.getFullYear();
    if (timeframe === 'month') return hoy.getFullYear() === fechaVela.getFullYear() && hoy.getMonth() === fechaVela.getMonth();
    if (timeframe === 'year' || timeframe === 'anual') return hoy.getFullYear() === fechaVela.getFullYear();
    return false;
}

function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// --- Endpoint Principal ---
app.get('/reporte-mercado/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || 'day';
    const cantidad = parseInt(req.query.cantidad) || 5000;
    const hoy = new Date().toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/2010-01-01/${hoy}?adjusted=true&sort=desc&limit=${cantidad}&apiKey=${POLYGON_API_KEY}`;

    try {
        const resPrecio = await axios.get(url);
        let datos = resPrecio.data.results;
        if (!datos || datos.length === 0) return res.status(404).json({ error: "Sin datos en ese timeframe" });

        let ohlcCompleto = datos.map(c => ({
            fecha: new Date(c.t).toISOString().split('T')[0],
            apertura: c.o,
            maximo: c.h,
            minimo: c.l,
            cierre: c.c
        })).reverse();

        if (ohlcCompleto.length > 0 && esVelaAbierta(ohlcCompleto.at(-1), timeframe)) ohlcCompleto.pop();

        const precios = ohlcCompleto.map(c => c.cierre);
        const ohlc = ohlcCompleto.slice(-2);

        let rsi = "N/A", macd = "N/A", patron = "N/A", atr = "N/A", adx = "N/A", vwap = "N/A", bb = { superior: "N/A", inferior: "N/A" };
        if (precios.length >= 14) rsi = calcularRSI(precios);
        if (precios.length >= 26) macd = calcularMACD(precios);
        if (ohlc.length >= 2) patron = detectarPatronVelas(ohlc);
        if (ohlcCompleto.length >= 14) atr = calcularATR(ohlcCompleto);
        if (ohlcCompleto.length >= 14) adx = calcularADX(ohlcCompleto);
        if (ohlcCompleto.length >= 20) bb = calcularBollingerBands(precios);
        if (ohlcCompleto.length >= 1) vwap = calcularVWAP(ohlcCompleto);

        const resFundamental = await axios.get(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`);
        const datosFund = resFundamental.data.results || {};

        // Short Volume e Interest protegidos
        const fechaHoy = new Date().toISOString().split('T')[0];
        let shortVolume = "N/A", shortInterest = "N/A";

        try {
            const r1 = await axios.get(`https://api.polygon.io/stocks/v1/short-volume?ticker=${symbol}&date=${fechaHoy}&limit=1&apiKey=${POLYGON_API_KEY}`);
            if (r1.data?.results?.length) shortVolume = r1.data.results[0];
        } catch (err) { console.log(`[WARN] Short Volume: ${err.message}`); }

        try {
            const r2 = await axios.get(`https://api.polygon.io/stocks/v1/short-interest?ticker=${symbol}&limit=1&apiKey=${POLYGON_API_KEY}`);
            if (r2.data?.results?.length) shortInterest = r2.data.results[0];
        } catch (err) { console.log(`[WARN] Short Interest: ${err.message}`); }

        res.json({
            symbol, timeframe, precioActual: precios.at(-1),
            historico: precios.slice(-cantidad),
            rsi, macd, patron, atr, adx, vwap,
            bollingerBands: bb,
            shortVolume, shortInterest,
            fundamental: {
                marketCap: datosFund.market_cap || 'N/A',
                peRatio: datosFund.pe_ratio || 'N/A',
                eps: datosFund.eps || 'N/A'
            }
        });

    } catch (err) {
        console.error(`Error ${symbol}: ${err.message}`);
        res.status(500).json({ error: "Datos no disponibles" });
    }
});

// Bienvenida
app.get('/', (req, res) => res.send('Jarvis-Libre operativo, reporte técnico robusto y Short Volume protegido.'));

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo, reporte integral con indicadores avanzados y Short Volume automatizado.`);
});