onst express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/reporte-mercado/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const hoy = new Date().toISOString().split('T')[0];
    const apiKey = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';
    const puenteURL = `https://api.polygon.io/v1/open-close/${ticker}/${hoy}?apiKey=${apiKey}`;

    try {
        const response = await axios.get(puenteURL);
        if (response.status === 200 && response.data) {
            return res.json(response.data);
        } else {
            return res.status(502).json({
                error: true,
                mensaje: 'Error en la respuesta del puente de datos',
                detalle: response.statusText
            });
        }
    } catch (error) {
        return res.status(500).json({
            error: true,
            mensaje: 'Error al obtener los datos desde el puente',
            detalle: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});