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

// Función MACD básico (diferencia de medias móviles 12 y 26 días)
function calcularMACD(precios) {
    const ema12 = precios.slice(-12).reduce((a, b) => a + b) / 12;
    const ema26 = precios.slice(-26).reduce((a, b) => a + b) / 26;
    return (ema12 - ema26).toFixed(2);
}

// Soporte = mínimo de últimos 10 cierres | Resistencia = máximo de últimos 10 cierres
function calcularSoporte(precios) {
    return Math.min(...precios.slice(-10)).toFixed(2);
}
function calcularResistencia(precios) {
    return Math.max(...precios.slice(-10)).toFixed(2);
}

// Consultar y analizar cada activo
async function analizarActivo(symbol) {
    try {
        const res = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2025-12-31?adjusted=true&sort=desc&limit=50&apiKey=${POLYGON_API_KEY}`);
        
        if (res.data && res.data.results) {
            const precios = res.data.results.map(c => c.c).reverse();
            if (precios.length >= 26) {
                const rsi = calcularRSI(precios);
                const soporte = calcularSoporte(precios);
                const resistencia = calcularResistencia(precios);
                const macd = calcularMACD(precios);
                const precioActual = precios[precios.length - 1];

                const alertaRSI = rsi > 70 ? "⚠️ Sobrecompra" : rsi < 30 ? "💡 Sobreventa" : "Estable";
                const alertaMACD = macd > 0 ? "Tendencia Alcista" : "Tendencia Bajista";

                console.log(`\n✅ [${symbol}] Precio: $${precioActual}`);
                console.log(`RSI: ${rsi} (${alertaRSI}) | MACD: ${macd} (${alertaMACD})`);
                console.log(`Soporte: $${soporte} | Resistencia: $${resistencia}`);

                historialReportes.push({
                    symbol,
                    precioActual,
                    rsi,
                    alertaRSI,
                    soporte,
                    resistencia,
                    macd,
                    alertaMACD,
                    timestamp: new Date().toLocaleString()
                });
            }
        }
    } catch (err) {
        console.error(`Error ${symbol}: ${err.message}`);
    }
}

// Monitoreo técnico
async function monitorear() {
    console.log(`\n🔍 Análisis Técnico Frico - ${new Date().toLocaleTimeString()}`);
    for (const symbol of portafolio) await analizarActivo(symbol);
}

// Exponer historial por endpoint
app.get('/reporte', (req, res) => {
    res.json(historialReportes);
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
    monitorear();
    setInterval(monitorear, 60000);
});