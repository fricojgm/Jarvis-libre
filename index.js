const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY || 'F145CUAXq7BwX7Hlo_oADZSkCnxsF5x0';

let memoria = {
    portafolio: [],
    aprendizajes: []
};

console.log("✅ Memoria cargada con éxito:", memoria);

// Ruta GET para pruebas en navegador
app.get('/consultar/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    console.log(`🔎 Consultando precio para: ${symbol}`);

    const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`;
    console.log(`🌐 URL consultada: ${url}`);

    try {
        const respuesta = await axios.get(url);
        console.log("📊 Respuesta API:", respuesta.data);
        res.json(respuesta.data);
    } catch (error) {
        console.error("❌ Error al consultar API:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Fallo en la consulta a Polygon' });
    }
});

// Ruta POST (como estaba antes)
app.post('/consultar/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    console.log(`🔎 Consultando precio para: ${symbol}`);

    const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`;
    console.log(`🌐 URL consultada: ${url}`);

    try {
        const respuesta = await axios.get(url);
        console.log("📊 Respuesta API:", respuesta.data);
        res.json(respuesta.data);
    } catch (error) {
        console.error("❌ Error al consultar API:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Fallo en la consulta a Polygon' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Jarvis-Libre escuchando en puerto ${PORT}`);
    console.log(`🔑 Clave Polygon cargada: ${POLYGON_API_KEY}`);
});