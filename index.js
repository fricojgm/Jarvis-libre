const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

let memoria = {
    portafolio: [],
    aprendizajes: []
};

// Cargar memoria si existe
try {
    const data = fs.readFileSync('./memoria.json', 'utf-8');
    memoria = JSON.parse(data);
    console.log("✅ Memoria cargada con éxito:", memoria);
} catch (error) {
    console.warn("⚠️ No se pudo cargar memoria, iniciando vacía.");
}

function guardarMemoria() {
    fs.writeFileSync('./memoria.json', JSON.stringify(memoria, null, 2));
}

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('Jarvis-Libre funcionando ✅');
});

// Ruta GET para consultar precios
app.get('/consultar/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    console.log(`📊 Consultando precio de ${symbol}...`);

    try {
        const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const respuesta = await axios.get(url);
        res.json(respuesta.data);
    } catch (error) {
        console.error('Error consultando Polygon:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Fallo al consultar Polygon' });
    }
});

// Ruta POST para guardar aprendizajes
app.post('/aprender', (req, res) => {
    const { contenido } = req.body;
    if (!contenido) {
        return res.status(400).json({ error: 'Falta el contenido' });
    }
    const nuevo = { fecha: new Date(), contenido };
    memoria.aprendizajes.push(nuevo);
    guardarMemoria();
    res.json({ mensaje: 'Aprendizaje guardado', nuevo });
});

app.listen(PORT, () => {
    console.log(`✅ Jarvis-Libre escuchando en puerto ${PORT}`);
    console.log(`🔑 Clave Polygon: ${POLYGON_API_KEY}`);
});
