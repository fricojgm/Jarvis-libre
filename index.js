require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Memoria inicial (se ampliará a permanente)
let memoria = {
  portafolio: [],
  aprendizajes: [],
};

// Endpoint de prueba
app.get('/', (req, res) => {
  res.send('Jarvis-Libre operativo');
});

// Endpoint de status
app.get('/status', (req, res) => {
  res.json({ status: 'Activo', memoria });
});

// Endpoint para consultar acciones en Polygon
app.get('/acciones/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const response = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Error consultando Polygon', detalle: error.message });
  }
});

// Endpoint para entrenamiento
app.use(express.json());
app.post('/entrenamiento', (req, res) => {
  const { tipo, contenido } = req.body;
  if (tipo === 'portafolio') {
    memoria.portafolio = contenido;
    return res.json({ mensaje: 'Portafolio actualizado', memoria });
  }
  if (tipo === 'aprendizaje') {
    memoria.aprendizajes.push(contenido);
    return res.json({ mensaje: 'Aprendizaje almacenado', memoria });
  }
  res.status(400).json({ error: 'Tipo de entrenamiento no reconocido' });
});

// Servidor activo
app.listen(PORT, () => {
  console.log(`Jarvis-Libre activo en puerto ${PORT}`);
});