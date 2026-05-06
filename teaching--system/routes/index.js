const express = require('express');
const router = express.Router();
const db = require('../db');
// 🔴 关键：从middleware引入checkLogin！解决"未定义"报错
const { checkLogin, SECRET } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// 1. 登录接口（签发JWT）
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        // 入参校验
        if (!username || !password) {
            return res.json({ code: 400, message: '账号密码不能为空', data: null });
        }

        // 查数据库（这里用测试账号，后续换真实查询）
        const [users] = await db.query(
            'SELECT id, username, real_name, role FROM users WHERE username = ? AND password_hash = SHA2(?, 256)',
            [username, password]
        );

        if (users.length === 0) {
            return res.json({ code: 401, message: '账号或密码错误', data: null });
        }

        const user = users[0];
        // 签发JWT（7天有效期）
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                realName: user.real_name,
                role: user.role
            },
            SECRET,
            { expiresIn: '7d' }
        );

        // 统一响应格式
        res.json({
            code: 200,
            message: '登录成功',
            data: {
                token,
                userInfo: {
                    id: user.id,
                    username: user.username,
                    realName: user.real_name,
                    role: user.role
                }
            }
        });
    } catch (err) {
        console.error('登录接口异常：', err);
        res.json({ code: 500, message: '服务异常', data: null });
    }
});

// 2. 校验登录态接口（/auth/me，核心闭环）
router.get('/auth/me', checkLogin, async (req, res) => {
    try {
        // req.user 是checkLogin中间件解析的token信息
        res.json({
            code: 200,
            message: '校验成功',
            data: req.user
        });
    } catch (err) {
        console.error('/auth/me 异常：', err);
        res.json({ code: 500, message: '服务异常', data: null });
    }
});

// 3. 获取班主任列表（用于下拉选择）
router.get('/teachers', checkLogin, async (req, res) => {
    try {
        const [teachers] = await db.query(
            `SELECT id, username, real_name as realName
             FROM users 
             WHERE role = 'head_teacher' AND status = 1
             ORDER BY real_name`
        );
        res.json({ code: 200, message: '查询成功', data: teachers });
    } catch (err) {
        console.error('查询班主任列表失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

// 4. 挂载班级管理路由
router.use('/classes', require('./classes-simple'));

// 导出路由
module.exports = router;