// Express主入口 - 简化版
require('dotenv').config(); // 加载环境变量

const express = require('express')
const cors = require('cors')
const app = express()
const path = require('path')

// 全局中间件
app.use(cors())
app.use(express.json())

// 禁用缓存中间件 - 防止浏览器缓存API响应
app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    next()
})

// 请求日志
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`)
    next()
})

// ========== API路由 ==========

// 引入操作日志中间件
const operationLogger = require('./middleware/operationLogger')
const { checkLogin } = require('./middleware/auth')

// 测试路由（不需要鉴权）
app.get('/api/test', (req, res) => {
    res.json({ code: 200, message: '测试成功', data: null })
})

// 认证路由（登录/获取用户信息，不需要鉴权）
app.use('/api/auth', require('./routes/auth'))

// 在鉴权之后、业务路由之前挂载操作日志中间件
// 这样req.user已经挂载，可以记录操作人信息
// 注意：要放在所有需要鉴权的路由之前，但登录路由之后
app.use('/api', checkLogin, operationLogger)

// 仪表盘统计路由
app.use('/api/dashboard', require('./routes/dashboard'))

// 班级管理路由
app.use('/api/classes', require('./routes/classes-simple'))

// 班主任路由
app.use('/api/teachers', require('./routes/teachers'))

// 成绩管理路由
app.use('/api/scores', require('./routes/scores'))

// 统计分析路由
app.use('/api/statistics', require('./routes/statistics'))

// 学生管理路由
app.use('/api/students', require('./routes/students'))

// 科目管理路由
app.use('/api/subjects', require('./routes/subjects'))

// 班级成员管理路由
app.use('/api/class-students', require('./routes/class-students'))

// 用户管理路由
app.use('/api/users', require('./routes/users'))

// 系统日志路由
app.use('/api/logs', require('./routes/logs'))

// 班级通知路由
app.use('/api/notices', require('./routes/notices'))

// ========== 静态文件和前端路由 ==========

// 提供静态文件（前端页面）
app.use(express.static('public'))

// 所有非API请求都返回index.html（支持前端路由）
app.use((req, res, next) => {
    // 如果是API请求，返回404
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({ code: 404, message: 'API接口不存在', data: null })
    }
    // 否则返回前端页面
    res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err)
    res.status(500).json({ code: 500, message: '服务器异常: ' + err.message, data: null })
})

// 引入数据库连接（用于日志清理）
const db = require('./db')

/**
 * 自动清理过期日志
 * 保留3个月内的日志，每天执行一次
 */
async function cleanupOldLogs() {
    try {
        const [result] = await db.query(
            'DELETE FROM operation_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 3 MONTH)'
        )
        if (result.affectedRows > 0) {
            console.log(`[日志清理] 删除了 ${result.affectedRows} 条过期日志（保留3个月内）`)
        } else {
            console.log('[日志清理] 暂无过期日志需要清理')
        }
    } catch (err) {
        console.error('[日志清理] 失败:', err.message)
    }
}

// 启动服务器
const PORT = 3001
app.listen(PORT, () => {
    console.log(`后端服务已启动：http://localhost:${PORT}`)
    console.log('[日志清理] 定时任务已启动：每天自动清理3个月前的日志')

    // 立即执行一次清理
    cleanupOldLogs()

    // 每24小时执行一次（每天）
    setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000)
})
