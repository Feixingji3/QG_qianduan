//认证路由

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db');
const { writeOperationLog } = require('../utils/logWriter');
const { checkLogin } = require('../middleware/auth');

// 从环境变量读取JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'TEACHING_SYSTEM_2025_FALLBACK';

// 登录接口
router.post('/login', async (req, res) => {
    try {
        // 1. 获取请求参数
        const { username, password } = req.body;
        // 2. 查询数据库验证用户名密码
        // 密码使用SHA256加密后比对
        const [users] = await db.query(
            'SELECT id, username, real_name, role FROM users WHERE username = ? AND password_hash = SHA2(?, 256)',
            [username, password]
        );
        // 3. 验证结果处理
        if (users.length === 0) {
            return res.json({ code: 401, message: '账号或密码错误', data: null });
        }

        const user = users[0];
        // 4. 签发JWT Token
        const token = jwt.sign(
            { id: user.id, username: user.username, realName: user.real_name, role: user.role },
            JWT_SECRET,             // 密钥
            { expiresIn: '7d' }
        );

        // 查询学生班级ID（用于日志权限筛选）
        let targetClassId = null;
        if (user.role === 'student') {
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );
            if (studentClasses.length > 0) {
                targetClassId = studentClasses[0].class_id;
            }
        }

        // 记录登录日志（手动写入，因为此时req.user尚未挂载）
        await writeOperationLog({
            userId: user.id,
            role: user.role,
            actionType: '登录',
            targetType: '系统',
            targetId: null,
            targetClassId: targetClassId,
            content: `用户登录成功：${user.real_name}（${user.username}）`,
            ipAddress: req.ip
        });

        res.json({
            code: 200,
            message: '登录成功',
            data: {
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    realName: user.real_name,
                    role: user.role
                }
            }
        });
    } catch (err) {
        console.error('登录失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

// 获取当前登录用户信息
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.json({ code: 401, message: '未登录', data: null });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        // 查询最新用户信息
        const [users] = await db.query(
            'SELECT id, username, real_name, role FROM users WHERE id = ? AND status = 1',
            [decoded.id]
        );

        if (users.length === 0) {
            return res.json({ code: 401, message: '用户不存在或已被禁用', data: null });
        }

        const user = users[0];
        res.json({
            code: 200,
            message: '获取成功',
            data: {
                id: user.id,
                username: user.username,
                realName: user.real_name,
                role: user.role
            }
        });
    } catch (err) {
        console.error('获取用户信息失败:', err);
        res.json({ code: 401, message: 'token无效或已过期', data: null });
    }
});

// 退出登录接口 - 记录退出日志
router.post('/logout', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        // 记录退出日志
        await writeOperationLog({
            userId: user.id,
            role: user.role,
            actionType: '登出',
            targetType: '系统',
            targetId: null,
            targetClassId: null,
            content: `用户退出登录：${user.realName || user.username}（${user.username}）`,
            ipAddress: req.ip
        });

        res.json({ code: 200, message: '退出成功', data: null });
    } catch (err) {
        console.error('记录退出日志失败:', err);
        // 即使记录失败也返回成功，不影响退出
        res.json({ code: 200, message: '退出成功', data: null });
    }
});

module.exports = router;
