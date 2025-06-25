const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

app.use(bodyParser.json());

let memoria = {
    portafolio: [],
    aprendizajes: []
};

// Cargar memoria si existe (versión simple)
try {
    memoria = require('./memoria.json');
    console.log('✅ Memoria cargada con éxito:', memoria);
} catch (error) {
    console.log('⚠️ No se pudo cargar memoria, iniciando vacía.');
}

// Ruta GET para probar desde navegador
app.get('/consultar/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`;

    try {
        const respuesta = await axios.get(url);
        res.json(respuesta.data);
    } catch (error) {
        console.error('Error consultando precio:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error consultando precio' });
    }
});

// Ruta POST para integraciones automáticas
app.post('/consultar/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`;

    try {
        const respuesta = await axios.get(url);
        res.json(respuesta.data);
    } catch (error) {
        console.error('Error consultando precio:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error consultando precio' });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`✅ Jarvis-Libre escuchando en puerto ${PORT}`);
    console.log(`🔑 Clave Polygon: ${POLYGON_API_KEY}`);
});