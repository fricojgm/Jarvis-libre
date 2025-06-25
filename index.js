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