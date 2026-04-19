/**
 * 班级管理页面
 * 
 * 功能说明：
 * 1. 班级列表展示（支持分页）
 * 2. 班级筛选查询
 * 3. 新增/编辑班级（教务主任权限）
 * 4. 删除班级（教务主任权限）
 * 5. 绑定班主任（教务主任权限）
 */
(function() {
'use strict';

// 页面状态 - 使用const声明，IIFE内部作用域隔离，不会污染全局
const classPageState = {
    list: [],           // 班级列表数据
    currentPage: 1,     // 当前页码
    pageSize: 10,       // 每页条数
    total: 0,           // 总条数
    filters: {          // 筛选条件
        className: '',
        teacherId: ''
    },
    teachers: [],       // 班主任列表（用于下拉选择）
    isLoading: false,   // 加载状态
    isSubmitting: false, // 提交锁，防止重复提交（保存班级）
    isSubmittingAddStudent: false, // 提交锁，防止重复提交（添加学生）
    selectedClass: null, // 当前选中的班级
    students: [],       // 班级学生列表
    allStudents: []     // 所有学生列表（用于补录）
};

//初始化班级管理页面
function initClassPage() {
    // 从本地缓存读取筛选条件
    const cachedFilters = localStorage.getItem('class_filters');
    if (cachedFilters) {
        try {
            classPageState.filters = JSON.parse(cachedFilters);
        } catch (e) {
            console.error('读取缓存筛选条件失败:', e);
        }
    }
    
    // 重置页面状态，避免从其他页面切换过来时状态混乱
    classPageState.currentPage = 1;
    classPageState.selectedClass = null;
    classPageState.students = [];
    classPageState.isSubmitting = false; // 重置提交锁

    renderClassPage();
    
    // 回填筛选条件到表单
    setTimeout(() => {
        const classNameInput = document.getElementById('filterClassName');
        const teacherSelect = document.getElementById('filterTeacher');
        if (classNameInput && classPageState.filters.className) classNameInput.value = classPageState.filters.className;
        if (teacherSelect && classPageState.filters.teacherId) teacherSelect.value = classPageState.filters.teacherId;
    }, 100);
    
    loadClassList();
    
    // 教务主任需要加载班主任列表
    if (currentUser && currentUser.role === ROLE_DIRECTOR) {
        loadTeacherList();
    }
    
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
    target.removeEventListener('keyup', handleContentKeyup);
    // 添加新的事件监听器
    target.addEventListener('click', handleContentClick);
    target.addEventListener('change', handleContentChange);
    target.addEventListener('keyup', handleContentKeyup);
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
 * 内容区域 keyup 事件处理
 */
function handleContentKeyup(e) {
    // 查找最近的带有 data-action 的元素
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    
    const action = actionEl.dataset.action;
    
    // 根据 action 类型分发处理
    switch (action) {
        case 'handleFilterKeyup':
            handleFilterKeyup(e);
            break;
    }
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
            debouncedApplyFilters();
            break;
        case 'resetFilters':
            resetFilters();
            break;
        case 'openClassModal':
            openClassModal();
            break;
        case 'openAddStudentModal':
            openAddStudentModal();
            break;
        case 'selectClass':
            const classId = actionEl.dataset.id;
            if (classId) selectClass(parseInt(classId));
            break;
        case 'editClass':
            const editId = actionEl.dataset.id;
            if (editId) editClass(parseInt(editId));
            break;
        case 'deleteClass':
            const deleteId = actionEl.dataset.id;
            const className = actionEl.dataset.name;
            if (deleteId) deleteClass(parseInt(deleteId), className);
            break;
        case 'goToPage':
            const page = actionEl.dataset.page;
            if (page) debouncedGoToPage(parseInt(page));
            break;
        case 'removeStudentFromClass':
            const studentId = actionEl.dataset.id;
            const studentName = actionEl.dataset.name;
            if (studentId) removeStudentFromClass(parseInt(studentId), studentName);
            break;
        case 'closeAddStudentModal':
            closeAddStudentModal();
            break;
        case 'switchTab':
            const tab = actionEl.dataset.tab;
            if (tab) switchTab(tab);
            break;
        case 'confirmAddStudent':
            confirmAddStudent();
            break;
    }
}

/**
 * 渲染页面结构
 */
function renderClassPage() {
    const content = document.getElementById('pageContent');
    if (!content) {
        console.error('pageContent 元素不存在');
        return;
    }
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;

    content.innerHTML = `
        <!-- 筛选栏 -->
        <div class="card">
            <div class="card-body">
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">班级名称</label>
                        <input type="text" 
                               class="form-input" 
                               id="filterClassName" 
                               placeholder="请输入班级名称"
                               data-action="handleFilterKeyup">
                    </div>
                    ${isDirector ? `
                    <div class="form-group">
                        <label class="form-label">班主任</label>
                        <select class="form-select" id="filterTeacher" data-action="handleFilterChange">
                            <option value="">全部班主任</option>
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

        <!-- 班级列表 -->
        <div class="card">
            <div class="card-header">
                <span class="card-title">班级列表</span>
                <div style="display: flex; gap: 8px;">
                    ${isDirector ? `
                    <button class="btn btn-success" data-action="openAddStudentModal" id="btnAddStudent" style="display: none;">
                        <span>+</span> 补录成员
                    </button>
                    ` : ''}
                    ${isDirector ? `
                    <button class="btn btn-primary" data-action="openClassModal">
                        <span>+</span> 新增班级
                    </button>
                    ` : ''}
                </div>
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>班级名称</th>
                                <th>班主任</th>
                                <th>学生人数</th>
                                <th>创建时间</th>
                                ${isDirector ? '<th>操作</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="classTableBody">
                            <!-- 动态加载 -->
                        </tbody>
                    </table>
                </div>

                <!-- 空状态 -->
                <div id="classEmptyState" class="empty-state" style="display: none;">
                    <div class="empty-icon" id="emptyStateIcon">📭</div>
                    <div class="empty-title" id="emptyStateTitle">暂无班级数据</div>
                    <div class="empty-desc" id="emptyStateDesc">${isDirector ? '点击"新增班级"按钮创建第一个班级' : '请联系教务主任添加班级'}</div>
                </div>

                <!-- 学生列表区域 -->
                <div id="studentListSection" style="display: none; margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-light);">
                    <div class="card-header" style="padding: 0 0 16px 0;">
                        <span class="card-title" id="studentListTitle">学生列表</span>
                    </div>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>学号</th>
                                    <th>姓名</th>
                                    <th>用户名</th>
                                    ${isDirector ? '<th>操作</th>' : ''}
                                </tr>
                            </thead>
                            <tbody id="studentTableBody">
                                <!-- 动态加载 -->
                            </tbody>
                        </table>
                    </div>
                    <div id="studentEmptyState" class="empty-state" style="display: none; padding: 40px;">
                        <div class="empty-icon">👨‍🎓</div>
                        <div class="empty-title">暂无学生</div>
                        <div class="empty-desc">该班级还没有学生</div>
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <span id="classPaginationInfo">共 0 条记录</span>
                <div class="pagination" id="classPagination">
                    <!-- 动态生成分页 -->
                </div>
            </div>
        </div>
    `;
}

/**
 * 加载班级列表
 */
async function loadClassList() {
    const tbody = document.getElementById('classTableBody');
    const emptyState = document.getElementById('classEmptyState');
    
    // 检查元素是否存在（页面切换时可能不存在）
    if (!tbody) {
        console.log('班级列表表格不存在，可能已切换到其他页面');
        return;
    }
    
    // 显示骨架屏加载状态
    tbody.innerHTML = `
        <tr>
            <td colspan="${currentUser?.role === ROLE_DIRECTOR ? 5 : 4}" class="empty-state">
                <div class="loading-skeleton" style="height: 200px;"></div>
            </td>
        </tr>
    `;
    
    try {
        const params = {
            page: classPageState.currentPage,
            pageSize: classPageState.pageSize,
            excludeSchool: 'true', // 班级管理模块排除"全校"班级
            ...classPageState.filters
        };
        
        const data = await API.get('/classes', params);
        
        classPageState.list = data.data?.list || [];
        classPageState.total = data.data?.total || 0;
        
        // 直接渲染，不延迟
        if (classPageState.list.length === 0) {
            tbody.innerHTML = '';
            // 根据是否有筛选条件显示不同的空状态提示
            updateEmptyState();
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            renderClassTable();
        }
        
        renderPagination();
        
    } catch (error) {
        console.error('加载班级列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color: var(--error-color); padding: 20px;">加载失败，请刷新页面重试</td></tr>';
        showError(error.message || '网络错误，请稍后重试');
    }
}

/**
 * 渲染班级表格
 */
function renderClassTable() {
    const tbody = document.getElementById('classTableBody');
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;

    tbody.innerHTML = classPageState.list.map(item => {
        const isSelected = classPageState.selectedClass && classPageState.selectedClass.id === item.id;
        return `
        <tr class="class-row ${isSelected ? 'selected' : ''}" data-action="selectClass" data-id="${item.id}" style="cursor: pointer;">
            <td>
                <strong>${escapeHtml(item.className)}</strong>
            </td>
            <td>${item.teacherName ? escapeHtml(item.teacherName) : '<span style="color: var(--text-muted);">未分配</span>'}</td>
            <td>${item.studentCount || 0} 人</td>
            <td>${formatDate(item.createdAt)}</td>
            ${isDirector ? `
            <td>
                <button class="btn btn-secondary btn-sm" data-action="editClass" data-id="${item.id}" data-stop-propagation="true">
                    编辑
                </button>
                <button class="btn btn-danger btn-sm" data-action="deleteClass" data-id="${item.id}" data-name="${escapeHtml(item.className)}" data-stop-propagation="true">
                    删除
                </button>
            </td>
            ` : ''}
        </tr>
    `}).join('');
}

/**
 * 渲染分页
 */
function renderPagination() {
    const totalPages = Math.ceil(classPageState.total / classPageState.pageSize);
    const container = document.getElementById('classPagination');
    const info = document.getElementById('classPaginationInfo');
    
    info.textContent = `共 ${classPageState.total} 条记录，第 ${classPageState.currentPage}/${totalPages} 页`;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = `
        <button class="page-btn" ${classPageState.currentPage === 1 ? 'disabled' : ''} 
                data-action="goToPage" data-page="${classPageState.currentPage - 1}">上一页</button>
    `;
    
    // 页码显示逻辑
    const maxVisible = 5;
    let startPage = Math.max(1, classPageState.currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }
    
    if (startPage > 1) {
        html += `<button class="page-btn" data-action="goToPage" data-page="1">1</button>`;
        if (startPage > 2) html += `<span class="page-btn" disabled>...</span>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="page-btn ${i === classPageState.currentPage ? 'active' : ''}" 
                         data-action="goToPage" data-page="${i}">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) html += `<span class="page-btn" disabled>...</span>`;
        html += `<button class="page-btn" data-action="goToPage" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    html += `
        <button class="page-btn" ${classPageState.currentPage === totalPages ? 'disabled' : ''} 
                data-action="goToPage" data-page="${classPageState.currentPage + 1}">下一页</button>
    `;
    
    container.innerHTML = html;
}

/**
 * 跳转到指定页
 */
function goToPage(page) {
    const totalPages = Math.ceil(classPageState.total / classPageState.pageSize);
    if (page < 1 || page > totalPages) return;
    
    classPageState.currentPage = page;
    loadClassList();
}

/**
 * 加载班主任列表
 */
async function loadTeacherList() {
    try {
        const data = await API.get('/teachers');
        
        classPageState.teachers = data.data || [];
        
        // 更新筛选下拉框
        const select = document.getElementById('filterTeacher');
        if (select) {
            const options = classPageState.teachers.map(t => 
                `<option value="${t.id}">${escapeHtml(t.realName || t.username)}</option>`
            ).join('');
            select.innerHTML = '<option value="">全部班主任</option>' + options;
        }
    } catch (error) {
        console.error('加载班主任列表失败:', error);
    }
}

/**
 * 筛选相关函数
 */
function handleFilterKeyup(event) {
    if (event.key === 'Enter') {
        applyFilters();
    }
}

function handleFilterChange() {
    applyFilters();
}

function applyFilters() {
    const classNameInput = document.getElementById('filterClassName');
    const teacherSelect = document.getElementById('filterTeacher');
    
    classPageState.filters.className = classNameInput?.value?.trim() || '';
    classPageState.filters.teacherId = teacherSelect?.value || '';
    classPageState.currentPage = 1;
    
    // 缓存筛选条件到本地存储
    localStorage.setItem('class_filters', JSON.stringify(classPageState.filters));
    
    loadClassList();
}

function resetFilters() {
    const classNameInput = document.getElementById('filterClassName');
    const teacherSelect = document.getElementById('filterTeacher');
    
    if (classNameInput) classNameInput.value = '';
    if (teacherSelect) teacherSelect.value = '';
    
    classPageState.filters = { className: '', teacherId: '' };
    classPageState.currentPage = 1;
    
    // 清除筛选条件缓存
    localStorage.removeItem('class_filters');
    
    loadClassList();
}

/**
 * 更新空状态提示
 * 根据是否有筛选条件显示不同的提示信息
 */
function updateEmptyState() {
    const icon = document.getElementById('emptyStateIcon');
    const title = document.getElementById('emptyStateTitle');
    const desc = document.getElementById('emptyStateDesc');
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;
    
    // 检查是否有筛选条件
    const hasFilters = classPageState.filters.className || classPageState.filters.teacherId;
    
    if (hasFilters) {
        // 有筛选条件但无结果
        icon.textContent = '🔍';
        title.textContent = '未找到匹配的班级';
        let filterDesc = [];
        if (classPageState.filters.className) {
            filterDesc.push(`班级名称包含"${classPageState.filters.className}"`);
        }
        if (classPageState.filters.teacherId) {
            const teacher = classPageState.teachers.find(t => t.id == classPageState.filters.teacherId);
            filterDesc.push(`班主任为"${teacher ? (teacher.realName || teacher.username) : '选定班主任'}"`);
        }
        desc.textContent = `当前筛选条件：${filterDesc.join('，')}，请尝试调整筛选条件`;
    } else {
        // 无筛选条件也无数据
        icon.textContent = '📭';
        title.textContent = '暂无班级数据';
        desc.textContent = isDirector ? '点击"新增班级"按钮创建第一个班级' : '请联系教务主任添加班级';
    }
}

/**
 * 打开班级编辑弹窗
 */
function openClassModal(classId = null) {
    const isEdit = !!classId;
    const classItem = isEdit ? classPageState.list.find(c => c.id === classId) : null;
    
    // 获取当前年份作为默认值
    const currentYear = new Date().getFullYear();
    
    const contentHtml = `
        <div class="form-group">
            <label class="form-label">班级名称 <span style="color: var(--error-color);">*</span></label>
            <input type="text" 
                   class="form-input" 
                   id="modalClassName" 
                   value="${isEdit ? escapeHtml(classItem.className) : ''}"
                   placeholder="请输入班级名称，如：软件工程1班">
        </div>
        <div class="form-group">
            <label class="form-label">年级 <span style="color: var(--error-color);">*</span></label>
            <input type="number" 
                   class="form-input" 
                   id="modalGradeYear" 
                   value="${isEdit ? (classItem.gradeYear || classItem.grade_year) : currentYear}"
                   placeholder="如：2024">
        </div>
        <div class="form-group">
            <label class="form-label">班主任</label>
            <select class="form-select" id="modalTeacher">
                <option value="">暂不分配</option>
                ${classPageState.teachers.map(t => `
                    <option value="${t.id}" ${isEdit && (classItem.teacherId === t.id || classItem.teacher_id === t.id) ? 'selected' : ''}>
                        ${escapeHtml(t.realName || t.username)}
                    </option>
                `).join('')}
            </select>
        </div>
    `;
    
    Modal.open({
        title: isEdit ? '编辑班级' : '新增班级',
        content: contentHtml,
        buttons: [
            { text: '取消', type: 'secondary', action: 'close' },
            { text: '保存', type: 'primary', onClick: () => saveClass(classId) }
        ]
    });
}

/**
 * 保存班级 - 使用提交锁防止重复提交
 */
async function saveClass(classId) {
    // 使用页面状态的提交锁，防止重复提交
    if (classPageState.isSubmitting) {
        console.log('正在保存中，忽略重复点击');
        return;
    }

    const className = document.getElementById('modalClassName').value.trim();
    const gradeYear = document.getElementById('modalGradeYear').value;
    const teacherId = document.getElementById('modalTeacher').value;

    if (!className) {
        alert('请输入班级名称');
        return;
    }

    if (!gradeYear) {
        alert('请输入年级');
        return;
    }

    // 如果指定了新班主任，先在提交前检查确认（此时还未禁用按钮）
    if (teacherId && teacherId !== '') {
        try {
            const checkData = await API.get(`/teachers/${teacherId}/current-class`);
            const currentClass = checkData.data;

            // 如果该班主任已在其他班级，提示用户
            if (currentClass && currentClass.classId !== classId) {
                const confirmed = confirm(
                    `班主任「${currentClass.teacherName}」当前负责"${currentClass.className}"，\n` +
                    `确定要将其调换到本班级吗？\n` +
                    `（原班级将变为"暂不分配"）`
                );

                if (!confirmed) {
                    return; // 用户取消保存，直接返回
                }
            }
        } catch (error) {
            console.error('检查班主任绑定状态失败:', error);
            // 继续保存，让后端处理
        }
    }

    // 用户确认后，设置提交锁并禁用按钮
    classPageState.isSubmitting = true;
    const saveBtn = document.querySelector('#modalComponent .btn-primary');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
    }

    try {
        const data = classId
            ? await API.put(`/classes/${classId}`, { className, gradeYear: parseInt(gradeYear), teacherId: teacherId || null })
            : await API.post('/classes', { className, gradeYear: parseInt(gradeYear), teacherId: teacherId || null });

        Modal.close();
        loadClassList();
        alert(classId ? '修改成功' : '创建成功');
    } catch (error) {
        console.error('保存班级失败:', error);
        alert(error.message || '网络错误，请稍后重试');
    } finally {
        // 无论成功失败，都恢复提交锁和按钮状态
        classPageState.isSubmitting = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
    }
}

/**
 * 编辑班级
 */
function editClass(classId) {
    openClassModal(classId);
}

/**
 * 删除班级
 */
async function deleteClass(classId, className) {
    if (!confirm(`确定要删除班级「${className}」吗？\n删除后该班级的学生将被移出，此操作不可恢复。`)) {
        return;
    }
    
    try {
        await API.delete(`/classes/${classId}`);
        
        loadClassList();
        alert('删除成功');
    } catch (error) {
        console.error('删除班级失败:', error);
        alert('网络错误，请稍后重试');
    }
}

/**
 * 添加弹窗样式
 */
function addModalStyles() {
    if (document.getElementById('modalStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'modalStyles';
    style.textContent = `
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
 * 工具函数：HTML转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 工具函数：格式化日期
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN');
}

/**
 * 显示错误信息
 */
function showError(message) {
    const tbody = document.getElementById('classTableBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="${currentUser?.role === ROLE_DIRECTOR ? 5 : 4}" class="empty-state">
                <div class="empty-icon">❌</div>
                <div class="empty-title">加载失败</div>
                <div class="empty-desc">${message}</div>
            </td>
        </tr>
    `;
}

// 导出页面初始化函数
window.initClassPage = initClassPage;

// ========== 班级成员管理功能 ==========

/**
 * 选中班级并显示学生列表
 */
async function selectClass(classId) {
    const classItem = classPageState.list.find(c => c.id === classId);
    if (!classItem) return;

    classPageState.selectedClass = classItem;

    // 重新渲染表格以显示选中状态
    renderClassTable();

    // 显示学生列表区域
    const studentSection = document.getElementById('studentListSection');
    const studentListTitle = document.getElementById('studentListTitle');
    const btnAddStudent = document.getElementById('btnAddStudent');

    studentSection.style.display = 'block';
    studentListTitle.textContent = `${escapeHtml(classItem.className)} - 学生列表`;

    // 显示补录成员按钮（仅教导主任）
    if (btnAddStudent && currentUser && currentUser.role === ROLE_DIRECTOR) {
        btnAddStudent.style.display = 'inline-flex';
    }

    // 加载学生列表
    await loadStudentList(classId);
}

/**
 * 加载班级学生列表
 */
async function loadStudentList(classId) {
    const tbody = document.getElementById('studentTableBody');
    const emptyState = document.getElementById('studentEmptyState');
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;

    tbody.innerHTML = '<tr><td colspan="' + (isDirector ? 4 : 3) + '" class="text-center">加载中...</td></tr>';

    try {
        const data = await API.get(`/class-students/${classId}`);
        classPageState.students = data.data || [];

        if (classPageState.students.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'flex';
        } else {
            emptyState.style.display = 'none';
            renderStudentTable();
        }
    } catch (error) {
        console.error('加载学生列表失败:', error);
        tbody.innerHTML = '<tr><td colspan="' + (isDirector ? 4 : 3) + '" class="text-center" style="color: var(--error-color);">加载失败</td></tr>';
    }
}

/**
 * 渲染学生表格
 */
function renderStudentTable() {
    const tbody = document.getElementById('studentTableBody');
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;

    tbody.innerHTML = classPageState.students.map((student, index) => `
        <tr class="${index % 2 === 0 ? 'table-row-even' : 'table-row-odd'}">
            <td>${student.id}</td>
            <td>${escapeHtml(student.realName)}</td>
            <td>${escapeHtml(student.username)}</td>
            ${isDirector ? `
            <td>
                <button class="btn btn-danger btn-sm" data-action="removeStudentFromClass" data-id="${student.id}" data-name="${escapeHtml(student.realName)}">
                    删除
                </button>
            </td>
            ` : ''}
        </tr>
    `).join('');
}

/**
 * 打开补录成员弹窗
 * 支持两种模式：
 * 1. 从已有学生中选择（未分班学生）
 * 2. 直接新增学生并入班
 */
async function openAddStudentModal() {
    if (!classPageState.selectedClass) {
        alert('请先选择一个班级');
        return;
    }

    // 如果弹窗已存在，先关闭
    const existingModal = document.getElementById('addStudentModal');
    if (existingModal) {
        existingModal.remove();
    }

    // 添加弹窗样式
    addModalStyles();

    // 创建弹窗
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'addStudentModal';
    modal.innerHTML = `
        <div class="modal-container" style="max-width: 600px;">
            <div class="modal-header">
                <h3>补录成员 - ${escapeHtml(classPageState.selectedClass.className)}</h3>
                <button class="modal-close" data-action="closeAddStudentModal">×</button>
            </div>
            <div class="modal-body">
                <!-- 选项卡切换 -->
                <div class="form-group" style="margin-bottom: 20px;">
                    <div style="display: flex; gap: 10px; border-bottom: 1px solid var(--border-light);">
                        <button type="button" class="tab-btn active" id="tabExisting" data-action="switchTab" data-tab="existing" style="padding: 10px 20px; background: none; border: none; border-bottom: 2px solid var(--primary-color); color: var(--primary-color); cursor: pointer;">选择已有学生</button>
                        <button type="button" class="tab-btn" id="tabNew" data-action="switchTab" data-tab="new" style="padding: 10px 20px; background: none; border: none; border-bottom: 2px solid transparent; color: var(--text-secondary); cursor: pointer;">新增学生</button>
                    </div>
                </div>
                
                <!-- 选项卡1：选择已有学生 -->
                <div id="tabContentExisting">
                    <div class="form-group">
                        <label class="form-label">选择未分班学生 <span style="color: var(--text-muted); font-size: 12px;">(从系统中选择已有账号但未分班的学生)</span></label>
                        <div id="existingStudentList" style="border: 1px solid var(--border-light); border-radius: var(--btn-radius); max-height: 250px; overflow-y: auto;">
                            <div class="text-center" style="padding: 20px; color: var(--text-muted);">加载中...</div>
                        </div>
                    </div>
                </div>
                
                <!-- 选项卡2：新增学生 -->
                <div id="tabContentNew" style="display: none;">
                    <div class="form-group">
                        <label class="form-label">学号 <span style="color: var(--error-color);">*</span></label>
                        <input type="text" class="form-input" id="newStudentId" placeholder="请输入学号">
                    </div>
                    <div class="form-group">
                        <label class="form-label">姓名 <span style="color: var(--error-color);">*</span></label>
                        <input type="text" class="form-input" id="newStudentName" placeholder="请输入姓名">
                    </div>
                    <div class="form-group">
                        <label class="form-label">用户名 <span style="color: var(--error-color);">*</span></label>
                        <input type="text" class="form-input" id="newStudentUsername" placeholder="请输入用户名（用于登录）">
                    </div>
                    <div class="form-group">
                        <label class="form-label">初始密码 <span style="color: var(--error-color);">*</span></label>
                        <input type="text" class="form-input" id="newStudentPassword" value="123456" placeholder="默认密码：123456">
                        <span style="font-size: 12px; color: var(--text-muted);">默认密码为 123456，学生登录后可修改</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" data-action="closeAddStudentModal">取消</button>
                <button class="btn btn-primary" id="btnConfirmAdd" data-action="confirmAddStudent">确定</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 强制重绘后添加show类，触发过渡动画
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });

    // 加载未分班学生列表
    await loadAvailableStudents();
}

/**
 * 切换选项卡
 */
function switchTab(tab) {
    const tabExisting = document.getElementById('tabExisting');
    const tabNew = document.getElementById('tabNew');
    const contentExisting = document.getElementById('tabContentExisting');
    const contentNew = document.getElementById('tabContentNew');
    
    if (tab === 'existing') {
        tabExisting.style.borderBottomColor = 'var(--primary-color)';
        tabExisting.style.color = 'var(--primary-color)';
        tabNew.style.borderBottomColor = 'transparent';
        tabNew.style.color = 'var(--text-secondary)';
        contentExisting.style.display = 'block';
        contentNew.style.display = 'none';
    } else {
        tabNew.style.borderBottomColor = 'var(--primary-color)';
        tabNew.style.color = 'var(--primary-color)';
        tabExisting.style.borderBottomColor = 'transparent';
        tabExisting.style.color = 'var(--text-secondary)';
        contentExisting.style.display = 'none';
        contentNew.style.display = 'block';
    }
}

/**
 * 加载可选择的未分班学生
 */
async function loadAvailableStudents() {
    const container = document.getElementById('existingStudentList');
    
    try {
        const data = await API.get('/students/available?classId=' + classPageState.selectedClass.id);
        classPageState.allStudents = data.data || [];

        if (classPageState.allStudents.length === 0) {
            container.innerHTML = '<div class="text-center" style="padding: 20px; color: var(--text-muted);">暂无可补录的学生，所有学生都已分配班级</div>';
            return;
        }

        container.innerHTML = `
            <select class="form-select" id="selectExistingStudent" size="8" style="border: none; width: 100%;">
                <option value="">请选择学生...</option>
                ${classPageState.allStudents.map(s => `
                    <option value="${s.id}">${escapeHtml(s.realName)} (${escapeHtml(s.username)}) - ID:${s.id}</option>
                `).join('')}
            </select>
        `;
    } catch (error) {
        console.error('加载学生列表失败:', error);
        container.innerHTML = '<div class="text-center" style="padding: 20px; color: var(--error-color);">加载失败，请稍后重试</div>';
    }
}

/**
 * 确认添加学生（根据当前选项卡决定操作）
 */
async function confirmAddStudent() {
    // 检查提交锁，防止重复提交
    if (classPageState.isSubmittingAddStudent) {
        console.log('正在添加学生，忽略重复点击');
        return;
    }

    // 设置提交锁并禁用按钮
    classPageState.isSubmittingAddStudent = true;
    const confirmBtn = document.getElementById('btnConfirmAdd');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '添加中...';
    }

    try {
        const contentExisting = document.getElementById('tabContentExisting');
        
        if (contentExisting.style.display !== 'none') {
            // 选项卡1：选择已有学生
            await addExistingStudentToClass();
        } else {
            // 选项卡2：新增学生
            await createNewStudentAndAddToClass();
        }
    } finally {
        // 释放提交锁并恢复按钮
        classPageState.isSubmittingAddStudent = false;
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '确定';
        }
    }
}

/**
 * 添加已有学生到班级
 */
async function addExistingStudentToClass() {
    const select = document.getElementById('selectExistingStudent');
    if (!select) {
        alert('学生列表加载中，请稍后再试');
        return;
    }
    
    const studentId = select.value;

    if (!studentId) {
        alert('请选择要添加的学生');
        return;
    }

    try {
        await API.post(`/class-students/${classPageState.selectedClass.id}`, {
            studentId: parseInt(studentId)
        });

        closeAddStudentModal();
        alert('添加成功');

        // 刷新学生列表
        await loadStudentList(classPageState.selectedClass.id);
        // 刷新班级列表（更新学生人数）
        await loadClassList();
    } catch (error) {
        console.error('添加学生失败:', error);
        alert('添加失败：' + (error.message || '请稍后重试'));
    }
}

/**
 * 创建新学生并添加到班级
 */
async function createNewStudentAndAddToClass() {
    const studentId = document.getElementById('newStudentId').value.trim();
    const studentName = document.getElementById('newStudentName').value.trim();
    const username = document.getElementById('newStudentUsername').value.trim();
    const password = document.getElementById('newStudentPassword').value.trim();

    // 验证输入
    if (!studentId) {
        alert('请输入学号');
        return;
    }
    if (!studentName) {
        alert('请输入姓名');
        return;
    }
    if (!username) {
        alert('请输入用户名');
        return;
    }
    if (!password) {
        alert('请输入初始密码');
        return;
    }

    try {
        // 创建学生账号并添加到班级
        await API.post('/students/with-class', {
            id: parseInt(studentId),
            realName: studentName,
            username: username,
            password: password,
            classId: classPageState.selectedClass.id
        });

        closeAddStudentModal();
        alert('创建学生并添加到班级成功');

        // 刷新学生列表
        await loadStudentList(classPageState.selectedClass.id);
        // 刷新班级列表（更新学生人数）
        await loadClassList();
    } catch (error) {
        console.error('创建学生失败:', error);
        alert('创建失败：' + (error.message || '请稍后重试'));
    }
}

/**
 * 关闭补录成员弹窗
 */
function closeAddStudentModal() {
    const modal = document.getElementById('addStudentModal');
    if (modal) {
        // 先移除show类触发关闭动画
        modal.classList.remove('show');
        // 等待动画完成后移除元素
        setTimeout(() => {
            modal.remove();
        }, 200);
    }
}

/**
 * 添加学生到班级
 */
async function addStudentToClass() {
    const select = document.getElementById('selectStudent');
    const studentId = select.value;

    if (!studentId) {
        alert('请选择要添加的学生');
        return;
    }

    try {
        await API.post('/class-students', {
            classId: classPageState.selectedClass.id,
            studentUserId: parseInt(studentId)
        });

        closeAddStudentModal();
        alert('添加成功');

        // 刷新学生列表
        await loadStudentList(classPageState.selectedClass.id);

        // 刷新班级列表（更新学生人数）
        await loadClassList();
    } catch (error) {
        console.error('添加学生失败:', error);
        alert('添加失败：' + (error.message || '请稍后重试'));
    }
}

/**
 * 从班级删除学生
 */
async function removeStudentFromClass(studentId, studentName) {
    if (!classPageState.selectedClass) return;

    if (!confirm(`确定要将 "${studentName}" 从该班级移除吗？`)) {
        return;
    }

    try {
        await API.delete(`/class-students/${classPageState.selectedClass.id}/${studentId}`);
        alert('删除成功');

        // 刷新学生列表
        await loadStudentList(classPageState.selectedClass.id);

        // 刷新班级列表（更新学生人数）
        await loadClassList();
    } catch (error) {
        console.error('删除学生失败:', error);
        alert('删除失败：' + (error.message || '请稍后重试'));
    }
}

/**
 * 防抖处理的筛选函数（防止快速连续点击）
 */
const debouncedApplyFilters = debounce(applyFilters, 300);

/**
 * 防抖处理的分页函数（防止快速连续点击）
 */
const debouncedGoToPage = debounce(goToPage, 200);

// 只暴露初始化函数，其他所有功能通过事件委托处理，避免全局变量污染
window.initClassPage = initClassPage;
// 暴露 Modal 相关的函数，供 HTML 内联事件调用
window.openClassModal = openClassModal;

})();
