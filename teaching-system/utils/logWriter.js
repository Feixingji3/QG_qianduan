/**
 * 日志写入工具函数
 *
 * 功能说明：
 * 用于中间件无法自动记录的场景，由业务代码主动调用
 * 典型场景：登录、导出、批量导入等
 *
 * 使用示例：
 *   await writeOperationLog({
 *       userId: user.id,
 *       role: user.role,
 *       actionType: 'LOGIN',
 *       detailJson: { description: '用户登录成功' }
 *   });
 *
 * 技术栈：原生 Node.js + MySQL
 */

const db = require('../db');

/**
 * 写入操作日志（手动调用）
 *
 * @param {Object} options - 日志参数
 * @param {number} options.userId - 操作用户ID（必填）
 * @param {string} options.role - 用户角色（必填）：director/head_teacher/student
 * @param {string} options.actionType - 操作类型（必填）：如 LOGIN、EXPORT_SCORES、IMPORT_SCORES
 * @param {string} options.targetType - 目标类型（可选）：如 班级、成绩、通知
 * @param {number} options.targetId - 目标ID（可选）
 * @param {number} options.targetClassId - 目标班级ID（可选，用于班主任筛选）
 * @param {Object} options.detailJson - 详细内容（可选）
 * @param {string} options.ip - IP地址（可选，默认自动获取）
 * @returns {Promise<Object>} 返回写入结果 { success: boolean, logId?: number }
 */
async function writeOperationLog(options) {
    try {
        const {
            userId,
            role,
            actionType,
            targetType = 'other',  // 修改为默认值，避免数据库null约束
            targetId = null,
            targetClassId = null,
            detailJson = {},
            ip = null
        } = options;

        // 参数校验
        if (!userId || !role || !actionType) {
            console.error('[日志写入] 参数错误：userId、role、actionType 为必填项');
            return { success: false, error: '参数错误' };
        }

        // 获取用户真实姓名
        let userName = detailJson.userName;
        if (!userName) {
            const [users] = await db.query(
                'SELECT real_name FROM users WHERE id = ?',
                [userId]
            );
            userName = users[0]?.real_name || '未知用户';
        }

        // 构建最终的 detail_json 对象
        const finalDetailJson = {
            ...detailJson,
            userName,           // 冗余存储用户名，避免查询时JOIN
            ipAddress: ip,      // IP地址
            timestamp: new Date().toISOString()
        };

        // 将对象转换为JSON字符串（确保MySQL接收的是字符串而非对象）
        const detailJsonString = JSON.stringify(finalDetailJson);

        // 插入数据库
        const [result] = await db.query(
            `INSERT INTO operation_logs
             (operator_user_id, operator_role, action_type, target_type, target_id, target_class_id, detail_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                userId,
                role,
                actionType,         // action_type: 如"LOGIN"
                targetType,         // target_type: 如"成绩"
                targetId,           // target_id
                targetClassId,      // target_class_id: 用于班主任筛选
                detailJsonString    // 必须是字符串，不能是对象
            ]
        );

        return {
            success: true,
            logId: result.insertId
        };

    } catch (error) {
        console.error('[日志写入] 写入失败:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * 批量写入日志
 * 用于需要记录多条日志的场景
 *
 * @param {Array} logs - 日志数组，每个元素为 writeOperationLog 的参数对象
 * @returns {Promise<Object>} 返回写入结果
 */
async function writeBatchLogs(logs) {
    const results = [];

    for (const log of logs) {
        const result = await writeOperationLog(log);
        results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    return {
        success: successCount === logs.length,
        total: logs.length,
        successCount,
        failCount: logs.length - successCount,
        results
    };
}

module.exports = {
    writeOperationLog,
    writeBatchLogs
};
