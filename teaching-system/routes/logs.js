//系统日志路由

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');

/**
 * 查询日志列表
 * GET /api/logs?page=1&pageSize=10&actionType=&startDate=&endDate=&userId=
 */
router.get('/', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        // 学生无权限查看日志
        if (user.role === 'student') {
            return res.status(403).json({
                code: 403,
                message: '无权限查看日志',
                data: null
            });
        }

        // 分页参数
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const offset = (page - 1) * pageSize;

        // 筛选参数
        const { actionType, startDate, endDate, userId, targetType } = req.query;
        console.log('后端接收到的参数:', req.query);
        console.log('解析后的日期:', { startDate, endDate });

        // 构建查询条件
        let whereClause = 'WHERE 1=1';
        const params = [];

        // 权限过滤：班主任只能查看本人的操作 或 本班学生的操作
        if (user.role === 'head_teacher') {
            // 获取班主任的班级ID
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            const classIds = teacherClasses.map(tc => tc.class_id);

            if (classIds.length > 0) {
                // 班主任只能看到
                whereClause += ` AND (operator_user_id = ? OR (target_class_id IN (${classIds.map(() => '?').join(',')}) AND operator_role = 'student'))`;
                params.push(user.id, ...classIds);
            } else {
                // 没有班级的班主任，只能看自己的操作
                whereClause += ' AND operator_user_id = ?';
                params.push(user.id);
            }
        }

        // 操作类型筛选
        if (actionType) {
            whereClause += ' AND action_type LIKE ?';
            params.push(`%${actionType}%`);
        }

        // 目标类型筛选
        if (targetType) {
            whereClause += ' AND target_type = ?';
            params.push(targetType);
        }

        // 用户筛选
        if (userId) {
            if (user.role === 'director') {
                // 教务主任可以筛选任何用户
                whereClause += ' AND l.operator_user_id = ?';
                params.push(userId);
            } else if (user.role === 'head_teacher') {
                // 班主任只能筛选本班学生或自己
                whereClause += ' AND l.operator_user_id = ?';
                params.push(userId);
            }
        }

        // 日期范围筛选 - 使用 DATE() 函数确保只比较日期部分，指定表别名 l
        if (startDate) {
            whereClause += ' AND DATE(l.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            whereClause += ' AND DATE(l.created_at) <= ?';
            params.push(endDate);
        }

        // 查询总数 - 使用表别名 l 与 whereClause 保持一致
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total FROM operation_logs l ${whereClause}`,
            params
        );
        const total = countResult[0].total;

        // 查询列表
        const [logs] = await db.query(
            `SELECT
                l.id,
                l.operator_user_id as userId,
                l.operator_role as role,
                l.action_type as actionType,
                l.target_type as targetType,
                l.target_id as targetId,
                l.target_class_id as targetClassId,
                l.detail_json as detailJson,
                l.created_at as createdAt,
                u.real_name as userName
             FROM operation_logs l
             LEFT JOIN users u ON l.operator_user_id = u.id
             ${whereClause}
             ORDER BY l.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, pageSize, offset]
        );

        // 解析 detail_json 字段
        const processedLogs = logs.map(log => {
            let detail = {};
            // MySQL JSON 列会自动解析为对象，如果是字符串才需要解析
            if (typeof log.detailJson === 'string') {
                try {
                    detail = JSON.parse(log.detailJson || '{}');
                } catch (e) {
                    detail = {};
                }
            } else if (typeof log.detailJson === 'object' && log.detailJson !== null) {
                // 已经是对象，直接使用
                detail = log.detailJson;
            }

            return {
                id: log.id,
                userId: log.userId,
                userName: log.userName || detail.userName || '未知用户',
                role: log.role,
                actionType: log.actionType,
                targetType: log.targetType,
                targetId: log.targetId,
                targetClassId: log.targetClassId,
                description: detail.description || log.actionType,
                ipAddress: detail.ipAddress || '-',
                createdAt: log.createdAt
            };
        });

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                list: processedLogs,
                total,
                page,
                pageSize
            }
        });

    } catch (err) {
        console.error('查询日志失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

/**
 * 导出日志（CSV格式）
 * GET /api/logs/export?actionType=&startDate=&endDate=&userId=
 * 权限：同查询接口
 */
router.get('/export', checkLogin, async (req, res) => {
    try {
        const user = req.user;

        // 学生无权限
        if (user.role === 'student') {
            return res.status(403).json({ code: 403, message: '无权限', data: null });
        }

        // 筛选参数（同查询接口）
        const { actionType, startDate, endDate, userId } = req.query;

        // 构建查询条件（同查询接口）
        let whereClause = 'WHERE 1=1';
        const params = [];

        if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            const classIds = teacherClasses.map(tc => tc.class_id);

            if (classIds.length > 0) {
                // 班主任只能看到：自己的操作 或 本班学生的操作
                whereClause += ` AND (operator_user_id = ? OR (target_class_id IN (${classIds.map(() => '?').join(',')}) AND operator_role = 'student'))`;
                params.push(user.id, ...classIds);
            } else {
                whereClause += ' AND operator_user_id = ?';
                params.push(user.id);
            }
        }

        if (actionType) {
            whereClause += ' AND action_type LIKE ?';
            params.push(`%${actionType}%`);
        }
        if (userId && user.role === 'director') {
            whereClause += ' AND operator_user_id = ?';
            params.push(userId);
        }
        if (startDate) {
            whereClause += ' AND l.created_at >= ?';
            params.push(`${startDate} 00:00:00`);
        }
        if (endDate) {
            whereClause += ' AND l.created_at <= ?';
            params.push(`${endDate} 23:59:59`);
        }

        // 查询所有数据（不分页）
        const [logs] = await db.query(
            `SELECT
                l.*,
                u.real_name as userName
             FROM operation_logs l
             LEFT JOIN users u ON l.operator_user_id = u.id
             ${whereClause}
             ORDER BY l.created_at DESC`,
            params
        );

        // 构建CSV内容
        const headers = ['序号', '时间', '用户', '角色', '操作类型', '目标类型', '描述'];
        const rows = logs.map((log, index) => {
            let detail = {};
            try {
                detail = JSON.parse(log.detail_json || '{}');
            } catch (e) {
                detail = {};
            }

            const roleMap = {
                'director': '教务主任',
                'head_teacher': '班主任',
                'student': '学生'
            };

            // 格式化时间，避免使用toLocaleString产生的逗号影响CSV格式
            const date = new Date(log.created_at);
            const timeStr = date.getFullYear() + '-' +
                String(date.getMonth() + 1).padStart(2, '0') + '-' +
                String(date.getDate()).padStart(2, '0') + ' ' +
                String(date.getHours()).padStart(2, '0') + ':' +
                String(date.getMinutes()).padStart(2, '0') + ':' +
                String(date.getSeconds()).padStart(2, '0');

            return [
                index + 1,
                timeStr,
                log.userName || detail.userName || '-',
                roleMap[log.operator_role] || log.operator_role,
                log.action_type,
                log.target_type || '-',
                detail.description || log.action_type
            ];
        });

        // 生成CSV
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        // 设置响应头，触发浏览器下载
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `操作日志_${dateStr}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.send('\ufeff' + csvContent); // BOM头，解决中文乱码

    } catch (err) {
        console.error('导出日志失败:', err);
        res.json({ code: 500, message: '导出失败：' + err.message, data: null });
    }
});

/**
 * 查询日志详情
 * GET /api/logs/:id
 */
router.get('/:id', checkLogin, async (req, res) => {
    try {
        const user = req.user;
        const logId = req.params.id;

        // 学生无权限
        if (user.role === 'student') {
            return res.status(403).json({ code: 403, message: '无权限', data: null });
        }

        // 查询日志
        const [logs] = await db.query(
            `SELECT l.*, u.real_name as userName
             FROM operation_logs l
             LEFT JOIN users u ON l.operator_user_id = u.id
             WHERE l.id = ?`,
            [logId]
        );

        if (logs.length === 0) {
            return res.json({ code: 404, message: '日志不存在', data: null });
        }

        const log = logs[0];

        // 权限检查：班主任只能查看本人的操作 或 本班学生的操作
        if (user.role === 'head_teacher') {
            const [teacherClasses] = await db.query(
                'SELECT class_id FROM class_teacher_bindings WHERE teacher_user_id = ? AND status = 1',
                [user.id]
            );
            const classIds = teacherClasses.map(tc => tc.class_id);

            // 班主任只能看到：自己的操作 或 本班学生的操作
            const isSelf = log.operator_user_id === user.id;
            const isStudentOfClass = classIds.includes(log.target_class_id) && log.operator_role === 'student';
            
            if (!isSelf && !isStudentOfClass) {
                return res.status(403).json({ code: 403, message: '无权限查看此日志', data: null });
            }
        }

        // 解析 detail_json
        let detail = {};
        try {
            detail = JSON.parse(log.detail_json || '{}');
        } catch (e) {
            detail = {};
        }

        res.json({
            code: 200,
            message: '查询成功',
            data: {
                id: log.id,
                userId: log.operator_user_id,
                userName: log.userName || detail.userName || '未知用户',
                role: log.operator_role,
                actionType: log.action_type,
                targetType: log.target_type,
                targetId: log.target_id,
                targetClassId: log.target_class_id,
                detailJson: detail,
                createdAt: log.created_at
            }
        });

    } catch (err) {
        console.error('查询日志详情失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
