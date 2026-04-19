//班级成员管理路由

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');

// 获取班级学生列表
router.get('/:classId', checkLogin, async (req, res) => {
    try {
        const classId = req.params.classId;
        const user = req.user;
        
        // 构建WHERE条件
        let whereClause = 'WHERE cs.class_id = ? AND cs.status = 1';
        const params = [classId];
        
        // 班主任：只能查看自己负责的班级学生
        if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            const classIds = teacherClasses.map(tc => tc.class_id);
            
            if (classIds.length === 0) {
                return res.json({ code: 200, message: '查询成功', data: [] });
            }
            
            if (!classIds.includes(parseInt(classId))) {
                return res.json({ code: 403, message: '无权限查看该班级学生', data: null });
            }
        }
        
        // 学生：只能查看自己所在班级的学生
        if (user.role === 'student') {
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );
            const classIds = studentClasses.map(sc => sc.class_id);
            
            if (!classIds.includes(parseInt(classId))) {
                return res.json({ code: 403, message: '无权限查看该班级学生', data: null });
            }
        }

        const [students] = await db.query(
            `SELECT 
                u.id,
                u.username,
                u.real_name as realName,
                cs.joined_at as joinTime
             FROM class_students cs
             JOIN users u ON cs.student_user_id = u.id
             ${whereClause}
             ORDER BY u.id`,
            params
        );

        res.json({ code: 200, message: '查询成功', data: students });

    } catch (err) {
        console.error('查询班级学生失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 添加学生到班级
router.post('/:classId', checkLogin, async (req, res) => {
    try {
        const classId = req.params.classId;
        const { studentId } = req.body;
        const user = req.user;
        
        if (user.role !== 'director') {
            return res.json({ code: 403, message: '无权限操作', data: null });
        }
        
        // 检查是否已存在记录（无论哪个班级）
        const [existing] = await db.query(
            'SELECT id, class_id, status FROM class_students WHERE student_user_id = ?',
            [studentId]
        );
        
        if (existing.length > 0) {
            const record = existing[0];
            if (record.status === 1) {
                // 学生在其他班级且未删除
                if (parseInt(record.class_id) === parseInt(classId)) {
                    return res.json({ code: 400, message: '该学生已在班级中', data: null });
                } else {
                    return res.json({ code: 400, message: '该学生已在其他班级', data: null });
                }
            } else {
                // 学生有软删除记录，更新到新班级并恢复
                await db.query(
                    'UPDATE class_students SET class_id = ?, status = 1, joined_at = NOW() WHERE id = ?',
                    [classId, record.id]
                );
            }
        } else {
            // 插入新记录
            await db.query(
                'INSERT INTO class_students (class_id, student_user_id, status) VALUES (?, ?, 1)',
                [classId, studentId]
            );
        }
        
        res.json({ code: 200, message: '添加成功', data: null });
        
    } catch (err) {
        console.error('添加班级学生失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 从班级移除学生
router.delete('/:classId/:studentId', checkLogin, async (req, res) => {
    try {
        const { classId, studentId } = req.params;
        const user = req.user;
        
        if (user.role !== 'director') {
            return res.json({ code: 403, message: '无权限操作', data: null });
        }
        
        await db.query(
            'UPDATE class_students SET status = 0 WHERE class_id = ? AND student_user_id = ?',
            [classId, studentId]
        );
        
        res.json({ code: 200, message: '移除成功', data: null });
        
    } catch (err) {
        console.error('移除班级学生失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
