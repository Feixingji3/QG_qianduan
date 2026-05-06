/**
 * 班主任管理路由
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');

// 查询班主任列表
router.get('/', checkLogin, async (req, res) => {
    try {
        // 查询所有角色为head_teacher的用户
        const [teachers] = await db.query(
            `SELECT id, username, real_name as realName 
             FROM users 
             WHERE role = 'head_teacher' AND status = 1
             ORDER BY real_name, username`,
        );

        res.json({
            code: 200,
            message: '查询成功',
            data: teachers
        });

    } catch (err) {
        console.error('查询班主任列表失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 查询班主任当前绑定的班级
router.get('/:id/current-class', checkLogin, async (req, res) => {
    try {
        const teacherId = req.params.id;

        // 查询该班主任当前有效绑定的班级
        const [bindings] = await db.query(
            `SELECT
                c.id as classId,
                c.class_name as className,
                u.real_name as teacherName
             FROM class_teacher_bindings ctb
             JOIN classes c ON ctb.class_id = c.id
             JOIN users u ON ctb.teacher_user_id = u.id
             WHERE ctb.teacher_user_id = ? AND ctb.status = 1 AND c.status = 1`,
            [teacherId]
        );

        res.json({
            code: 200,
            message: '查询成功',
            data: bindings[0] || null  // 返回当前绑定的班级，或null
        });

    } catch (err) {
        console.error('查询班主任当前班级失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
