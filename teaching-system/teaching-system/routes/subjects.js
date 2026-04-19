/**
 * 科目管理路由
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { checkLogin } = require('../middleware/auth');

// 查询科目列表
router.get('/', checkLogin, async (req, res) => {
    try {
        const [subjects] = await db.query(
            'SELECT id, subject_name as subjectName FROM subjects WHERE status = 1 ORDER BY id'
        );
        
        res.json({ code: 200, message: '查询成功', data: subjects });
        
    } catch (err) {
        console.error('查询科目列表失败:', err);
        res.json({ code: 500, message: '服务器错误：' + err.message, data: null });
    }
});

module.exports = router;
