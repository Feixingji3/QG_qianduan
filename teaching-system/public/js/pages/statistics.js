/**
 * 统计分析页面
 *
 * 功能说明：
 * 1. 成绩数据统计展示（平均分、最高分、最低分、及格人数、及格率）
 * 2. 多维度筛选查询（班级、科目、考试名称）
 * 3. 角色权限控制：
 *    - 教务主任：可按班级、科目、考试名称筛选，查看全量统计数据
 *    - 班主任：只能查看本班数据，按科目和考试名称筛选
 *    - 学生：只能查看本班数据，按科目和考试名称筛选
 */
(function() {
'use strict';

// ========== 页面状态（与 scorePageState 结构一致）==========
const statisticsState = {
    filters: {          // 筛选条件
        classId: '',    // 班级ID（教务主任可用）
        subjectId: '',  // 科目ID
        examName: ''    // 考试名称（模糊搜索）
    },
    statistics: null,   // 统计数据
    subjects: [],       // 科目列表
    classes: [],        // 班级列表（班主任需要）
    isLoading: false    // 加载状态
};

// ========== 初始化（与 initScorePage 完全一致）==========
/**
 * 初始化统计分析页面
 * 流程：读取缓存 -> 判断角色 -> 渲染页面 -> 加载基础数据 -> 校验缓存 -> 回填表单 -> 加载统计数据
 */
async function initStatisticsPage() {
    // 1. 从本地缓存读取筛选条件
    const cachedFilters = localStorage.getItem('statistics_filters');
    if (cachedFilters) {
        try {
            statisticsState.filters = JSON.parse(cachedFilters);
        } catch (e) {
            console.error('读取缓存筛选条件失败:', e);
        }
    }

    statisticsState.statistics = null;
    statisticsState.subjects = [];
    statisticsState.classes = [];

    // 2. 确定角色
    const isStudent = currentUser && currentUser.role === ROLE_STUDENT;
    const isTeacher = currentUser && currentUser.role === ROLE_HEAD_TEACHER;

    // 3. 渲染页面
    renderStatisticsPage();

    // 4. 加载基础数据（与 scores.js 一致的模式）
    if (isStudent) {
        // 学生端：加载该学生实际考过的科目和考试
        await loadStudentSubjects();
        await loadExamList();
    } else if (isTeacher) {
        // 班主任端：加载该班主任负责的科目、班级和考试
        await loadTeacherSubjects();
        await loadTeacherClasses();
        await loadExamList();
    } else {
        // 教务主任端：加载全部科目、班级和考试
        await loadSubjectList();
        await loadClassList();
        await loadExamList();
    }

    // 5. 校验缓存的筛选条件是否有效（班级和科目是否还存在）
    validateCachedFilters();

    // 6. 回填筛选条件到表单
    const classSelect = document.getElementById('statFilterClass');
    const subjectSelect = document.getElementById('statFilterSubject');
    const examNameInput = document.getElementById('statFilterExamName');

    if (classSelect && statisticsState.filters.classId) classSelect.value = statisticsState.filters.classId;
    if (subjectSelect && statisticsState.filters.subjectId) subjectSelect.value = statisticsState.filters.subjectId;
    if (examNameInput && statisticsState.filters.examName) examNameInput.value = statisticsState.filters.examName;

    // 7. 加载统计数据
    loadStatistics();
    
    // 8. 绑定事件委托
    bindEventDelegation();
}

/**
 * 校验缓存的筛选条件是否有效
 * 如果缓存的班级或科目已不存在，则清空对应的筛选条件
 */
function validateCachedFilters() {
    let hasInvalidFilter = false;

    // 校验班级ID是否有效（学生不校验，因为学生不能选择班级）
    if (statisticsState.filters.classId && currentUser?.role !== ROLE_STUDENT) {
        const validClassIds = statisticsState.classes.map(c => String(c.id));
        if (!validClassIds.includes(String(statisticsState.filters.classId))) {
            console.log('缓存的班级已不存在，清除班级筛选条件:', statisticsState.filters.classId);
            statisticsState.filters.classId = '';
            hasInvalidFilter = true;
        }
    }

    // 校验科目ID是否有效
    if (statisticsState.filters.subjectId) {
        const validSubjectIds = statisticsState.subjects.map(s => String(s.id));
        if (!validSubjectIds.includes(String(statisticsState.filters.subjectId))) {
            console.log('缓存的科目已不存在，清除科目筛选条件:', statisticsState.filters.subjectId);
            statisticsState.filters.subjectId = '';
            hasInvalidFilter = true;
        }
    }

    // 如果有无效的筛选条件，更新本地缓存
    if (hasInvalidFilter) {
        localStorage.setItem('statistics_filters', JSON.stringify(statisticsState.filters));
    }
}

/**
 * 事件委托绑定 - 统一处理所有点击事件，避免全局函数污染
 */
function bindEventDelegation() {
    // 绑定到 document 以捕获所有动态创建的弹窗事件
    const target = document;
    
    // 设置当前页面标识
    window.currentPageId = 'statistics';
    
    // 移除旧的事件监听器（如果存在）
    target.removeEventListener('click', handleStatContentClick);
    target.removeEventListener('change', handleStatContentChange);
    // 添加新的事件监听器
    target.addEventListener('click', handleStatContentClick);
    target.addEventListener('change', handleStatContentChange);
}

/**
 * 内容区域点击事件处理（统计模块专用）
 */
function handleStatContentClick(e) {
    // 检查是否是当前页面的事件（防止跨页面干扰）
    if (window.currentPageId !== 'statistics') return;
    
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
    }
}

/**
 * 内容区域 change 事件处理（统计模块专用）
 */
function handleStatContentChange(e) {
    // 检查是否是当前页面的事件（防止跨页面干扰）
    if (window.currentPageId !== 'statistics') return;
    
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

// ========== 页面渲染（与 renderScorePage 风格一致）==========
/**
 * 渲染页面结构
 * 根据角色显示不同的筛选条件
 */
function renderStatisticsPage() {
    const content = document.getElementById('pageContent');
    const isDirector = currentUser && currentUser.role === ROLE_DIRECTOR;
    const isTeacher = currentUser && currentUser.role === ROLE_HEAD_TEACHER;
    const isStudent = currentUser && currentUser.role === ROLE_STUDENT;

    // 根据角色生成不同的筛选栏
    let filterHTML = '';
    if (isStudent || isTeacher) {
        // 学生端和班主任端：只显示科目下拉筛选和考试名称搜索框
        // 班主任额外显示班级选择（如果有多个班级）
        filterHTML = `
            <div class="form-row">
                ${isTeacher ? `
                <div class="form-group" id="classFilterGroup" style="display: none;">
                    <label class="form-label">班级</label>
                    <select class="form-select" id="statFilterClass" data-action="handleFilterChange">
                        <option value="">全部班级</option>
                    </select>
                </div>
                ` : ''}
                <div class="form-group">
                    <label class="form-label">科目</label>
                    <select class="form-select" id="statFilterSubject" data-action="handleFilterChange">
                        <option value="">全部科目</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">考试名称</label>
                    <select class="form-select" id="statFilterExamName" data-action="handleFilterChange">
                        <option value="">全部考试</option>
                    </select>
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
        // 教务主任端：显示完整的筛选条件
        filterHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">班级</label>
                    <select class="form-select" id="statFilterClass" data-action="handleFilterChange">
                        <option value="">全部班级</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">科目</label>
                    <select class="form-select" id="statFilterSubject" data-action="handleFilterChange">
                        <option value="">全部科目</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">考试名称</label>
                    <select class="form-select" id="statFilterExamName" data-action="handleFilterChange">
                        <option value="">全部考试</option>
                    </select>
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

        <!-- 统计卡片 -->
        <div class="card">
            <div class="card-header">
                <span class="card-title">成绩统计</span>
                <span id="statInfo" style="font-size: 14px; color: var(--text-secondary);"></span>
            </div>
            <div class="card-body">
                <div id="statisticsContainer">
                    <!-- 统计内容由JS动态生成 -->
                </div>
            </div>
        </div>
    `;
}

// ========== 数据加载函数（与 scores.js 模式一致）==========

/**
 * 加载学生端科目列表（该学生实际考过的科目）
 */
async function loadStudentSubjects() {
    try {
        const data = await API.get('/statistics/subjects');
        statisticsState.subjects = data.data || [];
        renderSubjectOptions();
    } catch (error) {
        console.error('加载科目列表失败:', error);
    }
}

/**
 * 加载班主任端科目列表（负责班级的学生考过的科目）
 */
async function loadTeacherSubjects() {
    try {
        const data = await API.get('/statistics/subjects');
        statisticsState.subjects = data.data || [];
        renderSubjectOptions();
    } catch (error) {
        console.error('加载科目列表失败:', error);
    }
}

/**
 * 加载班主任端班级列表（用于切换班级）
 */
async function loadTeacherClasses() {
    try {
        const data = await API.get('/statistics/teacher-classes');
        statisticsState.classes = data.data || [];

        // 如果有多个班级，显示班级选择器
        if (statisticsState.classes.length > 1) {
            const classFilterGroup = document.getElementById('classFilterGroup');
            if (classFilterGroup) {
                classFilterGroup.style.display = 'block';
            }
        }

        renderClassOptions();
    } catch (error) {
        console.error('加载班级列表失败:', error);
    }
}

/**
 * 加载教务主任端科目列表（全部科目）
 */
async function loadSubjectList() {
    try {
        const data = await API.get('/statistics/subjects');
        statisticsState.subjects = data.data || [];
        renderSubjectOptions();
    } catch (error) {
        console.error('加载科目列表失败:', error);
    }
}

/**
 * 加载教务主任端班级列表（全部班级）
 */
async function loadClassList() {
    try {
        // 统计分析模块排除"全校"班级
        const data = await API.get('/classes', { page: 1, pageSize: 1000, excludeSchool: 'true' });
        statisticsState.classes = data.data?.list || [];
        renderClassOptions();
    } catch (error) {
        console.error('加载班级列表失败:', error);
    }
}

/**
 * 加载考试名称列表
 */
async function loadExamList() {
    try {
        const data = await API.get('/statistics/exams');
        const exams = data.data || [];
        renderExamOptions(exams);
    } catch (error) {
        console.error('加载考试列表失败:', error);
    }
}

/**
 * 加载统计数据
 * 核心功能：调用 /api/statistics/overview 获取统计数据
 */
async function loadStatistics() {
    const container = document.getElementById('statisticsContainer');
    const statInfo = document.getElementById('statInfo');

    // 显示骨架屏加载状态
    container.innerHTML = renderSkeletonCards();

    try {
        const params = { ...statisticsState.filters };
        const data = await API.get('/statistics/overview', params);
        statisticsState.statistics = data.data;

        renderStatisticsCards(data.data);

        // 更新统计信息文本
        if (statInfo) {
            const { className, subjectName } = data.data;
            if (className) {
                statInfo.textContent = `${className} ${subjectName ? '- ' + subjectName : ''}`;
            } else {
                statInfo.textContent = '暂无数据';
            }
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-title">加载失败</div>
                <div class="empty-desc">${escapeHtml(error.message || '请稍后重试')}</div>
            </div>
        `;
    }
}

// ========== 渲染函数 ==========

/**
 * 渲染科目下拉选项
 */
function renderSubjectOptions() {
    const select = document.getElementById('statFilterSubject');
    if (!select) return;

    const options = statisticsState.subjects.map(s =>
        `<option value="${s.id}">${escapeHtml(s.subjectName || s.name)}</option>`
    ).join('');

    select.innerHTML = '<option value="">全部科目</option>' + options;

    // 恢复之前的选中状态
    if (statisticsState.filters.subjectId) {
        select.value = statisticsState.filters.subjectId;
    }
}

/**
 * 渲染班级下拉选项
 */
function renderClassOptions() {
    const select = document.getElementById('statFilterClass');
    if (!select) return;

    const options = statisticsState.classes.map(c =>
        `<option value="${c.id}">${escapeHtml(c.className)}</option>`
    ).join('');

    select.innerHTML = '<option value="">全部班级</option>' + options;

    // 恢复之前的选中状态
    if (statisticsState.filters.classId) {
        select.value = statisticsState.filters.classId;
    }
}

/**
 * 渲染考试名称下拉选项
 */
function renderExamOptions(exams) {
    const select = document.getElementById('statFilterExamName');
    if (!select) return;

    const options = exams.map(exam =>
        `<option value="${escapeHtml(exam)}">${escapeHtml(exam)}</option>`
    ).join('');

    select.innerHTML = '<option value="">全部考试</option>' + options;

    // 恢复之前的选中状态
    if (statisticsState.filters.examName) {
        select.value = statisticsState.filters.examName;
    }
}

/**
 * 渲染骨架屏加载状态
 */
function renderSkeletonCards() {
    return `
        <div class="stats-grid" style="gap: 32px; padding: 20px;">
            ${[1, 2, 3, 4, 5, 6].map(() => `
                <div class="stat-item" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
                    <div class="stat-circle" style="width: 140px; height: 140px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                        <div class="loading-skeleton" style="height: 32px; width: 60%;"></div>
                    </div>
                    <div class="loading-skeleton" style="height: 16px; width: 50%;"></div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * 渲染统计卡片
 */
function renderStatisticsCards(stats) {
    const container = document.getElementById('statisticsContainer');

    if (!stats || stats.totalCount === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📊</div>
                <div class="empty-title">暂无统计数据</div>
                <div class="empty-desc">请调整筛选条件或录入成绩数据</div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="stats-grid" style="gap: 32px; padding: 20px;">
            <div class="stat-item" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
                <div class="stat-circle" style="width: 140px; height: 140px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                    <span class="stat-value" style="font-size: 32px; font-weight: 700; color: var(--text-primary);">${stats.totalCount}</span>
                </div>
                <div class="stat-label" style="font-size: 16px; font-weight: 500; color: var(--text-primary);">考试人数</div>
            </div>
            <div class="stat-item" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
                <div class="stat-circle" style="width: 140px; height: 140px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                    <span class="stat-value" style="font-size: 32px; font-weight: 700; color: var(--text-primary);">${stats.avgScore}</span>
                </div>
                <div class="stat-label" style="font-size: 16px; font-weight: 500; color: var(--text-primary);">平均分</div>
            </div>
            <div class="stat-item" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
                <div class="stat-circle" style="width: 140px; height: 140px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                    <span class="stat-value" style="font-size: 32px; font-weight: 700; color: var(--text-primary);">${stats.maxScore}</span>
                </div>
                <div class="stat-label" style="font-size: 16px; font-weight: 500; color: var(--text-primary);">最高分</div>
            </div>
            <div class="stat-item" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
                <div class="stat-circle" style="width: 140px; height: 140px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                    <span class="stat-value" style="font-size: 32px; font-weight: 700; color: var(--text-primary);">${stats.minScore}</span>
                </div>
                <div class="stat-label" style="font-size: 16px; font-weight: 500; color: var(--text-primary);">最低分</div>
            </div>
            <div class="stat-item" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
                <div class="stat-circle" style="width: 140px; height: 140px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                    <span class="stat-value" style="font-size: 32px; font-weight: 700; color: var(--text-primary);">${stats.passCount}</span>
                </div>
                <div class="stat-label" style="font-size: 16px; font-weight: 500; color: var(--text-primary);">及格人数</div>
            </div>
            <div class="stat-item" style="display: flex; flex-direction: column; align-items: center; text-align: center;">
                <div class="stat-circle" style="width: 140px; height: 140px; border-radius: 50%; background: #ffffff; box-shadow: 0 4px 20px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                    <span class="stat-value" style="font-size: 32px; font-weight: 700; color: var(--text-primary);">${stats.passRate}%</span>
                </div>
                <div class="stat-label" style="font-size: 16px; font-weight: 500; color: var(--text-primary);">及格率</div>
            </div>
        </div>
    `;
}

// ========== 事件处理函数（与 scores.js 完全一致）==========

/**
 * 筛选条件变化处理
 */
function handleFilterChange() {
    const classSelect = document.getElementById('statFilterClass');
    const subjectSelect = document.getElementById('statFilterSubject');
    const examNameInput = document.getElementById('statFilterExamName');

    statisticsState.filters.classId = classSelect ? classSelect.value : '';
    statisticsState.filters.subjectId = subjectSelect ? subjectSelect.value : '';
    statisticsState.filters.examName = examNameInput ? examNameInput.value.trim() : '';
}

/**
 * 筛选输入框按键处理（回车触发筛选）
 */
function handleFilterKeyup(event) {
    if (event.key === 'Enter') {
        applyFilters();
    }
}

/**
 * 应用筛选条件
 * 保存筛选条件到本地缓存
 */
function applyFilters() {
    handleFilterChange();
    // 保存筛选条件到本地存储
    localStorage.setItem('statistics_filters', JSON.stringify(statisticsState.filters));
    loadStatistics();
}

/**
 * 重置筛选条件
 * 清除本地缓存的筛选条件
 */
function resetFilters() {
    statisticsState.filters = { classId: '', subjectId: '', examName: '' };

    const classSelect = document.getElementById('statFilterClass');
    const subjectSelect = document.getElementById('statFilterSubject');
    const examNameInput = document.getElementById('statFilterExamName');

    if (classSelect) classSelect.value = '';
    if (subjectSelect) subjectSelect.value = '';
    if (examNameInput) examNameInput.value = '';

    // 清除筛选条件缓存
    localStorage.removeItem('statistics_filters');

    loadStatistics();
}

// ========== 工具函数（与 classes.js/scores.js 保持一致）==========

/**
 * HTML转义，防止XSS攻击
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示错误提示
 */
function showError(message) {
    // 简单的错误提示，使用 alert 或自定义实现
    alert(message);
}

/**
 * 防抖处理的筛选函数（防止快速连续点击）
 */
const debouncedApplyFilters = debounce(applyFilters, 300);

// 只暴露初始化函数，其他所有功能通过事件委托处理，避免全局变量污染
window.initStatisticsPage = initStatisticsPage;

})();
