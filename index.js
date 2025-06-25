const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.POLYGON_API_KEY;

app.use(express.json());
app.use(cors());

let memoria = {
    portafolio: [],
    aprendizajes: []
};

// Cargar memoria desde archivo si existe
try {
    const data = fs.readFileSync('memoria.json', 'utf8');
    memoria = JSON.parse(data);
    console.log('✅ Memoria cargada con éxito:', memoria);
} catch (err) {
    console.warn('⚠️ No se pudo cargar memoria, iniciando vacía.');
}

// Ruta de prueba GET directa por navegador
app.get('/', (req, res) => {
    res.send('✅ Jarvis-Libre activo y funcionando');
});

// Ruta para consultar el precio desde Polygon con GET y POST
app.route('/consultar/:symbol')
    .get(async (req, res) => {
        const symbol = req.params.symbol;
        console.log(`🔎 Consultando ${symbol}...`);
        try {
            const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${API_KEY}`;
            const respuesta = await axios.get(url);
            res.json(respuesta.data);
        } catch (error) {
            console.error('❌ Error al consultar precio:', error.response?.data || error.message);
            res.status(500).json({ error: 'Fallo al consultar el precio' });
        }
    })
    .post(async (req, res) => {
        const symbol = req.params.symbol;
        console.log(`🔎 Consultando ${symbol} por POST...`);
        try {
            const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${API_KEY}`;
            const respuesta = await axios.get(url);
            res.json(respuesta.data);
        } catch (error) {
            console.error('❌ Error al consultar precio:', error.response?.data || error.message);
            res.status(500).json({ error: 'Fallo al consultar el precio' });
        }
    });

// Ruta para guardar aprendizajes
app.post('/guardar', (req, res) => {
    const nuevo = req.body;
    nuevo.fecha = new Date().toISOString();
    memoria.aprendizajes.push(nuevo);
    fs.writeFileSync('memoria.json', JSON.stringify(memoria, null, 2));
    res.json({ mensaje: 'Aprendizaje guardado', data: nuevo });
});

app.listen(PORT, () => {
    console.log(`✅ Jarvis-Libre escuchando en puerto ${PORT}`);
    console.log(`🔑 Clave Polygon: ${API_KEY}`);
});