/**
 * 班级通知页面
 *
 * 功能说明：
 * 1. 通知列表展示（支持分页、时间倒序）
 * 2. 未读/已读状态区分（未读高亮、红点提醒）
 * 3. 通知展开/收起详情
 * 4. 发布通知（班主任）
 * 5. 编辑/删除通知（班主任，仅本班）
 * 6. 已读人数统计（班主任）
 * 7. 标记已读（学生）
 */
(function() {
'use strict';

// 页面状态 - 使用const声明，IIFE内部作用域隔离，不会污染全局
const noticePageState = {
    list: [],           // 通知列表
    currentPage: 1,     // 当前页码
    pageSize: 10,       // 每页条数
    total: 0,           // 总条数
    filters: {          // 筛选条件
        classId: '',
        status: ''      // read/unread
    },
    selectedNotice: null, // 当前选中的通知
    unreadCount: 0,     // 未读数量
    classes: [],        // 班级列表
    isLoading: false,
    isSubmitting: false, // 提交锁，防止重复提交
    readRefreshTimer: null, // 定时刷新已读统计的计时器
    notificationShown: false // 是否已显示过桌面通知（避免重复提醒）
};

/**
 * 初始化通知管理页面
 */
async function initNoticePage() {
    // 从本地缓存读取筛选条件
    const cachedFilters = localStorage.getItem('notice_filters');
    if (cachedFilters) {
        try {
            noticePageState.filters = JSON.parse(cachedFilters);
        } catch (e) {
            console.error('读取缓存筛选条件失败:', e);
        }
    }
    
    // 重置页面状态
    noticePageState.currentPage = 1;
    noticePageState.selectedNotice = null;

    renderNoticePage();
    
    // 回填筛选条件到表单
    setTimeout(() => {
        const classSelect = document.getElementById('filterClass');
        const statusSelect = document.getElementById('filterStatus');
        if (classSelect && noticePageState.filters.classId) {
            classSelect.value = noticePageState.filters.classId;
        }
        if (statusSelect && noticePageState.filters.status) {
            statusSelect.value = noticePageState.filters.status;
        }
    }, 100);

    const isStudent = currentUser?.role === ROLE_STUDENT;
    const isDirector = currentUser?.role === ROLE_DIRECTOR;
    const isHeadTeacher = currentUser?.role === ROLE_HEAD_TEACHER;

    // 只有教务主任需要加载班级列表进行筛选
    if (isDirector) {
        loadClassList();
    }

    // 绑定事件委托
    bindEventDelegation();

    // 加载通知列表
    await loadNoticeList();

    // 检查是否有从仪表盘跳转过来要查看的通知
    if (typeof pendingNoticeId === 'number' && pendingNoticeId > 0) {
        const notice = noticePageState.list.find(n => n.id === pendingNoticeId);
        if (notice) {
            // 自动选中该通知，会触发标记已读逻辑
            selectNotice(pendingNoticeId);
        }
        // 清空 pendingNoticeId，避免刷新页面后重复触发
        pendingNoticeId = null;
    }

    // 学生和班主任都加载未读数量
    if (isStudent || isHeadTeacher) {
        loadUnreadCount();
    }
}

/**
 * 事件委托绑定 - 统一处理所有点击事件，避免全局函数污染
 */
function bindEventDelegation() {
    const target = document;
    
    // 移除旧的事件监听器（如果存在）
    target.removeEventListener('click', handleContentClick);
    target.removeEventListener('change', handleContentChange);
    
    // 添加新的事件监听器
    target.addEventListener('click', handleContentClick);
    target.addEventListener('change', handleContentChange);
}

/**
 * 内容区域点击事件处理
 */
function handleContentClick(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    
    const action = actionEl.dataset.action;
    
    switch (action) {
        case 'applyFilters':
            debouncedApplyFilters();
            break;
        case 'resetFilters':
            resetFilters();
            break;
        case 'openNoticeModal':
            openNoticeModal();
            break;
        case 'selectNotice':
            const noticeId = actionEl.dataset.id;
            if (noticeId) selectNotice(parseInt(noticeId));
            break;
        case 'editNotice':
            const editId = actionEl.dataset.id;
            if (editId) editNotice(parseInt(editId));
            break;
        case 'deleteNotice':
            const deleteId = actionEl.dataset.id;
            if (deleteId) deleteNotice(parseInt(deleteId));
            break;
        case 'closeDeleteModal':
            closeDeleteModal();
            break;
        case 'confirmDeleteNotice':
            const confirmDeleteId = actionEl.dataset.id;
            if (confirmDeleteId) confirmDeleteNotice(parseInt(confirmDeleteId));
            break;
        case 'closeDetailCard':
            closeDetailCard();
            break;
        case 'viewReadDetails':
            const viewId = actionEl.dataset.id;
            if (viewId) viewReadDetails(parseInt(viewId));
            break;
        case 'goToPage':
            const page = actionEl.dataset.page;
            if (page) debouncedGoToPage(parseInt(page));
            break;
    }
}

/**
 * 内容区域 change 事件处理
 */
function handleContentChange(e) {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    
    const action = actionEl.dataset.action;
    
    switch (action) {
        case 'handleFilterChange':
            handleFilterChange();
            break;
    }
}

/**
 * 渲染页面结构
 */
function renderNoticePage() {
    const content = document.getElementById('pageContent');
    const isStudent = currentUser?.role === ROLE_STUDENT;
    const isHeadTeacher = currentUser?.role === ROLE_HEAD_TEACHER;
    const isDirector = currentUser?.role === ROLE_DIRECTOR;
    const canPublish = isHeadTeacher || isDirector;

    content.innerHTML = `
        <!-- 筛选栏 -->
        <div class="card">
            <div class="card-body">
                <div class="form-row">
                    ${isDirector ? `
                    <div class="form-group">
                        <label class="form-label">班级</label>
                        <select class="form-select" id="filterClass" data-action="handleFilterChange">
                            <option value="">全部班级</option>
                        </select>
                    </div>
                    ` : ''}
                    ${isStudent || isHeadTeacher ? `
                    <div class="form-group">
                        <label class="form-label">状态</label>
                        <select class="form-select" id="filterStatus" data-action="handleFilterChange">
                            <option value="">全部</option>
                            <option value="unread">未读</option>
                            <option value="read">已读</option>
                        </select>
                    </div>
                    ` : ''}
                    <div class="form-group" style="display: flex; align-items: flex-end; gap: 8px;">
                        <button class="btn btn-primary" data-action="applyFilters">
                            <span>🔍</span> 筛选
                        </button>
                        <button class="btn btn-secondary" data-action="resetFilters">
                            <span>↺</span> 重置
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 通知布局：左右分栏 -->
        <div class="notice-layout">
            <!-- 左侧：通知列表 -->
            <div class="card notice-list-card">
                <div class="card-header">
                    <span class="card-title">通知列表</span>
                    ${canPublish ? `
                    <button class="btn btn-primary btn-sm" data-action="openNoticeModal">
                        <span>+</span> 发布
                    </button>
                    ` : ''}
                </div>
                <div class="card-body" style="padding: 0;">
                    <div id="noticeListContainer">
                        <!-- 动态加载通知列表 -->
                    </div>
                    
                    <!-- 空状态 -->
                    <div id="noticeEmptyState" class="empty-state" style="display: none; padding: 40px;">
                        <div class="empty-icon">📭</div>
                        <div class="empty-title">暂无通知</div>
                        <div class="empty-desc">${isHeadTeacher ? '点击"发布"按钮发送第一条通知' : '暂无通知消息'}</div>
                    </div>
                </div>
                <div class="card-footer">
                    <span id="noticePaginationInfo">共 0 条记录</span>
                    <div class="pagination" id="noticePagination">
                        <!-- 动态生成分页 -->
                    </div>
                </div>
            </div>

            <!-- 右侧：通知详情（大屏显示） -->
            <div class="card notice-detail-card" id="noticeDetailCard">
                <div class="card-header">
                    <span class="card-title">通知详情</span>
                    <div id="detailActions" style="display: flex; gap: 8px;">
                        <!-- 动态生成操作按钮 -->
                    </div>
                </div>
                <div class="card-body" id="noticeDetailBody">
                    <div class="empty-state">
                        <div class="empty-icon">📢</div>
                        <div class="empty-title">请选择通知</div>
                        <div class="empty-desc">点击左侧列表查看通知详情</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 添加通知页面专用样式
    addNoticeStyles();
}

/**
 * 添加通知页面专用样式
 */
function addNoticeStyles() {
    if (document.getElementById('noticePageStyles')) return;

    const style = document.createElement('style');
    style.id = 'noticePageStyles';
    style.textContent = `
        /* 通知布局 */
        .notice-layout {
            display: grid;
            grid-template-columns: 380px 1fr;
            gap: var(--spacing-lg);
        }

        .notice-list-card {
            margin-bottom: 0;
        }

        .notice-detail-card {
            margin-bottom: 0;
        }

        /* 通知列表项 */
        .notice-item {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
            border-bottom: 1px solid var(--border-light);
            cursor: pointer;
            transition: all var(--transition-fast);
            position: relative;
        }

        .notice-item:hover {
            background: var(--bg-hover);
        }

        .notice-item.active {
            background: var(--bg-selected);
            border-left: 3px solid var(--primary-color);
        }

        .notice-item.unread {
            background: rgba(91, 76, 219, 0.03);
        }

        .notice-item.unread::before {
            content: '';
            position: absolute;
            left: 8px;
            top: 50%;
            transform: translateY(-50%);
            width: 6px;
            height: 6px;
            background: var(--error-color);
            border-radius: 50%;
        }

        .notice-icon {
            width: 40px;
            height: 40px;
            background: var(--primary-light);
            color: var(--text-white);
            border-radius: var(--btn-radius);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: var(--font-size-lg);
            flex-shrink: 0;
        }

        .notice-item.unread .notice-icon {
            background: var(--primary-color);
        }

        .notice-content {
            flex: 1;
            min-width: 0;
        }

        .notice-title {
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .notice-item.unread .notice-title {
            color: var(--primary-color);
        }

        /* 已读通知轻微置灰 */
        .notice-item.read {
            opacity: 0.85;
        }

        .notice-item.read .notice-icon {
            background: var(--border-light);
            color: var(--text-muted);
        }

        .notice-item.read .notice-title {
            color: var(--text-secondary);
            font-weight: 500;
        }

        .notice-item.read .notice-preview {
            color: var(--text-muted);
        }

        .notice-item.read:hover {
            opacity: 1;
        }

        .notice-preview {
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .notice-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 6px;
            font-size: var(--font-size-xs);
            color: var(--text-muted);
        }

        .notice-badge {
            padding: 1px 6px;
            background: var(--error-color);
            color: var(--text-white);
            border-radius: 10px;
            font-size: 10px;
        }

        /* 通知详情 */
        .notice-detail-header {
            margin-bottom: var(--spacing-md);
            padding-bottom: var(--spacing-md);
            border-bottom: 1px solid var(--border-light);
        }

        .notice-detail-title {
            font-size: var(--font-size-lg);
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 12px;
            line-height: 1.4;
        }

        .notice-detail-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
        }

        .notice-detail-meta span {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .notice-detail-body {
            font-size: var(--font-size-lg);
            line-height: 1.8;
            color: var(--text-primary);
            white-space: pre-wrap;
        }

        /* 已读统计 */
        .read-stats {
            display: flex;
            align-items: center;
            gap: var(--spacing-md);
            padding: var(--spacing-md);
            background: var(--bg-hover);
            border-radius: var(--btn-radius);
            margin-top: var(--spacing-lg);
        }

        .read-stats-item {
            text-align: center;
        }

        .read-stats-value {
            font-size: var(--font-size-xl);
            font-weight: 700;
            color: var(--primary-color);
        }

        .read-stats-label {
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
        }

        /* 响应式：中屏以下隐藏详情卡片 */
        @media screen and (max-width: 1199px) {
            .notice-layout {
                grid-template-columns: 1fr;
            }

            .notice-detail-card {
                display: none;
            }

            .notice-detail-card.show {
                display: block;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 1500;
                margin: 0;
                border-radius: 0;
            }
        }

        /* 弹窗样式 - 与班级管理模块保持一致 */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
            padding: var(--spacing-md);
        }

        .modal-container {
            background: var(--bg-card);
            border-radius: var(--card-radius);
            width: 100%;
            max-width: 480px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: var(--shadow-lg);
        }

        .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--spacing-md) var(--spacing-lg);
            border-bottom: 1px solid var(--border-light);
        }

        .modal-header h3 {
            font-size: var(--font-size-lg);
            font-weight: 600;
            margin: 0;
        }

        .modal-close {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: none;
            font-size: 24px;
            color: var(--text-tertiary);
            cursor: pointer;
            border-radius: var(--border-radius);
            transition: all var(--transition-fast);
        }

        .modal-close:hover {
            background: var(--bg-hover);
            color: var(--text-primary);
        }

        .modal-body {
            padding: var(--spacing-lg);
        }

        .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: var(--spacing-sm);
            padding: var(--spacing-md) var(--spacing-lg);
            border-top: 1px solid var(--border-light);
        }
    `;
    document.head.appendChild(style);
}

/**
 * 加载通知列表
 */
async function loadNoticeList() {
    const container = document.getElementById('noticeListContainer');
    const emptyState = document.getElementById('noticeEmptyState');

    if (!container) return;

    // 尝试从本地缓存读取通知列表（离线时展示缓存数据）
    const cachedNotices = localStorage.getItem('notice_list_cache');
    let hasCachedData = false;
    
    if (cachedNotices) {
        try {
            const cached = JSON.parse(cachedNotices);
            // 检查缓存是否过期（1小时）
            const cacheTime = cached.timestamp || 0;
            const now = Date.now();
            const oneHour = 60 * 60 * 1000;
            
            if (now - cacheTime < oneHour && cached.list && cached.list.length > 0) {
                noticePageState.list = cached.list;
                noticePageState.total = cached.total || cached.list.length;
                hasCachedData = true;
                
                // 先展示缓存数据
                if (noticePageState.list.length === 0) {
                    container.innerHTML = '';
                    emptyState.style.display = 'flex';
                } else {
                    emptyState.style.display = 'none';
                    renderNoticeList();
                }
                renderPagination();
            }
        } catch (e) {
            console.error('读取缓存通知列表失败:', e);
        }
    }

    // 如果没有缓存数据，显示加载状态
    if (!hasCachedData) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px;">
                <div class="loading-skeleton" style="height: 300px;"></div>
            </div>
        `;
    }

    try {
        const params = {
            page: noticePageState.currentPage,
            pageSize: noticePageState.pageSize,
            ...noticePageState.filters
        };

        const data = await API.get('/notices', params);

        noticePageState.list = data.data?.list || [];
        noticePageState.total = data.data?.total || 0;
        
        // 缓存通知列表到本地存储
        localStorage.setItem('notice_list_cache', JSON.stringify({
            list: noticePageState.list,
            total: noticePageState.total,
            timestamp: Date.now()
        }));

        if (noticePageState.list.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            renderNoticeList();
            
            // 首次加载有未读通知时，触发桌面提醒
            if (!noticePageState.notificationShown && NotificationManager.isReady()) {
                const unreadCount = noticePageState.list.filter(item => 
                    shouldShowUnread(item, currentUser?.role, currentUser?.id)
                ).length;
                
                if (unreadCount > 0) {
                    NotificationManager.show({
                        title: '教学管理系统',
                        body: `您有 ${unreadCount} 条未读通知，点击查看`,
                        tag: 'unread-notice',
                        onClick: () => {
                            // 点击通知聚焦到当前窗口并保持当前页面
                            window.focus();
                        }
                    });
                    noticePageState.notificationShown = true;
                }
            }
        }

        renderPagination();
    } catch (error) {
        console.error('加载通知列表失败:', error);
        // 如果有缓存数据，保持缓存展示并显示离线提示
        if (hasCachedData) {
            console.log('网络请求失败，使用缓存数据展示');
        } else {
            container.innerHTML = `
                <div class="empty-state" style="padding: 40px;">
                    <div class="empty-icon">❌</div>
                    <div class="empty-title">加载失败</div>
                    <div class="empty-desc">${error.message || '请稍后重试'}</div>
                </div>
            `;
        }
    }
}

/**
 * 渲染通知列表
 */
/**
 * 判断通知是否显示未读样式
 * @param {Object} item - 通知项
 * @param {string} userRole - 当前用户角色
 * @param {number} currentUserId - 当前用户ID
 * @returns {boolean} - 是否显示未读样式
 */
function shouldShowUnread(item, userRole, currentUserId) {
    // 已读的通知不显示未读样式
    const isUnread = !item.readId;
    if (!isUnread) return false;

    switch (userRole) {
        case ROLE_DIRECTOR:
            // 教务主任：所有通知不显示未读样式
            return false;
        
        case ROLE_HEAD_TEACHER:
            // 班主任：仅对来自教务主任的未读通知显示未读样式
            // 条件1：通知来自教务主任（不是自己发布的）
            // 条件2：通知状态为未读
            const isFromDirector = item.publisherId !== currentUserId;
            return isFromDirector;
        
        case ROLE_STUDENT:
            // 学生：对所有未读通知显示未读样式
            return true;
        
        default:
            return false;
    }
}

/**
 * 判断通知是否显示已读样式
 * @param {Object} item - 通知项
 * @param {string} userRole - 当前用户角色
 * @param {number} currentUserId - 当前用户ID
 * @returns {boolean} - 是否显示已读样式
 */
function shouldShowRead(item, userRole, currentUserId) {
    // 未读的通知不显示已读样式
    const isUnread = !item.readId;
    if (isUnread) return false;

    switch (userRole) {
        case ROLE_DIRECTOR:
            // 教务主任：所有通知不显示已读/未读样式
            return false;

        case ROLE_HEAD_TEACHER:
            // 班主任：仅对来自教务主任的已读通知显示已读样式
            const isFromDirector = item.publisherId !== currentUserId;
            return isFromDirector;

        case ROLE_STUDENT:
            // 学生：对所有已读通知显示已读样式
            return true;

        default:
            return false;
    }
}

/**
 * 渲染通知列表
 */
function renderNoticeList() {
    const container = document.getElementById('noticeListContainer');
    if (!container) return;

    const { role, id } = currentUser || {};
    container.innerHTML = '';

    noticePageState.list.forEach(item => {
        const showUnread = shouldShowUnread(item, role, id);
        const card = NotificationCard({
            id: item.id,
            title: item.title,
            preview: item.content,
            publisherName: item.publisherName,
            time: formatDateTime(item.publishTime),
            isUnread: showUnread,
            isActive: noticePageState.selectedNotice?.id === item.id,
            mode: 'detailed'
        });
        if (shouldShowRead(item, role, id)) card.classList.add('read');
        container.appendChild(card);
    });
}

/**
 * 选择通知查看详情
 */
async function selectNotice(noticeId) {
    const item = noticePageState.list.find(n => n.id === noticeId);
    if (!item) return;

    noticePageState.selectedNotice = item;

    // 更新列表激活状态
    document.querySelectorAll('.notice-item').forEach(el => {
        el.classList.remove('active');
    });
    const activeItem = document.querySelector(`[data-action="selectNotice"][data-id="${noticeId}"]`);
    if (activeItem) activeItem.classList.add('active');

    // 渲染详情
    renderNoticeDetail(item);

    // 学生自动标记已读，班主任查看教务主任发布的未读通知也自动标记已读
    const isHeadTeacher = currentUser?.role === ROLE_HEAD_TEACHER;
    const isFromDirector = item.publisherId !== currentUser?.id;
    if (!item.readId && (currentUser?.role === ROLE_STUDENT || (isHeadTeacher && isFromDirector))) {
        await markAsRead(noticeId);
        // 刷新未读数量
        loadUnreadCount();
    }

    // 中屏以下显示详情弹窗
    if (window.innerWidth < 1200) {
        document.getElementById('noticeDetailCard').classList.add('show');
    }
}

/**
 * 渲染通知详情
 */
function renderNoticeDetail(item) {
    const body = document.getElementById('noticeDetailBody');
    const actions = document.getElementById('detailActions');
    const isHeadTeacher = currentUser?.role === ROLE_HEAD_TEACHER;
    const isDirector = currentUser?.role === ROLE_DIRECTOR;
    const canManage = isHeadTeacher || isDirector;

    if (!body) return;

    // 操作按钮：教务主任可以编辑/删除任何通知，班主任只能编辑/删除自己发布的通知
    let actionHtml = '';
    const canEdit = isDirector || (isHeadTeacher && item.publisherId === currentUser?.id);
    if (canEdit) {
        actionHtml = `
            <button class="btn btn-secondary btn-sm" data-action="editNotice" data-id="${item.id}">编辑</button>
            <button class="btn btn-danger btn-sm" data-action="deleteNotice" data-id="${item.id}">删除</button>
        `;
    }
    if (window.innerWidth < 1200) {
        actionHtml += `<button class="btn btn-secondary btn-sm" data-action="closeDetailCard">关闭</button>`;
    }
    if (actions) actions.innerHTML = actionHtml;

    // 详情内容
    // 已读统计：教务主任可以查看任何通知，班主任只能查看自己发布的通知
    const canViewStats = isDirector || (isHeadTeacher && item.publisherId === currentUser?.id);
    body.innerHTML = `
        <div class="notice-detail-header">
            <div class="notice-detail-title">${escapeHtml(item.title)}</div>
            <div class="notice-detail-meta">
                <span>👤 发布人：${escapeHtml(item.publisherName || '未知')}</span>
                <span>🏫 班级：${escapeHtml(item.className || '全校')}</span>
                <span>📅 发布时间：${formatDateTime(item.publishTime)}</span>
            </div>
        </div>
        <div class="notice-detail-body">${escapeHtml(item.content)}</div>
        ${canViewStats ? renderReadStats(item) : ''}
    `;

    // 启动已读统计刷新
    if (canViewStats) {
        startReadStatsRefresh(item.id);
    }
}

/**
 * 渲染已读统计
 */
function renderReadStats(item) {
    const total = item.totalCount || 0;
    const read = item.readCount || 0;
    const unread = total - read;

    return `
        <div class="read-stats">
            <div class="read-stats-item">
                <div class="read-stats-value">${total}</div>
                <div class="read-stats-label">总人数</div>
            </div>
            <div class="read-stats-item">
                <div class="read-stats-value" style="color: var(--success-color);">${read}</div>
                <div class="read-stats-label">已读</div>
            </div>
            <div class="read-stats-item">
                <div class="read-stats-value" style="color: var(--error-color);">${unread}</div>
                <div class="read-stats-label">未读</div>
            </div>
            <div class="read-stats-item" style="margin-left: auto;">
                <button class="btn btn-secondary btn-sm" data-action="viewReadDetails" data-id="${item.id}">查看详情</button>
            </div>
        </div>
    `;
}

/**
 * 关闭详情卡片（移动端）
 */
function closeDetailCard() {
    const detailCard = document.getElementById('noticeDetailCard');
    if (detailCard) detailCard.classList.remove('show');
    noticePageState.selectedNotice = null;

    // 停止定时刷新
    if (noticePageState.readRefreshTimer) {
        clearInterval(noticePageState.readRefreshTimer);
        noticePageState.readRefreshTimer = null;
    }
}

/**
 * 标记通知已读
 */
async function markAsRead(noticeId) {
    try {
        await API.post(`/notices/${noticeId}/read`);

        // 更新本地状态
        const item = noticePageState.list.find(n => n.id === noticeId);
        if (item) item.readId = 1;

        // 重新渲染列表
        renderNoticeList();

        // 更新未读数
        loadUnreadCount();
    } catch (error) {
        console.error('标记已读失败:', error);
    }
}

/**
 * 加载未读数量
 */
async function loadUnreadCount() {
    // 学生和班主任都显示未读数量
    if (currentUser?.role !== ROLE_STUDENT && currentUser?.role !== ROLE_HEAD_TEACHER) return;

    try {
        const data = await API.get('/notices/unread-count');
        noticePageState.unreadCount = data.data?.count || 0;

        // 更新侧边栏徽章
        const badge = document.getElementById('sidebarBadge');
        if (badge) {
            badge.textContent = noticePageState.unreadCount;
            badge.style.display = noticePageState.unreadCount > 0 ? 'flex' : 'none';
        }
    } catch (error) {
        console.error('加载未读数量失败:', error);
    }
}

/**
 * 启动已读统计定时刷新
 */
function startReadStatsRefresh(noticeId) {
    // 清除之前的定时器
    if (noticePageState.readRefreshTimer) {
        clearInterval(noticePageState.readRefreshTimer);
    }

    // 立即刷新一次
    if (noticeId) refreshReadStats(noticeId);

    // 每10秒刷新一次
    noticePageState.readRefreshTimer = setInterval(() => {
        if (noticeId && noticePageState.selectedNotice?.id === noticeId) {
            refreshReadStats(noticeId);
        }
    }, 10000);
}

/**
 * 刷新已读统计
 */
async function refreshReadStats(noticeId) {
    try {
        const data = await API.get(`/notices/${noticeId}/read-status`);

        if (data.code === 200) {
            const stats = data.data;
            // 更新本地数据
            const item = noticePageState.list.find(n => n.id === noticeId);
            if (item) {
                item.totalCount = stats.totalCount;
                item.readCount = stats.readCount;
            }

            // 如果当前正在查看该通知，更新显示
            if (noticePageState.selectedNotice?.id === noticeId) {
                const statsContainer = document.querySelector('.read-stats');
                if (statsContainer) {
                    // 使用 stats 的数据（从API获取的最新数据）
                    statsContainer.outerHTML = renderReadStats({
                        id: noticeId,
                        totalCount: stats.totalCount,
                        readCount: stats.readCount
                    });
                }
            }
        }
    } catch (error) {
        console.error('刷新已读统计失败:', error);
    }
}

/**
 * 查看已读详情
 */
async function viewReadDetails(noticeId) {
    try {
        const data = await API.get(`/notices/${noticeId}/read-status`);

        if (data.code === 200) {
            const { readList, unreadList } = data.data;

            // 使用Modal组件显示已读/未读名单
            const contentHtml = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h4 style="color: var(--success-color); margin-bottom: 12px;">✅ 已读 (${readList.length})</h4>
                        <div style="max-height: 300px; overflow-y: auto;">
                            ${readList.map(s => `
                                <div style="padding: 8px; border-bottom: 1px solid var(--border-light);">
                                    ${escapeHtml(s.studentName || '未知')}
                                    <span style="color: var(--text-muted); font-size: 12px;">${formatDateTime(s.readTime)}</span>
                                </div>
                            `).join('') || '<div style="color: var(--text-muted);">暂无</div>'}
                        </div>
                    </div>
                    <div>
                        <h4 style="color: var(--error-color); margin-bottom: 12px;">❌ 未读 (${unreadList.length})</h4>
                        <div style="max-height: 300px; overflow-y: auto;">
                            ${unreadList.map(s => `
                                <div style="padding: 8px; border-bottom: 1px solid var(--border-light);">
                                    ${escapeHtml(s.studentName || '未知')}
                                </div>
                            `).join('') || '<div style="color: var(--text-muted);">暂无</div>'}
                        </div>
                    </div>
                </div>
            `;
            Modal.open({
                title: '已读统计',
                content: contentHtml,
                width: '600px',
                buttons: [{ text: '关闭', type: 'secondary', action: 'close' }]
            });
        } else {
            alert('加载失败: ' + data.message);
        }
    } catch (error) {
        console.error('加载已读详情失败:', error);
        alert('加载失败: ' + error.message);
    }
}

/**
 * 打开通知编辑弹窗
 */
function openNoticeModal(noticeId = null) {
    const isEdit = !!noticeId;
    const item = isEdit ? noticePageState.list.find(n => n.id === noticeId) : null;
    const isDirector = currentUser?.role === ROLE_DIRECTOR;

    // 构建表单内容
    const contentHtml = `
        ${!isEdit && isDirector ? `
        <div class="form-group">
            <label class="form-label">发布范围 <span style="color: var(--error-color);">*</span></label>
            <select class="form-select" id="modalNoticeClass">
                <option value="">全校通知</option>
                ${noticePageState.classes.map(c => `<option value="${c.id}">${escapeHtml(c.className)}</option>`).join('')}
            </select>
            <span style="font-size: 12px; color: var(--text-muted);">不选择则发布为全校通知</span>
        </div>
        ` : ''}
        <div class="form-group">
            <label class="form-label">标题 <span style="color: var(--error-color);">*</span></label>
            <input type="text"
                   class="form-input"
                   id="modalNoticeTitle"
                   value="${isEdit ? escapeHtml(item.title) : ''}"
                   placeholder="请输入通知标题">
        </div>
        <div class="form-group">
            <label class="form-label">内容 <span style="color: var(--error-color);">*</span></label>
            <textarea class="form-input"
                      id="modalNoticeContent"
                      rows="6"
                      placeholder="请输入通知内容">${isEdit ? escapeHtml(item.content) : ''}</textarea>
        </div>
    `;

    Modal.open({
        title: isEdit ? '编辑通知' : '发布通知',
        content: contentHtml,
        buttons: [
            { text: '取消', type: 'secondary', action: 'close' },
            { text: isEdit ? '保存' : '发布', type: 'primary', onClick: () => saveNotice(noticeId) }
        ]
    });
}

/**
 * 保存通知
 */
async function saveNotice(noticeId) {
    // 检查提交锁，防止重复提交
    if (noticePageState.isSubmitting) {
        console.log('正在保存中，忽略重复点击');
        return;
    }
    
    const titleInput = document.getElementById('modalNoticeTitle');
    const contentInput = document.getElementById('modalNoticeContent');
    const classSelect = document.getElementById('modalNoticeClass');
    
    if (!titleInput || !contentInput) {
        alert('表单元素不存在，请重试');
        return;
    }
    
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const classId = classSelect ? classSelect.value : '';

    if (!title) { alert('请输入标题'); return; }
    if (!content) { alert('请输入内容'); return; }
    
    // 设置提交锁并禁用按钮
    noticePageState.isSubmitting = true;
    const saveBtn = document.querySelector('#modalComponent .btn-primary');
    const originalText = saveBtn ? saveBtn.textContent : '发布';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
    }

    try {
        if (noticeId) {
            await API.put(`/notices/${noticeId}`, { title, content });
        } else {
            await API.post('/notices', { title, content, classId });
        }

        // 先关闭弹窗，等待动画完成后再显示提示
        Modal.close();
        
        // 延迟执行后续操作，确保弹窗关闭动画完成
        setTimeout(() => {
            loadNoticeList();
            
            // 如果当前正在查看该通知的详情，刷新详情页
            if (noticeId && noticePageState.selectedNotice?.id === noticeId) {
                const updatedItem = noticePageState.list.find(n => n.id === noticeId);
                if (updatedItem) {
                    updatedItem.title = title;
                    updatedItem.content = content;
                    renderNoticeDetail(updatedItem);
                }
            }
            
            alert(noticeId ? '修改成功' : '发布成功');
        }, 250);
    } catch (error) {
        console.error('保存通知失败:', error);
        alert(error.message || '操作失败');
    } finally {
        // 释放提交锁并恢复按钮
        noticePageState.isSubmitting = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }
}

/**
 * 编辑通知
 */
function editNotice(noticeId) {
    openNoticeModal(noticeId);
}

/**
 * 删除通知 - 使用弹窗确认
 */
function deleteNotice(noticeId) {
    const item = noticePageState.list.find(n => n.id === noticeId);
    if (!item) return;

    // 创建确认弹窗
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'deleteConfirmModal';
    modal.innerHTML = `
        <div class="modal-container" style="max-width: 400px;">
            <div class="modal-header">
                <h3>确认删除</h3>
                <button class="modal-close" data-action="closeDeleteModal">×</button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; padding: 20px 0;">
                    <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                    <p style="color: var(--text-primary); margin-bottom: 8px;">确定要删除这条通知吗？</p>
                    <p style="color: var(--text-secondary); font-size: 14px;">${escapeHtml(item.title)}</p>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" data-action="closeDeleteModal">取消</button>
                <button class="btn btn-danger" data-action="confirmDeleteNotice" data-id="${noticeId}">删除</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    
    // 强制重绘后添加show类，触发显示动画
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });
}

/**
 * 关闭删除确认弹窗
 */
function closeDeleteModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) {
        // 先移除show类，触发关闭动画
        modal.classList.remove('show');
        // 等待动画完成后移除元素
        setTimeout(() => {
            if (modal && modal.parentNode) {
                modal.remove();
            }
        }, 200);
    }
}

/**
 * 确认删除通知
 */
async function confirmDeleteNotice(noticeId) {
    try {
        await API.delete(`/notices/${noticeId}`);
        closeDeleteModal();
        closeDetailCard();
        loadNoticeList();
        alert('删除成功');
    } catch (error) {
        console.error('删除通知失败:', error);
        alert(error.message || '删除失败');
    }
}

/**
 * 加载班级列表
 */
async function loadClassList() {
    if (currentUser?.role === ROLE_STUDENT) return;

    try {
        const data = await API.get('/classes?page=1&pageSize=100');
        noticePageState.classes = data.data?.list || [];

        const select = document.getElementById('filterClass');
        if (select) {
            const options = noticePageState.classes.map(c =>
                `<option value="${c.id}">${escapeHtml(c.className)}</option>`
            ).join('');
            select.innerHTML = '<option value="">全部班级</option>' + options;
        }
    } catch (error) {
        console.error('加载班级列表失败:', error);
    }
}

/**
 * 筛选相关函数
 */
function handleFilterChange() {
    applyFilters();
}

function applyFilters() {
    const classSelect = document.getElementById('filterClass');
    const statusSelect = document.getElementById('filterStatus');

    noticePageState.filters.classId = classSelect?.value || '';
    noticePageState.filters.status = statusSelect?.value || '';
    noticePageState.currentPage = 1;
    
    // 缓存筛选条件到本地存储
    localStorage.setItem('notice_filters', JSON.stringify(noticePageState.filters));

    loadNoticeList();
}

function resetFilters() {
    const classSelect = document.getElementById('filterClass');
    const statusSelect = document.getElementById('filterStatus');

    if (classSelect) classSelect.value = '';
    if (statusSelect) statusSelect.value = '';

    noticePageState.filters = { classId: '', status: '' };
    noticePageState.currentPage = 1;
    
    // 清除筛选条件缓存
    localStorage.removeItem('notice_filters');

    loadNoticeList();
}

/**
 * 渲染分页
 */
function renderPagination() {
    const totalPages = Math.ceil(noticePageState.total / noticePageState.pageSize);
    const container = document.getElementById('noticePagination');
    const info = document.getElementById('noticePaginationInfo');

    if (info) info.textContent = `共 ${noticePageState.total} 条记录，第 ${noticePageState.currentPage}/${totalPages || 1} 页`;

    if (!container || totalPages <= 1) {
        if (container) container.innerHTML = '';
        return;
    }

    let html = `
        <button class="page-btn" ${noticePageState.currentPage === 1 ? 'disabled' : ''}
                data-action="goToPage" data-page="${noticePageState.currentPage - 1}">上一页</button>
    `;

    const maxVisible = 5;
    let startPage = Math.max(1, noticePageState.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        html += `<button class="page-btn" data-action="goToPage" data-page="1">1</button>`;
        if (startPage > 2) html += `<span class="page-btn" disabled>...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === noticePageState.currentPage ? 'active' : ''}"
                         data-action="goToPage" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="page-btn" disabled>...</span>`;
        html += `<button class="page-btn" data-action="goToPage" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
        <button class="page-btn" ${noticePageState.currentPage === totalPages ? 'disabled' : ''}
                data-action="goToPage" data-page="${noticePageState.currentPage + 1}">下一页</button>
    `;

    container.innerHTML = html;
}

/**
 * 跳转到指定页
 */
function goToPage(page) {
    const totalPages = Math.ceil(noticePageState.total / noticePageState.pageSize);
    if (page < 1 || page > totalPages) return;

    noticePageState.currentPage = page;
    loadNoticeList();
}

/**
 * 防抖处理的筛选函数（防止快速连续点击）
 */
const debouncedApplyFilters = debounce(applyFilters, 300);

/**
 * 防抖处理的分页函数（防止快速连续点击）
 */
const debouncedGoToPage = debounce(goToPage, 200);

/**
 * 工具函数
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 只暴露初始化函数，其他所有功能通过事件委托处理，避免全局变量污染
window.initNoticePage = initNoticePage;

// 页面卸载时停止定时器
window.addEventListener('beforeunload', () => {
    if (noticePageState.readRefreshTimer) {
        clearInterval(noticePageState.readRefreshTimer);
    }
});

})();
