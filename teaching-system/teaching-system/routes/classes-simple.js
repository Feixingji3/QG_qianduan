//班级管理路由 

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');
const { writeOperationLog } = require('../utils/logWriter');

// 查询班级列表
router.get('/', checkLogin, async (req, res) => {
    console.log('收到班级列表请求');
    console.log('用户信息:', req.user);
    console.log('查询参数:', req.query);

    try {
        const user = req.user;
        const { className, teacherId, excludeSchool } = req.query;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const offset = (page - 1) * pageSize;

        let classes = [];
        let total = 0;

        // 构建筛选条件
        let whereClause = 'WHERE c.status = 1';
        const params = [];

        // 排除"全校"班级（用于班级管理、成绩管理、统计分析模块）
        if (excludeSchool === 'true') {
            whereClause += ' AND c.id != 12';
        }

        // 班级名称筛选
        if (className) {
            whereClause += ' AND c.class_name LIKE ?';
            params.push(`%${className}%`);
        }

        // 班主任筛选（仅教务主任可用）
        if (teacherId && user.role === 'director') {
            whereClause += ' AND ctb.teacher_user_id = ?';
            params.push(teacherId);
        }

        if (user.role === 'director') {
            // 教务主任：查看所有班级（带筛选）
            [classes] = await db.query(
                `SELECT
                    c.id,
                    c.class_name as className,
                    c.grade_year as gradeYear,
                    c.created_at as createdAt,
                    u.real_name as teacherName,
                    u.id as teacherId,
                    (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 1) as studentCount
                 FROM classes c
                 LEFT JOIN class_teacher_bindings ctb ON c.id = ctb.class_id AND ctb.status = 1
                 LEFT JOIN users u ON ctb.teacher_user_id = u.id
                 ${whereClause}
                 ORDER BY c.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, pageSize, offset]
            );

            // 查询总数（带筛选条件）
            const [countResult] = await db.query(
                `SELECT COUNT(DISTINCT c.id) as total 
                 FROM classes c
                 LEFT JOIN class_teacher_bindings ctb ON c.id = ctb.class_id AND ctb.status = 1
                 ${whereClause}`,
                params
            );
            total = countResult[0].total;
        } else if (user.role === 'head_teacher') {
            // 班主任：只查看自己负责的班级（带班级名称筛选）
            // 班主任不能使用teacherId筛选，只能使用className筛选
            const headTeacherWhereClause = whereClause + ' AND ctb.teacher_user_id = ?';
            
            [classes] = await db.query(
                `SELECT 
                    c.id,
                    c.class_name as className,
                    c.grade_year as gradeYear,
                    c.created_at as createdAt,
                    u.real_name as teacherName,
                    u.id as teacherId,
                    (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 1) as studentCount
                 FROM classes c
                 INNER JOIN class_teacher_bindings ctb ON c.id = ctb.class_id AND ctb.status = 1
                 LEFT JOIN users u ON ctb.teacher_user_id = u.id
                 ${headTeacherWhereClause}
                 ORDER BY c.created_at DESC`,
                [...params, user.id]
            );

            total = classes.length;
        } else {
            // 学生：查看自己所在的班级（带班级名称筛选）
            const studentWhereClause = whereClause + ' AND cs.student_user_id = ?';
            
            [classes] = await db.query(
                `SELECT 
                    c.id,
                    c.class_name as className,
                    c.grade_year as gradeYear,
                    c.created_at as createdAt,
                    u.real_name as teacherName,
                    u.id as teacherId,
                    (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 1) as studentCount
                 FROM classes c
                 INNER JOIN class_students cs ON c.id = cs.class_id AND cs.status = 1
                 LEFT JOIN class_teacher_bindings ctb ON c.id = ctb.class_id AND ctb.status = 1
                 LEFT JOIN users u ON ctb.teacher_user_id = u.id
                 ${studentWhereClause}
                 ORDER BY c.created_at DESC`,
                [...params, user.id]
            );

            total = classes.length;
        }

        console.log('查询结果:', classes.length, '条记录, 总数:', total);

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                list: classes,
                total: total,
                page: parseInt(page),
                pageSize: parseInt(pageSize)
            }
        });

    } catch (err) {
        console.error('查询班级列表失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 新增班级
router.post('/', checkLogin, async (req, res) => {
    try {
        if (req.user.role !== 'director') {
            return res.json({ code: 403, message: '无权限操作', data: null });
        }

        const { className, gradeYear, teacherId } = req.body;

        if (!className || !gradeYear) {
            return res.json({ code: 400, message: '班级名称和年级不能为空', data: null });
        }

        // 检查是否已存在同名班级（包括已软删除的）
        const [existing] = await db.query(
            'SELECT id, status FROM classes WHERE class_name = ?',
            [className]
        );

        let classId;
        if (existing.length > 0) {
            if (existing[0].status === 0) {
                // 已软删除，恢复并更新
                await db.query(
                    'UPDATE classes SET status = 1, grade_year = ?, created_by = ? WHERE id = ?',
                    [gradeYear, req.user.id, existing[0].id]
                );
                classId = existing[0].id;

                // 清除旧的班主任绑定
                await db.query(
                    'UPDATE class_teacher_bindings SET status = 0 WHERE class_id = ?',
                    [classId]
                );
            } else {
                // 已存在且未删除
                return res.json({ code: 400, message: '班级名称已存在', data: null });
            }
        } else {
            // 新增班级
            const [classResult] = await db.query(
                'INSERT INTO classes (class_name, grade_year, created_by, status) VALUES (?, ?, ?, 1)',
                [className, gradeYear, req.user.id]
            );
            classId = classResult.insertId;
        }

        // 绑定班主任
        if (teacherId) {
            await db.query(
                'INSERT INTO class_teacher_bindings (class_id, teacher_user_id, bound_by, status) VALUES (?, ?, ?, 1)',
                [classId, teacherId, req.user.id]
            );
        }

        res.json({ code: 200, message: existing.length > 0 && existing[0].status === 0 ? '班级已恢复' : '新增成功', data: { id: classId } });

    } catch (err) {
        console.error('新增班级失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 修改班级
router.put('/:id', checkLogin, async (req, res) => {
    try {
        if (req.user.role !== 'director') {
            return res.json({ code: 403, message: '无权限操作', data: null });
        }
        
        const classId = req.params.id;
        const { className, gradeYear, teacherId } = req.body;
        
        if (className || gradeYear) {
            const updateFields = [];
            const updateParams = [];
            
            if (className) {
                updateFields.push('class_name = ?');
                updateParams.push(className);
            }
            if (gradeYear) {
                updateFields.push('grade_year = ?');
                updateParams.push(gradeYear);
            }
            
            await db.query(
                `UPDATE classes SET ${updateFields.join(', ')} WHERE id = ?`,
                [...updateParams, classId]
            );
        }
        
        // 处理班主任绑定变更（软删除实现，保留完整历史）
        // teacherId 可能为：undefined（未传）、''（暂不分配）、数字字符串（指定班主任）
        if (teacherId !== undefined) {
            // 查询班级名称和原班主任信息
            const [[classInfo]] = await db.query(
                'SELECT class_name FROM classes WHERE id = ?',
                [classId]
            );
            const className = classInfo?.class_name || '未知班级';

            // 查询原班主任信息
            const [[oldBinding]] = await db.query(
                `SELECT u.id, u.real_name
                 FROM class_teacher_bindings ctb
                 JOIN users u ON ctb.teacher_user_id = u.id
                 WHERE ctb.class_id = ? AND ctb.status = 1`,
                [classId]
            );
            const oldTeacherName = oldBinding?.real_name || null;

            // 1. 解绑该班级原班主任（软删除：status=0，更新时间为当前时间）
            await db.query(
                'UPDATE class_teacher_bindings SET status = 0, bound_at = NOW() WHERE class_id = ? AND status = 1',
                [classId]
            );

            // 如果指定了新班主任（非空且非空字符串）
            if (teacherId && teacherId !== '') {
                // 将 teacherId 转为数字
                const teacherIdNum = parseInt(teacherId, 10);

                // 查询新班主任姓名
                const [[newTeacher]] = await db.query(
                    'SELECT real_name FROM users WHERE id = ?',
                    [teacherIdNum]
                );
                const newTeacherName = newTeacher?.real_name || '未知教师';

                // 2. 解绑该教师原班级（软删除：status=0，更新时间为当前时间）
                await db.query(
                    'UPDATE class_teacher_bindings SET status = 0, bound_at = NOW() WHERE teacher_user_id = ? AND status = 1',
                    [teacherIdNum]
                );

                // 3. 创建新绑定（bound_at 自动为当前时间）
                await db.query(
                    `INSERT INTO class_teacher_bindings (class_id, teacher_user_id, bound_by, status)
                     VALUES (?, ?, ?, 1)`,
                    [classId, teacherIdNum, req.user.id]
                );

                // 记录绑定日志
                if (oldTeacherName) {
                    // 更换班主任
                    await writeOperationLog({
                        userId: req.user.id,
                        role: req.user.role,
                        actionType: 'UPDATE',
                        targetType: '班级',
                        targetId: classId,
                        targetClassId: classId,
                        detailJson: {
                            description: `将【${className}】班主任由【${oldTeacherName}】更换为【${newTeacherName}】`,
                            classId,
                            className,
                            oldTeacherId: oldBinding.id,
                            oldTeacherName,
                            newTeacherId: teacherIdNum,
                            newTeacherName
                        }
                    });
                } else {
                    // 绑定新班主任（之前没有）
                    await writeOperationLog({
                        userId: req.user.id,
                        role: req.user.role,
                        actionType: 'UPDATE',
                        targetType: '班级',
                        targetId: classId,
                        targetClassId: classId,
                        detailJson: {
                            description: `将【${newTeacherName}】绑定为【${className}】班主任`,
                            classId,
                            className,
                            teacherId: teacherIdNum,
                            teacherName: newTeacherName
                        }
                    });
                }
            } else if (oldTeacherName) {
                // 解绑班主任（teacherId 为空字符串，且之前有班主任）
                await writeOperationLog({
                    userId: req.user.id,
                    role: req.user.role,
                    actionType: 'UPDATE',
                    targetType: '班级',
                    targetId: classId,
                    targetClassId: classId,
                    detailJson: {
                        description: `解绑【${className}】班主任【${oldTeacherName}】`,
                        classId,
                        className,
                        teacherId: oldBinding.id,
                        teacherName: oldTeacherName
                    }
                });
            }
        }
        
        res.json({ code: 200, message: '修改成功', data: null });
        
    } catch (err) {
        console.error('修改班级失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 删除班级
router.delete('/:id', checkLogin, async (req, res) => {
    try {
        if (req.user.role !== 'director') {
            return res.json({ code: 403, message: '无权限操作', data: null });
        }
        
        const classId = req.params.id;
        await db.query('UPDATE classes SET status = 0 WHERE id = ?', [classId]);
        
        res.json({ code: 200, message: '删除成功', data: null });
        
    } catch (err) {
        console.error('删除班级失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
