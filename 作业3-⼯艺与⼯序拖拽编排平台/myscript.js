document.addEventListener('DOMContentLoaded', () => {
    const standardProcesses = [
        { id: 'p1', name: '原料切割' },
        { id: 'p2', name: '粗加工' },
        { id: 'p3', name: '精加工' },
        { id: 'p4', name: '表面处理' },
        { id: 'p5', name: '质量检测' },
        { id: 'p6', name: '包装入库' }
    ]

    const library = document.getElementById('library')

    //渲染标准工序库
    function renderLibrary() {
        const children = library.children
        for (let i = children.length - 1; i >= 0; i--) {
            if (!children[i].classList.contains('title-nav')) {
                library.removeChild(children[i])
            }
        }
        standardProcesses.forEach(process => {
            const div = document.createElement('div')
            div.className = 'box'
            div.textContent = process.name
            div.setAttribute('draggable', 'true')
            div.setAttribute('data-id', process.id)
            div.setAttribute('data-name', process.name)
            library.appendChild(div)
        })
        dragEvents()
    }

    function dragEvents() {
        const dragItems = document.querySelectorAll('#library .box[draggable="true"]')
        dragItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const processId = item.getAttribute('data-id')
                const processName = item.getAttribute('data-name')
                e.dataTransfer.setData('text/plain', JSON.stringify({
                    id: processId,
                    name: processName
                }))
                e.dataTransfer.effectAllowed = 'copy'
            })
        })
    }
    let crafts = []
    let currentCraftId = null
    if (!load()) {
        crafts = []
        currentCraftId = null
    }
    const craftList = document.querySelector('.craft-list')
    //渲染工艺列表
    function renderCrafts() {
        craftList.innerHTML = ''
        if (crafts.length === 0) {
            const emptyCraft = document.createElement('div')
            emptyCraft.className = 'emptyCraft'
            emptyCraft.textContent = '暂无工艺，点击“新建工艺”开始'
            craftList.appendChild(emptyCraft)
            return
        }
        crafts.forEach(craft => {
            const craftDiv = document.createElement('div')
            craftDiv.className = 'box'
            craftDiv.textContent = craft.name
            craftDiv.setAttribute('data-id', craft.id)
            craftDiv.setAttribute('data-name', craft.name)
            craftList.appendChild(craftDiv)

            if (currentCraftId === craft.id) {
                craftDiv.classList.add('active')
            }
            //绑定点击工艺事件
            craftDiv.addEventListener('click', (e) => {
                if (e.target === craftDiv) {
                    currentCraftId = craft.id
                    save()
                }
                renderCrafts()
                updateEditorName()
                renderEditorSteps()
            })
        })

    }

    //更新⼯艺编辑区名字
    function updateEditorName() {
        let now = document.querySelector('.now')
        if (currentCraftId === null) now.textContent = '未选中工艺'
        const current = crafts.find(c => c.id === currentCraftId)
        now.textContent = current ? current.name : '未选中工艺'
    }

    let dropZone = document.querySelector('.write')
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault()
            const effect = e.dataTransfer.effectAllowed === 'move' ? 'move' : 'copy'
            e.dataTransfer.dropEffect = effect
        })
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault()
            const rawData = e.dataTransfer.getData('text/plain')
            if (!rawData) return
            const process = JSON.parse(rawData)
            if (currentCraftId === null) {
                alert('请先选中或新建一个工艺')
                return
            }
            const currentCraft = crafts.find(c => c.id === currentCraftId)
            if (!currentCraft) return
            const newStep = {
                stepId: getId(),
                templateId: process.id,
                name: process.name
            }
            currentCraft.steps.push(newStep)
            renderEditorSteps()
            save()
        })
    }
    //渲染工艺编辑区
    function renderEditorSteps() {
        let writeArea = document.querySelector('.write')
        const current = crafts.find(c => c.id === currentCraftId)
        if (!writeArea) return
        if (currentCraftId === null) {
            writeArea.innerHTML = '<h4>请先选中或新建一个工艺</h4>'
            return
        }
        if (!current) {
            writeArea.innerHTML = '<h4>当前工艺不存在，请重新选择</h4>'
            return
        }
        if (currentCraftId && current.steps.length === 0) {
            writeArea.innerHTML = '<h4>请从左侧拖拽工序到此处</h4>'
            return
        }
        writeArea.innerHTML = ''
        current.steps.forEach(step => {
            const stepDiv = document.createElement('div')
            stepDiv.className = 'box'
            stepDiv.classList.add('stepDiv')
            stepDiv.innerHTML = `${step.name}<button class="del-step">删除</button>`
            stepDiv.setAttribute('data-id', step.stepId)
            stepDiv.setAttribute('data-name', step.name)
            stepDiv.setAttribute('draggable', true)

            //拖拽排序
            stepDiv.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', step.stepId)
                e.dataTransfer.effectAllowed = 'move'
            })
            stepDiv.addEventListener('dragover', (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'

            })
            stepDiv.addEventListener('drop', (e) => {
                e.preventDefault()
                const dragStepId = e.dataTransfer.getData('text/plain')
                const targetStepId = step.stepId
                if (dragStepId === targetStepId) return
                const currentCraft = crafts.find(c => c.id === currentCraftId)
                if (!currentCraft) return
                const dragIndex = currentCraft.steps.findIndex(s => s.stepId === dragStepId)
                const targetIndex = currentCraft.steps.findIndex(s => s.stepId === targetStepId)
                if (dragIndex !== -1 && targetIndex !== -1) {
                    // 交换两个元素的位置
                    [currentCraft.steps[dragIndex], currentCraft.steps[targetIndex]] =
                        [currentCraft.steps[targetIndex], currentCraft.steps[dragIndex]]
                    renderEditorSteps()
                    save()
                }
                e.stopPropagation()
            })
            writeArea.appendChild(stepDiv)
        })

        document.querySelectorAll('.del-step').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const stepId = btn.parentElement.getAttribute('data-id')
                const currentCraft = crafts.find(c => c.id === currentCraftId)
                if (currentCraft) {
                    currentCraft.steps = currentCraft.steps.filter(s => s.stepId !== stepId)
                    // console.log('ok')
                    renderEditorSteps()
                    save()
                }
                e.stopPropagation()
            })
        })
    }

    function getId() {
        return Date.now() + '-' + Math.floor(Math.random() * 10000)
    }

    //本地储存
    function save() {
        const data = {
            crafts: crafts,
            currentCraftId: currentCraftId
        }
        localStorage.setItem('processes_data', JSON.stringify(data))
    }

    function load() {
        const saved = localStorage.getItem('processes_data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                crafts = data.crafts;
                currentCraftId = data.currentCraftId;
                return true;
            } catch (e) {
                console.error('读取存储失败', e);
            }
        }
        return false;
    }

    //模态框
    const modal = document.querySelector('.modal')
    const craftNameInput = document.querySelector('.craftNameInput')
    const modalConfirm = document.querySelector('.btn-primary')
    const modalCancel = document.querySelector('.btn-secondary')
    const modalClose = document.querySelector('.modal-close')

    function openModal() {
        if (modal) {
            modal.style.display = 'flex'
            craftNameInput.value = ''
            craftNameInput.focus()
        }
    }

    function closeModal() {
        if (modal) {
            modal.style.display = 'none'
        }
    }

    function confirmCreateCraft() {
        let newName = craftNameInput.value.trim()
        if (!newName) {
            alert('工艺名称不能为空')
            return
        }
        const newId = getId()
        crafts.push({
            id: newId,
            name: newName,
            steps: []
        })
        currentCraftId = newId
        renderCrafts()
        updateEditorName()
        renderEditorSteps()
        closeModal()
        save()
    }

    //绑定新建工艺点击事件
    const createBtn = document.querySelector('.create')
    if (createBtn) {
        createBtn.addEventListener('click', openModal)
    }

    if (modalConfirm) modalConfirm.addEventListener('click', confirmCreateCraft)
    if (modalCancel) modalCancel.addEventListener('click', closeModal)
    if (modalClose) modalClose.addEventListener('click', closeModal)

    //点击模态框背景
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal()
        })
    }
    //删除当前工艺
    const delCurrentBtn = document.querySelector('.del-current')
    if (delCurrentBtn) {
        delCurrentBtn.addEventListener('click', () => {
            if (crafts.length === 0) {
                alert('没有可删除的工艺')
                return
            }
            if (currentCraftId === null) {
                alert('请先选中一个工艺')
                return
            }
            const current = crafts.findIndex(c => c.id === currentCraftId)
            if (current !== -1) {
                crafts.splice(current, 1)
                if (crafts.length === 0) {
                    currentCraftId = null
                } else {
                    currentCraftId = crafts[0].id
                }
                renderCrafts()
                updateEditorName()
                renderEditorSteps()
                save()
            }
        })
    }
    //编辑工艺区清空工序
    const clearBtn = document.querySelector('.del')
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (currentCraftId === null) {
                alert('请先选中一个工艺')
                return
            }
            const current = crafts.find(c => c.id === currentCraftId)
            if (current) {
                current.steps = []
                renderEditorSteps()
                save()
            }
        })
    }
    //编辑工艺区保存工艺
    const saveBtn = document.querySelector('.complete')
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            alert('当前工艺已保存')
        })
    }
    renderLibrary()
    renderCrafts()
    updateEditorName()
    renderEditorSteps()
})
