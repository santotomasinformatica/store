import { readFileSync } from 'fs';

// configuración Store&Alert
const USER = "";
const PASS = "";
const TOPIC = "testtopic/smartbeee";

// configuración de la base de datos
const db = {
    host: "crossover.proxy.rlwy.net",
    port: 23151,
    database: "railway",
    user: "root",
    password: "DwPLKjZIkHdyGcjLmnsmQIwWvDjisbBm"
};

// configuraciones MQTT disponibles
const mqttWSS = {
    url: "mqtt://broker.emqx.io:1883",
    username: USER,
    password: PASS,
    topic: TOPIC,
};

const mqttTLS = {
    url: "mqtt://broker.emqx.io:1883",
    username: USER,
    password: PASS,
    topic: TOPIC,
};

const mqttPLAIN = {
    url: "mqtt://broker.emqx.io:1883",
    username: USER,
    password: PASS,
    topic: TOPIC,
};

// configuracion MQTT a utilizar
const mqtt = mqttWSS;

// para depurar en la consola
const debug = true;

// la configuracion a exportar
const config = {
    db,
    mqtt,
    debug
};

export default config;