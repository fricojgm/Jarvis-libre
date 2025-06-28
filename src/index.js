const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

const portafolio = ["AVGO", "SCHD", "VITA", "XLE", "GLD", "IWM", "AAPL", "MSFT"];

// Cálculos técnicos
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

function detectarPatronVelas(candles) {
    if (candles.length < 2) return "Insuficiente data";
    const u = candles[candles.length - 1], p = candles[candles.length - 2];
    const c = Math.abs(u.c - u.o), r = u.h - u.l;
    if (c < (r * 0.3) && (u.h - u.c) < (r * 0.1)) return "Martillo";
    if (c < (r * 0.05)) return "Doji";
    if (p.c < p.o && u.c > u.o && u.c > p.o && u.o < p.c) return "Envolvente Alcista";
    if (p.c > p.o && u.c < u.o && u.o > p.c && u.c < p.o) return "Envolvente Bajista";
    return "Sin patrón";
}

// Endpoint flexible con timeframe y cantidad
app.get('/reporte-mercado/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || 'day';
    const cantidad = req.query.cantidad || 50;

    const timeframesValidos = ['minute', 'hour', 'day', 'week', 'month', 'year'];
    if (!timeframesValidos.includes(timeframe)) {
        return res.status(400).json({ error: "Timeframe inválido. Usa: minute, hour, day, week, month, year." });
    }

    try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/2024-01-01/2025-12-31?adjusted=true&sort=desc&limit=${cantidad}&apiKey=${POLYGON_API_KEY}`;
        const resPrecio = await axios.get(url);
        const datos = resPrecio.data.results;
        const precios = datos.map(c => c.c).reverse();
        const velas = datos.slice(-2).map(c => ({ o: c.o, h: c.h, l: c.l, c: c.c }));
        const volumen = datos[0]?.v || 'N/A';
        const maximo = datos[0]?.h || 'N/A';
        const minimo = datos[0]?.l || 'N/A';

        let rsi = "N/A", macd = "N/A", patron = "N/A";
        if (precios.length >= 26) {
            rsi = calcularRSI(precios);
            macd = calcularMACD(precios);
            patron = detectarPatronVelas(velas);
        }

        const resFundamental = await axios.get(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`);
        const datosFund = resFundamental.data.results;
        const marketCap = datosFund.market_cap || 'N/A';
        const peRatio = datosFund.pe_ratio || 'N/A';
        const eps = datosFund.eps || 'N/A';

        res.json({
            symbol,
            timeframe,
            precioActual: precios.at(-1),
            rsi, macd, patron, volumen, maximo, minimo,
            fundamental: { marketCap, peRatio, eps }
        });

    } catch (err) {
        console.error(`Error procesando ${symbol}: ${err.message}`);
        res.status(500).json({ error: "Datos no disponibles" });
    }
});

// Endpoint simple de prueba
app.get('/', (req, res) => res.send('Jarvis-Libre operativo con técnico, fundamental y timeframes flexibles'));

app.listen(PORT, () => {
    console.log(`🚀 Servidor operativo en puerto ${PORT} con soporte de timeframes y anual habilitado`);
});