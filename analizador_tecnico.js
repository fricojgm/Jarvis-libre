const axios = require('axios');

// Pega tu API Key real de Polygon
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// Lista de activos del Portafolio Frico
const portafolio = ["AVGO", "SCHD", "VITA", "XLE", "GLD", "IWM", "AAPL", "MSFT"];

// Función para calcular RSI
function calcularRSI(precios, periodo = 14) {
    let ganancias = 0;
    let perdidas = 0;

    for (let i = 1; i <= periodo; i++) {
        const cambio = precios[i] - precios[i - 1];
        if (cambio > 0) ganancias += cambio;
        if (cambio < 0) perdidas -= cambio;
    }

    const promedioGanancia = ganancias / periodo;
    const promedioPerdida = perdidas / periodo;
    const rs = promedioGanancia / promedioPerdida;
    const rsi = 100 - (100 / (1 + rs));

    return rsi.toFixed(2);
}

// Función para consultar histórico y calcular RSI
async function analizarActivo(symbol) {
    try {
        const response = await axios.get(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2025-12-31?adjusted=true&sort=desc&limit=50&apiKey=${POLYGON_API_KEY}`);

        if (response.data && response.data.results) {
            const preciosCierre = response.data.results.map(candle => candle.c).reverse();

            if (preciosCierre.length >= 15) {
                const rsi = calcularRSI(preciosCierre.slice(-15));

                console.log(`\n✅ [${symbol}] - RSI: ${rsi}`);

                if (rsi > 70) {
                    console.log(`⚠️ Alerta: ${symbol} en sobrecompra`);
                } else if (rsi < 30) {
                    console.log(`💡 Oportunidad: ${symbol} en sobreventa`);
                } else {
                    console.log(`✔️ Estado técnico: Estable`);
                }
            } else {
                console.log(`⚠️ No hay suficientes datos para ${symbol}`);
            }
        } else {
            console.log(`⚠️ No se encontraron datos para ${symbol}`);
        }
    } catch (error) {
        console.error(`Error al consultar ${symbol}: ${error.message}`);
    }
}

// Función principal de monitoreo técnico
async function monitoreoTecnico() {
    console.log(`\n🔍 Análisis técnico Portafolio Frico - ${new Date().toLocaleTimeString()}`);

    for (const symbol of portafolio) {
        await analizarActivo(symbol);
    }
}

// Primer chequeo inmediato y luego cada minuto
monitoreoTecnico();
setInterval(monitoreoTecnico, 60000); // 60000ms = 1 min