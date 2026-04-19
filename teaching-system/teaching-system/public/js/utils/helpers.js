/**
 * 工具函数集合
 * 
 * 包含常用优化函数：
 * - debounce: 防抖，延迟执行，只执行最后一次
 * - throttle: 节流，固定间隔执行
 * - escapeHtml: HTML转义，防止XSS攻击
 */

/**
 * HTML转义函数
 * 将特殊字符转换为HTML实体，防止XSS攻击
 * 
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 * 
 * 使用场景：动态渲染用户输入内容到页面时
 * 
 * 示例：
 * element.innerHTML = escapeHtml(userInput);
 */
function escapeHtml(text) {
    if (typeof text !== 'string') {
        text = String(text);
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 防抖函数
 * 延迟执行，在指定时间内多次调用只执行最后一次
 * 
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间（毫秒），默认300ms
 * @returns {Function} 防抖后的函数
 * 
 * 使用场景：筛选、分页、搜索输入等高频操作
 * 
 * 示例：
 * const debouncedSearch = debounce(loadSearchResults, 300);
 * input.addEventListener('input', debouncedSearch);
 */
function debounce(fn, delay = 300) {
    let timer = null;
    return function(...args) {
        // 清除上次的定时器
        if (timer) clearTimeout(timer);
        // 设置新的定时器
        timer = setTimeout(() => {
            fn.apply(this, args);
        }, delay);
    };
}

/**
 * 节流函数
 * 固定时间间隔内只执行一次
 * 
 * @param {Function} fn - 要执行的函数
 * @param {number} interval - 间隔时间（毫秒），默认300ms
 * @returns {Function} 节流后的函数
 * 
 * 使用场景：滚动事件、resize事件等持续触发操作
 * 
 * 示例：
 * const throttledScroll = throttle(handleScroll, 100);
 * window.addEventListener('scroll', throttledScroll);
 */
function throttle(fn, interval = 300) {
    let lastTime = 0;
    return function(...args) {
        const now = Date.now();
        // 如果距离上次执行超过间隔时间，则执行
        if (now - lastTime >= interval) {
            lastTime = now;
            fn.apply(this, args);
        }
    };
}

/**
 * 创建提交锁管理器
 * 用于防止表单重复提交
 * 
 * @param {Object} options - 配置选项
 * @param {string} options.buttonSelector - 提交按钮选择器
 * @param {string} options.loadingText - 加载中的按钮文字
 * @param {string} options.originalText - 原始按钮文字
 * @returns {Object} { lock, unlock, isLocked }
 * 
 * 使用示例：
 * const submitLock = createSubmitLock({
 *     buttonSelector: '#modalComponent .btn-primary',
 *     loadingText: '保存中...',
 *     originalText: '保存'
 * });
 * 
 * async function saveData() {
 *     if (submitLock.isLocked()) return;
 *     submitLock.lock();
 *     try {
 *         await API.post('/api/data', {...});
 *     } finally {
 *         submitLock.unlock();
 *     }
 * }
 */
function createSubmitLock(options = {}) {
    const {
        buttonSelector = '#modalComponent .btn-primary',
        loadingText = '保存中...',
        originalText = '保存'
    } = options;
    
    let isSubmitting = false;
    
    return {
        isLocked() {
            return isSubmitting;
        },
        lock() {
            isSubmitting = true;
            const btn = document.querySelector(buttonSelector);
            if (btn) {
                btn.disabled = true;
                btn.textContent = loadingText;
            }
        },
        unlock() {
            isSubmitting = false;
            const btn = document.querySelector(buttonSelector);
            if (btn) {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    };
}

/**
 * 桌面通知管理器
 * 封装浏览器 Notification API，实现新通知桌面提醒
 * 
 * 特性：
 * - 自动请求用户授权
 * - 支持点击通知跳转到指定页面
 * - 防止重复通知（相同tag的通知会替换）
 * - 优雅降级（不支持时静默失败）
 * 
 * 使用示例：
 * // 简单通知
 * NotificationManager.show('您有一条新通知');
 * 
 * // 完整配置
 * NotificationManager.show({
 *     title: '教学管理系统',
 *     body: '班主任发布了一条新通知',
 *     icon: '/images/logo.png',
 *     tag: 'new-notice',
 *     onClick: () => switchPage('notices')
 * });
 */
const NotificationManager = (function() {
    'use strict';
    
    let permission = 'default';
    
    /**
     * 初始化，请求通知权限
     */
    function init() {
        if (!('Notification' in window)) {
            console.log('浏览器不支持桌面通知');
            return Promise.resolve(false);
        }
        
        // 如果已经有权限，直接返回
        if (Notification.permission === 'granted') {
            permission = 'granted';
            return Promise.resolve(true);
        }
        
        // 请求权限
        return Notification.requestPermission().then(result => {
            permission = result;
            return result === 'granted';
        });
    }
    
    /**
     * 显示通知
     * @param {string|Object} options - 通知内容或配置对象
     * @returns {Notification|null} 通知对象
     */
    function show(options) {
        // 浏览器不支持或没有权限
        if (!('Notification' in window) || permission !== 'granted') {
            return null;
        }
        
        // 处理简单字符串调用
        if (typeof options === 'string') {
            options = { body: options };
        }
        
        const config = {
            title: '教学管理系统',
            body: '',
            icon: '', // 可配置图标路径
            tag: 'default', // 相同tag的通知会替换
            requireInteraction: false, // 是否保持显示直到用户交互
            ...options
        };
        
        try {
            const notification = new Notification(config.title, {
                body: config.body,
                icon: config.icon,
                tag: config.tag,
                requireInteraction: config.requireInteraction
            });
            
            // 绑定点击事件
            if (config.onClick) {
                notification.onclick = function() {
                    // 关闭通知
                    notification.close();
                    // 执行回调
                    config.onClick();
                    // 聚焦到当前窗口
                    window.focus();
                };
            }
            
            // 自动关闭（如果不requireInteraction）
            if (!config.requireInteraction) {
                setTimeout(() => {
                    notification.close();
                }, 5000);
            }
            
            return notification;
        } catch (error) {
            console.error('显示桌面通知失败:', error);
            return null;
        }
    }
    
    /**
     * 检查是否支持并已有权限
     */
    function isReady() {
        return 'Notification' in window && Notification.permission === 'granted';
    }
    
    /**
     * 获取当前权限状态
     */
    function getPermission() {
        if (!('Notification' in window)) return 'unsupported';
        return Notification.permission;
    }
    
    return {
        init,
        show,
        isReady,
        getPermission
    };
})();
