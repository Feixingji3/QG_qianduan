document.addEventListener('DOMContentLoaded', function () {
    const titleInput = document.getElementById('title-input')
    const contentInput = document.getElementById('content-input')
    const todoList = document.getElementById('todo-list')
    const addBtn = document.getElementById('add-btn')
    const tips = document.getElementById('tips')
    const btnTodos = document.getElementById('btn-todos')
    const btnTrash = document.getElementById('btn-trash')
    const btnClearData = document.getElementById('btn-clear-data')
    const btnAddCompleted = document.getElementById('btn-add-completed')

    const searchInput = document.getElementById('search-input')
    const btnExport = document.getElementById('btn-export')
    const btnImport = document.getElementById('btn-import')
    const importInput = document.getElementById('import-input')
    const timeDisplay = document.getElementById('time-display')
    const langBtn = document.getElementById('lang-btn')
    const appTitle = document.getElementById('app-title')
    const listTop = document.getElementById('list-top')
    const listBottom = document.getElementById('list-bottom')

    let currentPage = 'todos'
    let currentLang = 'zh'
    let searchKeyword = ''

    const langData = {
        zh: {
            appTitle: '我的待办清单',
            listTop: '待办列表',
            listBottom: '底部',
            btnTodos: '我的待办',
            btnTrash: '回收站',
            btnClearData: '清除数据',
            btnAddCompleted: '一键添加已完成',
            btnExport: '导出数据',
            btnImport: '导入数据',
            titlePlaceholder: '请输入待办标题',
            contentPlaceholder: '请输入待办内容',
            searchPlaceholder: '搜索待办标题/内容...',
            tipEmpty: '标题和内容不能为空！',
            tipAddSuccess: '添加成功！',
            tipCompleteSuccess: '已标记完成！',
            tipUrgentSuccess: '已加急！',
            tipRestoreSuccess: '恢复成功！',
            tipDeleteSuccess: '已移至回收站！',
            tipMoveAllSuccess: '已将所有待办移至回收站！',
            tipClearTrashSuccess: '回收站已清空！',
            tipClearSuccess: '所有数据已清除！',
            tipExportSuccess: '导出成功！',
            tipImportSuccess: '导入成功！',
            tipEditSuccess: '修改成功！',
            tipSearchEmpty: '无匹配待办！',
            confirmClear: '确定清空所有数据？不可恢复！',
            confirmDelete: '确定移至回收站？',
            confirmMoveAll: '确定要将所有待办移至回收站吗？',
            confirmClearTrash: '确定要清空回收站吗？此操作不可恢复！'
        },
        en: {
            appTitle: 'My Todo List',
            listTop: 'Todo List',
            listBottom: 'Footer',
            btnTodos: 'My Todos',
            btnTrash: 'Trash',
            btnClearData: 'Clear Data',
            btnAddCompleted: 'Add Completed',
            btnExport: 'Export Dates',
            btnImport: 'Import Dates',
            titlePlaceholder: 'Enter todo title',
            contentPlaceholder: 'Enter todo content',
            searchPlaceholder: 'Search todo title/content...',
            tipEmpty: 'Title and content cannot be empty!',
            tipAddSuccess: 'Added successfully!',
            tipCompleteSuccess: 'Marked as completed!',
            tipUrgentSuccess: 'Urgent marked!',
            tipRestoreSuccess: 'Restored successfully!',
            tipDeleteSuccess: 'Moved to trash!',
            tipClearSuccess: 'All data cleared!',
            tipExportSuccess: 'Exported successfully!',
            tipImportSuccess: 'Imported successfully!',
            tipEditSuccess: 'Edited successfully!',
            tipSearchEmpty: 'No matching todos!',
            confirmClear: 'Are you sure to clear all data? Irreversible!',
            confirmDelete: 'Are you sure to move to trash?'
        }
    }
    //更新语言
    function updateLangUI() {
        const lang = langData[currentLang]
        appTitle.textContent = lang.appTitle
        listTop.textContent = lang.listTop
        listBottom.textContent = lang.listBottom
        btnTodos.textContent = lang.btnTodos
        btnTrash.textContent = lang.btnTrash
        btnClearData.textContent = lang.btnClearData
        btnAddCompleted.textContent = lang.btnAddCompleted
        btnExport.textContent = lang.btnExport
        btnImport.textContent = lang.btnImport
        titleInput.placeholder = lang.titlePlaceholder
        contentInput.placeholder = lang.contentPlaceholder
        searchInput.placeholder = lang.searchPlaceholder
    }

    //语言切换
    langBtn.addEventListener('click', function () {
        currentLang = currentLang === 'zh' ? 'en' : 'zh'
        updateLangUI()
        renderTodoList()
    })

    updateTime()
    setInterval(updateTime, 1000)
    renderTodoList()
    updateLangUI()

    function updateTime() {
        const now = new Date()
        const timeStr = now.toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
        timeDisplay.textContent = timeStr
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp)
        return date.toLocaleString('zh-CN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        })
    }

    function showTips(key) {
        const lang = langData[currentLang]
        tips.textContent = lang[key]
        tips.style.display = 'block'
        setTimeout(function () {
            tips.style.display = 'none'
        }, 2000)
    }

    //渲染
    function renderTodoList() {
        todoList.innerHTML = ''
        let rawData = currentPage === 'todos'
            ? JSON.parse(localStorage.getItem('todos')) || []
            : JSON.parse(localStorage.getItem('trash')) || []

        //搜索
        let filteredData = rawData.filter(function (item) {
            if (!searchKeyword) return true
            return item.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
                item.content.toLowerCase().includes(searchKeyword.toLowerCase())
        })

        //排序
        filteredData.sort(function (a, b) {
            if (a.isUrgent !== b.isUrgent) {
                return a.isUrgent ? -1 : 1
            }
            return b.createTime - a.createTime
        })

        if (filteredData.length === 0 && searchKeyword) {
            showTips('tipSearchEmpty')
        }

        for (let i = 0; i < filteredData.length; i++) {
            const item = filteredData[i]
            const todoItem = document.createElement('div')
            todoItem.className = 'todo-item'
            if (item.completed) todoItem.classList.add('completed')
            if (item.isUrgent) todoItem.classList.add('urgent')

            let btnHtml = ''
            if (currentPage === 'todos') {
                btnHtml = `
                            <button class="urgent-btn">${currentLang === 'zh' ? '加急' : 'Urgent'}</button>
                            <button class="del-btn">${currentLang === 'zh' ? '删除' : 'Delete'}</button>
                        `
            } else {
                btnHtml = `<button class="restore-btn">${currentLang === 'zh' ? '恢复' : 'Restore'}</button>`
            }

            todoItem.innerHTML = `
                        <input type="checkbox" ${item.completed ? 'checked' : ''}>
                        <div class="todo-info">
                            <div class="todo-title">${item.title}</div>
                            <div class="todo-content">${item.content}</div>
                            <div class="todo-time">${formatTime(item.createTime)}</div>
                        </div>
                        ${btnHtml}
                    `
            todoList.appendChild(todoItem);
        }
    }

    //添加待办
    addBtn.addEventListener('click', addTodo)
    titleInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') addTodo()
    })
    contentInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') addTodo()
    })

    function addTodo() {
        let todoTitle = titleInput.value.trim();
        let todoContent = contentInput.value.trim();
        if (!todoTitle || !todoContent) {
            showTips('tipEmpty');
            return;
        }

        const todoObj = {
            title: todoTitle,
            content: todoContent,
            completed: false,
            isUrgent: false,
            createTime: Date.now()
        }
        let todoArr = JSON.parse(localStorage.getItem('todos')) || []
        todoArr.unshift(todoObj)
        localStorage.setItem('todos', JSON.stringify(todoArr))
        titleInput.value = ''
        contentInput.value = ''
        showTips('tipAddSuccess')
        renderTodoList()
    }

    //切换页面
    btnTodos.addEventListener('click', function () {
        currentPage = 'todos'
        btnTodos.classList.add('tab-active')
        btnTrash.classList.remove('tab-active')
        searchKeyword = ''
        searchInput.value = ''
        renderTodoList()
    })
    btnTrash.addEventListener('click', function () {
        currentPage = 'trash'
        btnTrash.classList.add('tab-active')
        btnTodos.classList.remove('tab-active')
        searchKeyword = ''
        searchInput.value = ''
        renderTodoList()
    })


    todoList.addEventListener('click', function (e) {
        let target = e.target
        const todoItem = target.closest('.todo-item')
        if (!todoItem) return
        const title = todoItem.querySelector('.todo-title').innerText
        if (target.className === 'del-btn') {
            if (confirm(langData[currentLang].confirmDelete)) {
                todoItem.classList.add('fade-out')
                setTimeout(function () {
                    moveToTrash(title)
                    showTips('tipDeleteSuccess')
                    renderTodoList()
                }, 300)
            }
        }

        if (target.className === 'restore-btn') {
            restoreFromTrash(title)
            showTips('tipRestoreSuccess')
            renderTodoList()
        }

        if (target.type === 'checkbox') {
            updateSingleComplete(title, target.checked)
            showTips('tipCompleteSuccess')
            renderTodoList()
        }

        if (target.className === 'urgent-btn') {
            updateUrgent(title)
            showTips('tipUrgentSuccess')
            renderTodoList()
        }

        if (target.className === 'todo-title' || target.className === 'todo-content') {
            if (currentPage !== 'todos') return
            if (target.classList.contains('editing')) return

            const oldText = target.innerText
            target.classList.add('editing')
            target.contentEditable = true
            target.focus()

            function saveEdit() {
                const newText = target.innerText.trim()
                if (!newText) {
                    target.innerText = oldText
                    showTips('tipEmpty')
                } else {
                    if (target.className === 'todo-title') {
                        updateTitle(title, newText)
                    } else {
                        updateContent(title, oldText, newText)
                    }
                    showTips('tipEditSuccess')
                    renderTodoList()
                }
                target.classList.remove('editing')
                target.contentEditable = false
            }

            target.addEventListener('blur', saveEdit);
            target.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    saveEdit()
                }
            })
        }
    })

    //修改标题
    function updateTitle(oldTitle, newTitle) {
        let todos = JSON.parse(localStorage.getItem('todos')) || []
        for (let i = 0; i < todos.length; i++) {
            if (todos[i].title === oldTitle) {
                todos[i].title = newTitle
                break
            }
        }
        localStorage.setItem('todos', JSON.stringify(todos));
    }

    //修改内容
    function updateContent(title, oldContent, newContent) {
        let todos = JSON.parse(localStorage.getItem('todos')) || []
        for (let i = 0; i < todos.length; i++) {
            if (todos[i].title === title && todos[i].content === oldContent) {
                todos[i].content = newContent
                break
            }
        }
        localStorage.setItem('todos', JSON.stringify(todos))
    }

    //移动到回收站
    function moveToTrash(title) {
        let todos = JSON.parse(localStorage.getItem('todos')) || []
        let trash = JSON.parse(localStorage.getItem('trash')) || []
        let newTodos = []
        for (let i = 0; i < todos.length; i++) {
            if (todos[i].title === title) {
                trash.unshift(todos[i])
            } else {
                newTodos.push(todos[i])
            }
        }
        localStorage.setItem('todos', JSON.stringify(newTodos))
        localStorage.setItem('trash', JSON.stringify(trash))
    }

    //从回收站恢复
    function restoreFromTrash(title) {
        let todos = JSON.parse(localStorage.getItem('todos')) || []
        let trash = JSON.parse(localStorage.getItem('trash')) || []
        let newTrash = []
        for (let i = 0; i < trash.length; i++) {
            if (trash[i].title === title) {
                todos.unshift(trash[i])
            } else {
                newTrash.push(trash[i])
            }
        }
        localStorage.setItem('todos', JSON.stringify(todos))
        localStorage.setItem('trash', JSON.stringify(newTrash))
    }

    //单个完成
    function updateSingleComplete(title, isChecked) {
        let todos = JSON.parse(localStorage.getItem('todos')) || []
        for (let i = 0; i < todos.length; i++) {
            if (todos[i].title === title) {
                todos[i].completed = isChecked
                break
            }
        }
        localStorage.setItem('todos', JSON.stringify(todos))
    }

    //加急
    function updateUrgent(title) {
        let todos = JSON.parse(localStorage.getItem('todos')) || []
        for (let i = 0; i < todos.length; i++) {
            if (todos[i].title === title) {
                todos[i].isUrgent = !todos[i].isUrgent
                break
            }
        }
        localStorage.setItem('todos', JSON.stringify(todos))
    }

    //搜索
    searchInput.addEventListener('input', function () {
        searchKeyword = this.value.trim()
        renderTodoList()
    })

    //导出
    btnExport.addEventListener('click', function () {
        const exportData = {
            todos: JSON.parse(localStorage.getItem('todos')) || [],
            trash: JSON.parse(localStorage.getItem('trash')) || [],
            exportTime: Date.now()
        }
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `todolist-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
        showTips('tipExportSuccess')
    })

    //导入
    btnImport.addEventListener('click', function () {
        importInput.click()
    })
    importInput.addEventListener('change', function (e) {
        const file = e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = function (event) {
            try {
                const importData = JSON.parse(event.target.result)
                // 合并数据
                let localTodos = JSON.parse(localStorage.getItem('todos')) || []
                let localTrash = JSON.parse(localStorage.getItem('trash')) || []
                localTodos = localTodos.concat(importData.todos || [])
                localTrash = localTrash.concat(importData.trash || [])
                localStorage.setItem('todos', JSON.stringify(localTodos))
                localStorage.setItem('trash', JSON.stringify(localTrash))
                showTips('tipImportSuccess')
                renderTodoList()
            } catch (err) {
                alert(langData[currentLang].tipEmpty)
            }
        }
        reader.readAsText(file)
        importInput.value = ''
    })

    //一键添加已完成
    btnAddCompleted.addEventListener('click', function () {
        const todoObj = {
            title: currentLang === 'zh' ? '已完成待办' : 'Completed Todo',
            content: currentLang === 'zh' ? '单击可修改' : 'Click to edit',
            completed: true,
            isUrgent: false,
            createTime: Date.now()
        }
        let todoArr = JSON.parse(localStorage.getItem('todos')) || []
        todoArr.unshift(todoObj)
        localStorage.setItem('todos', JSON.stringify(todoArr))
        showTips('tipAddSuccess')
        renderTodoList()
    })
    // 一键清除
    btnClearData.addEventListener('click', function () {
        if (currentPage === 'todos') {
            if (confirm(langData[currentLang].confirmMoveAll)) {
                let todos = JSON.parse(localStorage.getItem('todos')) || []
                let trash = JSON.parse(localStorage.getItem('trash')) || []
                for (let i = 0; i < todos.length; i++) {
                    trash.unshift(todos[i])
                }
                localStorage.setItem('trash', JSON.stringify(trash))
                localStorage.setItem('todos', JSON.stringify([]))
                showTips('tipMoveAllSuccess')
                renderTodoList()
            }
        } else if (currentPage === 'trash') {
            if (confirm(langData[currentLang].confirmClearTrash)) {
                localStorage.setItem('trash', JSON.stringify([]))
                showTips('tipClearTrashSuccess')
                renderTodoList()
            }
        }
    })

    updateTime()
    setInterval(updateTime, 1000)
    renderTodoList()
    updateLangUI()

})
