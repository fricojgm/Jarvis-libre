const express = require('express');
const axios = require('axios');
const app = express();

const PORT = process.env.PORT || 3000;

// 🔑 Reemplaza esto por tu API Key real de Polygon
const POLYGON_API_KEY = '8afDJ382kd83klFja8sd832';

app.get('/', (req, res) => {
  res.send('Jarvis-Libre está operativo');
});

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
        status: "DELAYED" // Por tu plan Stock Developer de Polygon
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

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
