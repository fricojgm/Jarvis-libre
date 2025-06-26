const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// Pega tu API Key real de Polygon aquí
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// Ruta principal de prueba
app.get('/', (req, res) => {
    res.send('Jarvis-Libre está operativo');
});

// Ruta consultar precio actual
app.get('/consultar/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();

    try {
        const response = await axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`);

        const data = response.data;

        if (data && data.status === 'OK' && data.ticker) {
            const resultado = {
                mensaje: "Consulta exitosa",
                symbol: data.ticker.ticker,
                precio: data.ticker.lastTrade.p || null,
                status: "DELAYED"
            };
            res.json(resultado);
        } else {
            res.status(404).json({ mensaje: "No se encontraron datos para ese símbolo" });
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ mensaje: "Error al consultar el símbolo", detalle: error.message });
    }
});

// Ruta para obtener histórico de precios
app.get('/historico/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();

    try {
        const response = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2025-12-31?adjusted=true&sort=desc&limit=50&apiKey=${POLYGON_API_KEY}`);

        if (response.data && response.data.results) {
            const preciosCierre = response.data.results.map(candle => candle.c).reverse();

            res.json({
                symbol: symbol,
                precios: preciosCierre
            });
        } else {
            res.status(404).json({ mensaje: "No se encontraron datos históricos" });
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ mensaje: "Error al consultar histórico", detalle: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});