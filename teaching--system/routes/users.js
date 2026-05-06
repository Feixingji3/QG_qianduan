/**
 * 用户管理路由
 *
 * 功能说明：
 * 1. 获取所有用户列表（仅教务主任）
 *
 * 权限控制：
 * - 教务主任：可查看所有用户
 * - 其他角色：无权限
 *
 * 技术栈：Express + MySQL + JWT鉴权
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');

/**
 * 获取所有用户列表
 * GET /api/users/all
 *
 * 权限：
 * - 教务主任：可查看所有用户
 * - 班主任：可查看本班学生和自己
 */
router.get('/all', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        let users;

        if (user.role === 'director') {
            // 教务主任：查询所有用户
            [users] = await db.query(
                `SELECT id, username, real_name as realName, role, created_at as createdAt
                 FROM users
                 ORDER BY role, id`
            );
        } else if (user.role === 'head_teacher') {
            // 班主任：查询本班学生和自己
            const [classBindings] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            const classIds = classBindings.map(cb => cb.class_id);

            if (classIds.length > 0) {
                // 查询本班学生 + 自己
                [users] = await db.query(
                    `SELECT DISTINCT u.id, u.username, u.real_name as realName, u.role, u.created_at as createdAt
                     FROM users u
                     LEFT JOIN class_students cs ON u.id = cs.student_user_id AND cs.status = 1
                     WHERE (cs.class_id IN (${classIds.map(() => '?').join(',')}) AND u.role = 'student')
                        OR u.id = ?
                     ORDER BY u.role, u.id`,
                    [...classIds, user.id]
                );
            } else {
                // 没有班级的班主任，只返回自己
                users = [{
                    id: user.id,
                    username: user.username,
                    realName: user.realName,
                    role: user.role,
                    createdAt: new Date()
                }];
            }
        } else {
            return res.status(403).json({
                code: 403,
                message: '无权限查看用户列表',
                data: null
            });
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: users
        });

    } catch (err) {
        console.error('查询用户列表失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
