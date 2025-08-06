const CA = null;
const USER = "";    // broker.emqx.io no requiere usuario
const PASS = "";    // broker.emqx.io no requiere contraseña          
const TOPIC = "testtopic/smartbee/";  // Tópico fijo sin wildcard
const node_id = "NODO-7881883A-97A5-47E0-869C-753E99E1B168";

const db = {
    host: "crossover.proxy.rlwy.net",
    port: 23151,
    database: "railway",
    user: "root",
    password: "DwPLKjZIkHdyGcjLmnsmQIwWvDjisbBm"
};

const mqttWSS = {
    url: "wss://broker.emqx.io:8084/mqtt",  // WebSocket Secure público
    ca: CA,
    username: USER,
    password: PASS,
    topic: TOPIC,
};

const mqttTLS = {
    url: "mqtts://broker.emqx.io:8883",     // MQTT TLS público
    ca: null,
    username: USER,
    password: PASS,
    topic: TOPIC,
};

const mqttPLAIN = {
    url: "mqtt://broker.emqx.io:1883",      // MQTT plano público
    ca: null,
    username: USER,
    password: PASS,
    topic: TOPIC,
};

// Usar PLAIN para broker público (más simple y confiable)
const mqtt = mqttPLAIN;
const debug = true;

const config = {
    db,
    mqtt,
    nodo_id: node_id,
    debug
};

export default config;