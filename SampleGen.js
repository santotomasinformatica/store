import { createConnection as dbConnect } from 'mysql2/promise';

class App {
    constructor() {
    }

    log(msg) {
        console.log('[', new Date(), ']', msg);
    }

    async run(inicio) {
        this.log("Iniciando Generación de Mensajes");
        let db = undefined;

        // nos conectamos a la base de datos
        try {
            this.log("Conectando a la Base de Datos");
            db = await dbConnect({
                host: "crossover.proxy.rlwy.net",
                port: 23151,
                database: "railway",
                user: "root",
                password: "DwPLKjZIkHdyGcjLmnsmQIwWvDjisbBm"
            });
            this.log("Conectado a la Base de Datos");
        } catch (err) {
            if (db)
                await db.end();
            this.log(`Error al conectar a la Base de Datos: ${err.message}`);
            return;
        }

        // iteramos sobre cada nodo
        let nodos;
        try {
            this.log('Recuperando los nodos');
            const sql = 'SELECT n.id, n.tipo FROM nodo n ORDER by n.tipo';
            const [rows] = await db.query(sql);
            nodos = rows;
        } catch (err) {
            this.log(err.message);
            await db.end();
            return;
        }

        this.log('Comenzando iteración sobre los nodos');
        for (const nodo of nodos) {
            const topico = "testtopic/smartbeee"
            let fecha = new Date(inicio);
            const fecha_fin = new Date();
            this.log(`${nodo.id}:${nodo.tipo} / ${fecha.toISOString()}:${fecha_fin.toISOString()}`);
            while (fecha <= fecha_fin) {
                const payload = {
                    'nodo_id': nodo.id,
                    'temperatura': Math.trunc((10 + Math.random() * 40) * 10) / 10,
                    'humedad': Math.trunc((20 + Math.random() * 80) * 10) / 10
                };
                if (nodo.tipo == 'COLMENA')
                    payload['peso'] = Math.trunc((20 + Math.random() * 50) * 10) / 10;

                const sql = "INSERT INTO nodo_mensaje(nodo_id, topico, payload, fecha) VALUES(?,?,?,?)";
                await db.query(sql, [nodo.id, topico, JSON.stringify(payload), fecha]);
                fecha = new Date(fecha.getTime() + 20 * 60 * 1000);
            }
        };
        await db.end();
    }
}

// --- SHow Time

const app = new App();
await app.run('2025-05-01 00:00:00');