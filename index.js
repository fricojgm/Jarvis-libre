const express = require('express');
const axios = require('axios');
const nodemailer = require('nodemailer');
const app = express();

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';
const TELEGRAM_BOT_TOKEN = '7868141860:AAGUmHQdNPM32t-70zU0uH78KXH6ajpg_7Y';
const portafolio = ["AVGO", "SCHD", "VITA", "XLE", "GLD", "IWM", "AAPL", "MSFT"];
const historialReportes = [];

// Configuración clientes y alertas
const EMAILS = {
    'AAPL': 'juan@cliente.com',
    'MSFT': 'maria@cliente.com'
};
const CHAT_IDS = {
    'AAPL': 'CHAT_ID_JUAN',
    'MSFT': 'CHAT_ID_MARIA'
};

// Email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'TU_EMAIL', pass: 'TU_PASSWORD' }
});
function enviarAlertaEmail(destino, asunto, mensaje) {
    const mailOptions = { from: 'TU_EMAIL', to: destino, subject: asunto, text: mensaje };
    transporter.sendMail(mailOptions, (err, info) => {
        if (err) console.error(err);
        else console.log('Alerta enviada Email:', info.response);
    });
}
// Telegram
function enviarAlertaTelegram(symbol, mensaje) {
    const chatID = CHAT_IDS[symbol];
    if (!chatID) return console.log('No hay chat configurado para', symbol);
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    axios.post(url, { chat_id: chatID, text: mensaje })
        .then(() => console.log('Alerta enviada Telegram'))
        .catch(err => console.error(err.message));
}
// Lógica centralizada
function manejarAlerta(symbol, mensaje) {
    if (EMAILS[symbol]) enviarAlertaEmail(EMAILS[symbol], `Alerta de ${symbol}`, mensaje);
    enviarAlertaTelegram(symbol, mensaje);
}

// Soporte técnico
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
                console.log(`Alerta ${symbol}: RSI ${rsi}, MACD ${macd}, Velas ${patron}`);
                if (rsi > 70 || rsi < 30 || patron !== "Sin patrón") {
                    manejarAlerta(symbol, `RSI: ${rsi}, MACD: ${macd}, Velas: ${patron}`);
                }
            }
        }
    } catch (err) { console.error(`Error ${symbol}: ${err.message}`); }
}

// Monitoreo
async function monitorear() {
    console.log(`\nAnálisis Técnico ${new Date().toLocaleTimeString()}`);
    for (const symbol of portafolio) await analizarActivo(symbol);
}

// Endpoints
app.get('/', (req, res) => res.send('Jarvis-Libre con Email y Telegram personalizado.'));
app.get('/reporte', (req, res) => res.json(historialReportes));

app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
    monitorear();
    setInterval(monitorear, 60000);
});