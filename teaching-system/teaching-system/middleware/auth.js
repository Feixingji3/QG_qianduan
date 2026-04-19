const jwt = require('jsonwebtoken');

// 从环境变量读取JWT密钥，与 routes/auth.js 保持一致
const SECRET = process.env.JWT_SECRET || 'TEACHING_SYSTEM_2025_FALLBACK';

// 密钥安全检查（生产环境警告）
if (!process.env.JWT_SECRET) {
    console.warn('[安全警告] 未设置 JWT_SECRET 环境变量，使用默认密钥。生产环境请务必设置！');
}

// 核心：校验登录态的中间件
const checkLogin = (req, res, next) => {
    try {
        // 从请求头拿token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ code: 401, message: '未登录', data: null });
        }
        const token = authHeader.split(' ')[1];
        // 校验token有效性
        const decoded = jwt.verify(token, SECRET);
        // 把用户信息挂到req上，给后续接口用
        req.user = decoded;
        next(); // 校验通过，继续执行接口
    } catch (err) {
        return res.status(401).json({ code: 401, message: 'token无效/过期', data: null });
    }
};

// 关键：必须导出checkLogin！否则routes里拿不到
module.exports = { checkLogin, SECRET };
