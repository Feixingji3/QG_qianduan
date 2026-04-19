//学生管理路由

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');

// 查询学生列表
router.get('/', checkLogin, async (req, res) => {
    try {
        const { keyword, classId } = req.query;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const offset = (page - 1) * pageSize;

        let whereClause = 'WHERE u.role = "student" AND u.status = 1';
        const params = [];

        if (keyword) {
            whereClause += ' AND (u.real_name LIKE ? OR u.username LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        if (classId) {
            whereClause += ' AND cs.class_id = ?';
            params.push(classId);
        }

        const [students] = await db.query(
            `SELECT
                u.id,
                u.username,
                u.real_name as realName,
                c.class_name as className,
                c.id as classId
             FROM users u
             LEFT JOIN class_students cs ON u.id = cs.student_user_id AND cs.status = 1
             LEFT JOIN classes c ON cs.class_id = c.id
             ${whereClause}
             ORDER BY u.id
             LIMIT ? OFFSET ?`,
            [...params, pageSize, offset]
        );
        
        res.json({ code: 200, message: '查询成功', data: { list: students } });
        
    } catch (err) {
        console.error('查询学生列表失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 查询未分班的学生（用于班级补录）
router.get('/available', checkLogin, async (req, res) => {
    try {
        // 查询所有学生，但排除已经加入任何班级的学生
        const [students] = await db.query(
            `SELECT
                u.id,
                u.username,
                u.real_name as realName
             FROM users u
             WHERE u.role = 'student' AND u.status = 1
             AND u.id NOT IN (
                 SELECT DISTINCT student_user_id
                 FROM class_students
                 WHERE status = 1
             )
             ORDER BY u.id`
        );

        res.json({ code: 200, message: '查询成功', data: students });

    } catch (err) {
        console.error('查询未分班学生失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 搜索学生（用于班级补录）
router.get('/search', checkLogin, async (req, res) => {
    try {
        const { keyword } = req.query;
        
        if (!keyword) {
            return res.json({ code: 200, message: '查询成功', data: [] });
        }
        
        const [students] = await db.query(
            `SELECT 
                u.id,
                u.username,
                u.real_name as realName,
                c.class_name as className
             FROM users u
             LEFT JOIN class_students cs ON u.id = cs.student_user_id AND cs.status = 1
             LEFT JOIN classes c ON cs.class_id = c.id
             WHERE u.role = 'student' AND u.status = 1
             AND (u.real_name LIKE ? OR u.username LIKE ? OR u.id LIKE ?)
             ORDER BY u.id
             LIMIT 20`,
            [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
        );
        
        res.json({ code: 200, message: '查询成功', data: students });
        
    } catch (err) {
        console.error('搜索学生失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 创建学生并添加到班级（用于补录）
router.post('/with-class', checkLogin, async (req, res) => {
    try {
        const { id, realName, username, password, classId } = req.body;
        const user = req.user;

        // 权限检查
        if (user.role !== 'director') {
            return res.json({ code: 403, message: '无权限操作', data: null });
        }

        // 参数验证
        if (!id || !realName || !username || !password || !classId) {
            return res.json({ code: 400, message: '缺少必要参数', data: null });
        }

        // 检查学号是否已存在
        const [existingStudent] = await db.query(
            'SELECT id, status FROM users WHERE id = ?',
            [id]
        );

        if (existingStudent.length > 0) {
            if (existingStudent[0].status === 0) {
                // 已软删除，恢复
                await db.query(
                    'UPDATE users SET status = 1, real_name = ?, username = ?, password_hash = SHA2(?, 256) WHERE id = ?',
                    [realName, username, password, id]
                );
            } else {
                return res.json({ code: 400, message: '学号已存在', data: null });
            }
        } else {
            // 创建新学生
            await db.query(
                'INSERT INTO users (id, username, real_name, password_hash, role, status) VALUES (?, ?, ?, SHA2(?, 256), "student", 1)',
                [id, username, realName, password]
            );
        }

        // 添加到班级（先清除旧绑定）
        await db.query(
            'UPDATE class_students SET status = 0 WHERE student_user_id = ?',
            [id]
        );

        await db.query(
            'INSERT INTO class_students (class_id, student_user_id, status) VALUES (?, ?, 1)',
            [classId, id]
        );

        res.json({ code: 200, message: '创建成功', data: { id } });

    } catch (err) {
        console.error('创建学生失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
