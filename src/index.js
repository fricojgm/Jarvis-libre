const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';
const TELEGRAM_BOT_TOKEN = '7868141860:AAGUmHQdNPM32t-70zU0uH78KXH6ajpg_7Y';
const CHAT_ID = '1418346985';

const portafolio = ["AVGO", "SCHD", "VITA", "XLE", "GLD", "IWM", "AAPL", "MSFT"];
const historialReportes = [];

// Telegram
function enviarReporteTelegram(symbol, mensaje) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    axios.post(url, { chat_id: CHAT_ID, text: mensaje })
        .then(() => console.log(`✅ Reporte enviado para ${symbol}`))
        .catch(err => console.error(err.message));
}

// Cálculos
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

// Análisis técnico
async function analizarActivo(symbol) {
    try {
        const res = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2025-12-31?adjusted=true&sort=desc&limit=50&apiKey=${POLYGON_API_KEY}`);
        if (res.data && res.data.results) {
            const precios = res.data.results.map(c => c.c).reverse();
            const velas = res.data.results.slice(-2).map(c => ({ o: c.o, h: c.h, l: c.l, c: c.c }));
            const volumen = res.data.results[0]?.v || 'N/A';
            const maximo = res.data.results[0]?.h || 'N/A';
            const minimo = res.data.results[0]?.l || 'N/A';

            if (precios.length >= 26) {
                const rsi = calcularRSI(precios);
                const macd = calcularMACD(precios);
                const patron = detectarPatronVelas(velas);
                const precioActual = precios.at(-1);
                const hora = new Date().toLocaleTimeString();

                const mensaje = `📊 Análisis ${symbol}
• Precio: $${precioActual}
• RSI: ${rsi}
• MACD: ${macd}
• Velas: ${patron}
• Volumen: ${volumen}
• Máximo: $${maximo}
• Mínimo: $${minimo}
• Hora: ${hora}`;

                historialReportes.push({ symbol, precioActual, rsi, macd, patron, volumen, maximo, minimo, timestamp: hora });
                enviarReporteTelegram(symbol, mensaje);
            }
        }
    } catch (err) { console.error(`⚠️ Error ${symbol}: ${err.message}`); }
}

// Monitoreo con horario de mercado
async function monitorear() {
    const horaActual = new Date();
    const horaDecimal = horaActual.getHours() + (horaActual.getMinutes() / 60);

    if (horaDecimal >= 9.5 && horaDecimal <= 17) {
        console.log(`📡 Análisis Técnico ${horaActual.toLocaleTimeString()}`);
        for (const symbol of portafolio) await analizarActivo(symbol);
    } else {
        console.log(`⏸️ Fuera de horario bursátil, no se ejecuta análisis`);
    }
}

// Endpoints
app.get('/', (req, res) => res.send('Jarvis-Libre con reporte completo por Telegram listo'));
app.get('/reporte', (req, res) => res.json(historialReportes));

app.listen(PORT, () => {
    console.log(`🚀 Servidor operativo en puerto ${PORT}`);
    monitorear();
    setInterval(monitorear, 60000);
});




