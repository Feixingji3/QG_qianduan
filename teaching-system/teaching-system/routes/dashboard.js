/**
 * 仪表盘统计路由
 * 提供首页仪表盘所需的统计数据
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');

// 获取班级总数
router.get('/classes/count', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        let count = 0;
        
        if (user.role === 'director') {
            // 教务主任：查看所有班级（排除全校班级）
            const [result] = await db.query('SELECT COUNT(*) as count FROM classes WHERE status = 1 AND id != 12');
            count = result[0].count;
        } else if (user.role === 'head_teacher') {
            // 班主任：查看自己负责的班级
            const [result] = await db.query(
                'SELECT COUNT(*) as count FROM classes c INNER JOIN class_teacher_bindings ctb ON c.id = ctb.class_id WHERE ctb.teacher_user_id = ? AND c.status = 1 AND ctb.status = 1',
                [user.id]
            );
            count = result[0].count;
        } else {
            // 学生：查看自己所在的班级
            const [result] = await db.query(
                'SELECT COUNT(*) as count FROM classes c INNER JOIN class_students cs ON c.id = cs.class_id WHERE cs.student_user_id = ? AND c.status = 1 AND cs.status = 1',
                [user.id]
            );
            count = result[0].count;
        }
        
        res.json({ code: 200, message: '查询成功', data: { count } });
    } catch (err) {
        console.error('查询班级总数失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

// 获取学生总数
router.get('/students/count', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        let count = 0;
        
        if (user.role === 'director') {
            // 教务主任：查看所有学生
            const [result] = await db.query("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND status = 1");
            count = result[0].count;
        } else if (user.role === 'head_teacher') {
            // 班主任：查看自己班级的学生
            const [result] = await db.query(
                `SELECT COUNT(DISTINCT cs.student_user_id) as count 
                 FROM class_students cs 
                 INNER JOIN class_teacher_bindings ctb ON cs.class_id = ctb.class_id 
                 WHERE ctb.teacher_user_id = ? AND cs.status = 1 AND ctb.status = 1`,
                [user.id]
            );
            count = result[0].count;
        } else {
            // 学生：查看自己所在班级的学生总数
            const [result] = await db.query(
                `SELECT COUNT(*) as count 
                 FROM class_students cs 
                 WHERE cs.class_id IN (
                     SELECT class_id FROM class_students 
                     WHERE student_user_id = ? AND status = 1
                 ) AND cs.status = 1`,
                [user.id]
            );
            count = result[0].count;
        }
        
        res.json({ code: 200, message: '查询成功', data: { count } });
    } catch (err) {
        console.error('查询学生总数失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

// 获取平均成绩
router.get('/scores/average', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        let average = 0;
        
        if (user.role === 'director') {
            // 教务主任：所有成绩的平均
            const [result] = await db.query('SELECT AVG(score) as average FROM scores WHERE status = 1');
            average = result[0].average || 0;
        } else if (user.role === 'head_teacher') {
            // 班主任：本班成绩的平均
            const [result] = await db.query(
                `SELECT AVG(s.score) as average 
                 FROM scores s 
                 INNER JOIN class_students cs ON s.student_user_id = cs.student_user_id 
                 INNER JOIN class_teacher_bindings ctb ON cs.class_id = ctb.class_id 
                 WHERE ctb.teacher_user_id = ? AND s.status = 1 AND cs.status = 1 AND ctb.status = 1`,
                [user.id]
            );
            average = result[0].average || 0;
        } else {
            // 学生：自己的平均成绩
            const [result] = await db.query(
                'SELECT AVG(score) as average FROM scores WHERE student_user_id = ? AND status = 1',
                [user.id]
            );
            average = result[0].average || 0;
        }
        
        res.json({ code: 200, message: '查询成功', data: { average: Math.round(average * 10) / 10 } });
    } catch (err) {
        console.error('查询平均成绩失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

// 获取未读通知数
router.get('/notices/unread-count', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        let count = 0;

        if (user.role === 'director') {
            // 教务主任：查看所有通知（没有未读概念，返回0）
            count = 0;
        } else if (user.role === 'head_teacher') {
            // 获取班主任所在班级
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );

            if (teacherClasses.length > 0) {
                const classId = teacherClasses[0].class_id;
                // 班主任查看：教务主任发布的全校通知 + 发给本班的通知
                const [result] = await db.query(
                    `SELECT COUNT(*) as count
                     FROM notices n
                     LEFT JOIN notice_reads nr ON n.id = nr.notice_id AND nr.student_user_id = ?
                     WHERE n.status = 'published'
                     AND (n.class_id = ? OR n.class_id = 12)  -- 本班通知或全校通知
                     AND n.created_by != ?  -- 排除自己发布的
                     AND nr.id IS NULL`,  -- 未读
                    [user.id, classId, user.id]
                );
                count = result[0].count;
            }
        } else {
            // 学生：查看自己未读的通知
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );

            if (studentClasses.length > 0) {
                const classId = studentClasses[0].class_id;
                const [result] = await db.query(
                    `SELECT COUNT(*) as count
                     FROM notices n
                     LEFT JOIN notice_reads nr ON n.id = nr.notice_id AND nr.student_user_id = ?
                     WHERE n.status = 'published'
                     AND (n.class_id = ? OR n.class_id = 12)
                     AND nr.id IS NULL`,
                    [user.id, classId]
                );
                count = result[0].count;
            }
        }

        res.json({ code: 200, message: '查询成功', data: { count } });
    } catch (err) {
        console.error('查询未读通知数失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

/**
 * 获取最近通知列表（仪表盘预览用）
 * GET /api/dashboard/notices/recent
 * 返回：最近3条通知（id, title, created_at）
 */
router.get('/notices/recent', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        let whereClause = 'WHERE n.status = "published"';
        const params = [];

        // 学生：本班通知 + 全校通知(class_id=12)
        if (user.role === 'student') {
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );
            if (studentClasses.length === 0) {
                return res.json({ code: 200, message: '查询成功', data: [] });
            }
            const studentClassId = studentClasses[0].class_id;
            whereClause += ' AND (n.class_id = ? OR n.class_id = 12)';
            params.push(studentClassId);
        }
        // 班主任：本班通知 + 全校通知
        else if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            if (teacherClasses.length === 0) {
                return res.json({ code: 200, message: '查询成功', data: [] });
            }
            const teacherClassId = teacherClasses[0].class_id;
            whereClause += ' AND (n.class_id = ? OR n.class_id = 12)';
            params.push(teacherClassId);
        }
        // 教务主任：全部通知，无需额外条件

        // 查询最近3条通知
        const [notices] = await db.query(
            `SELECT 
                n.id,
                n.title,
                n.created_at as createdAt,
                CASE 
                    WHEN n.class_id = 12 THEN '全校'
                    ELSE c.class_name 
                END as className
            FROM notices n
            LEFT JOIN classes c ON n.class_id = c.id
            ${whereClause}
            ORDER BY n.created_at DESC
            LIMIT 3`,
            params
        );

        res.json({ 
            code: 200, 
            message: '查询成功', 
            data: notices.map(n => ({
                id: n.id,
                title: n.title,
                createdAt: n.createdAt,
                className: n.className
            }))
        });

    } catch (err) {
        console.error('查询最近通知失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
