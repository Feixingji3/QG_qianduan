/**
 * 通知卡片组件
 * 可复用的通知展示卡片，支持两种模式：
 * - 简洁模式：用于仪表盘最近通知（显示标题、班级、时间）
 * - 详细模式：用于通知模块列表（显示标题、预览、发布人、时间、未读标记）
 * 
 * @param {Object} options - 配置选项
 * @param {number} options.id - 通知ID
 * @param {string} options.title - 通知标题
 * @param {string} options.className - 班级名称（简洁模式）
 * @param {string} options.time - 相对时间（如"2小时前"）
 * @param {string} options.preview - 内容预览（详细模式）
 * @param {string} options.publisherName - 发布人名称（详细模式）
 * @param {boolean} options.isUnread - 是否未读（详细模式显示未读样式和标记）
 * @param {boolean} options.isActive - 是否选中（详细模式）
 * @param {string} options.mode - 模式：'simple'(简洁) 或 'detailed'(详细)，默认'simple'
 * @param {Function} options.onClick - 点击回调函数
 * @returns {HTMLElement} 卡片DOM元素
 */
function NotificationCard(options) {
    // 默认配置与传入配置合并
    const config = {
        id: null,
        title: '',
        className: '',
        time: '',
        preview: '',
        publisherName: '',
        isUnread: false,
        isActive: false,
        mode: 'simple',  // 'simple' 或 'detailed'
        onClick: null,
        ...options
    };

    // 创建卡片容器
    const card = document.createElement('div');
    
    // 根据模式设置不同的类名
    if (config.mode === 'detailed') {
        const classes = ['notice-item'];
        if (config.isUnread) classes.push('unread');
        if (!config.isUnread && config.isActive !== undefined) classes.push('read');
        if (config.isActive) classes.push('active');
        card.className = classes.join(' ');
        card.setAttribute('data-action', 'selectNotice');
        card.setAttribute('data-id', config.id);
    } else {
        card.className = `notice-preview-item ${config.isUnread ? '' : 'notice-read'}`;
    }
    
    // 如果有ID和点击回调，添加点击事件
    if (config.id && config.onClick) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => config.onClick(config.id));
    }

    // 标题处理（超过20字省略）
    const displayTitle = config.title.length > 20 
        ? config.title.substring(0, 20) + '...' 
        : config.title;

    // 根据模式渲染不同HTML
    if (config.mode === 'detailed') {
        // 详细模式：用于通知模块列表
        const previewText = config.preview?.substring(0, 50) + (config.preview?.length > 50 ? '...' : '');
        card.innerHTML = `
            <div class="notice-icon">📢</div>
            <div class="notice-content">
                <div class="notice-title">${escapeHtml(displayTitle)}</div>
                <div class="notice-preview">${escapeHtml(previewText || '')}</div>
                <div class="notice-meta">
                    <span>👤 ${escapeHtml(config.publisherName || '未知')}</span>
                    <span>•</span>
                    <span>📅 ${config.time}</span>
                    ${config.isUnread ? '<span class="notice-badge">新</span>' : ''}
                </div>
            </div>
        `;
    } else {
        // 简洁模式：用于仪表盘
        card.innerHTML = `
            <div class="notice-preview-dot"></div>
            <div class="notice-preview-content">
                <div class="notice-preview-title">${displayTitle}</div>
                <div class="notice-preview-meta">
                    <span class="notice-preview-class">${config.className}</span>
                    <span class="notice-preview-time">${config.time}</span>
                </div>
            </div>
        `;
    }

    return card;
}
