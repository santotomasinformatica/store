import { v4 as uuidv4 } from 'uuid';
import { createConnection as dbConnect } from 'mysql2/promise';
import { connectAsync as mqttConnectAsync } from 'mqtt';

const config = {
    mqtt: {
        url: "mqtt://broker.emqx.io:1883",
        topic: "testtopic/smartbee",
        username: "",
        password: ""
    },
    db: {
        host: "crossover.proxy.rlwy.net",
        port: 23151,
        database: "railway",
        user: "root",
        password: "DwPLKjZIkHdyGcjLmnsmQIwWvDjisbBm"
    },
    debug: true
};

class Log {
    static error(msg) {
        if (config.debug) console.log(new Date(), ` - [ERROR] ${msg}`);
    }

    static info(msg) {
        if (config.debug) console.log(new Date(), ` - [INFO ] ${msg}`);
    }
}

class App {
    constructor() {
        this.db = undefined;
        this.mqttClient = undefined;
    }

    async run() {
        await this.dbConnect();
        await this.mqttConnect();
    }

    async dbConnect() {
        try {
            Log.info(`Conectando a la Base de Datos en ${config.db.host}:${config.db.port}/${config.db.database}`);
            this.db = await dbConnect({
                host: config.db.host,
                port: config.db.port,
                database: config.db.database,
                user: config.db.user,
                password: config.db.password
            });
            Log.info('Conectado a la Base de Datos');
        } catch (err) {
            if (this.db)
                await this.db.end();
            throw new Error(err.message);
        }
    }

    async mqttConnect() {
        try {
            const mqttClientId = 'STORE-APP-' + uuidv4();
            Log.info(`Conectando al Broker en ${config.mqtt.url}`);
            
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

            this.mqttClient = await mqttConnectAsync(config.mqtt.url, mqttOptions);
            Log.info('Conectado al Broker');
        }
        catch (err) {
            if (this.db)
                await this.db.end();
            throw new Error(err.message);
        }

        // algunos callback
        this.mqttClient.on('connect', () => {
            Log.info('Conectado al broker MQTT...');
        });

        this.mqttClient.on('reconnect', () => {
            Log.info('Reconectando al broker MQTT...');
        });

        this.mqttClient.on('close', () => {
            Log.info('Conexion cerrada con el broker MQTT...');
        });

        this.mqttClient.on('error', (err) => {
            Log.info(`Error con el broker MQTT:${err.message}`);
        });

        this.mqttClient.on('offline', () => {
            Log.info('Conexion offline con el broker MQTT...');
        });

        // aqui recibimos los mensajes desde los nodos
        this.mqttClient.on('message', (topic, message) => {
            // liberamos rapidamente este callback
            setImmediate(() => {
                this.processMessages(topic, message);
            });
        });

        // nos suscribimos a todos los mensajes de los nodos sensores
        this.mqttClient.subscribe(config.mqtt.topic);
        Log.info('App inicializada');
    }


    // -------------------------
    async processMessages(topic, message) {
        Log.error('Mensaje recibido');
        // preparamos el payload
        let strMessage = message.toString();
        let payload;
        try {
            payload = JSON.parse(strMessage);
        } catch (err) {
            Log.error(`    ${err.message}`);
            return;
        }

        // intentamos almacenarlo
        await this.doStore(topic, payload);

        // vemos si el mensaje gatilla una alerta
        //await this.doAlert();
    }

    // -------------------------
    async doStore(topic, payload) {
        // debe venir el id del nodo
        const nodo_id = payload.nodo_id;
        if (nodo_id == undefined) {
            Log.error('    NODO_ID no viene en el mensaje');
            return;
        }

        // el topico es fijo: testtopic/smartbee/
        const topic_ = "testtopic/smartbee";
        if (topic != topic_) {
            Log.error('    Topico es invalido');
            Log.error(`    ${topic} != ${topic_}`);
            return;
        }

        // debe venir la temperatura
        const temperatura = Number(payload.temperatura);
        if (isNaN(temperatura)) {
            Log.error('    Valor de TEMPERATURA es invalido');
            return
        }

        // debe venir la humedad
        const humedad = Number(payload.humedad);
        if (isNaN(humedad)) {
            Log.error('    Valor de HUMEDAD es invalido');
            return;
        }

        // necesitamos tipo del nodo y ubicacion (latitud/longitud)
        // las coordenadas vienen desde estacion o colmena segun el tipo
        let nodo_tipo;
        let nodo_latitud;
        let nodo_longitud;
        try {
            // primero obtenemos el tipo de nodo
            const sqlNodo = 'SELECT tipo FROM nodo WHERE id = ?';
            const [nodoRows] = await this.db.query(sqlNodo, [nodo_id]);
            if (nodoRows.length != 1) {
                Log.error('    Nodo no existe en la Base de Datos');
                Log.error(`    ${nodo_id}`);
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

            const [locationRows] = await this.db.query(locationSql, [nodo_id]);
            if (locationRows.length != 1) {
                Log.error('    No se encontro ubicacion para el nodo en la Base de Datos');
                Log.error(`    ${nodo_id} (tipo: ${nodo_tipo})`);
                return;
            }
            nodo_latitud = locationRows[0].latitud;
            nodo_longitud = locationRows[0].longitud;

        } catch (err) {
            Log.error('    Error al recuperar datos del nodo desde la Base de Datos');
            Log.error(`    ${err.message}`);
            return;
        }

        // (solo) si es COLMENA debe venir el peso
        let peso = payload.peso;
        if (nodo_tipo == "COLMENA") {
            peso = Number(peso);
            if (isNaN(peso)) {
                Log.error('    Valor de PESO es invalido para nodo COLMENA');
                return;
            }
        }
        // Para nodos ambientales, el peso es opcional y puede ser undefined
        else {
            if (peso !== undefined) {
                peso = Number(peso);
                // Si viene peso pero no es válido, lo ignoramos (no es crítico para nodos ambientales)
                if (isNaN(peso)) {
                    Log.error('    Peso presente pero inválido en nodo ambiental - ignorando');
                    peso = undefined;
                }
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
        
        // Solo agregar peso si existe y es válido
        if (peso !== undefined && !isNaN(peso)) {
            msg.peso = peso;
        }
        
        // Agregar timestamp si viene en el payload
        if (payload.timestamp) {
            msg.timestamp = payload.timestamp;
        }
        
        msg = JSON.stringify(msg);
        try {
            const sql = 'INSERT INTO nodo_mensaje(nodo_id, topico, payload) VALUES(?, ?, ?)';
            await this.db.query(sql, [nodo_id, topic, msg]);
        } catch (err) {
            Log.error(`    ${err.message}`);
            return;
        }

        // mostramos lo recibido
        Log.info('Datos almacenados en la Base de Datos');
        Log.info(`    Nodo: ${nodo_id} (${nodo_tipo})`)
        Log.info(`    Tópico: ${topic}`)
        Log.info(`    Datos: T=${temperatura}°C, H=${humedad}%${peso !== undefined ? `, P=${peso}kg` : ''}, Lat=${nodo_latitud}, Lng=${nodo_longitud}`)
        Log.info(`    Payload completo: ${msg}`)

        // eso es todo
        return;
    };
}


const app = new App();
try {
    await app.run();
    Log.info('*** Dentro del loop de eventos de Store App                  ***');
    Log.info('*** Si aplicacion finaliza debe ser reiniciada a la brevedad ***');
}
catch (err) {
    Log.error(`${err.message}`);
    Log.error('*** Reiniciar la aplicacion a la brevedad ***');
    process.exit(1);
}

/*
testtopic/smartbee
{"nodo_id":"NODO-B51D175B-9B00-4CBD-B4C1-2597C0258F26","temperatura":21.7,"humedad":41.8,"peso":100}
*/