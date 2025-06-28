const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

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

function detectarPatronVelas(ohlc) {
    if (ohlc.length < 2) return "Insuficiente data";
    const u = ohlc[ohlc.length - 1], p = ohlc[ohlc.length - 2];
    const cuerpo = Math.abs(u.close - u.open), rango = u.high - u.low;
    if (cuerpo < (rango * 0.3) && (u.high - u.close) < (rango * 0.1)) return "Martillo";
    if (cuerpo < (rango * 0.05)) return "Doji";
    if (p.close < p.open && u.close > u.open && u.close > p.open && u.open < p.close) return "Envolvente Alcista";
    if (p.close > p.open && u.close < u.open && u.open > p.close && u.close < p.open) return "Envolvente Bajista";
    return "Sin patrón";
}

// Endpoint flexible con OHLC completo
app.get('/reporte-mercado/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || 'day';
    const cantidad = req.query.cantidad || 50;

    const timeframesValidos = ['minute', '5min', '15min', '30min', 'hour', '4h', 'day', 'week', 'month', 'year', 'anual'];
    if (!timeframesValidos.includes(timeframe)) {
        return res.status(400).json({ error: "Timeframe inválido. Usa: minute, 5min, 15min, 30min, hour, 4h, day, week, month, year, anual." });
    }

    try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/2024-01-01/2025-12-31?adjusted=true&sort=desc&limit=${cantidad}&apiKey=${POLYGON_API_KEY}`;
        const resPrecio = await axios.get(url);
        const datos = resPrecio.data.results;

        if (!datos || datos.length === 0) {
            return res.status(404).json({ error: "Sin datos disponibles en ese timeframe para este activo." });
        }

        const precios = datos.map(c => c.c).reverse();
        
        const ohlc = datos.slice(-2).map(c => ({
            fecha: new Date(c.t).toISOString().split('T')[0],
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c
        }));

        const ohlcCompleto = datos.map(c => ({
            fecha: new Date(c.t).toISOString().split('T')[0],
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c
        })).reverse();

        const volumen = datos[0]?.v || 'N/A';
        const maximo = datos[0]?.h || 'N/A';
        const minimo = datos[0]?.l || 'N/A';

        let rsi = "N/A", macd = "N/A", patron = "N/A";
        if (precios.length >= 26) {
            rsi = calcularRSI(precios);
            macd = calcularMACD(precios);
            patron = detectarPatronVelas(ohlc);
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
            ohlcCompleto,
            fundamental: { marketCap, peRatio, eps }
        });

    } catch (err) {
        console.error(`Error procesando ${symbol}: ${err.message}`);
        res.status(500).json({ error: "Datos no disponibles" });
    }
});

// Endpoint simple
app.get('/', (req, res) => res.send('Jarvis-Libre operativo con técnico, fundamental, OHLC completo (con fecha) y timeframes avanzados.'));

app.listen(PORT, () => {
    console.log(`🚀 Servidor operativo en puerto ${PORT} con OHLC profesional y timeframes avanzados.`);
});