const mysql = require('mysql2/promise')

// 从环境变量读取数据库配置
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'teaching_mgmt',
    port: parseInt(process.env.DB_PORT) || 3306,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: parseInt(process.env.DB_QUEUE_LIMIT) || 0
})

async function testDB() {
    try {
        await pool.getConnection();
        console.log('MySQL连接成功！')
    } catch (err) {
        console.log('MySQL连接失败：', err.message)
    }
}
testDB()

module.exports = pool