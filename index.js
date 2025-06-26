require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

let memoria = {
    portafolio: [],
    aprendizajes: []
};

const archivoMemoria = './memoria.json';

if (fs.existsSync(archivoMemoria)) {
    try {
        const datos = fs.readFileSync(archivoMemoria, 'utf8');
        memoria = JSON.parse(datos);
        console.log('✅ Memoria cargada con éxito:', memoria);
    } catch (error) {
        console.error('⚠️ Error al cargar la memoria, iniciando vacía.', error);
    }
} else {
    console.log('⚠️ No se encontró memoria previa, iniciando vacía.');
}

app.use(bodyParser.json());

// Ruta POST para guardar aprendizajes
app.post('/aprender', (req, res) => {
    const { contenido } = req.body;
    if (!contenido) {
        return res.status(400).json({ error: 'El contenido es requerido.' });
    }
    const nuevoAprendizaje = { fecha: new Date(), contenido };
    memoria.aprendizajes.push(nuevoAprendizaje);

    fs.writeFileSync(archivoMemoria, JSON.stringify(memoria, null, 2));
    res.json({ mensaje: 'Aprendizaje guardado.', memoria });
});

// Ruta GET para consultar precio desde Polygon (por navegador funciona)
app.get('/consultar/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    const apiKey = process.env.POLYGON_API_KEY;

    try {
        const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${apiKey}`;
        const response = await axios.get(url);

        res.json({ mensaje: 'Consulta exitosa', data: response.data });
    } catch (error) {
        console.error('Error consultando Polygon:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Error al consultar datos de Polygon.' });
    }
});

app.listen(port, () => {
    console.log(`✅ Jarvis-Libre escuchando en puerto ${port}`);
    console.log(`🔑 Clave Polygon cargada: ${process.env.POLYGON_API_KEY}`);
});