const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

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

function esVelaAbierta(vela, timeframe) {
    const hoy = new Date();
    const fechaVela = new Date(vela.fecha);

    if (timeframe === 'day') return fechaVela.toDateString() === hoy.toDateString();
    if (timeframe === 'week') {
        const semanaActual = getWeekNumber(hoy);
        const semanaVela = getWeekNumber(fechaVela);
        return semanaActual === semanaVela && hoy.getFullYear() === fechaVela.getFullYear();
    }
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

app.get('/reporte-mercado/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || 'day';
    const cantidad = parseInt(req.query.cantidad) || 5000;

    const timeframesValidos = ['minute', '5min', '15min', '30min', 'hour', '4h', 'day', 'week', 'month', 'year', 'anual'];
    if (!timeframesValidos.includes(timeframe)) {
        return res.status(400).json({ error: "Timeframe inválido. Usa: minute, 5min, 15min, 30min, hour, 4h, day, week, month, year, anual." });
    }

    const hoy = new Date().toISOString().split('T')[0];
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/2010-01-01/${hoy}?adjusted=true&sort=desc&limit=${cantidad}&apiKey=${POLYGON_API_KEY}`;

    try {
        const resPrecio = await axios.get(url);
        let datos = resPrecio.data.results;

        if (!datos || datos.length === 0) {
            return res.status(404).json({ error: "Sin datos disponibles en ese timeframe para este activo." });
        }

        let ohlcCompleto = datos.map(c => ({
            fecha: new Date(c.t).toISOString().split('T')[0],
            apertura: c.o,
            maximo: c.h,
            minimo: c.l,
            cierre: c.c
        })).reverse();

        if (ohlcCompleto.length > 0 && esVelaAbierta(ohlcCompleto.at(-1), timeframe)) {
            ohlcCompleto.pop();
        }

        const precios = ohlcCompleto.map(c => c.cierre);
        const ohlc = ohlcCompleto.slice(-2);

        const volumen = datos[0]?.v || 'N/A';
        const maximo = datos[0]?.h || 'N/A';
        const minimo = datos[0]?.l || 'N/A';

        let rsi = "N/A", macd = "N/A", patron = "N/A";
        if (precios.length >= 14) rsi = calcularRSI(precios);
        if (precios.length >= 26) {
            macd = calcularMACD(precios);
        } else if (precios.length < 26 && timeframe !== 'minute') {
            const fechaInicioExtra = new Date();
            fechaInicioExtra.setMonth(fechaInicioExtra.getMonth() - 42);
            const inicioExtra = fechaInicioExtra.toISOString().split('T')[0];
            const urlExtra = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/${inicioExtra}/${hoy}?adjusted=true&sort=desc&limit=${cantidad}&apiKey=${POLYGON_API_KEY}`;

            const extraData = await axios.get(urlExtra);
            let datosExtra = extraData.data.results;

            if (datosExtra && datosExtra.length > 0) {
                let ohlcExtra = datosExtra.map(c => ({
                    fecha: new Date(c.t).toISOString().split('T')[0],
                    apertura: c.o,
                    maximo: c.h,
                    minimo: c.l,
                    cierre: c.c
                })).reverse();

                if (ohlcExtra.length > 0 && esVelaAbierta(ohlcExtra.at(-1), timeframe)) {
                    ohlcExtra.pop();
                }

                const preciosExtra = ohlcExtra.map(c => c.cierre);
                if (preciosExtra.length >= 26) {
                    macd = calcularMACD(preciosExtra);
                }
            }
        }

        if (ohlc.length >= 2) patron = detectarPatronVelas(ohlc);

        const resFundamental = await axios.get(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`);
        const datosFund = resFundamental.data.results;
        const marketCap = datosFund.market_cap || 'N/A';
        const peRatio = datosFund.pe_ratio || 'N/A';
        const eps = datosFund.eps || 'N/A';

        res.json({
            symbol,
            timeframe,
            precioActual: precios.at(-1),
            historico: precios.slice(-cantidad),
            rsi, macd, patron, volumen, maximo, minimo,
            ohlcCompleto,
            fundamental: { marketCap, peRatio, eps }
        });

    } catch (err) {
        console.error(`Error procesando ${symbol}: ${err.message}`);
        res.status(500).json({ error: "Datos no disponibles" });
    }
});

// Short Volume Diario en JSON
app.get('/short-volume/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const fecha = req.query.fecha;

    if (!fecha) {
        return res.status(400).json({ error: "Debes proporcionar una fecha en formato YYYY-MM-DD" });
    }

    const url = `https://api.polygon.io/v3/reference/shorts/${symbol}/volume?date=${fecha}&apiKey=${POLYGON_API_KEY}`;

    try {
        const response = await axios.get(url);
        const data = response.data.results || [];
        res.json({ symbol, fecha, shortVolume: data });
    } catch (err) {
        console.error(`Error Short Volume ${symbol}: ${err.message}`);
        res.status(500).json({ error: "Datos no disponibles o activo sin short volume" });
    }
});

// Short Interest Bi-mensual en JSON
app.get('/short-interest/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const limit = req.query.limit || 10;

    const url = `https://api.polygon.io/v3/reference/shorts/${symbol}/interest?limit=${limit}&apiKey=${POLYGON_API_KEY}`;

    try {
        const response = await axios.get(url);
        const data = response.data.results || [];
        res.json({ symbol, shortInterest: data });
    } catch (err) {
        console.error(`Error Short Interest ${symbol}: ${err.message}`);
        res.status(500).json({ error: "Datos no disponibles o activo sin short interest" });
    }
});

app.get('/', (req, res) => res.send('Jarvis-Libre operativo, análisis técnico, velas protegidas, MACD forzado y short data activado.'));

app.listen(PORT, () => {
    console.log(`🚀 Servidor operativo en puerto ${PORT} con Short Volume y Short Interest activados.`);
});