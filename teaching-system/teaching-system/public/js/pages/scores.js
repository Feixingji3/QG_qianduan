/**
 * 成绩管理页面
 *
 * 功能说明：
 * 1. 成绩列表展示（支持分页）
 * 2. 成绩筛选查询（班级、科目、考试名称、学生姓名）
 * 3. 新增/编辑成绩（教务主任、班主任权限）
 * 4. 删除成绩（教务主任、班主任权限）
 * 5. 成绩统计（平均分、最高分、最低分、及格率）
 */
(function() {
'use strict';

// 页面状态 - 使用const声明，IIFE内部作用域隔离，不会污染全局
const scorePageState = {
    list: [],           // 成绩列表数据
    currentPage: 1,     // 当前页码
    pageSize: 10,       // 每页条数
    total: 0,           // 总条数
    filters: {          // 筛选条件
        classId: '',
        subjectId: '',
        examName: '',
        studentName: '',
        studentId: ''     // 学号筛选
    },
    classes: [],        // 班级列表
    subjects: [],       // 科目列表
    students: [],       // 学生列表（用于录入时选择）
    statistics: null,   // 统计数据
    isLoading: false,   // 加载状态
    isSubmitting: false // 提交锁，防止重复提交
};

/**
 * 初始化成绩管理页面
 */
function initScorePage() {
    // 从本地缓存读取筛选条件
    const cachedFilters = localStorage.getItem('score_filters');
    if (cachedFilters) {
        try {
            scorePageState.filters = JSON.parse(cachedFilters);
        } catch (e) {
            console.error('读取缓存筛选条件失败:', e);
        }
    }
    
    // 重置页面状态，避免从其他页面切换过来时状态混乱
    scorePageState.currentPage = 1;
    
    const isStudent = currentUser && currentUser.role === ROLE_STUDENT;
    const isTeacher = currentUser && currentUser.role === ROLE_HEAD_TEACHER;
    
    renderScorePage();
    
    // 回填筛选条件到表单
    setTimeout(() => {
        const classSelect = document.getElementById('filterClass');
        const subjectSelect = document.getElementById('filterSubject');
        const examNameInput = document.getElementById('filterExamName');
        const studentNameInput = document.getElementById('filterStudentName');
        const studentIdInput = document.getElementById('filterStudentId');
        
        if (classSelect && scorePageState.filters.classId) classSelect.value = scorePageState.filters.classId;
        if (subjectSelect && scorePageState.filters.subjectId) subjectSelect.value = scorePageState.filters.subjectId;
        if (examNameInput && scorePageState.filters.examName) examNameInput.value = scorePageState.filters.examName;
        if (studentNameInput && scorePageState.filters.studentName) studentNameInput.value = scorePageState.filters.studentName;
        if (studentIdInput && scorePageState.filters.studentId) studentIdInput.value = scorePageState.filters.studentId;
    }, 100);
    
    if (isStudent) {
        // 学生端：加载该学生实际考过的科目
        loadStudentSubjects();
    } else if (isTeacher) {
        // 班主任端：加载该班主任负责的科目和班级
        loadTeacherSubjects();  // 加载班主任负责的科目
        loadClassList();        // 加载班级列表
    } else {
        // 教务主任端：加载全部科目和班级
        loadSubjectList();  // 加载全部科目列表
        loadClassList();    // 加载班级列表
    }
    
    loadScoreList();    // 加载成绩列表
    
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
    
    // 根据 action 类型分发处理
    switch (action) {
        case 'applyFilters':
            debouncedApplyFilters();
            break;
        case 'resetFilters':
            resetFilters();
            break;
        case 'exportScores':
            exportScores();
            break;
        case 'openImportModal':
            openImportModal();
            break;
        case 'openScoreModal':
            const scoreId = actionEl.dataset.id;
            openScoreModal(scoreId ? parseInt(scoreId) : null);
            break;
        case 'deleteScore':
            const deleteId = actionEl.dataset.id;
            if (deleteId) deleteScore(parseInt(deleteId));
            break;
        case 'goToPage':
            const page = actionEl.dataset.page;
            if (page) debouncedGoToPage(parseInt(page));
            break;
        case 'closeImportModal':
            closeImportModal();
            break;
        case 'downloadImportTemplate':
            downloadImportTemplate();
            break;
        case 'confirmImport':
            confirmImport();
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
        case 'handleClassFilterChange':
            handleClassChange();
            handleFilterChange();
            break;
    }
}

/**
 * 渲染页面结构
 */
function renderScorePage() {
    const content = document.getElementById('pageContent');
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;
    const isTeacher = currentUser && currentUser.role === ROLE_HEAD_TEACHER;
    const isStudent = currentUser && currentUser.role === ROLE_STUDENT;
    const canEdit = isDirector || isTeacher;

    // 根据角色生成不同的筛选栏
    let filterHTML = '';
    if (isStudent) {
        // 学生端：只显示科目下拉筛选和考试名称搜索框
        filterHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">科目</label>
                    <select class="form-select" id="filterSubject" data-action="handleFilterChange">
                        <option value="">全部科目</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">考试名称</label>
                    <input type="text"
                           class="form-input"
                           id="filterExamName"
                           placeholder="请输入考试名称"
                           onkeyup="handleFilterKeyup(event)">
                </div>
                <div class="form-group" style="display: flex; align-items: flex-end; gap: 8px;">
                    <button class="btn btn-primary" data-action="applyFilters">
                        <span>🔍</span> 筛选
                    </button>
                    <button class="btn btn-secondary" data-action="resetFilters">
                        <span>↺</span> 重置
                    </button>
                </div>
            </div>
        `;
    } else {
        // 教务主任和班主任端：显示完整的筛选条件
        filterHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">班级</label>
                    <select class="form-select" id="filterClass" data-action="handleClassFilterChange">
                        <option value="">全部班级</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">科目</label>
                    <select class="form-select" id="filterSubject" data-action="handleFilterChange">
                        <option value="">全部科目</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">考试名称</label>
                    <input type="text"
                           class="form-input"
                           id="filterExamName"
                           placeholder="请输入考试名称"
                           onkeyup="handleFilterKeyup(event)">
                </div>
                <div class="form-group">
                    <label class="form-label">学生姓名</label>
                    <input type="text"
                           class="form-input"
                           id="filterStudentName"
                           placeholder="请输入学生姓名"
                           onkeyup="handleFilterKeyup(event)">
                </div>
                <div class="form-group">
                    <label class="form-label">学号</label>
                    <input type="text"
                           class="form-input"
                           id="filterStudentId"
                           placeholder="请输入学号"
                           onkeyup="handleFilterKeyup(event)">
                </div>
                <div class="form-group" style="display: flex; align-items: flex-end; gap: 8px;">
                    <button class="btn btn-primary" data-action="applyFilters">
                        <span>🔍</span> 筛选
                    </button>
                    <button class="btn btn-secondary" data-action="resetFilters">
                        <span>↺</span> 重置
                    </button>
                </div>
            </div>
        `;
    }

    content.innerHTML = `
        <!-- 筛选栏 -->
        <div class="card">
            <div class="card-body">
                ${filterHTML}
            </div>
        </div>

        <!-- 成绩列表 -->
        <div class="card">
            <div class="card-header">
                <span class="card-title">成绩列表</span>
                ${canEdit ? `
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-success" data-action="exportScores">
                        <span>📊</span> 导出成绩
                    </button>
                    <button class="btn btn-info" data-action="openImportModal">
                        <span>📥</span> 批量导入
                    </button>
                    <button class="btn btn-primary" data-action="openScoreModal">
                        <span>+</span> 录入成绩
                    </button>
                </div>
                ` : ''}
            </div>
            <div class="card-body">
                <div class="table-container">
                    <table class="data-table" id="scoreTable">
                        <thead>
                            <tr>
                                <th>学生姓名</th>
                                <th>班级</th>
                                <th>科目</th>
                                <th>考试名称</th>
                                <th>分数</th>
                                <th>考试日期</th>
                                <th>录入人</th>
                                ${canEdit ? '<th>操作</th>' : ''}
                            </tr>
                        </thead>
                        <tbody id="scoreTableBody">
                            <!-- 表格内容由JS动态生成 -->
                        </tbody>
                    </table>
                </div>

                <!-- 分页 -->
                <div class="pagination" id="scorePagination">
                    <!-- 分页内容动态生成 -->
                </div>
            </div>
        </div>
    `;
}

/**
 * 渲染统计卡片
 */
function renderStatistics() {
    const statsContainer = document.getElementById('scoreStats');
    if (!statsContainer || !scorePageState.statistics) {
        // 如果没有统计数据，显示空状态
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat-card">
                    <div class="stat-value">-</div>
                    <div class="stat-label">成绩记录数</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">-</div>
                    <div class="stat-label">平均分</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">-</div>
                    <div class="stat-label">最高分</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">-</div>
                    <div class="stat-label">最低分</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">-%</div>
                    <div class="stat-label">及格率</div>
                </div>
            `;
        }
        return;
    }

    const stats = scorePageState.statistics;

    statsContainer.innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${stats.totalCount || 0}</div>
            <div class="stat-label">成绩记录数</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.averageScore || 0}</div>
            <div class="stat-label">平均分</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.maxScore || 0}</div>
            <div class="stat-label">最高分</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.minScore || 0}</div>
            <div class="stat-label">最低分</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.passRate || 0}%</div>
            <div class="stat-label">及格率</div>
        </div>
    `;
}

/**
 * 显示骨架屏加载状态
 */
function showSkeletonLoading() {
    const tbody = document.getElementById('scoreTableBody');
    
    // 检查元素是否存在（页面切换时可能不存在）
    if (!tbody) {
        console.log('成绩列表表格不存在，可能已切换到其他页面');
        return;
    }
    
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;
    const isTeacher = currentUser && currentUser.role === ROLE_HEAD_TEACHER;
    const canEdit = isDirector || isTeacher;
    const colCount = canEdit ? 8 : 7;

    let skeletonHTML = '';
    for (let i = 0; i < 5; i++) {
        skeletonHTML += `
            <tr>
                <td><div class="loading-skeleton" style="height: 20px; width: 80%;"></div></td>
                <td><div class="loading-skeleton" style="height: 20px; width: 60%;"></div></td>
                <td><div class="loading-skeleton" style="height: 20px; width: 70%;"></div></td>
                <td><div class="loading-skeleton" style="height: 20px; width: 90%;"></div></td>
                <td><div class="loading-skeleton" style="height: 20px; width: 40%;"></div></td>
                <td><div class="loading-skeleton" style="height: 20px; width: 70%;"></div></td>
                <td><div class="loading-skeleton" style="height: 20px; width: 60%;"></div></td>
                ${canEdit ? '<td><div class="loading-skeleton" style="height: 20px; width: 80%;"></div></td>' : ''}
            </tr>
        `;
    }

    tbody.innerHTML = skeletonHTML;
}

/**
 * 加载成绩列表
 */
async function loadScoreList() {
    const startTime = Date.now();
    const minLoadingTime = 2000; // 最小加载时间2秒

    try {
        scorePageState.isLoading = true;
        showSkeletonLoading(); // 显示骨架屏

        const params = {
            page: scorePageState.currentPage,
            pageSize: scorePageState.pageSize,
            ...scorePageState.filters
        };

        const data = await API.get('/scores', params);

        scorePageState.list = data.data.list || [];
        scorePageState.total = data.data.total || 0;

        // 计算已经过的时间
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

        // 延迟渲染，确保骨架屏至少显示3秒
        setTimeout(() => {
            // 检查是否还在成绩管理页面
            if (!document.getElementById('scoreTableBody')) {
                console.log('成绩列表页面已切换，取消渲染');
                return;
            }
            scorePageState.isLoading = false;
            renderScoreTable();
            renderPagination();
        }, remainingTime);

    } catch (error) {
        console.error('加载成绩列表失败:', error);
        showError('加载失败：' + (error.message || '请稍后重试'));
        scorePageState.isLoading = false;
    }
}

/**
 * 加载成绩统计
 */
async function loadScoreStatistics() {
    try {
        // 如果有选择班级，则统计该班级；否则不统计
        const classId = scorePageState.filters.classId;
        if (!classId) {
            scorePageState.statistics = null;
            renderStatistics();
            return;
        }

        const params = {
            classId: classId,
            subjectId: scorePageState.filters.subjectId,
            examName: scorePageState.filters.examName
        };

        const data = await API.get('/scores/statistics', params);
        scorePageState.statistics = data.data;
        renderStatistics();
    } catch (error) {
        console.error('加载成绩统计失败:', error);
        // 统计失败不影响主列表显示
        scorePageState.statistics = null;
        renderStatistics();
    }
}

/**
 * 加载科目列表
 */
async function loadSubjectList() {
    try {
        const data = await API.get('/subjects');
        scorePageState.subjects = data.data || [];

        // 更新科目下拉框
        const select = document.getElementById('filterSubject');
        if (select) {
            const options = scorePageState.subjects.map(s =>
                `<option value="${s.id}">${escapeHtml(s.subjectName)}</option>`
            ).join('');
            select.innerHTML = '<option value="">全部科目</option>' + options;
        }
    } catch (error) {
        console.error('加载科目列表失败:', error);
    }
}

/**
 * 加载班级列表
 */
async function loadClassList() {
    try {
        // 成绩管理模块排除"全校"班级
        const data = await API.get('/classes?page=1&pageSize=100&excludeSchool=true');
        scorePageState.classes = data.data.list || [];

        // 更新班级下拉框
        const select = document.getElementById('filterClass');
        if (select) {
            const options = scorePageState.classes.map(c =>
                `<option value="${c.id}">${escapeHtml(c.className)}</option>`
            ).join('');
            select.innerHTML = '<option value="">全部班级</option>' + options;
        }
    } catch (error) {
        console.error('加载班级列表失败:', error);
    }
}

/**
 * 班级选择改变时加载学生列表
 */
async function handleClassChange() {
    const classId = document.getElementById('filterClass')?.value;
    if (!classId) {
        scorePageState.students = [];
        return;
    }

    try {
        const data = await API.get(`/scores/students/${classId}`);
        scorePageState.students = data.data || [];
    } catch (error) {
        console.error('加载学生列表失败:', error);
    }
}

/**
 * 渲染成绩表格
 */
function renderScoreTable() {
    const tbody = document.getElementById('scoreTableBody');
    
    // 检查元素是否存在（页面切换时可能不存在）
    if (!tbody) {
        console.log('成绩列表表格不存在，可能已切换到其他页面');
        return;
    }
    
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;
    const isTeacher = currentUser && currentUser.role === ROLE_HEAD_TEACHER;
    const canEdit = isDirector || isTeacher;

    if (scorePageState.isLoading) {
        showSkeletonLoading();
        return;
    }

    if (scorePageState.list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${canEdit ? 8 : 7}" class="text-center">暂无数据</td></tr>`;
        return;
    }

    tbody.innerHTML = scorePageState.list.map((score, index) => `
        <tr class="${index % 2 === 0 ? 'table-row-even' : 'table-row-odd'}">
            <td>${escapeHtml(score.studentName)}</td>
            <td>${escapeHtml(score.className)}</td>
            <td>${escapeHtml(score.subjectName)}</td>
            <td>${escapeHtml(score.examName)}</td>
            <td>
                <span class="score-badge ${getScoreClass(score.score)}">
                    ${score.score}
                </span>
            </td>
            <td>${formatDate(score.examDate)}</td>
            <td>${escapeHtml(score.createdByName || '-')}</td>
            ${canEdit ? `
            <td>
                <button class="btn btn-sm btn-primary" data-action="openScoreModal" data-id="${score.id}">编辑</button>
                <button class="btn btn-sm btn-danger" data-action="deleteScore" data-id="${score.id}">删除</button>
            </td>
            ` : ''}
        </tr>
    `).join('');
}

/**
 * 获取分数对应的样式类
 */
function getScoreClass(score) {
    const scoreNum = parseFloat(score);
    if (scoreNum >= 90) return 'score-excellent';
    if (scoreNum >= 80) return 'score-good';
    if (scoreNum >= 60) return 'score-pass';
    return 'score-fail';
}

/**
 * 渲染分页
 */
function renderPagination() {
    const container = document.getElementById('scorePagination');
    if (!container) return;

    const totalPages = Math.ceil(scorePageState.total / scorePageState.pageSize);

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // 上一页
    html += `<button class="btn btn-sm ${scorePageState.currentPage === 1 ? 'disabled' : ''}" data-action="goToPage" data-page="${scorePageState.currentPage - 1}">上一页</button>`;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= scorePageState.currentPage - 2 && i <= scorePageState.currentPage + 2)) {
            html += `<button class="btn btn-sm ${i === scorePageState.currentPage ? 'btn-primary' : ''}" data-action="goToPage" data-page="${i}">${i}</button>`;
        } else if (i === scorePageState.currentPage - 3 || i === scorePageState.currentPage + 3) {
            html += `<span>...</span>`;
        }
    }

    // 下一页
    html += `<button class="btn btn-sm ${scorePageState.currentPage === totalPages ? 'disabled' : ''}" data-action="goToPage" data-page="${scorePageState.currentPage + 1}">下一页</button>`;

    // 分页信息
    html += `<span class="pagination-info">共 ${scorePageState.total} 条</span>`;

    container.innerHTML = html;
}

/**
 * 跳转到指定页
 */
function goToPage(page) {
    const totalPages = Math.ceil(scorePageState.total / scorePageState.pageSize);
    if (page < 1 || page > totalPages) return;

    scorePageState.currentPage = page;
    loadScoreList();
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
    // 筛选条件改变时自动应用
    applyFilters();
}

function applyFilters() {
    scorePageState.filters.classId = document.getElementById('filterClass')?.value || '';
    scorePageState.filters.subjectId = document.getElementById('filterSubject')?.value || '';
    scorePageState.filters.examName = document.getElementById('filterExamName')?.value || '';
    scorePageState.filters.studentName = document.getElementById('filterStudentName')?.value || '';
    scorePageState.filters.studentId = document.getElementById('filterStudentId')?.value || '';

    // 缓存筛选条件到本地存储
    localStorage.setItem('score_filters', JSON.stringify(scorePageState.filters));

    scorePageState.currentPage = 1;
    loadScoreList();
}

function resetFilters() {
    // 安全地重置筛选输入框（考虑不同角色可能只有部分筛选元素）
    const filterClass = document.getElementById('filterClass');
    const filterSubject = document.getElementById('filterSubject');
    const filterExamName = document.getElementById('filterExamName');
    const filterStudentName = document.getElementById('filterStudentName');
    const filterStudentId = document.getElementById('filterStudentId');
    
    if (filterClass) filterClass.value = '';
    if (filterSubject) filterSubject.value = '';
    if (filterExamName) filterExamName.value = '';
    if (filterStudentName) filterStudentName.value = '';
    if (filterStudentId) filterStudentId.value = '';

    scorePageState.filters = {
        classId: '',
        subjectId: '',
        examName: '',
        studentName: '',
        studentId: ''
    };
    
    // 清除筛选条件缓存
    localStorage.removeItem('score_filters');

    scorePageState.currentPage = 1;
    loadScoreList();
}

/**
 * 打开成绩录入/编辑弹窗
 */
async function openScoreModal(scoreId = null) {
    const isEdit = !!scoreId;
    const scoreItem = isEdit ? scorePageState.list.find(s => s.id === scoreId) : null;

    // 如果没有选择班级，提示先选择班级
    const selectedClassId = document.getElementById('filterClass')?.value;
    if (!isEdit && !selectedClassId) {
        alert('请先选择班级');
        return;
    }

    // 加载学生列表
    if (!isEdit && selectedClassId) {
        await handleClassChange();
    }

    const contentHtml = `
        ${!isEdit ? `
        <div class="form-group">
            <label class="form-label">学生 <span style="color: var(--error-color);">*</span></label>
            <select class="form-select" id="modalStudent">
                <option value="">请选择学生</option>
                ${scorePageState.students.map(s => `
                    <option value="${s.id}">${escapeHtml(s.realName)} (${s.username})</option>
                `).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">科目 <span style="color: var(--error-color);">*</span></label>
            <select class="form-select" id="modalSubject">
                <option value="">请选择科目</option>
                ${scorePageState.subjects.map(s => `
                    <option value="${s.id}">${escapeHtml(s.subjectName)}</option>
                `).join('')}
            </select>
        </div>
        <div class="form-group">
            <label class="form-label">考试名称 <span style="color: var(--error-color);">*</span></label>
            <input type="text" class="form-input" id="modalExamName" placeholder="如：2025-2026第一学期期末考试">
        </div>
        ` : ''}
        <div class="form-group">
            <label class="form-label">分数 <span style="color: var(--error-color);">*</span></label>
            <input type="number" class="form-input" id="modalScore" value="${isEdit ? scoreItem.score : ''}" min="0" max="100" placeholder="0-100">
        </div>
        ${!isEdit ? `
        <div class="form-group">
            <label class="form-label">考试日期 <span style="color: var(--error-color);">*</span></label>
            <input type="date" class="form-input" id="modalExamDate" value="${new Date().toISOString().split('T')[0]}">
        </div>
        ` : ''}
    `;

    Modal.open({
        title: isEdit ? '编辑成绩' : '录入成绩',
        content: contentHtml,
        buttons: [
            { text: '取消', type: 'secondary', action: 'close' },
            { text: '保存', type: 'primary', onClick: () => saveScore(scoreId) }
        ]
    });
}

/**
 * 保存成绩
 */
async function saveScore(scoreId) {
    // 检查提交锁，防止重复提交
    if (scorePageState.isSubmitting) {
        console.log('正在保存中，忽略重复点击');
        return;
    }
    
    const isEdit = !!scoreId;
    
    // 设置提交锁并禁用按钮
    scorePageState.isSubmitting = true;
    const saveBtn = document.querySelector('#modalComponent .btn-primary');
    const originalText = saveBtn ? saveBtn.textContent : '保存';
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
    }

    try {
        if (isEdit) {
            // 编辑模式
            const score = document.getElementById('modalScore').value;

            if (score === '') {
                alert('请输入分数');
                return;
            }

            await API.put(`/scores/${scoreId}`, { score: parseFloat(score) });
            Modal.close();
            loadScoreList();
            loadScoreStatistics();
            alert('修改成功');
        } else {
            // 新增模式
            const studentUserId = document.getElementById('modalStudent').value;
            const subjectId = document.getElementById('modalSubject').value;
            const examName = document.getElementById('modalExamName').value.trim();
            const score = document.getElementById('modalScore').value;
            const examDate = document.getElementById('modalExamDate').value;
            const classId = document.getElementById('filterClass').value;

            if (!studentUserId || !subjectId || !examName || score === '' || !examDate) {
                alert('请填写所有必填项');
                return;
            }

            await API.post('/scores', {
                studentUserId: parseInt(studentUserId),
                classId: parseInt(classId),
                subjectId: parseInt(subjectId),
                examName,
                score: parseFloat(score),
                examDate
            });
            Modal.close();
            loadScoreList();
            loadScoreStatistics();
            alert('录入成功');
        }
    } catch (error) {
        console.error(isEdit ? '修改成绩失败:' : '录入成绩失败:', error);
        alert(error.message || (isEdit ? '修改失败' : '录入失败'));
    } finally {
        // 释放提交锁并恢复按钮
        scorePageState.isSubmitting = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
        }
    }
}

/**
 * 删除成绩
 */
async function deleteScore(scoreId) {
    if (scorePageState.isSubmitting) {
        return;
    }

    if (!confirm('确定要删除这条成绩记录吗？')) {
        return;
    }

    try {
        scorePageState.isSubmitting = true;
        await API.delete(`/scores/${scoreId}`);
        loadScoreList();
        loadScoreStatistics();
        alert('删除成功');
    } catch (error) {
        console.error('删除成绩失败:', error);
        alert(error.message || '删除失败');
    } finally {
        scorePageState.isSubmitting = false;
    }
}

/**
 * 导出成绩
 * 调用后端导出接口，同时记录导出日志
 */
async function exportScores() {
    try {
        // 构建筛选参数
        const params = new URLSearchParams();
        if (scorePageState.filters.classId) params.append('classId', scorePageState.filters.classId);
        if (scorePageState.filters.subjectId) params.append('subjectId', scorePageState.filters.subjectId);
        if (scorePageState.filters.examName) params.append('examName', scorePageState.filters.examName);

        // 获取token
        const token = localStorage.getItem('teaching_token');

        // 调用后端导出接口
        const response = await fetch(`${API.baseURL}/scores/export?${params}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });

        // 先读取响应内容检查是否是错误JSON
        const contentType = response.headers.get('Content-Type') || '';
        const responseText = await response.text();

        // 检查是否是JSON错误响应
        if (responseText.trim().startsWith('{')) {
            try {
                const errorData = JSON.parse(responseText);
                throw new Error(errorData.message || '导出失败');
            } catch (e) {
                // 不是有效的JSON，继续作为文件处理
            }
        }

        // 获取文件名（从Content-Disposition头）
        const disposition = response.headers.get('Content-Disposition');
        let filename = '成绩导出.csv';
        if (disposition) {
            const match = disposition.match(/filename="(.+)"/);
            if (match) filename = match[1];
        }

        // 下载文件
        const blob = new Blob([responseText], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        alert('导出成功');
    } catch (error) {
        console.error('导出成绩失败:', error);
        alert('导出失败：' + error.message);
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
            z-index: 1000;
        }
        .modal-container {
            background: white;
            border-radius: 8px;
            width: 90%;
            max-width: 500px;
            max-height: 90vh;
            overflow-y: auto;
        }
        .modal-header {
            padding: 16px 20px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .modal-header h3 {
            margin: 0;
            font-size: 18px;
        }
        .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: var(--text-secondary);
        }
        .modal-body {
            padding: 20px;
        }
        .modal-footer {
            padding: 16px 20px;
            border-top: 1px solid var(--border-color);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 显示错误信息
 */
function showError(message) {
    const tbody = document.getElementById('scoreTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center" style="color: var(--error-color);">${message}</td></tr>`;
    }
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
}

/**
 * HTML转义函数
 * 防止XSS攻击，将特殊字符转换为HTML实体
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 加载学生实际考的科目列表（仅学生端使用）
 * 从该学生的成绩记录中提取实际考过的科目
 */
async function loadStudentSubjects() {
    try {
        const data = await API.get('/scores/student-subjects');
        const subjects = data.data || [];
        
        const select = document.getElementById('filterSubject');
        if (!select) return;
        
        select.innerHTML = '<option value="">全部科目</option>' +
            subjects.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    } catch (error) {
        console.error('加载学生科目列表失败:', error);
    }
}

/**
 * 加载学生实际参加的考试列表（仅学生端使用）
 * 从该学生的成绩记录中提取实际参加过的考试
 */
async function loadStudentExams() {
    try {
        const data = await API.get('/scores/student-exams');
        const exams = data.data || [];
        
        const select = document.getElementById('filterExamName');
        if (!select) return;
        
        select.innerHTML = '<option value="">全部考试</option>' +
            exams.map(e => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
    } catch (error) {
        console.error('加载学生考试列表失败:', error);
    }
}

/**
 * 加载班主任负责的科目列表（仅班主任端使用）
 * 从该班主任负责班级的学生成绩记录中提取科目
 */
async function loadTeacherSubjects() {
    try {
        const data = await API.get('/scores/teacher-subjects');
        const subjects = data.data || [];
        
        // 更新状态管理中的科目列表
        scorePageState.subjects = subjects;

        // 更新筛选栏的科目下拉框
        const select = document.getElementById('filterSubject');
        if (select) {
            select.innerHTML = '<option value="">全部科目</option>' +
                subjects.map(s => `<option value="${s.id}">${escapeHtml(s.subjectName)}</option>`).join('');
        }
    } catch (error) {
        console.error('加载班主任科目列表失败:', error);
    }
}

// ========== 批量导入成绩功能 ==========

/**
 * 打开批量导入弹窗
 */
function openImportModal() {
    // 如果弹窗已存在，先关闭
    const existingModal = document.getElementById('importModal');
    if (existingModal) {
        existingModal.remove();
    }

    // 创建弹窗
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'importModal';
    modal.innerHTML = `
        <div class="modal-container" style="max-width: 600px;">
            <div class="modal-header">
                <h3>批量导入成绩</h3>
                <button class="modal-close" data-action="closeImportModal">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">1. 下载模板</label>
                    <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                        请先下载CSV模板，按模板格式填写成绩数据
                    </p>
                    <button class="btn btn-secondary" data-action="downloadImportTemplate">
                        <span>📄</span> 下载模板
                    </button>
                </div>

                <div class="form-group">
                    <label class="form-label">2. 上传文件</label>
                    <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">
                        支持 .csv 格式，文件大小不超过5MB
                    </p>
                    <input type="file"
                           id="importFile"
                           accept=".csv"
                           style="display: none;">
                    <div id="fileDropZone"
                         style="border: 2px dashed var(--border-color);
                                border-radius: 8px;
                                padding: 40px;
                                text-align: center;
                                cursor: pointer;
                                transition: all 0.2s;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📁</div>
                        <div style="color: var(--text-secondary);">
                            点击选择文件或拖拽文件到此处
                        </div>
                        <div id="selectedFileName" style="margin-top: 8px; color: var(--primary-color); font-weight: 500;"></div>
                    </div>
                </div>

                <div id="importPreview" style="display: none;">
                    <div class="form-group">
                        <label class="form-label">3. 数据预览</label>
                        <div id="previewContent" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-light); border-radius: 4px; padding: 12px;">
                            <!-- 预览内容 -->
                        </div>
                    </div>
                    <div id="importErrors" style="display: none;" class="alert alert-error">
                        <!-- 错误信息 -->
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" data-action="closeImportModal">取消</button>
                <button class="btn btn-primary" id="btnConfirmImport" data-action="confirmImport" disabled>确认导入</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 使用 requestAnimationFrame 确保 DOM 更新后再添加 show 类
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });

    // 绑定文件上传相关事件（使用事件委托方式）
    bindImportModalEvents();
}

/**
 * 绑定批量导入弹窗内的事件
 */
function bindImportModalEvents() {
    const fileInput = document.getElementById('importFile');
    const dropZone = document.getElementById('fileDropZone');

    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }

    if (dropZone) {
        dropZone.addEventListener('click', () => {
            fileInput?.click();
        });
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleDrop);
    }
}

/**
 * 关闭批量导入弹窗
 */
function closeImportModal() {
    const modal = document.getElementById('importModal');
    if (modal) {
        // 先移除 show 类触发关闭动画
        modal.classList.remove('show');
        // 等待动画完成后移除元素
        setTimeout(() => {
            modal.remove();
        }, 200);
    }
}

/**
 * 下载导入模板
 */
function downloadImportTemplate() {
    // 创建模板数据
    const headers = ['学号', '姓名', '班级', '科目', '考试名称', '分数', '考试日期(YYYY-MM-DD)'];
    const exampleData = [
        ['2024001', '张三', '大一(1)班', '高等数学', '2025-2026第一学期期末考试', '85', '2026-01-10'],
        ['2024002', '李四', '大一(1)班', '高等数学', '2025-2026第一学期期末考试', '92', '2026-01-10'],
        ['2024003', '王五', '大一(2)班', '大学英语', '2025-2026第一学期期末考试', '78', '2026-01-10']
    ];
    
    // 构建CSV内容
    const csvContent = [headers.join(','), ...exampleData.map(row => row.join(','))].join('\n');
    
    // 下载文件
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `成绩导入模板_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

/**
 * 处理拖拽悬停
 */
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--primary-color)';
    e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
}

/**
 * 处理拖拽离开
 */
function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--border-color)';
    e.currentTarget.style.backgroundColor = 'transparent';
}

/**
 * 处理文件拖放
 */
function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.style.borderColor = 'var(--border-color)';
    e.currentTarget.style.backgroundColor = 'transparent';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processImportFile(files[0]);
    }
}

/**
 * 处理文件选择
 */
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processImportFile(file);
    }
}

/**
 * 处理导入文件
 */
var importData = null;

async function processImportFile(file) {
    // 显示文件名
    document.getElementById('selectedFileName').textContent = file.name;
    
    // 验证文件类型
    const validTypes = ['.csv'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validTypes.includes(fileExt)) {
        alert('请上传 .csv 格式的文件');
        return;
    }
    
    // 验证文件大小（5MB）
    if (file.size > 5 * 1024 * 1024) {
        alert('文件大小不能超过5MB');
        return;
    }
    
    try {
        // 读取文件内容
        const content = await readFileContent(file);
        
        // 解析数据（简单CSV解析）
        const rows = parseCSV(content);
        
        if (rows.length < 2) {
            alert('文件数据为空或格式不正确');
            return;
        }
        
        // 验证数据
        const validation = validateImportData(rows);
        
        // 显示预览
        showImportPreview(validation);
        
        importData = validation;
        
    } catch (error) {
        console.error('读取文件失败:', error);
        alert('读取文件失败：' + error.message);
    }
}

/**
 * 读取文件内容（支持UTF-8和GBK编码）
 */
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            let content = e.target.result;

            // 检查是否有UTF-8 BOM，如果有则移除
            if (content.charCodeAt(0) === 0xFEFF) {
                content = content.substring(1);
            }

            // 检测是否是乱码（包含大量锟�字符）
            const garbledPattern = /锟|�/;
            if (garbledPattern.test(content)) {
                // 尝试用GBK重新读取
                const gbkReader = new FileReader();
                gbkReader.onload = (e2) => {
                    // 使用TextDecoder解码GBK
                    const decoder = new TextDecoder('gbk', { fatal: false });
                    const arrayBuffer = e2.target.result;
                    const bytes = new Uint8Array(arrayBuffer);
                    let decoded = decoder.decode(bytes);

                    // 移除BOM
                    if (decoded.charCodeAt(0) === 0xFEFF) {
                        decoded = decoded.substring(1);
                    }

                    resolve(decoded);
                };
                gbkReader.onerror = () => reject(new Error('文件读取失败'));
                gbkReader.readAsArrayBuffer(file);
            } else {
                resolve(content);
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file);
    });
}

/**
 * 解析CSV数据
 */
function parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim());
    return lines.map(line => {
        // 简单CSV解析（处理引号内的逗号）
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    });
}

/**
 * 验证导入数据
 */
function validateImportData(rows) {
    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    const validRows = [];
    const errors = [];
    
    dataRows.forEach((row, index) => {
        const rowNum = index + 2; // 行号（从2开始，因为第1行是表头）
        const rowErrors = [];
        
        // 检查必填字段
        const studentId = row[0]?.trim();
        const studentName = row[1]?.trim();
        const className = row[2]?.trim();
        const subjectName = row[3]?.trim();
        const examName = row[4]?.trim();
        const score = row[5]?.trim();
        const examDate = row[6]?.trim();
        
        if (!studentId) rowErrors.push('学号不能为空');
        if (!studentName) rowErrors.push('姓名不能为空');
        if (!className) rowErrors.push('班级不能为空');
        if (!subjectName) rowErrors.push('科目不能为空');
        if (!examName) rowErrors.push('考试名称不能为空');
        if (!score) rowErrors.push('分数不能为空');
        if (!examDate) rowErrors.push('考试日期不能为空');
        
        // 验证分数格式
        if (score) {
            const scoreNum = parseFloat(score);
            if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
                rowErrors.push('分数必须在0-100之间');
            }
        }
        
        // 验证日期格式（支持 YYYY-MM-DD 或 YYYY/M/D，WPS会自动把01变成1）
        let normalizedDate = examDate;
        if (examDate) {
            // 将斜杠替换为横杠，统一格式
            normalizedDate = examDate.replace(/\//g, '-');
            // 支持 2026-01-10 或 2026-1-10（WPS会自动去掉前导零）
            if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalizedDate)) {
                rowErrors.push('考试日期格式不正确，应为YYYY-MM-DD');
            } else {
                // 标准化为 YYYY-MM-DD 格式（补零）
                const parts = normalizedDate.split('-');
                const year = parts[0];
                const month = parts[1].padStart(2, '0');
                const day = parts[2].padStart(2, '0');
                normalizedDate = `${year}-${month}-${day}`;
            }
        }

        if (rowErrors.length > 0) {
            errors.push(`第${rowNum}行: ${rowErrors.join('、')}`);
        } else {
            validRows.push({
                studentId,
                studentName,
                className,
                subjectName,
                examName,
                score: parseFloat(score),
                examDate: normalizedDate
            });
        }
    });
    
    return {
        headers,
        validRows,
        errors,
        totalCount: dataRows.length,
        validCount: validRows.length
    };
}

/**
 * 显示导入预览
 */
function showImportPreview(validation) {
    const previewDiv = document.getElementById('importPreview');
    const contentDiv = document.getElementById('previewContent');
    const errorsDiv = document.getElementById('importErrors');
    const confirmBtn = document.getElementById('btnConfirmImport');
    
    previewDiv.style.display = 'block';
    
    // 显示预览数据
    let html = `
        <div style="margin-bottom: 12px;">
            <strong>共 ${validation.totalCount} 条数据</strong>，
            <span style="color: var(--success-color);">有效 ${validation.validCount} 条</span>，
            <span style="color: var(--error-color);">无效 ${validation.errors.length} 条</span>
        </div>
        <table class="data-table" style="font-size: 12px;">
            <thead>
                <tr>
                    <th>学号</th>
                    <th>姓名</th>
                    <th>班级</th>
                    <th>科目</th>
                    <th>考试</th>
                    <th>分数</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    validation.validRows.slice(0, 5).forEach(row => {
        html += `
            <tr>
                <td>${escapeHtml(row.studentId)}</td>
                <td>${escapeHtml(row.studentName)}</td>
                <td>${escapeHtml(row.className)}</td>
                <td>${escapeHtml(row.subjectName)}</td>
                <td>${escapeHtml(row.examName)}</td>
                <td>${row.score}</td>
            </tr>
        `;
    });
    
    if (validation.validRows.length > 5) {
        html += `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">...还有 ${validation.validRows.length - 5} 条数据...</td></tr>`;
    }
    
    html += '</tbody></table>';
    contentDiv.innerHTML = html;
    
    // 显示错误信息
    if (validation.errors.length > 0) {
        errorsDiv.style.display = 'block';
        errorsDiv.innerHTML = `
            <strong>发现 ${validation.errors.length} 个错误：</strong>
            <ul style="margin-top: 8px; margin-bottom: 0; padding-left: 20px;">
                ${validation.errors.slice(0, 5).map(e => `<li>${e}</li>`).join('')}
                ${validation.errors.length > 5 ? `<li>...还有 ${validation.errors.length - 5} 个错误...</li>` : ''}
            </ul>
        `;
    } else {
        errorsDiv.style.display = 'none';
    }
    
    // 启用/禁用确认按钮
    confirmBtn.disabled = validation.validCount === 0;
}

/**
 * 确认导入
 */
async function confirmImport() {
    if (!importData || importData.validCount === 0) {
        alert('没有有效的数据可导入');
        return;
    }

    const confirmBtn = document.getElementById('btnConfirmImport');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span>⏳</span> 导入中...';

    try {
        // 获取所有班级和科目列表，用于名称转ID
        const [classesRes, subjectsRes] = await Promise.all([
            API.get('/classes'),
            API.get('/subjects')
        ]);

        const classes = classesRes.data?.list || [];
        const subjects = subjectsRes.data || [];

        // 创建名称到ID的映射
        const classNameToId = {};
        classes.forEach(c => {
            classNameToId[c.className] = c.id;
        });

        const subjectNameToId = {};
        subjects.forEach(s => {
            subjectNameToId[s.subjectName] = s.id;
        });

        // 转换数据格式
        const scoresToImport = [];
        const errors = [];

        for (const row of importData.validRows) {
            const classId = classNameToId[row.className];
            const subjectId = subjectNameToId[row.subjectName];

            if (!classId) {
                errors.push(`班级"${row.className}"不存在`);
                continue;
            }
            if (!subjectId) {
                errors.push(`科目"${row.subjectName}"不存在`);
                continue;
            }

            scoresToImport.push({
                studentId: row.studentId,
                classId: classId,
                subjectId: subjectId,
                score: row.score,
                examName: row.examName,
                examDate: row.examDate,
                subjectName: row.subjectName
            });
        }

        if (errors.length > 0) {
            alert('数据验证失败：\n' + errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n...等共${errors.length}个错误` : ''));
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<span>✓</span> 确认导入';
            return;
        }

        const response = await API.post('/scores/import', {
            scores: scoresToImport
        });

        if (response.code === 200) {
            alert(`导入完成！${response.message}`);
            closeImportModal();
            loadScoreList(); // 刷新成绩列表
        } else {
            alert('导入失败：' + response.message);
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<span>✓</span> 确认导入';
        }
    } catch (error) {
        console.error('导入失败:', error);
        alert('导入失败：' + (error.message || '网络错误'));
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<span>✓</span> 确认导入';
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
window.initScorePage = initScorePage;
// 暴露 Modal 相关的函数，供 HTML 内联事件调用
window.openScoreModal = openScoreModal;

})();
