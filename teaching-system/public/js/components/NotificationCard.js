/**
 * 通知卡片组件 - Class封装版本
 * 支持两种模式：简洁模式（仪表盘）和详细模式（通知列表）
 * 
 * 使用方式：
 *   // 简洁模式
 *   const card = NotificationCard.createSimple({ title, className, time, ... });
 *   container.appendChild(card.element);
 *   
 *   // 详细模式
 *   const card = NotificationCard.createDetailed({ title, preview, publisherName, time, ... });
 *   container.appendChild(card.element);
 */

/**
 * HTML转义函数 - 防止XSS攻击
 * 将特殊字符转换为HTML实体
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

class NotificationCard {
    /**
     * 构造函数
     * @param {Object} options - 配置选项
     */
    constructor(options) {
        // 合并默认配置和传入配置
        const config = {
            id: null,
            title: '',
            className: '',
            time: '',
            preview: '',
            publisherName: '',
            isUnread: false,
            isActive: false,
            mode: 'simple',
            onClick: null,
            ...options
        };

        // 创建卡片DOM元素
        const card = document.createElement('div');
        
        // 根据模式渲染不同内容
        if (config.mode === 'detailed') {
            this.renderDetailed(card, config);
        } else {
            this.renderSimple(card, config);
        }

        // 绑定点击事件
        if (config.id && config.onClick) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => config.onClick(config.id));
        }

        // 将DOM元素保存为实例属性
        this.element = card;
    }

    /**
     * 渲染简洁模式（用于仪表盘）
     * @param {HTMLElement} card - 卡片DOM元素
     * @param {Object} config - 配置对象
     */
    renderSimple(card, config) {
        card.className = `notice-preview-item ${config.isUnread ? '' : 'notice-read'}`;
        
        const displayTitle = config.title.length > 20 
            ? config.title.substring(0, 20) + '...' 
            : config.title;
        
        card.innerHTML = `
            <div class="notice-preview-dot"></div>
            <div class="notice-preview-content">
                <div class="notice-preview-title">${escapeHtml(displayTitle)}</div>
                <div class="notice-preview-meta">
                    <span class="notice-preview-class">${escapeHtml(config.className)}</span>
                    <span class="notice-preview-time">${escapeHtml(config.time)}</span>
                </div>
            </div>
        `;
    }

    /**
     * 渲染详细模式（用于通知列表）
     * @param {HTMLElement} card - 卡片DOM元素
     * @param {Object} config - 配置对象
     */
    renderDetailed(card, config) {
        const classes = ['notice-item'];
        if (config.isUnread) classes.push('unread');
        if (!config.isUnread && config.isActive !== undefined) classes.push('read');
        if (config.isActive) classes.push('active');
        
        card.className = classes.join(' ');
        card.setAttribute('data-action', 'selectNotice');
        card.setAttribute('data-id', config.id);
        
        const previewText = config.preview 
            ? config.preview.substring(0, 50) + (config.preview.length > 50 ? '...' : '')
            : '';
        
        card.innerHTML = `
            <div class="notice-icon">📢</div>
            <div class="notice-content">
                <div class="notice-title">${escapeHtml(config.title)}</div>
                <div class="notice-preview">${escapeHtml(previewText)}</div>
                <div class="notice-meta">
                    <span>👤 ${escapeHtml(config.publisherName || '未知')}</span>
                    <span>•</span>
                    <span>📅 ${escapeHtml(config.time)}</span>
                    ${config.isUnread ? '<span class="notice-badge">新</span>' : ''}
                </div>
            </div>
        `;
    }

    /**
     * 静态工厂方法：创建简洁模式卡片
     * @param {Object} options - 配置选项
     * @returns {NotificationCard} 卡片实例
     */
    static createSimple(options) {
        return new NotificationCard({
            ...options,
            mode: 'simple'
        });
    }

    /**
     * 静态工厂方法：创建详细模式卡片
     * @param {Object} options - 配置选项
     * @returns {NotificationCard} 卡片实例
     */
    static createDetailed(options) {
        return new NotificationCard({
            ...options,
            mode: 'detailed'
        });
    }
}
