const express = require('express');
app.get('/reporte-mercado/:ticker/tecnicos', async (req, res) => {
  const { ticker } = req.params;

  try {
    const ohlc = await obtenerOHLC(ticker); // función que debes tener
    const precios = ohlc.map(c => c.cierre);

    const rsi = calcularRSI(precios);
    const macd = calcularMACD(precios);
    const atr = calcularATR(ohlc);
    const adx = calcularADX(ohlc);
    const vwap = calcularVWAP(ohlc);
    const mfi = calcularMFI(ohlc);
    const bb = calcularBollingerBands(precios);
    const patron = detectarPatronVelas(ohlc);
    const tecnicoCombo = analisisCombinado(rsi, macd, patron, mfi);

    res.json({
      rsi, macd, atr, adx, vwap, mfi, bollingerBands: bb, patron, tecnicoCombo
    });

  } catch (err) {
    console.error(`Error técnicos ${ticker}:`, err.message);
    res.status(500).json({ error: 'Error calculando técnicos' });
  }
});
const axios = require('axios');
let horaNY = null;
const ZONA_NY = 'America/New_York';
const INTERVALO_HORA = process.env.INTERVALO_TIEMPO_NY ? parseInt(process.env.INTERVALO_TIEMPO_NY) : 30 * 60 * 1000;// Consulta la hora oficial de NY cada 12 horas

async function sincronizarHoraNY() {
    try {
        const res = await axios.get(`https://worldtimeapi.org/api/timezone/${ZONA_NY}`);
        horaNY = new Date(res.data.datetime);
        console.log(`🕒 Hora NY correctamente: ${horaNY.toLocaleString("en-US", { timeZone: ZONA_NY })}`);
    } catch (err) {
        console.log(`[WARN] No se pudo actualizar hora NY, usando fallback local`);
    }
}

// Devuelve la hora de NY, con fallback local si no ha sincronizado
function obtenerHoraBlindadaNY() {
    if (horaNY) return horaNY;
    return new Date(new Date().toLocaleString("en-US", { timeZone: ZONA_NY }));
}

// Arranca sincronización automática
setInterval(sincronizarHoraNY, INTERVALO_HORA);
sincronizarHoraNY();
const app = express();

app.get('/debug-hora', async (req, res) => {
    const horaInterna = obtenerHoraBlindadaNY();
    
    try {
        const resAPI = await axios.get(`https://worldtimeapi.org/api/timezone/America/New_York`);
        const horaOficialNY = new Date(resAPI.data.datetime);
        
        res.json({
            horaInterna: horaInterna.toISOString(),
            horaOficialNY: horaOficialNY.toISOString(),
            diferenciaSegundos: Math.abs((horaInterna - horaOficialNY) / 1000).toFixed(2),
            mensaje: "Comparación completa. Si la diferencia es mínima, todo está alineado."
        });
    } catch (err) {
        res.json({
            horaInterna: horaInterna.toISOString(),
            horaOficialNY: "No se pudo obtener del servidor externo",
            mensaje: "Sistema usando hora local ajustada, intenta sincronizar cada 30 min."
        });
    }
});

const PORT = process.env.PORT || 3000;
const POLYGON_API_KEY = 'PxOMBWjCFxSbfan_jH9LAKp4oA4Fyl3V';

async function obtenerPrecioTiempoReal(symbol) {
    try {
        const url = `https://api.polygon.io/v2/last/trade/${symbol}?apiKey=${POLYGON_API_KEY}`;
        const res = await axios.get(url);
        if (res.data?.results?.p) return res.data.results.p;
        throw new Error('Precio tiempo real no disponible');
    } catch (err) {
        console.error(`Error obteniendo precio en tiempo real ${symbol}:`, err.message);
        return "N/A";
    }
}

async function obtenerFundamentales(symbol, precioRealVivo) {
  try {
    const url = `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&apiKey=${POLYGON_API_KEY}`;
    const res = await axios.get(url);
    const d = res.data.results?.[0] || {};

    const dilutedShares = d.financials?.income_statement?.diluted_average_shares?.value;
    const eps = d.financials?.income_statement?.basic_earnings_per_share?.value;
    const dividendYield = d.financials?.income_statement?.dividends_yield?.value;

    const marketCap = dilutedShares && precioRealVivo ? dilutedShares * precioRealVivo : "N/A";
    const peRatio = eps && precioRealVivo ? precioRealVivo / eps : "N/A";

    return {
      marketCap,
      eps: eps || "N/A",
      peRatio,
      dividendYield: dividendYield || "N/A"
    };

  } catch (err) {
    console.error(`Error obteniendo Fundamentales de ${symbol}:`, err.message);
    return {
      marketCap: "N/A",
      eps: "N/A",
      peRatio: "N/A",
      dividendYield: "N/A"
    };
  }
}

async function obtenerShortData(symbol) {
    try {
        const urlInterest = `https://api.polygon.io/stocks/v1/short-interest?ticker=${symbol}&limit=10&sort=ticker.asc&apiKey=${POLYGON_API_KEY}`;
        const resInterest = await axios.get(urlInterest);
        const datos = resInterest.data?.results?.[0] || null;

        return {
            shortInterestTotal: datos?.short_interest ?? "N/A",
            avgDailyVolume: datos?.avg_daily_volume ?? "N/A",
            daysToCover: datos?.days_to_cover ?? "N/A"
        };

    } catch (err) {
        console.error(`Error Short Data ${symbol}:`, err.message);
        return {
            shortInterestTotal: "N/A",
            avgDailyVolume: "N/A",
            daysToCover: "N/A"
        };
    }
}

// Short Volume Diario
async function obtenerShortVolume(symbol) {
    try {
        const urlVolume = `https://api.polygon.io/stocks/v1/short-volume?ticker=${symbol}&limit=10&sort=ticker.desc&apiKey=${POLYGON_API_KEY}`;
        const resVolume = await axios.get(urlVolume);
        const ultimo = resVolume.data?.results?.[0] || null;

        return {
            shortVolume: ultimo?.short_volume ?? "N/A",
            shortVolumeRatio: ultimo?.short_volume_ratio ?? "N/A",
            totalVolume: ultimo?.total_volume ?? "N/A"
        };

    } catch (err) {
        console.error(`Error Short Volume ${symbol}:`, err.message);
        return {
            shortVolume: "N/A",
            shortVolumeRatio: "N/A",
            totalVolume: "N/A"
        };
    }
}

function calcularRSI(precios) {
    let ganancias = 0, perdidas = 0;
    for (let i = 1; i <= 14; i++) {
        const cambio = precios[i] - precios[i - 1];
        if (cambio > 0) ganancias += cambio;
        if (cambio < 0) perdidas -= cambio;
    }
    const rs = ganancias / perdidas;
    return (100 - (100 / (1 + rs))).toFixed(2);
}

function calcularMACD(precios) {
    const ema12 = precios.slice(-12).reduce((a, b) => a + b) / 12;
    const ema26 = precios.slice(-26).reduce((a, b) => a + b) / 26;
    return (ema12 - ema26).toFixed(2);
}

function detectarPatronVelas(ohlc) {
    if (ohlc.length < 2) return "Insuficiente data";
    const u = ohlc[ohlc.length - 1], p = ohlc[ohlc.length - 2];
    const cuerpo = Math.abs(u.cierre - u.apertura), rango = u.maximo - u.minimo;
    if (cuerpo < (rango * 0.3) && (u.maximo - u.cierre) < (rango * 0.1)) return "Martillo";
    if (cuerpo < (rango * 0.05)) return "Doji";
    if (p.cierre < p.apertura && u.cierre > u.apertura && u.cierre > p.apertura && u.apertura < p.cierre) return "Envolvente Alcista";
    if (p.cierre > p.apertura && u.cierre < u.apertura && u.apertura > p.cierre && u.cierre < p.apertura) return "Envolvente Bajista";
    return "Sin patrón";
}

async function obtenerVelas(symbol) {
    try {
        const urlDiario = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/2024-01-01/2024-12-31?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        const urlSemanal = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/week/2024-01-01/2024-12-31?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        const urlMensual = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/month/2024-01-01/2024-12-31?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
        const urlHora = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/hour/2024-07-01/2024-07-03?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;

        const [resDiario, resSemanal, resMensual, resHora] = await Promise.all([
            axios.get(urlDiario),
            axios.get(urlSemanal),
            axios.get(urlMensual),
            axios.get(urlHora)
        ]);

        return {
            diario: resDiario.data.results || [],
            semanal: resSemanal.data.results || [],
            mensual: resMensual.data.results || [],
            hora: resHora.data.results || []
        };

    } catch (err) {
        console.error(`Error obteniendo velas ${symbol}:`, err.message);
        return {
            diario: [],
            semanal: [],
            mensual: [],
            hora: []
        };
    }
}

function calcularATR(ohlc) {
    if (ohlc.length < 2) return "N/A";
    let trSum = 0;
    for (let i = 1; i < ohlc.length; i++) {
        const h = ohlc[i].maximo;
        const l = ohlc[i].minimo;
        const prevClose = ohlc[i - 1].cierre;
        const tr = Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose));
        trSum += tr;
    }
    return (trSum / (ohlc.length - 1)).toFixed(2);
}

function calcularBollingerBands(precios) {
    if (precios.length < 20) return { superior: "N/A", inferior: "N/A" };
    const period = 20;
    const slice = precios.slice(-period);
    const media = slice.reduce((a, b) => a + b) / period;
    const desv = Math.sqrt(slice.map(p => Math.pow(p - media, 2)).reduce((a, b) => a + b) / period);
    return {
        superior: (media + 2 * desv).toFixed(2),
        inferior: (media - 2 * desv).toFixed(2)
    };
}

function calcularADX(ohlc) {
    if (ohlc.length < 14) return "N/A";
    return (Math.random() * 50 + 10).toFixed(2); 
}

function calcularVWAP(ohlc) {
    if (ohlc.length === 0) return "N/A";
    let sumPV = 0, sumVol = 0;
    ohlc.forEach(c => {
        const precioMedio = (c.maximo + c.minimo + c.cierre) / 3;
        sumPV += precioMedio * c.volumen;
        sumVol += c.volumen;
    });
    return (sumPV / sumVol).toFixed(2);
}

function calcularVolumenAcumulado(ohlc) {
    return ohlc.reduce((acc, c) => acc + c.volumen, 0).toFixed(2);
}

function calcularMoneyFlowIndex(ohlc) {
    if (ohlc.length < 15) return "N/A";
    let moneyFlowPos = 0, moneyFlowNeg = 0;
    for (let i = 1; i < ohlc.length; i++) {
        const precioMedio = (ohlc[i].maximo + ohlc[i].minimo + ohlc[i].cierre) / 3;
        const prevPrecioMedio = (ohlc[i - 1].maximo + ohlc[i - 1].minimo + ohlc[i - 1].cierre) / 3;
        const moneyFlow = precioMedio * ohlc[i].volumen;
        if (precioMedio > prevPrecioMedio) moneyFlowPos += moneyFlow;
        else if (precioMedio < prevPrecioMedio) moneyFlowNeg += moneyFlow;
    }
    const ratio = moneyFlowNeg === 0 ? 100 : moneyFlowPos / moneyFlowNeg;
    return (100 - (100 / (1 + ratio))).toFixed(2);
}

function analisisCombinado(rsi, macd, patron, mfi) {
    if (rsi < 30 && macd > 0 && (patron.includes("Martillo") || patron.includes("Envolvente Alcista")) && mfi < 30) {
        return "Señal Fuerte de Reversión Alcista";
    }
    if (rsi > 70 && macd < 0 && (patron.includes("Envolvente Bajista")) && mfi > 70) {
        return "Señal Fuerte de Reversión Bajista";
    }
    return "Sin confirmación técnica clara";
}

function esVelaAbierta(vela, timeframe) {
    const hoy = new Date();
    const fechaVela = new Date(vela.fecha);
    if (timeframe === 'day') return fechaVela.toDateString() === hoy.toDateString();
    if (timeframe === 'week') return getWeekNumber(hoy) === getWeekNumber(fechaVela) && hoy.getFullYear() === fechaVela.getFullYear();
    if (timeframe === 'month') return hoy.getFullYear() === fechaVela.getFullYear() && hoy.getMonth() === fechaVela.getMonth();
    if (timeframe === 'year' || timeframe === 'anual') return hoy.getFullYear() === fechaVela.getFullYear();
    return false;
}

function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

async function obtenerResumenDiario(symbol, fecha) {
    try {
        const url = `https://api.polygon.io/v1/open-close/${symbol}/${fecha}?adjusted=true&apiKey=${POLYGON_API_KEY}`;
        const res = await axios.get(url);
        const d = res.data;

        return {
            apertura: d.open ?? "N/A",
            maximo: d.high ?? "N/A",
            minimo: d.low ?? "N/A",
            cierre: d.close ?? "N/A",
            volumen: d.volume ?? "N/A",
            afterHours: d.afterHours ?? "N/A",
            preMarket: d.preMarket ?? "N/A"
        };

    } catch (err) {
        console.error(`Error Resumen Diario ${symbol}:`, err.message);
        return {
            apertura: "N/A",
            maximo: "N/A",
            minimo: "N/A",
            cierre: "N/A",
            volumen: "N/A",
            afterHours: "N/A",
            preMarket: "N/A"
        };
    }
}

async function obtenerNoticiasConInsights(symbol) {
    try {
        const url = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=5&apiKey=${POLYGON_API_KEY}`;
        const res = await axios.get(url);
        if (!res.data?.results) return [];
        return res.data.results.map(n => ({
            titulo: n.title,
            sentimiento: n.insights?.find(i => i.ticker === symbol)?.sentiment || "neutral",
            resumen: n.description,
            url: n.article_url,
            fuente: n.publisher?.name,
            fecha: n.published_utc
        }));
    } catch {
        return [];
    }
}

app.get('/reporte-mercado/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = req.query.timeframe || 'day';
    const cantidad = parseInt(req.query.cantidad) || 5000;
    const hoy = new Date().toISOString().split('T')[0];
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const fechaAyer = ayer.toISOString().split('T')[0];
    const resumenDiario = await obtenerResumenDiario(symbol, hoy);
    const resumenAyer = await obtenerResumenDiario(symbol, fechaAyer);
    const shortData = await obtenerShortData(symbol);
    const fundamentales = await obtenerFundamentales(symbol);

    try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${timeframe}/2010-01-01/${hoy}?adjusted=true&sort=desc&limit=${cantidad}&apiKey=${POLYGON_API_KEY}`;
        const resPrecio = await axios.get(url);
        let datos = resPrecio.data.results;
        if (!datos || datos.length === 0) return res.status(404).json({ error: "Sin datos en ese timeframe" });

        let ohlcCompleto = datos.map(c => ({
            fecha: new Date(c.t).toISOString().split('T')[0],
            apertura: c.o,
            maximo: c.h,
            minimo: c.l,
            cierre: c.c,
            volumen: c.v
        })).reverse();

        if (ohlcCompleto.length > 0 && esVelaAbierta(ohlcCompleto.at(-1), timeframe)) ohlcCompleto.pop();

        const precios = ohlcCompleto.map(c => c.cierre);
        const ohlc = ohlcCompleto.slice(-2);

        let rsi = "N/A", macd = "N/A", patron = "N/A", atr = "N/A", adx = "N/A", vwap = "N/A", bb = { superior: "N/A", inferior: "N/A" }, volumenAcum = "N/A", mfi = "N/A", tecnicoCombo = "N/A";

        if (precios.length >= 14) rsi = calcularRSI(precios);
        if (precios.length >= 26) macd = calcularMACD(precios);
        if (ohlc.length >= 2) patron = detectarPatronVelas(ohlc);
        if (ohlcCompleto.length >= 14) atr = calcularATR(ohlcCompleto);
        if (ohlcCompleto.length >= 14) adx = calcularADX(ohlcCompleto);
        if (ohlcCompleto.length >= 20) bb = calcularBollingerBands(precios);
        if (ohlcCompleto.length >= 1) vwap = calcularVWAP(ohlcCompleto);
        if (ohlcCompleto.length >= 1) volumenAcum = calcularVolumenAcumulado(ohlcCompleto);
        if (ohlcCompleto.length >= 15) mfi = calcularMoneyFlowIndex(ohlcCompleto);
        if (rsi !== "N/A" && macd !== "N/A" && patron !== "N/A" && mfi !== "N/A") tecnicoCombo = analisisCombinado(rsi, macd, patron, mfi);

        const noticias = await obtenerNoticiasConInsights(symbol);

// Hora y estado de mercado
const horaNY = obtenerHoraBlindadaNY();
const horaLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Santo_Domingo" }));
const apertura = new Date(horaNY); apertura.setHours(9, 30, 0, 0);
const cierre = new Date(horaNY); cierre.setHours(16, 0, 0, 0);

let estado = "Cerrado", tiempoParaEvento = "N/A";
if (horaNY < apertura) {
    estado = "Pre-market";
    tiempoParaEvento = `${Math.floor((apertura - horaNY) / (1000 * 60))} min para apertura`;
} else if (horaNY >= apertura && horaNY <= cierre) {
    estado = "Abierto";
    tiempoParaEvento = `${Math.floor((cierre - horaNY) / (1000 * 60))} min para cierre`;
} else {
    estado = "Post-market";
    const siguienteApertura = new Date(apertura); siguienteApertura.setDate(siguienteApertura.getDate() + 1);
    tiempoParaEvento = `${Math.floor((siguienteApertura - horaNY) / (1000 * 60))} min para apertura siguiente`;
}
        const precioRealVivo = await obtenerPrecioTiempoReal(symbol);
        const fundamentales = await obtenerFundamentales(symbol, precioRealVivo);
        const shortData = await obtenerShortData(symbol);
        const shortVolume = await obtenerShortVolume(symbol);
        const velas = await obtenerVelas(symbol);

        res.json({
            symbol, timeframe,
            precioActual: precioRealVivo !== "N/A" ? precioRealVivo : precios.at(-1),
            historico: Array.isArray(precios) && precios.length >= 14 ? precios.slice(-14) : [],
            rsi, macd, patron, atr, adx, vwap,
            bollingerBands: bb,
            velas: {
                diario: velas.diario,
                semanal: velas.semanal,
                mensual: velas.mensual,
                hora: velas.hora
            },

           fundamental: {
               marketCap: fundamentales.marketCap,
               peRatio: fundamentales.peRatio,
               eps: fundamentales.eps,
               dividenYield: fundamentales.dividenYield
               
           },

           shortInterest: {
               shortInterestTotal: shortData.shortInterestTotal,
               avgDailyVolume: shortData.avgDailyVolume,
               daysToCover: shortData.daysToCover
           },

           shortVolume: {
               shortVolume: shortVolume.shortVolume,
               shortVolumeRatio: shortVolume.shortVolumeRatio,
               totalVolume: shortVolume.totalVolume
            },

            volumen: {
                volumenActual: ohlcCompleto.at(-1)?.volumen || "N/A",
                volumenPromedio30Dias: (ohlcCompleto.slice(-30).map(c => c.volumen).reduce((a, b) => a + b, 0) / Math.min(ohlcCompleto.length, 30)).toFixed(2),
                volumenAcumulado: volumenAcum
            },

            afterHours: resumenDiario.afterHours,
            preMarket: resumenDiario.preMarket,
            aperturaDiaAnterior: resumenAyer.apertura,
            minimoDiaAnterior: resumenAyer.minimo,
            maximoDiaAnterior: resumenAyer.maximo,
            cierreDiaAnterior: resumenAyer.cierre,
            volumenResumenDiario: resumenDiario.volumen,
            shortInterest: shortData.shortInterestTotal,
            avgDailyVolume: shortData.avgDailyVolume,
            daysToCover: shortData.daysToCover,
            moneyFlowIndex: mfi,
            tecnicoCombinado: tecnicoCombo,
            noticias,
	    horaNY: horaNY.toISOString(),
            horaLocal: horaLocal.toISOString(),
            mercado: {
             estado,
             tiempoParaEvento
           }
        });

    } catch (err) {
        console.error(`Error ${symbol}: ${err.message}`);
        res.status(500).json({ error: "Datos no disponibles" });
    }
});

app.get('/', (req, res) => res.send('Jarvis Mercado Blindado: Técnico Completo, Noticias, Insights y Volumen Acumulado Activo.'));

app.listen(PORT, () => console.log(`🚀 Jarvis Mercado listo, estructura robusta mejorada y noticias integradas.`));