/**
 * 班级通知路由
 * 
 * 接口设计：
 * GET    /api/notices              获取通知列表
 * POST   /api/notices              发布通知（班主任仅可向自己所属班级发布，主任可发布全校通知）
 * PUT    /api/notices/:id          编辑通知（班主任仅可编辑本班未过期通知，主任可编辑任何通知）
 * DELETE /api/notices/:id          删除通知（班主任仅可删除本班未过期通知，主任可删除任何通知）
 * POST   /api/notices/:id/read     标记已读（学生且通知班级与自身class_id一致）
 * GET    /api/notices/:id/read-status  获取已读/未读名单（班主任/主任可查看）
 * GET    /api/notices/unread-count    获取未读数量（学生）
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');
const { writeOperationLog } = require('../utils/logWriter');

// 获取通知列表
// 权限：主任全部（可按班级筛选），班主任/学生仅本班
// 排序：未读优先，时间倒序
router.get('/', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const offset = (page - 1) * pageSize;
        const classId = req.query.classId || '';
        const readStatus = req.query.status || ''; // 'read' 或 'unread'

        let whereClause = 'WHERE n.status = "published"';
        const params = [];
        const readStatusParams = []; // 用于存储已读筛选的参数

        // 学生只能查看本班通知
        if (user.role === 'student') {
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );
            if (studentClasses.length === 0) {
                return res.json({
                    code: 200,
                    message: '查询成功',
                    data: { list: [], total: 0, page, pageSize }
                });
            }
            const studentClassId = studentClasses[0].class_id;
            whereClause += ' AND (n.class_id = ? OR n.class_id = 12)';
            params.push(studentClassId);
        }
        // 班主任只能查看本班通知
        else if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            if (teacherClasses.length === 0) {
                return res.json({
                    code: 200,
                    message: '查询成功',
                    data: { list: [], total: 0, page, pageSize }
                });
            }
            const teacherClassId = teacherClasses[0].class_id;
            whereClause += ' AND (n.class_id = ? OR n.class_id = 12)';
            params.push(teacherClassId);
        }
        // 教务主任可以查看全部，也可以按班级筛选
        else if (user.role === 'director') {
            if (classId && classId !== '') {
                // 筛选特定班级
                whereClause += ' AND n.class_id = ?';
                params.push(classId);
            }
            // classId为空时查看全部（包括全校通知）
        }

        // 查询通知列表 - 未读优先，时间倒序
        // 学生和班主任都可以查看自己的已读状态
        const canReadStatus = user.role === 'student' || user.role === 'head_teacher';
        
        // 处理已读/未读筛选
        let readStatusFilter = '';
        if (canReadStatus && readStatus) {
            if (readStatus === 'read') {
                // 只看已读
                readStatusFilter = ' AND nr.id IS NOT NULL';
            } else if (readStatus === 'unread') {
                // 只看未读
                readStatusFilter = ' AND nr.id IS NULL';
            }
            
            // 班主任筛选已读/未读时，排除自己发布的通知
            // 只筛选教务主任发布的通知（全校通知或发给本班的通知）
            if (user.role === 'head_teacher') {
                readStatusFilter += ' AND n.created_by != ?';
                readStatusParams.push(user.id);
            }
        }
        
        let orderClause = '';
        if (user.role === 'head_teacher') {
            // 班主任：未读（来自教务主任的）优先，然后其他通知（自己发的+已读）统一按时间倒序
            orderClause = `
                ORDER BY 
                    CASE WHEN nr.id IS NULL AND n.created_by != ? THEN 0 ELSE 1 END ASC,
                    n.publish_time DESC
            `;
        } else if (canReadStatus) {
            // 学生：未读优先，然后按时间倒序
            orderClause = `
                ORDER BY 
                    CASE WHEN nr.id IS NULL THEN 0 ELSE 1 END ASC,
                    n.publish_time DESC
            `;
        } else {
            // 教务主任：按时间倒序
            orderClause = 'ORDER BY n.publish_time DESC';
        }

        const [notices] = await db.query(
            `SELECT
                n.id,
                n.title,
                n.content,
                n.class_id as classId,
                n.created_by as publisherId,
                n.publish_time as publishTime,
                n.expire_time as expireTime,
                n.status,
                u.real_name as publisherName,
                c.class_name as className
                ${canReadStatus ? ', nr.id as readId' : ''}
             FROM notices n
             LEFT JOIN users u ON n.created_by = u.id
             LEFT JOIN classes c ON n.class_id = c.id
             ${canReadStatus ? 'LEFT JOIN notice_reads nr ON n.id = nr.notice_id AND nr.student_user_id = ?' : ''}
             ${whereClause}
             ${canReadStatus ? readStatusFilter : ''}
             ${orderClause}
             LIMIT ? OFFSET ?`,
            user.role === 'head_teacher'
                ? [user.id, ...params, ...readStatusParams, user.id, pageSize, offset]
                : canReadStatus
                    ? [user.id, ...params, ...readStatusParams, pageSize, offset]
                : [...params, pageSize, offset]
        );

        // 对于学生和班主任，标记已读状态（保留readId字段供前端使用）
        if (canReadStatus) {
            notices.forEach(notice => {
                notice.isRead = !!notice.readId;
                // 保留readId字段，前端需要使用它来判断未读样式
            });
        }

        // 查询总数
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM notices n ${whereClause}`,
            params
        );

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                list: notices,
                total: countResult[0].total,
                page: parseInt(page),
                pageSize: parseInt(pageSize)
            }
        });

    } catch (err) {
        console.error('查询通知失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 发布通知
// 权限：班主任向本班发布，主任可发布全校通知（class_id=0）或指定班级
router.post('/', checkLogin, async (req, res) => {
    try {
        const { title, content, classId: reqClassId } = req.body;
        const user = req.user;

        // 权限检查：只有班主任和教务主任可以发布通知
        if (user.role !== 'head_teacher' && user.role !== 'director') {
            return res.json({ code: 403, message: '无权限发布通知', data: null });
        }

        if (!title || !content) {
            return res.json({ code: 400, message: '标题和内容不能为空', data: null });
        }

        // 计算过期时间（默认7天后过期）
        const expireTime = new Date();
        expireTime.setDate(expireTime.getDate() + 7);

        let classId;

        if (user.role === 'director') {
            // 教务主任可发布全校通知（class_id=12）或指定班级
            classId = reqClassId ? parseInt(reqClassId) : 12;
        } else if (user.role === 'head_teacher') {
            // 班主任强制使用自己的班级
            const [bindings] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            if (bindings.length === 0) {
                return res.json({ code: 403, message: '您没有管理的班级', data: null });
            }
            classId = bindings[0].class_id;
        }

        const [result] = await db.query(
            `INSERT INTO notices 
             (class_id, title, content, publish_time, expire_time, status, created_by, updated_by, created_at, updated_at) 
             VALUES (?, ?, ?, NOW(), ?, 'published', ?, ?, NOW(), NOW())`,
            [classId, title, content, expireTime, user.id, user.id]
        );

        res.json({ code: 200, message: '发布成功', data: { id: result.insertId } });

    } catch (err) {
        console.error('发布通知失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 编辑通知
// 权限：班主任编辑本班未过期通知，主任可编辑任何通知
router.put('/:id', checkLogin, async (req, res) => {
    try {
        const noticeId = req.params.id;
        const { title, content } = req.body;
        const user = req.user;

        // 权限检查：只有班主任和教务主任可以编辑
        if (user.role !== 'head_teacher' && user.role !== 'director') {
            return res.json({ code: 403, message: '无权限编辑通知', data: null });
        }

        if (!title || !content) {
            return res.json({ code: 400, message: '标题和内容不能为空', data: null });
        }

        // 检查通知是否存在
        const [notices] = await db.query(
            'SELECT * FROM notices WHERE id = ? AND status = "published"',
            [noticeId]
        );

        if (notices.length === 0) {
            return res.json({ code: 404, message: '通知不存在', data: null });
        }

        const notice = notices[0];

        // 班主任需要校验本班归属和过期时间
        if (user.role === 'head_teacher') {
            const [bindings] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            
            if (bindings.length === 0 || bindings[0].class_id !== notice.class_id) {
                return res.json({ code: 403, message: '无权限编辑此通知', data: null });
            }

            // 校验通知未过期
            const now = new Date();
            const expireTime = new Date(notice.expire_time);
            if (now > expireTime) {
                return res.json({ code: 403, message: '通知已过期，无法编辑', data: null });
            }
        }
        // 教务主任可以编辑任何通知，不受过期限制

        await db.query(
            'UPDATE notices SET title = ?, content = ?, updated_at = NOW() WHERE id = ?',
            [title, content, noticeId]
        );

        res.json({ code: 200, message: '修改成功', data: null });

    } catch (err) {
        console.error('编辑通知失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 删除通知
// 权限：班主任删除本班未过期通知，主任可删除任何通知
router.delete('/:id', checkLogin, async (req, res) => {
    try {
        const noticeId = req.params.id;
        const user = req.user;

        // 权限检查：只有班主任和教务主任可以删除
        if (user.role !== 'head_teacher' && user.role !== 'director') {
            return res.json({ code: 403, message: '无权限删除通知', data: null });
        }

        // 检查通知是否存在
        const [notices] = await db.query(
            'SELECT * FROM notices WHERE id = ? AND status = "published"',
            [noticeId]
        );

        if (notices.length === 0) {
            return res.json({ code: 404, message: '通知不存在', data: null });
        }

        const notice = notices[0];

        // 班主任需要校验本班归属和过期时间
        if (user.role === 'head_teacher') {
            const [bindings] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            
            if (bindings.length === 0 || bindings[0].class_id !== notice.class_id) {
                return res.json({ code: 403, message: '无权限删除此通知', data: null });
            }

            // 校验通知未过期
            const now = new Date();
            const expireTime = new Date(notice.expire_time);
            if (now > expireTime) {
                return res.json({ code: 403, message: '通知已过期，无法删除', data: null });
            }
        }
        // 教务主任可以删除任何通知，不受过期限制

        // 软删除：更新状态为deleted
        await db.query(
            'UPDATE notices SET status = "deleted", updated_at = NOW() WHERE id = ?',
            [noticeId]
        );

        res.json({ code: 200, message: '删除成功', data: null });

    } catch (err) {
        console.error('删除通知失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 标记通知已读
// 权限：学生和班主任可标记，自动标记自己查看的通知
router.post('/:id/read', checkLogin, async (req, res) => {
    try {
        const noticeId = req.params.id;
        const user = req.user;

        // 只有学生和班主任可以标记已读
        if (user.role !== 'student' && user.role !== 'head_teacher') {
            return res.json({ code: 403, message: '无权限', data: null });
        }

        // 获取通知信息（包括标题）
        const [notices] = await db.query(
            'SELECT id, class_id, title FROM notices WHERE id = ? AND status = "published"',
            [noticeId]
        );

        if (notices.length === 0) {
            return res.json({ code: 404, message: '通知不存在', data: null });
        }

        const notice = notices[0];
        let userClassId = null;

        if (user.role === 'student') {
            // 获取学生所在班级
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );

            if (studentClasses.length === 0) {
                return res.json({ code: 403, message: '您没有加入任何班级', data: null });
            }

            userClassId = studentClasses[0].class_id;
        } else if (user.role === 'head_teacher') {
            // 获取班主任所在班级
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );

            if (teacherClasses.length === 0) {
                return res.json({ code: 403, message: '您没有管理的班级', data: null });
            }

            userClassId = teacherClasses[0].class_id;
        }

        // 校验通知班级与自身class_id一致（全校通知class_id为12，所有人可见）
        if (notice.class_id !== 12 && notice.class_id !== userClassId) {
            return res.json({ code: 403, message: '无权限标记此通知', data: null });
        }

        // 标记已读，使用 INSERT IGNORE 避免重复插入报错
        await db.query(
            'INSERT IGNORE INTO notice_reads (notice_id, student_user_id, read_at) VALUES (?, ?, NOW())',
            [noticeId, user.id]
        );

        // 手动记录阅读通知日志（包含通知标题）
        await writeOperationLog({
            userId: user.id,
            role: user.role,
            actionType: 'READ_NOTICE',
            targetType: '通知',
            targetId: notice.id,
            targetClassId: notice.class_id,
            detailJson: {
                description: `阅读了通知【${notice.title}】`,
                noticeId: notice.id,
                noticeTitle: notice.title
            },
            ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown'
        });

        res.json({ code: 200, message: '标记成功', data: null });

    } catch (err) {
        console.error('标记已读失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 获取未读通知数量
// 权限：学生和班主任
router.get('/unread-count', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        // 只有学生和班主任需要获取未读数量
        if (user.role !== 'student' && user.role !== 'head_teacher') {
            return res.json({ code: 200, message: '查询成功', data: { count: 0 } });
        }

        let classId;
        let userId = user.id;
        let createdByFilter = '';

        if (user.role === 'student') {
            // 获取学生所在班级
            const [studentClasses] = await db.query(
                'SELECT class_id FROM class_students WHERE student_user_id = ? AND status = 1',
                [user.id]
            );
            if (studentClasses.length === 0) {
                return res.json({ code: 200, message: '查询成功', data: { count: 0 } });
            }
            classId = studentClasses[0].class_id;
        } else if (user.role === 'head_teacher') {
            // 获取班主任所在班级
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            if (teacherClasses.length === 0) {
                return res.json({ code: 200, message: '查询成功', data: { count: 0 } });
            }
            classId = teacherClasses[0].class_id;
            // 班主任只统计教务主任发布的通知
            createdByFilter = 'AND n.created_by != ?';
            userId = [user.id, user.id];
        }

        // 查询未读通知数量（包括本班通知和全校通知）
        const query = `SELECT COUNT(*) as count
             FROM notices n
             WHERE n.status = "published"
             AND (n.class_id = ? OR n.class_id = 12)
             ${createdByFilter}
             AND n.id NOT IN (
                 SELECT notice_id FROM notice_reads WHERE student_user_id = ?
             )`;
        const params = user.role === 'head_teacher' ? [classId, user.id, user.id] : [classId, user.id];
        const [result] = await db.query(query, params);

        res.json({ code: 200, message: '查询成功', data: { count: result[0].count } });

    } catch (err) {
        console.error('查询未读数量失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

// 获取已读/未读名单
// 权限：班主任/主任可查看
router.get('/:id/read-status', checkLogin, async (req, res) => {
    try {
        const noticeId = req.params.id;
        const user = req.user;

        // 权限检查：只有班主任和教务主任可以查看
        if (user.role !== 'head_teacher' && user.role !== 'director') {
            return res.json({ code: 403, message: '无权限', data: null });
        }

        // 检查通知是否存在
        const [notices] = await db.query(
            'SELECT * FROM notices WHERE id = ? AND status = "published"',
            [noticeId]
        );

        if (notices.length === 0) {
            return res.json({ code: 404, message: '通知不存在', data: null });
        }

        const notice = notices[0];

        // 班主任只能查看自己发布的通知的已读状态
        if (user.role === 'head_teacher' && notice.created_by !== user.id) {
            return res.json({ code: 403, message: '无权限查看此通知的已读状态', data: null });
        }
        // 教务主任可以查看任何通知的已读统计

        // 获取班级总人数（排除发布者本人）
        let totalCount = 0;
        if (notice.class_id && notice.class_id !== 12) {
            // 班级通知：学生 + 班主任（排除发布者）
            const [studentResult] = await db.query(
                'SELECT COUNT(*) as count FROM class_students WHERE class_id = ? AND status = 1',
                [notice.class_id]
            );
            const [teacherResult] = await db.query(
                'SELECT COUNT(*) as count FROM class_teacher_bindings WHERE class_id = ? AND status = 1',
                [notice.class_id]
            );
            // 如果发布者是班主任，需要减去1
            const [publisherResult] = await db.query(
                'SELECT COUNT(*) as count FROM class_teacher_bindings WHERE class_id = ? AND teacher_user_id = ? AND status = 1',
                [notice.class_id, notice.created_by]
            );
            totalCount = studentResult[0].count + teacherResult[0].count - publisherResult[0].count;
        } else {
            // 全校通知，统计所有学生 + 班主任（排除发布者）
            const [totalResult] = await db.query(
                'SELECT COUNT(*) as count FROM users WHERE (role = "student" OR role = "head_teacher") AND status = 1 AND id != ?',
                [notice.created_by]
            );
            totalCount = totalResult[0].count;
        }

        // 获取已读学生列表
        const [readList] = await db.query(
            `SELECT
                u.real_name as studentName,
                nr.read_at as readTime
             FROM notice_reads nr
             JOIN users u ON nr.student_user_id = u.id
             WHERE nr.notice_id = ?
             ORDER BY nr.read_at DESC`,
            [noticeId]
        );

        // 获取未读学生列表
        let unreadList = [];
        if (notice.class_id && notice.class_id !== 12) {
            // 班级通知：学生 + 班主任（排除发布者本人）
            const [unreadResult] = await db.query(
                `SELECT
                    u.real_name as studentName
                 FROM (
                     SELECT student_user_id as user_id FROM class_students WHERE class_id = ? AND status = 1
                     UNION
                     SELECT teacher_user_id as user_id FROM class_teacher_bindings WHERE class_id = ? AND status = 1
                 ) AS users_in_class
                 JOIN users u ON users_in_class.user_id = u.id
                 WHERE users_in_class.user_id NOT IN (
                     SELECT student_user_id FROM notice_reads WHERE notice_id = ?
                 )
                 AND users_in_class.user_id != ?
                 ORDER BY u.real_name`,
                [notice.class_id, notice.class_id, noticeId, notice.created_by]
            );
            unreadList = unreadResult;
        } else {
            // 全校通知，包括学生和班主任（排除发布者本人）
            const [unreadResult] = await db.query(
                `SELECT
                    u.real_name as studentName
                 FROM users u
                 WHERE (u.role = "student" OR u.role = "head_teacher")
                 AND u.status = 1
                 AND u.id NOT IN (
                     SELECT student_user_id FROM notice_reads WHERE notice_id = ?
                 )
                 AND u.id != ?
                 ORDER BY u.real_name`,
                [noticeId, notice.created_by]
            );
            unreadList = unreadResult;
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                totalCount,
                readCount: readList.length,
                unreadCount: unreadList.length,
                readList,
                unreadList
            }
        });

    } catch (err) {
        console.error('查询已读状态失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
