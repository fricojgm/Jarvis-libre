require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

app.use(express.json());

// Memoria inicial
let memoria = {
    portafolio: [],
    aprendizajes: [],
};

// Cargar memoria desde archivo
try {
    const data = fs.readFileSync('memoria.json', 'utf8');
    const cargada = JSON.parse(data);
    memoria.portafolio = cargada.portafolio || [];
    memoria.aprendizajes = cargada.aprendizajes || [];
    console.log('✅ Memoria cargada:', memoria);
} catch (err) {
    console.log('⚠️ No se pudo cargar memoria, iniciando vacía.');
}

// Guardar memoria
function guardarMemoria() {
    fs.writeFileSync('memoria.json', JSON.stringify(memoria, null, 2));
}

// Entrenamiento
app.post('/entrenar', (req, res) => {
    const { tipo, contenido } = req.body;
    if (tipo === 'portafolio') {
        memoria.portafolio.push(contenido);
    } else if (tipo === 'aprendizaje') {
        memoria.aprendizajes.push({ fecha: new Date(), contenido });
    } else {
        return res.status(400).json({ error: 'Tipo no reconocido' });
    }
    guardarMemoria();
    res.json({ status: '✅ Aprendido', memoria });
});

// Configuración
app.post('/configurar', (req, res) => {
    const { identidad, proyectos } = req.body;
    memoria.portafolio.push(proyectos);
    memoria.aprendizajes.push({ fecha: new Date(), tipo: 'configuracion', contenido: identidad });
    guardarMemoria();
    res.json({ status: 'Configuración recibida', memoria });
});

// Consultas Polygon

app.get('/polygon/price', async (req, res) => {
    try {
        const symbol = req.query.symbol || 'AAPL';
        const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        res.json({ status: '✅ Último precio', data: response.data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener precio' });
    }
});

app.get('/polygon/summary', async (req, res) => {
    try {
        const symbol = req.query.symbol || 'AAPL';
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        res.json({ status: '✅ Resumen diario', data: response.data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener resumen' });
    }
});

app.get('/polygon/book', async (req, res) => {
    try {
        const symbol = req.query.symbol || 'AAPL';
        const url = `https://api.polygon.io/v3/snapshot/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        res.json({ status: '✅ Libro de órdenes', data: response.data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener libro de órdenes' });
    }
});

app.get('/polygon/quote', async (req, res) => {
    try {
        const symbol = req.query.symbol || 'AAPL';
        const url = `https://api.polygon.io/v3/quotes/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        res.json({ status: '✅ Cotización actual', data: response.data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener cotización' });
    }
});

// Estado
app.get('/status', (req, res) => {
    res.json({ status: '✅ Jarvis-Libre Activo', memoria });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`✅ Jarvis-Libre escuchando en puerto ${PORT}`);
    console.log(`🔑 Clave Polygon: ${POLYGON_API_KEY}`);
});