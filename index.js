require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

app.get('/consultar', async (req, res) => {
    const simbolo = req.query.simbolo || 'AAPL';
    try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${simbolo}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error al consultar Polygon');
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});