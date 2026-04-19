/**
 * 操作日志中间件
 *
 * 功能说明：
 * 1. 自动拦截 POST/PUT/DELETE 写操作
 * 2. 仅当接口返回成功（2xx状态码）时记录日志
 * 3. 自动从请求中提取 target_class_id
 * 4. 异步写入，不阻塞响应
 * 5. 生成清晰的操作描述：【谁】干了【什么】
 *
 * 核心原则（基于核心原则.md）：
 * - 只记录成功写操作
 * - 中间件统一拦截，减少代码重复
 * - 特殊行为（登录、导出、批量导入）由业务代码手动补录
 *
 * 技术栈：原生 Node.js + MySQL
 */

const db = require('../db');

/**
 * 从URL路径中提取ID
 * 如 /api/classes/5 提取 5
 *
 * @param {Object} req - Express请求对象
 * @returns {number|null} ID或null
 */
function extractIdFromPath(req) {
    const url = req.originalUrl || req.url || '';
    // 匹配 /api/xxx/123 格式的URL，提取最后的数字
    const match = url.match(/\/api\/[^/]+\/(\d+)(?:\/|$)/);
    if (match) {
        return parseInt(match[1], 10);
    }
    return null;
}

/**
 * 提取目标班级ID
 * 从请求的 body、params、query、URL路径中自动解析班级ID
 *
 * @param {Object} req - Express请求对象
 * @returns {number|null} 班级ID或null
 */
function extractTargetClassId(req) {
    // 1. 优先从 body 中获取（POST/PUT请求）
    if (req.body) {
        if (req.body.classId) return parseInt(req.body.classId, 10);
        if (req.body.class_id) return parseInt(req.body.class_id, 10);
    }

    // 2. 从 URL 参数中获取（如 /api/classes/5）
    if (req.params && req.params.id) {
        // 判断是否是班级相关路由
        const path = req.route?.path || req.path || '';
        if (path.includes('class') || path.includes('scores') || path.includes('notices')) {
            return parseInt(req.params.id, 10);
        }
    }

    // 3. 从URL路径中解析（中间件执行时req.params可能还未解析）
    const pathId = extractIdFromPath(req);
    if (pathId) {
        const url = req.originalUrl || req.url || '';
        // 如果是班级相关路由，提取的ID就是班级ID
        if (url.includes('/classes/') || url.includes('/scores/')) {
            return pathId;
        }
    }

    // 4. 从查询参数中获取（GET请求，虽然中间件不拦截GET，但以防万一）
    if (req.query) {
        if (req.query.classId) return parseInt(req.query.classId, 10);
        if (req.query.class_id) return parseInt(req.query.class_id, 10);
    }

    // 5. 无法确定班级ID
    return null;
}

/**
 * 从请求体中提取业务对象名称
 * 如班级名称、科目名称、学生姓名、通知标题等
 *
 * @param {Object} body - 请求体
 * @param {string} path - 请求路径
 * @returns {string} 业务对象名称
 */
function extractBusinessName(body, path) {
    if (!body) return '';

    // 班级相关
    if (path.includes('classes')) {
        return body.className || body.class_name || '';
    }

    // 成绩相关
    if (path.includes('scores')) {
        const parts = [];
        if (body.studentName) parts.push(body.studentName);
        if (body.subjectName) parts.push(body.subjectName);
        if (body.examName) parts.push(body.examName);
        return parts.join('-');
    }

    // 通知相关
    if (path.includes('notices')) {
        return body.title || '';
    }

    // 班级成员相关
    if (path.includes('class-students')) {
        return body.studentName || body.studentNameOrCode || '';
    }

    return '';
}

/**
 * 构建操作描述
 * 生成格式：【用户姓名】【动作】【目标类型】【目标名称】
 * 例如："张主任 创建了班级【大一1班】"
 *
 * @param {Object} req - Express请求对象
 * @param {Object} user - 当前用户信息
 * @returns {Object} 描述对象
 */
function buildDescription(req, user) {
    const method = req.method;
    // 使用 originalUrl 更可靠，中间件执行时 req.route?.path 可能为 undefined
    const path = req.originalUrl || req.route?.path || req.path || '';
    const body = req.body || {};

    // 获取用户姓名（优先使用 realName）
    const userName = user.realName || user.real_name || user.username || '未知用户';

    // 解析操作类型和目标类型
    let action = '';
    let targetType = '';

    if (path.includes('classes')) {
        targetType = '班级';
        if (method === 'POST') action = '创建了';
        else if (method === 'PUT') action = '修改了';
        else if (method === 'DELETE') action = '删除了';
    } else if (path.includes('scores')) {
        targetType = '成绩';
        if (method === 'POST') action = '录入了';
        else if (method === 'PUT') action = '修改了';
        else if (method === 'DELETE') action = '删除了';
    } else if (path.includes('notices')) {
        if (path.includes('read')) {
            targetType = '通知状态';
            action = '标记了已读';
        } else {
            targetType = '通知';
            if (method === 'POST') action = '发布了';
            else if (method === 'PUT') action = '修改了';
            else if (method === 'DELETE') action = '删除了';
        }
    } else if (path.includes('class-students')) {
        targetType = '班级成员';
        if (method === 'POST') action = '添加了';
        else if (method === 'DELETE') action = '移除了';
    }

    // 提取业务对象名称
    const businessName = extractBusinessName(body, path);

    // 构建详细描述
    let description = '';
    if (action && targetType) {
        if (businessName) {
            description = `${userName} ${action}${targetType}【${businessName}】`;
        } else {
            description = `${userName} ${action}${targetType}`;
        }
    } else {
        description = `${userName} 执行了${method}操作`;
    }

    return {
        description,
        action: action.replace(/了$/, ''), // 去掉末尾的"了"
        target: targetType,
        userName,
        businessName,
        path: req.originalUrl || req.url
    };
}

/**
 * 脱敏处理请求体
 * 移除密码等敏感字段
 *
 * @param {Object} body - 请求体
 * @returns {Object} 脱敏后的对象
 */
function sanitizeBody(body) {
    if (!body || typeof body !== 'object') return {};

    const sensitiveFields = ['password', 'newPassword', 'oldPassword', 'token', 'secret'];
    const clone = {};

    for (const key of Object.keys(body)) {
        if (sensitiveFields.includes(key)) {
            clone[key] = '***'; // 敏感字段用星号代替
        } else {
            clone[key] = body[key];
        }
    }

    return clone;
}

/**
 * 获取客户端IP地址
 *
 * @param {Object} req - Express请求对象
 * @returns {string} IP地址
 */
function getClientIp(req) {
    return req.headers['x-forwarded-for'] ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
}

/**
 * 操作日志中间件主函数
 * 拦截所有写操作，成功后自动记录日志
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件
 */
function operationLogger(req, res, next) {
    // 只拦截写操作（POST/PUT/DELETE）
    const writeMethods = ['POST', 'PUT', 'DELETE'];
    if (!writeMethods.includes(req.method)) {
        return next();
    }

    // 保存原始的 res.end 方法
    const originalEnd = res.end;

    // 重写 res.end 方法，在响应完成后记录日志
    res.end = function(chunk, encoding) {
        // 恢复原始方法
        res.end = originalEnd;
        res.end(chunk, encoding);

        // 仅成功响应（2xx状态码）才记录日志
        if (res.statusCode < 200 || res.statusCode >= 300) {
            return;
        }

        // 获取用户信息（由 checkLogin 中间件挂载）
        const user = req.user;
        if (!user) {
            console.log('[日志中间件] 未获取到用户信息，跳过记录');
            return;
        }

        try {
            // 提取目标班级ID和目标ID
            const targetClassId = res.locals?.targetClassId || extractTargetClassId(req);
            // 从URL路径中提取目标ID（中间件执行时req.params可能还未解析）
            const targetId = req.params?.id || extractIdFromPath(req) || null;

            // 构建操作描述（传入用户信息以生成更清晰的描述）
            const descInfo = buildDescription(req, user);

            // 构建 detail_json 对象
            const detailJson = {
                description: descInfo.description,
                userName: descInfo.userName,
                action: descInfo.action,
                target: descInfo.target,
                businessName: descInfo.businessName,
                path: descInfo.path,
                method: req.method,
                requestBody: sanitizeBody(req.body),
                ipAddress: getClientIp(req),
                timestamp: new Date().toISOString()
            };

            // 异步写入数据库，不阻塞响应
            db.query(
                `INSERT INTO operation_logs
                 (operator_user_id, operator_role, action_type, target_type, target_id, target_class_id, detail_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    user.id,
                    user.role,
                    descInfo.description,           // action_type: 如"张主任 创建了班级【大一1班】"
                    descInfo.target || '其他',      // target_type: 如"班级"
                    targetId,                        // target_id: URL中的ID
                    targetClassId,                   // target_class_id: 班级ID（用于班主任筛选）
                    JSON.stringify(detailJson)       // detail_json: 详细信息
                ]
            ).catch(err => {
                console.error('[日志中间件] 写入日志失败:', err.message);
            });

        } catch (error) {
            console.error('[日志中间件] 处理日志时出错:', error.message);
        }
    };

    next();
}

module.exports = operationLogger;
