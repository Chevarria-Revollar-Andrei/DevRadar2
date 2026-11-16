
// ==========================================
// CONFIGURACION DE LA BASE DE DATOS MYSQL
// ==========================================

const mysql = require('mysql2/promise');
require('dotenv').config();

// Creamos un pool de conexiones para MySQL.
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'devradar',

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Comprobamos la conexion con MySQL.
db.getConnection()
    .then(connection => {
        console.log('MYSQL conectado correctamente a DevRadar');
        connection.release();
    })
    .catch(error => {
        console.error('Error al conectar con MySQL:', error.message);
    });

module.exports = db;
