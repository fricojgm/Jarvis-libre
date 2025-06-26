const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';
const TELEGRAM_BOT_TOKEN = '7868141860:AAGUmHQdNPM32t-70zU0uH78KXH6ajpg_7Y
';

const portafolio = ["AVGO", "SCHD", "VITA", "XLE", "GLD", "IWM", "AAPL", "MSFT"];
const historialReportes = [];
const CHAT_IDS = {};

// Telegram general
function enviarAlertaTelegram(symbol, mensaje, chatid) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    axios.post(url, { chat_id: chatid, text: mensaje })
        .then(() => console.log(`✅ Alerta enviada para ${symbol} al chat ${chatid}`))
        .catch(err => console.error(err.message));
}

// Lógica de uso normal
function manejarAlerta(symbol, mensaje) {
    const chatID = CHAT_IDS[symbol];
    if (chatID) {
        enviarAlertaTelegram(symbol, mensaje, chatID);
    } else {
        console.log(`⚠️ No hay chat_id activo para ${symbol}, no se envió la alerta`);
    }
}

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
            if (precios.length >= 26) {
                const rsi = calcularRSI(precios);
                const macd = calcularMACD(precios);
                const patron = detectarPatronVelas(velas);
                historialReportes.push({ symbol, precioActual: precios.at(-1), rsi, macd, patron, timestamp: new Date().toLocaleString() });
                console.log(`✅ ${symbol}: RSI ${rsi}, MACD ${macd}, Velas ${patron}`);
                if (rsi > 70 || rsi < 30 || patron !== "Sin patrón") {
                    manejarAlerta(symbol, `RSI: ${rsi}, MACD: ${macd}, Velas: ${patron}`);
                }
            }
        }
    } catch (err) { console.error(`⚠️ Error ${symbol}: ${err.message}`); }
}

// Monitoreo
async function monitorear() {
    console.log(`\n📊 Análisis Técnico ${new Date().toLocaleTimeString()}`);
    for (const symbol of portafolio) await analizarActivo(symbol);
}

// Endpoints
app.get('/', (req, res) => res.send('Jarvis-Libre operativo, control total Telegram'));
app.get('/activar-alerta/:symbol/:chatid', (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const chatid = req.params.chatid;
    CHAT_IDS[symbol] = chatid;
    res.send(`✅ Alerta activada para ${symbol} al chat ${chatid}`);
});
app.get('/alerta-directa/:symbol/:chatid', (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const chatid = req.params.chatid;
    const mensaje = `🚨 Alerta directa de ${symbol}`;
    enviarAlertaTelegram(symbol, mensaje, chatid);
    res.send(`✅ Alerta directa enviada de ${symbol} al chat ${chatid}`);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor operativo en puerto ${PORT}`);
    monitorear();
    setInterval(monitorear, 60000);
});