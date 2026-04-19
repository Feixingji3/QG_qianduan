/**
 * 统计分析路由
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');

/**
 * 获取统计数据
 * 权限逻辑与成绩管理一致
 */
router.get('/overview', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        const { classId, subjectId, examName } = req.query;

        // WHERE条件构建
        let whereClause = 'WHERE 1=1';
        const params = [];

        // 权限控制
        if (user.role === 'student') {
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );
            if (studentClasses.length === 0) {
                return res.json({
                    code: 200,
                    message: '查询成功',
                    data: {
                        className: '',
                        subjectName: '',
                        avgScore: '0.00',
                        maxScore: 0,
                        minScore: 0,
                        passCount: 0,
                        passRate: '0.00',
                        totalCount: 0
                    }
                });
            }
            const studentClassId = studentClasses[0].class_id;
            whereClause += ' AND s.class_id = ?';
            params.push(studentClassId);
        } else if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            const classIds = teacherClasses.map(tc => tc.class_id);

            if (classIds.length === 0) {
                return res.json({
                    code: 200,
                    message: '查询成功',
                    data: {
                        className: '',
                        subjectName: '',
                        avgScore: '0.00',
                        maxScore: 0,
                        minScore: 0,
                        passCount: 0,
                        passRate: '0.00',
                        totalCount: 0
                    }
                });
            }

            if (classId) {
                if (!classIds.includes(parseInt(classId))) {
                    return res.json({ code: 403, message: '无权限查看该班级统计', data: null });
                }
                whereClause += ' AND s.class_id = ?';
                params.push(classId);
            } else {
                whereClause += ' AND s.class_id = ?';
                params.push(classIds[0]);
            }
        } else {
            if (classId) {
                whereClause += ' AND s.class_id = ?';
                params.push(classId);
            }
        }

        // 筛选条件
        if (subjectId) {
            whereClause += ' AND s.subject_id = ?';
            params.push(subjectId);
        }
        if (examName) {
            whereClause += ' AND s.exam_name LIKE ?';
            params.push(`%${examName}%`);
        }

        // 统计查询
        let statData;

        if (subjectId) {
            // 指定了科目：直接统计单科分数
            const [stats] = await db.query(`
                SELECT 
                    AVG(s.score) as avgScore,
                    MAX(s.score) as maxScore,
                    MIN(s.score) as minScore,
                    COUNT(*) as totalCount,
                    SUM(CASE WHEN s.score >= 60 THEN 1 ELSE 0 END) as passCount
                FROM scores s
                ${whereClause}
            `, params);
            statData = stats[0];
        } else {
            // 全部科目：按学生分组，计算每个学生的总分
            const [studentTotals] = await db.query(`
                SELECT 
                    s.student_user_id,
                    SUM(s.score) as totalScore,
                    COUNT(*) as subjectCount
                FROM scores s
                ${whereClause}
                GROUP BY s.student_user_id
            `, params);

            if (studentTotals.length === 0) {
                statData = {
                    avgScore: 0,
                    maxScore: 0,
                    minScore: 0,
                    totalCount: 0,
                    passCount: 0
                };
            } else {
                // 将字符串转换为数字
                const totalScores = studentTotals.map(st => parseFloat(st.totalScore));
                const avgScore = totalScores.reduce((a, b) => a + b, 0) / totalScores.length;
                const maxScore = Math.max(...totalScores);
                const minScore = Math.min(...totalScores);
                const passCount = studentTotals.filter(st => parseFloat(st.totalScore) >= st.subjectCount * 60).length;

                statData = {
                    avgScore: avgScore,
                    maxScore: maxScore,
                    minScore: minScore,
                    totalCount: studentTotals.length,
                    passCount: passCount
                };
            }
        }

        const totalCount = statData.totalCount || 0;
        const passCount = statData.passCount || 0;
        const passRate = totalCount > 0 ? ((passCount / totalCount) * 100).toFixed(2) : '0.00';

        // 查询班级名称
        let className = '';
        let subjectName = '';

        if (classId) {
            const [classResult] = await db.query('SELECT class_name FROM classes WHERE id = ?', [classId]);
            className = classResult[0]?.class_name || '';
        } else if (user.role === 'student') {
            const [studentClass] = await db.query(
                `SELECT c.class_name 
                 FROM class_students cs 
                 JOIN classes c ON cs.class_id = c.id 
                 WHERE cs.student_user_id = ? AND cs.status = 1`,
                [user.id]
            );
            className = studentClass[0]?.class_name || '';
        } else if (user.role === 'head_teacher' && !classId) {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1 LIMIT 1',
                [user.id]
            );
            if (teacherClasses.length > 0) {
                const [classResult] = await db.query('SELECT class_name FROM classes WHERE id = ?', [teacherClasses[0].class_id]);
                className = classResult[0]?.class_name || '';
            }
        }

        // 查询科目名称
        if (subjectId) {
            const [subjectResult] = await db.query('SELECT subject_name FROM subjects WHERE id = ?', [subjectId]);
            subjectName = subjectResult[0]?.subject_name || '';
        }

        // 确保所有数值都是数字类型
        const avgScoreNum = parseFloat(statData.avgScore) || 0;
        const maxScoreNum = parseFloat(statData.maxScore) || 0;
        const minScoreNum = parseFloat(statData.minScore) || 0;

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                className: className,
                subjectName: subjectName || (subjectId ? '' : '全部科目（总分）'),
                avgScore: avgScoreNum.toFixed(2),
                maxScore: maxScoreNum,
                minScore: minScoreNum,
                passCount: passCount,
                passRate: passRate,
                totalCount: totalCount
            }
        });

    } catch (err) {
        console.error('查询统计数据失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

/**
 * 获取班主任班级列表
 */
router.get('/teacher-classes', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        if (user.role !== 'head_teacher') {
            return res.json({ code: 403, message: '无权限操作', data: null });
        }

        const [classes] = await db.query(
            `SELECT 
                c.id,
                c.class_name as className
             FROM class_teacher_bindings ctb
             JOIN classes c ON ctb.class_id = c.id
             WHERE ctb.teacher_user_id = ? AND ctb.status = 1 AND c.status = 1
             ORDER BY c.class_name`,
            [user.id]
        );

        res.json({ code: 200, message: '查询成功', data: classes });
    } catch (err) {
        console.error('查询班主任班级列表失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

/**
 * 获取科目列表
 */
router.get('/subjects', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        if (user.role === 'student') {
            const [subjects] = await db.query(
                `SELECT DISTINCT 
                    sub.id,
                    sub.subject_name as subjectName
                 FROM scores s
                 JOIN subjects sub ON s.subject_id = sub.id
                 WHERE s.student_user_id = ?
                 ORDER BY sub.id`,
                [user.id]
            );
            res.json({ code: 200, message: '查询成功', data: subjects });
        } else if (user.role === 'head_teacher') {
            const [subjects] = await db.query(
                `SELECT DISTINCT 
                    sub.id,
                    sub.subject_name as subjectName
                 FROM scores s
                 JOIN subjects sub ON s.subject_id = sub.id
                 JOIN class_teacher_bindings ctb ON s.class_id = ctb.class_id
                 WHERE ctb.teacher_user_id = ? AND ctb.status = 1
                 ORDER BY sub.id`,
                [user.id]
            );
            res.json({ code: 200, message: '查询成功', data: subjects });
        } else {
            const [subjects] = await db.query(
                'SELECT id, subject_name as subjectName FROM subjects WHERE status = 1 ORDER BY id'
            );
            res.json({ code: 200, message: '查询成功', data: subjects });
        }
    } catch (err) {
        console.error('查询统计科目列表失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

/**
 * 获取考试名称列表
 */
router.get('/exams', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        const { keyword } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];

        // 权限过滤
        if (user.role === 'student') {
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );
            if (studentClasses.length > 0) {
                whereClause += ' AND class_id = ?';
                params.push(studentClasses[0].class_id);
            }
        } else if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            const classIds = teacherClasses.map(tc => tc.class_id);
            if (classIds.length > 0) {
                whereClause += ` AND class_id IN (${classIds.map(() => '?').join(',')})`;
                params.push(...classIds);
            }
        }

        // 关键字筛选
        if (keyword) {
            whereClause += ' AND exam_name LIKE ?';
            params.push(`%${keyword}%`);
        }

        const [exams] = await db.query(
            `SELECT DISTINCT exam_name as examName FROM scores ${whereClause} ORDER BY exam_name LIMIT 20`,
            params
        );

        res.json({ code: 200, message: '查询成功', data: exams.map(e => e.examName) });
    } catch (err) {
        console.error('查询考试列表失败:', err);
        res.json({ code: 500, message: '服务器错误', data: null });
    }
});

module.exports = router;
