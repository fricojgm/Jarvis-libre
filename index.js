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

// Cargar memoria desde archivo sin romper la estructura
try {
    const data = fs.readFileSync('memoria.json', 'utf8');
    const cargada = JSON.parse(data);

    memoria.portafolio = cargada.portafolio || [];
    memoria.aprendizajes = cargada.aprendizajes || [];

    console.log('✅ Memoria cargada con éxito:', memoria);
} catch (err) {
    console.log('⚠️ No se pudo cargar memoria, iniciando vacía.');
}
// Guardar memoria en archivo
function guardarMemoria() {
    fs.writeFileSync('memoria.json', JSON.stringify(memoria, null, 2));
}

// Agregar un aprendizaje a la memoria
function agregarAprendizaje(texto) {
    memoria.aprendizajes.push({ fecha: new Date(), contenido: texto });
    guardarMemoria();
}

// Endpoint para configurar identidad y proyectos
app.post('/configurar', (req, res) => {
    const { identidad, proyectos } = req.body;

    memoria.portafolio.push(proyectos);
    memoria.aprendizajes.push({ fecha: new Date(), tipo: 'configuracion', contenido: identidad });

    guardarMemoria();
    res.json({ status: 'Configuración recibida', memoria });
});


// Endpoint de prueba
app.get('/', (req, res) => {
    res.send('✅ Jarvis-Libre operativo');
});

// Endpoint de status
app.get('/status', (req, res) => {
    res.json({ status: 'Activo', memoria });
});

// Endpoint para recibir identidad o configuraciones
app.post('/configurar', (req, res) => {
    const datos = req.body;
    memoria.push({ fecha: new Date(), tipo: 'configuracion', contenido: datos });
    guardarMemoria();
    res.json({ status: 'Configuración recibida', memoria });
});

// Consultar último precio de un activo
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

// Consultar resumen del día anterior (OHLC, volumen, etc.)
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

// Consultar libro de órdenes (Level 2 Market Data)
app.get('/polygon/book', async (req, res) => {
    try {
        const symbol = req.query.symbol || 'AAPL';
        const url = `https://api.polygon.io/v3/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        res.json({ status: '✅ Snapshot Market Data', data: response.data });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener snapshot' });
    }
});

// Consultar cotizaciones en tiempo real
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


// Endpoint para entrenar (guardar configuraciones y aprendizajes)
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

app.listen(PORT, () => {
    console.log(`✅ Jarvis-Libre escuchando en puerto ${PORT}`);
});