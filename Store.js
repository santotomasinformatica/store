import { v4 as uuidv4 } from 'uuid';
import { createConnection as dbConnect } from 'mysql2/promise';
import { connectAsync as mqttConnectAsync } from 'mqtt';

//import config from "./Config.js"
import config from "./Config (Secret).js";
import Utils from './Utils.js';
Utils.logEnabled = config.debug;

let db;
let mqttClient;

Utils.logInfo("Iniciando Store App");
try {
    await app();
    Utils.logInfo("Dentro del loop de eventos de Store App");
    Utils.logInfo("*** Si aplicacion finaliza debe ser reiniciada a la brevedad ***");
}
catch (err) {
    Utils.logError(`${err.message}`);
    Utils.logError("*** Reiniciar la aplicacion a la brevedad ***");
    process.exit(1);
}

// -------------------------
async function app() {
    // nos conectamos a la base de datos
    try {
        Utils.logInfo(`Conectando a la Base de Datos en ${config.db.database}:${config.db.port}`);
        db = await dbConnect({
            host: config.db.host,
            port: config.db.port,
            database: config.db.database,
            user: config.db.user,
            password: config.db.password
        });
        Utils.logInfo("Conectado a la Base de Datos");
    } catch (err) {
        throw new Error(`Error al conectar a la Base de Datos: ${err.message}`);
    }

    // nos conectamos al servidor mqtt
    try {
        const mqttClientId = 'STORE-APP-' + uuidv4();
        Utils.logInfo(`Conectando al Broker en ${config.mqtt.url}`);
        
        // Configuración para broker público
        const mqttOptions = {
            clientId: mqttClientId,
            clean: true,
            connectTimeout: 4000,
            reconnectPeriod: 1000,
            rejectUnauthorized: false  // Para broker público
        };

        // Solo agregar credenciales si están definidas y no vacías
        if (config.mqtt.username && config.mqtt.username.trim() !== '') {
            mqttOptions.username = config.mqtt.username;
        }
        if (config.mqtt.password && config.mqtt.password.trim() !== '') {
            mqttOptions.password = config.mqtt.password;
        }
        if (config.mqtt.ca) {
            mqttOptions.ca = config.mqtt.ca;
        }

        mqttClient = await mqttConnectAsync(config.mqtt.url, mqttOptions);
        Utils.logInfo('Conectado al Broker');
    }
    catch (err) {
        await db.end();
        throw new Error(`Error al conectar con el Broker: ${err.message}`);
    }

    // algunos callback
    mqttClient.on('connect', () => {
        Utils.logInfo('Conectado al broker MQTT...');
    });

    mqttClient.on('reconnect', () => {
        Utils.logInfo('Reconectando al broker MQTT...');
    });

    mqttClient.on('close', () => {
        Utils.logInfo('Conexion cerrada con el broker MQTT...');
    });

    mqttClient.on('error', (err) => {
        Utils.logInfo(`Error con el broker MQTT:${err.message}`);
    });

    mqttClient.on('offline', () => {
        Utils.logInfo('Conexion offline con el broker MQTT...');
    });

    // aqui recibimos los mensajes desde los nodos
    mqttClient.on('message', (topic, message) => {
        // liberamos rapidamente este callback
        setImmediate(() => {
            processMessages(topic, message);
        });
    });

    // nos suscribimos a todos los mensajes de los nodos sensores
    Utils.logInfo(`Suscribiéndose al tópico: ${config.mqtt.topic}`);
    mqttClient.subscribe(config.mqtt.topic);
}

// -------------------------
async function processMessages(topic, message) {
    // preparamos el payload
    let strMessage = message.toString();
    let payload;
    try {
        payload = JSON.parse(strMessage);
    } catch (err) {
        Utils.logError("Mensaje recibido desde el broker MQTT no es valido:");
        Utils.logError(`    ${message}`);
        return;
    }

    Utils.logInfo(`Mensaje recibido en tópico: ${topic}`);
    Utils.logInfo(`Payload: ${strMessage}`);

    // intentamos almacenarlo
    await doStore(topic, payload);
}

// -------------------------
async function doStore(topic, payload) {
    // debe venir el id del nodo
    const nodo_id = payload.nodo_id;
    if (nodo_id == undefined) {
        Utils.logError("NODO_ID no viene en el mensaje");
        return;
    }

    // el topico tiene una nueva regla de formación: testtopic/smartbee/{nodo_id}
    const topic_ = "testtopic/smartbee/";
    if (topic != topic_) {
        Utils.logError("Topico es invalido:");
        Utils.logError(`    Recibido: ${topic}`);
        Utils.logError(`    Esperado: ${topic_}`);
        return;
    }

    // debe venir la temperatura
    const temperatura = Number(payload.temperatura);
    if (isNaN(temperatura)) {
        Utils.logError("Valor de TEMPERATURA es invalido");
        return;
    }

    // debe venir la humedad
    const humedad = Number(payload.humedad);
    if (isNaN(humedad)) {
        Utils.logError("Valor de HUMEDAD es invalido");
        return;
    }

    // necesitamos tipo del nodo y ubicacion (latitud/longitud)
    // el nodo debe existir en la base de datos
    // las coordenadas vienen desde estacion o colmena segun el tipo
    let nodo_tipo;
    let nodo_latitud;
    let nodo_longitud;
    try {
        // primero obtenemos el tipo de nodo
        const sqlNodo = 'SELECT tipo FROM nodo WHERE id = ?';
        const [nodoRows] = await db.query(sqlNodo, [nodo_id]);
        if (nodoRows.length != 1) {
            Utils.logError("Nodo no existe en la Base de Datos:");
            Utils.logError(`    ${nodo_id}`);
            return;
        }
        nodo_tipo = nodoRows[0].tipo;

        // ahora obtenemos las coordenadas segun el tipo de nodo
        let locationSql;
        if (nodo_tipo == "COLMENA") {
            locationSql = 'SELECT c.latitud, c.longitud ' +
                'FROM nodo_colmena nc ' +
                'INNER JOIN colmena c ON nc.colmena_id = c.id ' +
                'WHERE nc.nodo_id = ?';
        } else {
            // asumimos que es tipo ESTACION o similar
            locationSql = 'SELECT e.latitud, e.longitud ' +
                'FROM nodo_estacion ne ' +
                'INNER JOIN estacion e ON ne.estacion_id = e.id ' +
                'WHERE ne.nodo_id = ?';
        }

        const [locationRows] = await db.query(locationSql, [nodo_id]);
        if (locationRows.length != 1) {
            Utils.logError("No se encontro ubicacion para el nodo en la Base de Datos:");
            Utils.logError(`    ${nodo_id} (tipo: ${nodo_tipo})`);
            return;
        }
        nodo_latitud = locationRows[0].latitud;
        nodo_longitud = locationRows[0].longitud;

    } catch (err) {
        Utils.logError("Error al recuperar datos del nodo desde la Base de Datos:");
        Utils.logError(`    ${err.message}`);
        return;
    }

    // (solo) si es COLMENA debe venir el peso
    let peso = payload.peso;
    if (nodo_tipo == "COLMENA") {
        peso = Number(peso);
        if (isNaN(peso)) {
            Utils.logError("Valor de PESO es invalido");
            return;
        }
    }
    else {
        if (peso != undefined) {
            Utils.logError("PESO no es valido para este nodo");
            return;
        }
    }

    // almacenamos en la BD
    let msg = {
        nodo_id: nodo_id,
        temperatura: temperatura,
        humedad: humedad,
        latitud: nodo_latitud,
        longitud: nodo_longitud
    }
    if (nodo_tipo == "COLMENA")
        msg.peso = peso;
    
    // Agregar timestamp si viene en el payload
    if (payload.timestamp) {
        msg.timestamp = payload.timestamp;
    }
    
    msg = JSON.stringify(msg);
    try {
        const sql = "INSERT INTO nodo_mensaje(nodo_id, topico, payload) VALUES(?, ?, ?)";
        await db.query(sql, [nodo_id, topic, msg]);
    } catch (err) {
        Utils.logError(`Error al insertar mensaje en la Base de Datos:`);
        Utils.logError(`    ${err.message}`);
        return;
    }

    // mostramos lo recibido
    Utils.logInfo("✅ Datos almacenados en la Base de Datos:");
    Utils.logInfo(`    Nodo: ${nodo_id} (${nodo_tipo})`)
    Utils.logInfo(`    Tópico: ${topic}`)
    Utils.logInfo(`    Datos: T=${temperatura}°C, H=${humedad}%, ${nodo_tipo === 'COLMENA' ? `P=${peso}kg, ` : ''}Lat=${nodo_latitud}, Lng=${nodo_longitud}`)
    Utils.logInfo(`    Payload completo: ${msg}`)

    // eso es todo
    return;
};