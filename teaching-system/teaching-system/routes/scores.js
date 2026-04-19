//成绩管理路由

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');
const { writeOperationLog } = require('../utils/logWriter');

// 查询成绩列表
router.get('/', checkLogin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1
        const pageSize = parseInt(req.query.pageSize) || 10
        const classId = req.query.classId || ''
        const subjectId = req.query.subjectId || ''
        const examName = req.query.examName || ''
        const studentName = req.query.studentName || ''
        const studentId = req.query.studentId || ''
        const user = req.user
        
        let whereClause = 'WHERE s.status = 1'
        const params = []

        if (classId) {
            whereClause += ' AND s.class_id = ?'
            params.push(classId)
        }
        
        if (subjectId) {
            whereClause += ' AND s.subject_id = ?'
            params.push(subjectId)
        }
        
        if (examName) {
            whereClause += ' AND s.exam_name LIKE ?'
            params.push(`%${examName}%`)
        }
        
        if (studentName) {
            whereClause += ' AND u.real_name LIKE ?'
            params.push(`%${studentName}%`)
        }
        
        if (studentId) {
            whereClause += ' AND u.id = ?'
            params.push(studentId)
        }
        
        if (user.role === 'student') {
            whereClause += ' AND s.student_user_id = ?'
            params.push(user.id)
        }
        
        if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            )
            const classIds = teacherClasses.map(tc => tc.class_id)
            
            if (classIds.length > 0) {
                whereClause += ` AND s.class_id IN (${classIds.map(() => '?').join(',')})`
                params.push(...classIds)
            } else {
                return res.json({
                    code: 200,
                    message: '查询成功',
                    data: { list: [], total: 0, page, pageSize }
                })
            }
        }
        
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM scores s
             JOIN users u ON s.student_user_id = u.id
             ${whereClause}`,
            params
        )
        const total = countResult[0].total
        
        const offset = (page - 1) * pageSize
        const [scores] = await db.query(
            `SELECT 
                s.id,
                s.score,
                s.exam_name as examName,
                s.exam_date as examDate,
                s.created_at as createdAt,
                u.id as studentId,
                u.real_name as studentName,
                u.username as studentUsername,
                c.id as classId,
                c.class_name as className,
                sub.id as subjectId,
                sub.subject_name as subjectName,
                creator.real_name as createdByName
             FROM scores s
             JOIN users u ON s.student_user_id = u.id
             JOIN classes c ON s.class_id = c.id
             JOIN subjects sub ON s.subject_id = sub.id
             LEFT JOIN users creator ON s.created_by = creator.id
             ${whereClause}
             ORDER BY s.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, pageSize, offset]
        )
        
        res.json({
            code: 200,
            message: '查询成功',
            data: { list: scores, total, page, pageSize }
        })
        
    } catch (err) {
        console.error('查询成绩列表失败:', err)
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null })
    }
})

// 新增成绩
router.post('/', checkLogin, async (req, res) => {
    try {
        // 支持两种参数名：studentId 或 studentUserId
        const studentId = req.body.studentId || req.body.studentUserId
        const { classId, subjectId, score, examName, examDate } = req.body
        const user = req.user
        
        if (!studentId || !classId || !subjectId || score === undefined || !examName) {
            return res.json({ code: 400, message: '缺少必要参数', data: null })
        }
        
        // 检查是否已存在相同记录（排除已软删除的记录）
        const [existing] = await db.query(
            'SELECT id, status FROM scores WHERE student_user_id = ? AND class_id = ? AND subject_id = ? AND exam_name = ?',
            [studentId, classId, subjectId, examName]
        )

        if (existing.length > 0) {
            // 如果记录存在但已软删除(status=0)，则恢复该记录
            if (existing[0].status === 0) {
                await db.query(
                    `UPDATE scores SET status = 1, score = ?, exam_date = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
                    [score, examDate || new Date(), user.id, existing[0].id]
                )
                return res.json({ code: 200, message: '成绩录入成功（已恢复已删除的记录）', data: { id: existing[0].id } })
            }
            // 如果记录存在且未删除，则提示重复
            return res.json({ code: 400, message: '该学生此科目本次考试成绩已存在', data: null })
        }
        
        const [result] = await db.query(
            `INSERT INTO scores (student_user_id, class_id, subject_id, score, exam_name, exam_date, created_by, updated_by, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [studentId, classId, subjectId, score, examName, examDate || new Date(), user.id, user.id]
        )
        
        res.json({ code: 200, message: '录入成功', data: { id: result.insertId } })
        
    } catch (err) {
        console.error('录入成绩失败:', err)
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null })
    }
})

// 修改成绩
router.put('/:id', checkLogin, async (req, res) => {
    try {
        const scoreId = req.params.id
        const { score } = req.body
        const user = req.user
        
        if (score === undefined) {
            return res.json({ code: 400, message: '成绩不能为空', data: null })
        }
        
        await db.query(
            'UPDATE scores SET score = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
            [score, user.id, scoreId]
        )
        
        res.json({ code: 200, message: '修改成功', data: null })
        
    } catch (err) {
        console.error('修改成绩失败:', err)
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null })
    }
})

// 删除成绩（软删除）
router.delete('/:id', checkLogin, async (req, res) => {
    try {
        const scoreId = req.params.id

        await db.query('UPDATE scores SET status = 0 WHERE id = ?', [scoreId])

        res.json({ code: 200, message: '删除成功', data: null })

    } catch (err) {
        console.error('删除成绩失败:', err)
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null })
    }
})

// 导出成绩（后端生成CSV，同时记录日志）
router.get('/export', checkLogin, async (req, res) => {
    try {
        const { classId, subjectId, examName } = req.query
        const user = req.user

        // 1. 权限校验与数据查询（复用查询逻辑）
        let whereClause = 'WHERE s.status = 1'
        const params = []

        if (classId) {
            whereClause += ' AND s.class_id = ?'
            params.push(classId)
        }
        if (subjectId) {
            whereClause += ' AND s.subject_id = ?'
            params.push(subjectId)
        }
        if (examName) {
            whereClause += ' AND s.exam_name LIKE ?'
            params.push(`%${examName}%`)
        }

        // 权限过滤
        if (user.role === 'student') {
            whereClause += ' AND s.student_user_id = ?'
            params.push(user.id)
        } else if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            )
            const classIds = teacherClasses.map(tc => tc.class_id)
            if (classIds.length > 0) {
                whereClause += ` AND s.class_id IN (${classIds.map(() => '?').join(',')})`
                params.push(...classIds)
            }
        }

        // 2. 查询成绩数据
        const [scores] = await db.query(
            `SELECT
                s.score,
                s.exam_name as examName,
                s.exam_date as examDate,
                u.real_name as studentName,
                c.class_name as className,
                sub.subject_name as subjectName
             FROM scores s
             JOIN users u ON s.student_user_id = u.id
             JOIN classes c ON s.class_id = c.id
             JOIN subjects sub ON s.subject_id = sub.id
             ${whereClause}
             ORDER BY s.created_at DESC`,
            params
        )

        // 3. 生成 CSV 内容
        const headers = ['学生姓名', '班级', '科目', '考试名称', '分数', '考试日期']
        const rows = scores.map(s => [
            s.studentName,
            s.className,
            s.subjectName,
            s.examName,
            s.score,
            new Date(s.examDate).toLocaleDateString('zh-CN')
        ])
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')

        // 4. ★ 记录导出日志（不阻塞响应）
        writeOperationLog({
            userId: user.id,
            role: user.role,
            actionType: 'EXPORT_SCORES',
            targetType: '成绩',
            targetId: null,
            targetClassId: classId ? parseInt(classId) : null,
            detailJson: {
                description: `导出成绩：共${scores.length}条`,
                filters: { classId, subjectId, examName },
                count: scores.length
            },
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
        }).catch(err => console.error('导出日志写入失败:', err))

        // 5. 返回文件流
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        // 对中文文件名进行编码，避免Invalid character错误
        const filename = `成绩导出_${new Date().toISOString().split('T')[0]}.csv`
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
        res.send('\ufeff' + csvContent)  // BOM头防止中文乱码

    } catch (err) {
        console.error('导出成绩失败:', err)
        console.error('错误堆栈:', err.stack)
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null })
    }
})

// 批量导入成绩
router.post('/import', checkLogin, async (req, res) => {
    try {
        const { scores } = req.body
        const user = req.user

        if (!scores || !Array.isArray(scores) || scores.length === 0) {
            return res.json({ code: 400, message: '没有要导入的数据', data: null })
        }

        let successCount = 0
        let failCount = 0

        for (const score of scores) {
            try {
                // 检查是否已存在（包括已软删除的记录）
                const [existing] = await db.query(
                    'SELECT id, status FROM scores WHERE student_user_id = ? AND class_id = ? AND subject_id = ? AND exam_name = ?',
                    [score.studentId, score.classId, score.subjectId, score.examName]
                )

                if (existing.length > 0) {
                    if (existing[0].status === 0) {
                        // 已软删除，恢复并更新
                        await db.query(
                            `UPDATE scores SET status = 1, score = ?, exam_date = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
                            [score.score, score.examDate || new Date(), user.id, existing[0].id]
                        )
                        successCount++
                    } else {
                        // 已存在且未删除，跳过
                        failCount++
                    }
                    continue
                }

                // 新增记录
                await db.query(
                    `INSERT INTO scores (student_user_id, class_id, subject_id, score, exam_name, exam_date, created_by, updated_by, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [score.studentId, score.classId, score.subjectId, score.score, score.examName, score.examDate || new Date(), user.id, user.id]
                )
                successCount++
            } catch (e) {
                console.error('导入单条成绩失败:', e)
                failCount++
            }
        }

        // 手动记录批量导入日志（包含成功/失败条数）
        const classId = scores[0]?.classId;
        const subjectName = scores[0]?.subjectName || '';
        const examName = scores[0]?.examName || '';
        await writeOperationLog({
            userId: user.id,
            role: user.role,
            actionType: 'IMPORT_SCORES',
            targetType: '成绩',
            targetId: null,
            targetClassId: classId,
            detailJson: {
                description: `批量导入成绩：成功${successCount}条，失败${failCount}条`,
                subjectName,
                examName,
                totalCount: scores.length,
                successCount,
                failCount
            },
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
        });

        res.json({
            code: 200,
            message: `导入完成：成功${successCount}条，失败${failCount}条`,
            data: { successCount, failCount }
        })

    } catch (err) {
        console.error('批量导入成绩失败:', err)
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null })
    }
})

// 查询班主任负责的科目（根据已有成绩的科目）
router.get('/teacher-subjects', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        if (user.role !== 'head_teacher') {
            return res.json({ code: 403, message: '无权限访问', data: null });
        }

        // 查询班主任班级已有成绩的科目
        const [subjects] = await db.query(
            `SELECT DISTINCT
                s.subject_id as id,
                sub.subject_name as subjectName
             FROM scores s
             INNER JOIN class_teacher_bindings ctb ON s.class_id = ctb.class_id
             INNER JOIN subjects sub ON s.subject_id = sub.id
             WHERE ctb.teacher_user_id = ? AND ctb.status = 1 AND s.status = 1
             ORDER BY s.subject_id`,
            [user.id]
        );

        res.json({ code: 200, message: '查询成功', data: subjects });

    } catch (err) {
        console.error('查询班主任科目失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 查询班级学生列表（用于成绩录入时选择）
router.get('/students/:classId', checkLogin, async (req, res) => {
    try {
        const { classId } = req.params;
        const user = req.user;

        // 权限检查：班主任只能查看自己班级的学生
        if (user.role === 'head_teacher') {
            const [bindings] = await db.query(
                'SELECT * FROM class_teacher_bindings WHERE teacher_user_id = ? AND class_id = ? AND status = 1',
                [user.id, classId]
            );
            if (bindings.length === 0) {
                return res.json({ code: 403, message: '无权限访问该班级', data: null });
            }
        }

        // 查询班级学生列表
        const [students] = await db.query(
            `SELECT 
                u.id,
                u.real_name as realName,
                u.username
             FROM class_students cs
             JOIN users u ON cs.student_user_id = u.id
             WHERE cs.class_id = ? AND u.role = 'student' AND u.status = 1
             ORDER BY u.id ASC`,
            [classId]
        );

        res.json({ code: 200, message: '查询成功', data: students });

    } catch (err) {
        console.error('查询班级学生列表失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 查询学生实际考过的科目列表（仅学生端使用）
router.get('/student-subjects', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        if (user.role !== 'student') {
            return res.json({ code: 403, message: '无权限访问', data: null });
        }

        // 查询该学生成绩记录中出现过的科目
        const [subjects] = await db.query(
            `SELECT DISTINCT
                s.subject_id as id,
                sub.subject_name as name
             FROM scores s
             INNER JOIN subjects sub ON s.subject_id = sub.id
             WHERE s.student_user_id = ? AND s.status = 1
             ORDER BY s.subject_id`,
            [user.id]
        );

        res.json({ code: 200, message: '查询成功', data: subjects });

    } catch (err) {
        console.error('查询学生科目列表失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 查询学生实际参加过的考试列表（仅学生端使用）
router.get('/student-exams', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        if (user.role !== 'student') {
            return res.json({ code: 403, message: '无权限访问', data: null });
        }

        // 查询该学生成绩记录中出现过的考试名称
        const [exams] = await db.query(
            `SELECT DISTINCT exam_name as name
             FROM scores
             WHERE student_user_id = ? AND status = 1
             ORDER BY exam_name`,
            [user.id]
        );

        res.json({ code: 200, message: '查询成功', data: exams.map(e => e.name) });

    } catch (err) {
        console.error('查询学生考试列表失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
