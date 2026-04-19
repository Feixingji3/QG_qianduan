/**
 * 日志管理页面
 *
 * 功能说明：
 * 1. 日志列表展示（支持分页、时间倒序）
 * 2. 日志详情查看（完整请求参数、返回结果）
 * 3. 日志筛选（按操作类型、时间范围、用户）
 * 4. 日志导出
 */
(function() {
'use strict';

// 页面状态 - 使用const声明，IIFE内部作用域隔离，不会污染全局
const logPageState = {
    list: [],           // 日志列表
    currentPage: 1,     // 当前页码
    pageSize: 10,       // 每页条数
    total: 0,           // 总条数
    filters: {          // 筛选条件
        operationType: '',
        startDate: '',
        endDate: '',
        userId: ''
    },
    users: [],          // 用户列表（用于筛选）
    isLoading: false
};

/**
 * 初始化日志管理页面
 */
function initLogPage() {
    // 权限检查：仅允许教务主任和班主任访问
    // 学生角色会被拦截，显示无权限提示
    if (currentUser?.role !== ROLE_DIRECTOR && currentUser?.role !== ROLE_HEAD_TEACHER) {
        renderNoPermission();
        return;
    }
    
    // 从本地缓存读取筛选条件
    const cachedFilters = localStorage.getItem('log_filters');
    if (cachedFilters) {
        try {
            logPageState.filters = JSON.parse(cachedFilters);
        } catch (e) {
            console.error('读取缓存筛选条件失败:', e);
        }
    }

    // 根据角色渲染不同视图
    if (currentUser?.role === ROLE_DIRECTOR) {
        // 教务主任：查看全量日志
        renderLogPage();
        loadUserList();
        loadLogList();
    } else if (currentUser?.role === ROLE_HEAD_TEACHER) {
        // 班主任：查看本班相关日志
        // TODO: 后端需配合添加classId筛选条件
        renderLogPage();
        loadUserList();
        loadLogList();
    }
    
    // 回填筛选条件到表单
    setTimeout(() => {
        const typeSelect = document.getElementById('filterOperationType');
        const userSelect = document.getElementById('filterUser');
        const startDateInput = document.getElementById('filterStartDate');
        const endDateInput = document.getElementById('filterEndDate');
        if (typeSelect && logPageState.filters.operationType) typeSelect.value = logPageState.filters.operationType;
        if (userSelect && logPageState.filters.userId) userSelect.value = logPageState.filters.userId;
        if (startDateInput && logPageState.filters.startDate) startDateInput.value = logPageState.filters.startDate;
        if (endDateInput && logPageState.filters.endDate) endDateInput.value = logPageState.filters.endDate;
    }, 100);
    
    // 绑定事件委托
    bindEventDelegation();
}

/**
 * 事件委托绑定 - 统一处理所有点击事件，避免全局函数污染
 */
function bindEventDelegation() {
    // 绑定到 document 以捕获所有动态创建的弹窗事件
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
    // 查找最近的带有 data-action 的元素
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    
    const action = actionEl.dataset.action;
    
    // 如果需要阻止冒泡
    if (actionEl.dataset.stopPropagation === 'true') {
        e.stopPropagation();
    }
    
    // 根据 action 类型分发处理
    switch (action) {
        case 'applyFilters':
            applyFilters();
            break;
        case 'resetFilters':
            resetFilters();
            break;
        case 'exportLogs':
            exportLogs();
            break;
        case 'viewLogDetail':
            const logId = actionEl.dataset.id;
            if (logId) viewLogDetail(parseInt(logId));
            break;
        case 'goToPage':
            const page = actionEl.dataset.page;
            if (page) goToPage(parseInt(page));
            break;
    }
}

/**
 * 内容区域 change 事件处理
 */
function handleContentChange(e) {
    // 查找最近的带有 data-action 的元素
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    
    const action = actionEl.dataset.action;
    
    // 根据 action 类型分发处理
    switch (action) {
        case 'handleFilterChange':
            handleFilterChange();
            break;
    }
}

/**
 * 渲染无权限页面
 * 显示给无权限用户（学生）的友好提示
 */
function renderNoPermission() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
        <div class="card" style="min-height: 400px; display: flex; align-items: center; justify-content: center;">
            <div class="empty-state">
                <div class="empty-icon" style="font-size: 64px;">🚫</div>
                <div class="empty-title" style="font-size: var(--font-size-xl);">无访问权限</div>
                <div class="empty-desc">您没有权限查看日志信息</div>
            </div>
        </div>
    `;
}

/**
 * 渲染页面结构
 */
function renderLogPage() {
    const content = document.getElementById('pageContent');

    content.innerHTML = `
        <!-- 筛选栏 -->
        <div class="card">
            <div class="card-body">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">操作类型</label>
                        <select class="form-select" id="filterOperationType" data-action="handleFilterChange">
                            <option value="">全部类型</option>
                            <option value="LOGIN">登录</option>
                            <option value="LOGOUT">登出</option>
                            <option value="CREATE">新增</option>
                            <option value="UPDATE">修改</option>
                            <option value="DELETE">删除</option>
                            <option value="QUERY">查询</option>
                            <option value="EXPORT">导出</option>
                            <option value="IMPORT">导入</option>
                            <option value="READ">阅读</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">操作用户</label>
                        <select class="form-select" id="filterUser" data-action="handleFilterChange">
                            <option value="">全部用户</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">开始日期</label>
                        <input type="date" class="form-input" id="filterStartDate" data-action="handleFilterChange">
                    </div>
                    <div class="form-group">
                        <label class="form-label">结束日期</label>
                        <input type="date" class="form-input" id="filterEndDate" data-action="handleFilterChange">
                    </div>
                    <div class="form-group" style="display: flex; align-items: flex-end; gap: 8px;">
                        <button class="btn btn-primary" data-action="applyFilters">
                            <span>🔍</span> 筛选
                        </button>
                        <button class="btn btn-secondary" data-action="resetFilters">
                            <span>↺</span> 重置
                        </button>
                        <button class="btn btn-success" data-action="exportLogs">
                            <span>📥</span> 导出
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 日志列表 -->
        <div class="card">
            <div class="card-header">
                <span class="card-title">操作日志</span>
                <span id="logCountBadge" class="badge badge-primary">0 条记录</span>
            </div>
            <div class="card-body" style="padding: 0;">
                <div class="table-responsive">
                    <table class="data-table" id="logTable">
                        <thead>
                            <tr>
                                <th style="width: 80px;">序号</th>
                                <th style="width: 120px;">时间</th>
                                <th style="width: 100px;">用户</th>
                                <th style="width: 100px;">角色</th>
                                <th style="width: 100px;">操作类型</th>
                                <th>操作描述</th>
                                <th style="width: 80px;">IP地址</th>
                                <th style="width: 80px;">状态</th>
                                <th style="width: 100px;">操作</th>
                            </tr>
                        </thead>
                        <tbody id="logTableBody">
                            <!-- 动态加载 -->
                        </tbody>
                    </table>
                </div>
                
                <!-- 空状态 -->
                <div id="logEmptyState" class="empty-state" style="display: none; padding: 60px 20px;">
                    <div class="empty-icon">📋</div>
                    <div class="empty-title">暂无日志记录</div>
                    <div class="empty-desc">系统操作日志将显示在这里</div>
                </div>
            </div>
            <div class="card-footer">
                <span id="logPaginationInfo">共 0 条记录</span>
                <div class="pagination" id="logPagination">
                    <!-- 动态生成分页 -->
                </div>
            </div>
        </div>
    `;

    // 添加日志页面专用样式
    addLogStyles();
}

/**
 * 添加日志页面专用样式
 */
function addLogStyles() {
    if (document.getElementById('logPageStyles')) return;

    const style = document.createElement('style');
    style.id = 'logPageStyles';
    style.textContent = `
        /* 日志表格样式 */
        .log-row {
            cursor: pointer;
            transition: background var(--transition-fast);
        }

        .log-row:hover {
            background: var(--bg-hover);
        }

        .log-time {
            font-family: monospace;
            font-size: var(--font-size-xs);
            color: var(--text-secondary);
        }

        .log-type {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: var(--font-size-xs);
            font-weight: 500;
        }

        .log-type-login {
            background: rgba(91, 76, 219, 0.1);
            color: var(--primary-color);
        }

        .log-type-logout {
            background: rgba(108, 117, 125, 0.1);
            color: var(--text-secondary);
        }

        .log-type-create {
            background: rgba(40, 167, 69, 0.1);
            color: var(--success-color);
        }

        .log-type-update {
            background: rgba(255, 193, 7, 0.1);
            color: var(--warning-color);
        }

        .log-type-delete {
            background: rgba(220, 53, 69, 0.1);
            color: var(--error-color);
        }

        .log-type-query {
            background: rgba(23, 162, 184, 0.1);
            color: #17a2b8;
        }

        .log-type-export {
            background: rgba(111, 66, 193, 0.1);
            color: #6f42c1;
        }

        .log-type-import {
            background: rgba(40, 167, 69, 0.1);
            color: var(--success-color);
        }

        .log-type-read {
            background: rgba(23, 162, 184, 0.1);
            color: #17a2b8;
        }

        .log-status-success {
            color: var(--success-color);
        }

        .log-status-error {
            color: var(--error-color);
        }

        .log-desc {
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* 日志详情弹窗 */
        .log-detail-section {
            margin-bottom: var(--spacing-lg);
        }

        .log-detail-title {
            font-size: var(--font-size-sm);
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: var(--spacing-sm);
            padding-bottom: var(--spacing-xs);
            border-bottom: 1px solid var(--border-light);
        }

        .log-detail-item {
            display: flex;
            margin-bottom: var(--spacing-sm);
        }

        .log-detail-label {
            width: 100px;
            color: var(--text-secondary);
            font-size: var(--font-size-sm);
            flex-shrink: 0;
        }

        .log-detail-value {
            flex: 1;
            color: var(--text-primary);
            font-size: var(--font-size-sm);
            word-break: break-all;
        }

        .log-detail-code {
            background: var(--bg-hover);
            padding: var(--spacing-md);
            border-radius: var(--btn-radius);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: var(--font-size-xs);
            line-height: 1.6;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 300px;
            overflow-y: auto;
        }

        /* 徽章样式 */
        .badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 10px;
            border-radius: 12px;
            font-size: var(--font-size-xs);
            font-weight: 500;
        }

        .badge-primary {
            background: var(--primary-color);
            color: var(--text-white);
        }

        /* 弹窗基础样式 */
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
            max-width: 700px;
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
            border-radius: var(--btn-radius);
            font-size: var(--font-size-xl);
            color: var(--text-secondary);
            background: none;
            border: none;
            cursor: pointer;
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
 * 加载日志列表
 */
async function loadLogList() {
    const tbody = document.getElementById('logTableBody');
    const emptyState = document.getElementById('logEmptyState');
    const table = document.getElementById('logTable');

    // 显示加载状态
    tbody.innerHTML = `
        <tr>
            <td colspan="9" style="padding: 40px; text-align: center;">
                <div class="loading-skeleton" style="height: 200px;"></div>
            </td>
        </tr>
    `;

    try {
        const token = Auth.getToken();
        // 构建查询参数（注意：前端使用 operationType，后端使用 actionType）
        const params = new URLSearchParams({
            page: logPageState.currentPage,
            pageSize: logPageState.pageSize
        });

        // 映射前端筛选条件到后端参数名
        if (logPageState.filters.operationType) {
            params.append('actionType', logPageState.filters.operationType);
        }
        if (logPageState.filters.startDate) {
            params.append('startDate', logPageState.filters.startDate);
            console.log('发送开始日期:', logPageState.filters.startDate);
        }
        if (logPageState.filters.endDate) {
            params.append('endDate', logPageState.filters.endDate);
            console.log('发送结束日期:', logPageState.filters.endDate);
        }
        if (logPageState.filters.userId) {
            params.append('userId', logPageState.filters.userId);
        }
        
        console.log('完整请求URL:', `${API_BASE_URL}/logs?${params}`);

        const response = await fetch(`${API_BASE_URL}/logs?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.code === 200) {
            logPageState.list = data.data?.list || [];
            logPageState.total = data.data?.total || 0;

            // 更新徽章
            const badge = document.getElementById('logCountBadge');
            if (badge) {
                badge.textContent = `${logPageState.total} 条记录`;
            }

            if (logPageState.list.length === 0) {
                tbody.innerHTML = '';
                table.style.display = 'none';
                emptyState.style.display = 'flex';
            } else {
                emptyState.style.display = 'none';
                table.style.display = 'table';
                renderLogList();
            }

            renderPagination();
        } else {
            showError(data.message || '加载失败');
        }
    } catch (error) {
        console.error('加载日志列表失败:', error);
        showError('网络错误，请稍后重试');
    }
}

/**
 * 渲染日志列表
 */
function renderLogList() {
    const tbody = document.getElementById('logTableBody');

    tbody.innerHTML = logPageState.list.map((item, index) => {
        const seq = (logPageState.currentPage - 1) * logPageState.pageSize + index + 1;
        // 从 actionType 解析操作类型（如"创建班级" -> 类型为"创建"）
        const operationType = extractOperationType(item.actionType);
        const typeClass = getLogTypeClass(operationType);
        const typeText = getLogTypeText(operationType);

        return `
            <tr class="log-row" data-action="viewLogDetail" data-id="${item.id}">
                <td>${seq}</td>
                <td class="log-time">${formatDateTime(item.createdAt)}</td>
                <td>${escapeHtml(item.userName)}</td>
                <td>${escapeHtml(getRoleText(item.role))}</td>
                <td><span class="log-type ${typeClass}">${typeText}</span></td>
                <td class="log-desc" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</td>
                <td>${escapeHtml(item.ipAddress || '-')}</td>
                <td class="log-status-success">✓ 成功</td>
                <td>
                    <button class="btn btn-sm btn-secondary" data-action="viewLogDetail" data-id="${item.id}" data-stop-propagation="true">
                        查看
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 从 actionType 中提取操作类型
 * 支持中文描述和英文 actionType
 * 例如："创建班级" -> "CREATE"，"LOGIN" -> "LOGIN"
 */
function extractOperationType(actionType) {
    if (!actionType) return 'QUERY';

    // 优先检查英文 actionType（完全匹配）
    const upperActionType = actionType.toUpperCase();
    if (upperActionType === 'LOGIN') return 'LOGIN';
    if (upperActionType === 'LOGOUT') return 'LOGOUT';
    if (upperActionType === 'EXPORT_SCORES') return 'EXPORT';  // 成绩导出
    if (upperActionType === 'IMPORT_SCORES') return 'IMPORT';  // 批量导入
    if (upperActionType === 'READ_NOTICE') return 'READ';      // 阅读通知

    // 检查中文描述（包含匹配）
    if (actionType.includes('登录')) return 'LOGIN';
    if (actionType.includes('登出')) return 'LOGOUT';
    if (actionType.includes('创建') || actionType.includes('新增') || actionType.includes('录入') || 
        actionType.includes('发布') || actionType.includes('添加')) return 'CREATE';
    if (actionType.includes('修改') || actionType.includes('编辑') || actionType.includes('更新') || 
        actionType.includes('换绑')) return 'UPDATE';
    if (actionType.includes('删除') || actionType.includes('移除')) return 'DELETE';
    if (actionType.includes('导出')) return 'EXPORT';
    if (actionType.includes('导入')) return 'IMPORT';
    if (actionType.includes('阅读') || actionType.includes('已读')) return 'READ';
    if (actionType.includes('标记已读')) return 'UPDATE';

    return 'QUERY';
}

/**
 * 获取日志类型样式类
 */
function getLogTypeClass(type) {
    const typeMap = {
        'LOGIN': 'log-type-login',      // 紫色
        'LOGOUT': 'log-type-logout',    // 灰色
        'CREATE': 'log-type-create',    // 绿色
        'UPDATE': 'log-type-update',    // 黄色
        'DELETE': 'log-type-delete',    // 红色
        'QUERY': 'log-type-query',      // 蓝色
        'EXPORT': 'log-type-export',    // 紫色
        'IMPORT': 'log-type-import',    // 绿色（和新增一样）
        'READ': 'log-type-read'         // 蓝色（和查询一样）
    };
    return typeMap[type] || 'log-type-query';
}

/**
 * 获取日志类型显示文本
 */
function getLogTypeText(type) {
    const textMap = {
        'LOGIN': '登录',
        'LOGOUT': '登出',
        'CREATE': '新增',
        'UPDATE': '修改',
        'DELETE': '删除',
        'QUERY': '查询',
        'EXPORT': '导出',
        'IMPORT': '导入',
        'READ': '阅读'
    };
    return textMap[type] || type;
}

/**
 * 获取角色显示文本
 */
function getRoleText(role) {
    const roleMap = {
        'director': '教务主任',
        'head_teacher': '班主任',
        'student': '学生'
    };
    return roleMap[role] || role;
}

/**
 * 查看日志详情
 */
async function viewLogDetail(logId) {
    const item = logPageState.list.find(l => l.id === logId);
    if (!item) return;

    const operationType = extractOperationType(item.actionType);

    const contentHtml = `
        <div class="log-detail-section">
            <div class="log-detail-title">基本信息</div>
            <div class="log-detail-item">
                <span class="log-detail-label">日志ID：</span>
                <span class="log-detail-value">${item.id}</span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">操作时间：</span>
                <span class="log-detail-value">${formatFullDateTime(item.createdAt)}</span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">操作用户：</span>
                <span class="log-detail-value">${escapeHtml(item.userName)} (${getRoleText(item.role)})</span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">操作类型：</span>
                <span class="log-detail-value">
                    <span class="log-type ${getLogTypeClass(operationType)}">${getLogTypeText(operationType)}</span>
                </span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">操作描述：</span>
                <span class="log-detail-value">${escapeHtml(item.description)}</span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">目标类型：</span>
                <span class="log-detail-value">${escapeHtml(item.targetType || '-')}</span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">目标ID：</span>
                <span class="log-detail-value">${item.targetId || '-'}</span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">目标班级：</span>
                <span class="log-detail-value">${item.targetClassId || '-'}</span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">IP地址：</span>
                <span class="log-detail-value">${escapeHtml(item.ipAddress || '-')}</span>
            </div>
            <div class="log-detail-item">
                <span class="log-detail-label">执行状态：</span>
                <span class="log-detail-value log-status-success">✓ 执行成功</span>
            </div>
        </div>
    `;

    Modal.open({
        title: '日志详情',
        content: contentHtml,
        width: '700px',
        buttons: [
            { text: '关闭', type: 'secondary', action: 'close' }
        ]
    });
}

/**
 * 加载用户列表
 */
async function loadUserList() {
    try {
        const token = Auth.getToken();
        const response = await fetch(`${API_BASE_URL}/users/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.code === 200) {
            logPageState.users = data.data || [];

            const select = document.getElementById('filterUser');
            if (select) {
                const options = logPageState.users.map(u =>
                    `<option value="${u.id}">${escapeHtml(u.realName || u.username)}</option>`
                ).join('');
                select.innerHTML = '<option value="">全部用户</option>' + options;
            }
        }
    } catch (error) {
        console.error('加载用户列表失败:', error);
    }
}

/**
 * 筛选相关函数
 */
function handleFilterChange() {
    // 可以在这里添加防抖逻辑
}

function applyFilters() {
    const typeSelect = document.getElementById('filterOperationType');
    const userSelect = document.getElementById('filterUser');
    const startDateInput = document.getElementById('filterStartDate');
    const endDateInput = document.getElementById('filterEndDate');

    logPageState.filters.operationType = typeSelect?.value || '';
    logPageState.filters.userId = userSelect?.value || '';
    logPageState.filters.startDate = startDateInput?.value || '';
    logPageState.filters.endDate = endDateInput?.value || '';
    logPageState.currentPage = 1;
    
    console.log('筛选条件已更新:', logPageState.filters);
    
    // 缓存筛选条件到本地存储
    localStorage.setItem('log_filters', JSON.stringify(logPageState.filters));

    loadLogList();
}

function resetFilters() {
    const typeSelect = document.getElementById('filterOperationType');
    const userSelect = document.getElementById('filterUser');
    const startDateInput = document.getElementById('filterStartDate');
    const endDateInput = document.getElementById('filterEndDate');

    if (typeSelect) typeSelect.value = '';
    if (userSelect) userSelect.value = '';
    if (startDateInput) startDateInput.value = '';
    if (endDateInput) endDateInput.value = '';

    logPageState.filters = {
        operationType: '',
        startDate: '',
        endDate: '',
        userId: ''
    };
    logPageState.currentPage = 1;
    
    // 清除筛选条件缓存
    localStorage.removeItem('log_filters');

    loadLogList();
}

/**
 * 导出日志
 */
async function exportLogs() {
    try {
        const token = Auth.getToken();
        const params = new URLSearchParams({
            ...logPageState.filters,
            export: 'true'
        });

        const response = await fetch(`${API_BASE_URL}/logs/export?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `操作日志_${new Date().toLocaleDateString()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            alert('导出成功');
        } else {
            const data = await response.json();
            alert(data.message || '导出失败');
        }
    } catch (error) {
        console.error('导出日志失败:', error);
        alert('网络错误，请稍后重试');
    }
}

/**
 * 渲染分页
 */
function renderPagination() {
    const totalPages = Math.ceil(logPageState.total / logPageState.pageSize);
    const container = document.getElementById('logPagination');
    const info = document.getElementById('logPaginationInfo');

    info.textContent = `共 ${logPageState.total} 条记录，第 ${logPageState.currentPage}/${totalPages || 1} 页`;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = `
        <button class="page-btn" ${logPageState.currentPage === 1 ? 'disabled' : ''}
                data-action="goToPage" data-page="${logPageState.currentPage - 1}">上一页</button>
    `;

    const maxVisible = 5;
    let startPage = Math.max(1, logPageState.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
        html += `<button class="page-btn" data-action="goToPage" data-page="1">1</button>`;
        if (startPage > 2) html += `<span class="page-btn" disabled>...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === logPageState.currentPage ? 'active' : ''}"
                         data-action="goToPage" data-page="${i}">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="page-btn" disabled>...</span>`;
        html += `<button class="page-btn" data-action="goToPage" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `
        <button class="page-btn" ${logPageState.currentPage === totalPages ? 'disabled' : ''}
                data-action="goToPage" data-page="${logPageState.currentPage + 1}">下一页</button>
    `;

    container.innerHTML = html;
}

/**
 * 跳转到指定页
 */
function goToPage(page) {
    const totalPages = Math.ceil(logPageState.total / logPageState.pageSize);
    if (page < 1 || page > totalPages) return;

    logPageState.currentPage = page;
    loadLogList();
}

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

function formatFullDateTime(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatJson(jsonStr) {
    if (!jsonStr) return '{}';
    try {
        const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
        return JSON.stringify(obj, null, 2);
    } catch (e) {
        return escapeHtml(String(jsonStr));
    }
}

function showError(message) {
    const tbody = document.getElementById('logTableBody');
    const table = document.getElementById('logTable');
    const emptyState = document.getElementById('logEmptyState');

    table.style.display = 'none';
    emptyState.style.display = 'none';
    tbody.innerHTML = `
        <tr>
            <td colspan="9" style="padding: 40px; text-align: center;">
                <div class="empty-state">
                    <div class="empty-icon">❌</div>
                    <div class="empty-title">加载失败</div>
                    <div class="empty-desc">${message}</div>
                </div>
            </td>
        </tr>
    `;
}

// 只暴露初始化函数，其他所有功能通过事件委托处理，避免全局变量污染
window.initLogPage = initLogPage;

})();
