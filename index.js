const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';
const portafolio = ["AVGO", "SCHD", "VITA", "XLE", "GLD", "IWM", "AAPL", "MSFT"];
const historialReportes = [];

// Función RSI
function calcularRSI(precios, periodo = 14) {
    let ganancias = 0, perdidas = 0;
    for (let i = 1; i <= periodo; i++) {
        const cambio = precios[i] - precios[i - 1];
        if (cambio > 0) ganancias += cambio;
        if (cambio < 0) perdidas -= cambio;
    }
    const rs = ganancias / perdidas;
    return (100 - (100 / (1 + rs))).toFixed(2);
}

// MACD
function calcularMACD(precios) {
    const ema12 = precios.slice(-12).reduce((a, b) => a + b) / 12;
    const ema26 = precios.slice(-26).reduce((a, b) => a + b) / 26;
    return (ema12 - ema26).toFixed(2);
}

// Soporte y Resistencia
function calcularSoporte(precios) {
    return Math.min(...precios.slice(-10)).toFixed(2);
}
function calcularResistencia(precios) {
    return Math.max(...precios.slice(-10)).toFixed(2);
}

// Detección de patrones de velas japonesas
function detectarPatronVelas(candles) {
    if (candles.length < 2) return "Insuficiente data";
    const ultima = candles[candles.length - 1];
    const penultima = candles[candles.length - 2];
    const cuerpoUltima = Math.abs(ultima.c - ultima.o);
    const rangoUltima = ultima.h - ultima.l;
    if (cuerpoUltima < (rangoUltima * 0.3) && (ultima.h - ultima.c) < (rangoUltima * 0.1)) return "Martillo (posible reversión alcista)";
    if (cuerpoUltima < (rangoUltima * 0.05)) return "Doji (indecisión de mercado)";
    if (penultima.c < penultima.o && ultima.c > ultima.o && ultima.c > penultima.o && ultima.o < penultima.c) return "Envolvente Alcista";
    if (penultima.c > penultima.o && ultima.c < ultima.o && ultima.o > penultima.c && ultima.c < penultima.o) return "Envolvente Bajista";
    return "Sin patrón destacado";
}

// Análisis Técnico Completo
async function analizarActivo(symbol) {
    try {
        const res = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2025-12-31?adjusted=true&sort=desc&limit=50&apiKey=${POLYGON_API_KEY}`);
        if (res.data && res.data.results) {
            const precios = res.data.results.map(c => c.c).reverse();
            const velas = res.data.results.slice(-2).map(c => ({ o: c.o, h: c.h, l: c.l, c: c.c }));
            if (precios.length >= 26) {
                const rsi = calcularRSI(precios);
                const soporte = calcularSoporte(precios);
                const resistencia = calcularResistencia(precios);
                const macd = calcularMACD(precios);
                const precioActual = precios[precios.length - 1];
                const patronVelas = detectarPatronVelas(velas);
                historialReportes.push({
                    symbol, precioActual, rsi, soporte, resistencia, macd, patronVelas, timestamp: new Date().toLocaleString()
                });
                console.log(`\n[${symbol}] $${precioActual} | RSI: ${rsi} | MACD: ${macd} | Soporte: ${soporte} | Resistencia: ${resistencia} | Velas: ${patronVelas}`);
            }
        }
    } catch (err) { console.error(`Error ${symbol}: ${err.message}`); }
}

// Monitoreo Técnico
async function monitorear() {
    console.log(`\nAnálisis Técnico Completo - ${new Date().toLocaleTimeString()}`);
    for (const symbol of portafolio) await analizarActivo(symbol);
}

// Endpoints
app.get('/', (req, res) => res.send('Jarvis-Libre operativo con velas japonesas.'));
app.get('/reporte', (req, res) => res.json(historialReportes));

// Servidor
app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
    monitorear();
    setInterval(monitorear, 60000);
});