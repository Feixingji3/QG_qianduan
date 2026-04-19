/**
 * API请求工具模块 - 简化版
 * 
 * 功能说明：
 * 本模块统一封装了HTTP请求，解决以下问题：
 * 1. 避免重复代码 - 每个页面都要写取token、发请求、处理错误
 * 2. 统一错误处理 - 401自动跳转登录页，其他错误统一提示
 * 3. 简化调用方式 - 一行代码完成请求
 * 
 * 技术栈：原生JavaScript，无第三方库
 */

const API = {
    /**
     * API基础地址
     * 所有请求都会自动拼接这个前缀
     */
    baseURL: '/api',

    /**
     * 核心请求方法 - 所有HTTP请求都走这里
     * 
     * @param {string} url - 接口路径，例如 '/classes'、'/auth/login'
     * @param {object} options - 请求配置
     *   - method: 请求方法，GET/POST/PUT/DELETE，默认GET
     *   - body: 请求体数据，POST/PUT时用到
     * @returns {Promise} 返回后端响应的data字段
     * 
     * 使用示例：
     *   const result = await API.request('/classes', { method: 'GET' });
     */
    async request(url, options = {}) {
        // 第1步：从本地存储获取用户登录令牌（token）
        // 用户登录时，服务器会返回token，我们把它存在localStorage里
        const token = localStorage.getItem('teaching_token');
        
        // 第2步：发送HTTP请求
        // 使用fetch API发送请求，自动带上token和Content-Type
        const response = await fetch(this.baseURL + url, {
            // 请求方法，默认GET
            method: options.method || 'GET',
            
            // 请求头，告诉服务器：
            // 1. 我发送的是JSON格式数据
            // 2. 我的身份令牌是什么（用于权限验证）
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            
            // 请求体，如果有数据就转成JSON字符串，GET请求没有body
            body: options.body ? JSON.stringify(options.body) : null
        });
        
        // 第3步：解析服务器返回的JSON数据
        // 无论成功失败，服务器都会返回JSON格式的响应
        const data = await response.json();
        
        // 第4步：错误处理
        // 后端用code字段表示业务状态：200成功，其他表示各种错误
        
        // 4.1 处理401错误 - 未登录或token过期
        // 这种情况需要让用户重新登录
        if (data.code === 401) {
            // 清除本地存储的登录信息
            localStorage.removeItem('teaching_token');
            localStorage.removeItem('teaching_userInfo');
            // 跳转到登录页面
            window.location.href = '/login.html';
            // 抛出错误，中断后续代码执行
            throw new Error('登录已过期，请重新登录');
        }
        
        // 4.2 处理其他业务错误（403无权限、404不存在、500服务器错误等）
        if (data.code !== 200) {
            // 抛出错误，让调用方知道请求失败了
            // 错误信息优先用服务器返回的message，没有就用默认提示
            throw new Error(data.message || '请求失败，请稍后重试');
        }
        
        // 第5步：返回成功数据
        // 只返回data字段，因为外层{code, message, data}的结构已经处理过了
        return data;
    },

    /**
     * GET请求 - 用于查询数据
     * 
     * @param {string} url - 接口路径
     * @param {object} params - 查询参数（可选）
     * @returns {Promise} 返回查询结果
     * 
     * 使用示例：
     *   // 查询所有班级
     *   const result = await API.get('/classes');
     *   // 带参数查询
     *   const result = await API.get('/classes', { page: 1, pageSize: 10 });
     *   // result.data 就是班级列表数组
     */
    get(url, params = null) {
        // 如果有查询参数，拼接到URL
        if (params) {
            const queryString = Object.keys(params)
                .filter(key => params[key] !== '' && params[key] !== null && params[key] !== undefined)
                .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
                .join('&');
            if (queryString) {
                url += '?' + queryString;
            }
        }
        return this.request(url, { method: 'GET' });
    },

    /**
     * POST请求 - 用于新增数据
     * 
     * @param {string} url - 接口路径
     * @param {object} body - 要提交的数据对象
     * @returns {Promise} 返回新增结果
     * 
     * 使用示例：
     *   // 新增班级
     *   const result = await API.post('/classes', { 
     *       className: '一班', 
     *       grade: '高一' 
     *   });
     */
    post(url, body) {
        return this.request(url, { method: 'POST', body });
    },

    /**
     * PUT请求 - 用于修改数据
     * 
     * @param {string} url - 接口路径（通常包含ID，如'/classes/1'）
     * @param {object} body - 要修改的数据对象
     * @returns {Promise} 返回修改结果
     * 
     * 使用示例：
     *   // 修改ID为1的班级
     *   const result = await API.put('/classes/1', { 
     *       className: '一班（改）' 
     *   });
     */
    put(url, body) {
        return this.request(url, { method: 'PUT', body });
    },

    /**
     * DELETE请求 - 用于删除数据
     * 
     * @param {string} url - 接口路径（通常包含ID，如'/classes/1'）
     * @returns {Promise} 返回删除结果
     * 
     * 使用示例：
     *   // 删除ID为1的班级
     *   const result = await API.delete('/classes/1');
     */
    delete(url) {
        return this.request(url, { method: 'DELETE' });
    }
};

/**
 * 兼容旧代码的API_BASE_URL常量
 * 有些旧代码可能直接用了API_BASE_URL，这里保持一致性
 */
const API_BASE_URL = API.baseURL;
