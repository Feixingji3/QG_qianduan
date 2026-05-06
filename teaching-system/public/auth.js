// 原生登录态工具（7天过期，非永久，纯原生无框架）
const Auth = {
    TOKEN_KEY: 'teaching_token',
    USER_KEY: 'teaching_user',
    EXPIRE_KEY: 'teaching_expire',
    EXPIRE_DAY: 7,

    // 保存登录态
    save(token, userInfo) {
        const expireTime = Date.now() + (this.EXPIRE_DAY * 24 * 60 * 60 * 1000);
        localStorage.setItem(this.TOKEN_KEY, token);
        localStorage.setItem(this.USER_KEY, JSON.stringify(userInfo));
        localStorage.setItem(this.EXPIRE_KEY, expireTime);
    },

    // 获取token
    getToken() {
        return localStorage.getItem(this.TOKEN_KEY) || null;
    },

    // 获取用户信息
    getUserInfo() {
        const userInfo = localStorage.getItem(this.USER_KEY);
        return userInfo ? JSON.parse(userInfo) : null;
    },

    // 判断是否登录（未过期）
    isLogin() {
        const token = this.getToken();
        const expire = localStorage.getItem(this.EXPIRE_KEY);
        if (!token || !expire) return false;
        return Date.now() < parseInt(expire);
    },

    // 退出登录
    logout() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        localStorage.removeItem(this.EXPIRE_KEY);
        // 清除筛选条件缓存
        localStorage.removeItem('score_filters');
        localStorage.removeItem('notice_filters');
        localStorage.removeItem('class_filters');
        localStorage.removeItem('log_filters');
        localStorage.removeItem('statistics_filters');
        // 清除通知列表缓存
        localStorage.removeItem('notice_list_cache');
        window.location.href = '/login.html';
    }
};