const axios = require('axios');

// Reemplaza esta clave por tu API Key real de Polygon
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

// Activos de tu Portafolio Frico Estructurado
const portafolio = ["AVGO", "SCHD", "VITA", "XLE", "GLD", "IWM", "AAPL", "MSFT"];

// Función para consultar cada activo
async function consultarActivo(symbol) {
    try {
        const response = await axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`);
        const data = response.data;

        if (data && data.status === 'OK' && data.ticker) {
            const ticker = data.ticker;

            console.log(`\n✅ [${symbol}]`);
            console.log(`Precio Actual: $${ticker.lastTrade.p}`);
            console.log(`Precio Apertura: $${ticker.day.o}`);
            console.log(`Máximo Día: $${ticker.day.h}`);
            console.log(`Mínimo Día: $${ticker.day.l}`);
            console.log(`Último Cierre: $${ticker.prevDay.c}`);
            console.log(`Volumen Día: ${ticker.day.v}`);

            const variacion = (((ticker.lastTrade.p - ticker.prevDay.c) / ticker.prevDay.c) * 100).toFixed(2);
            console.log(`Variación % desde cierre anterior: ${variacion}%`);

            if (variacion <= -2) {
                console.log(`⚠️ Alerta: ${symbol} está cayendo más de 2%`);
            }
            if (variacion >= 2) {
                console.log(`💡 Oportunidad: ${symbol} está subiendo más de 2%`);
            }
        } else {
            console.log(`⚠️ No se encontraron datos para ${symbol}`);
        }
    } catch (error) {
        console.error(`Error al consultar ${symbol}: ${error.message}`);
    }
}

// Función principal que consulta todo el portafolio
async function monitorearPortafolio() {
    console.log(`\n🔄 Monitoreo del Portafolio Frico a las ${new Date().toLocaleTimeString()}`);

    for (const symbol of portafolio) {
        await consultarActivo(symbol);
    }
}

// Ejecución inicial y luego cada minuto
monitorearPortafolio();
setInterval(monitorearPortafolio, 60000); // 60000ms = 1 minuto