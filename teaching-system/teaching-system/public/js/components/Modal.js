/**
 * Modal 弹窗组件
 * 封装通用弹窗外壳，支持自定义内容和按钮
 * 
 * @param {Object} options - 配置选项
 * @param {string} options.title - 弹窗标题
 * @param {string|HTMLElement} options.content - 弹窗内容（HTML字符串或DOM元素）
 * @param {string} options.width - 弹窗宽度（默认480px）
 * @param {Array} options.buttons - 底部按钮配置
 * @param {Function} options.onClose - 关闭回调
 * @param {boolean} options.closeOnOverlay - 点击遮罩是否关闭（默认true）
 * @returns {Object} { close: Function } 可手动关闭弹窗
 * 
 * 使用示例：
 * Modal.open({
 *   title: '发布通知',
 *   content: formElement,
 *   width: '600px',
 *   buttons: [
 *     { text: '取消', type: 'secondary', action: 'close' },
 *     { text: '发布', type: 'primary', onClick: () => { ... } }
 *   ]
 * });
 */
const Modal = (function() {
    'use strict';

    let currentModal = null;

    /**
     * 打开弹窗
     */
    function open(options) {
        const config = {
            title: '',
            content: '',
            width: '480px',
            buttons: [],
            onClose: null,
            closeOnOverlay: true,
            ...options
        };

        // 关闭已有弹窗
        close();

        // 创建弹窗DOM
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'modalComponent';

        // 构建按钮HTML
        const buttonsHtml = config.buttons.map((btn, index) => {
            const btnClass = btn.type === 'primary' ? 'btn btn-primary' : 
                            btn.type === 'danger' ? 'btn btn-danger' : 'btn btn-secondary';
            return `<button class="${btnClass}" data-modal-btn="${index}">${btn.text}</button>`;
        }).join('');

        // 构建弹窗HTML
        overlay.innerHTML = `
            <div class="modal-container" style="max-width: ${config.width};">
                <div class="modal-header">
                    <h3>${escapeHtml(config.title)}</h3>
                    <button class="modal-close" data-modal-action="close">×</button>
                </div>
                <div class="modal-body" id="modalBody"></div>
                ${config.buttons.length > 0 ? `
                <div class="modal-footer">
                    ${buttonsHtml}
                </div>
                ` : ''}
            </div>
        `;

        // 插入内容
        const bodyContainer = overlay.querySelector('#modalBody');
        if (typeof config.content === 'string') {
            bodyContainer.innerHTML = config.content;
        } else if (config.content instanceof HTMLElement) {
            bodyContainer.appendChild(config.content);
        }

        // 绑定事件
        bindEvents(overlay, config);

        // 添加到页面
        document.body.appendChild(overlay);
        currentModal = overlay;
        
        // 强制重绘后添加show类，触发过渡动画
        requestAnimationFrame(() => {
            overlay.classList.add('show');
        });

        // 返回关闭方法
        return { close };
    }

    /**
     * 绑定事件
     */
    function bindEvents(overlay, config) {
        // 关闭按钮
        const closeBtn = overlay.querySelector('[data-modal-action="close"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', close);
        }

        // 遮罩点击关闭
        if (config.closeOnOverlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
        }

        // 按钮点击事件
        overlay.querySelectorAll('[data-modal-btn]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.modalBtn);
                const btnConfig = config.buttons[index];
                
                if (btnConfig.action === 'close') {
                    close();
                } else if (btnConfig.onClick) {
                    btnConfig.onClick();
                }
            });
        });
    }

    /**
     * 关闭弹窗
     */
    function close() {
        if (currentModal) {
            // 先移除show类，触发关闭动画
            currentModal.classList.remove('show');
            // 等待动画完成后移除元素
            setTimeout(() => {
                if (currentModal) {
                    currentModal.remove();
                    currentModal = null;
                }
            }, 200);
        }
    }

    /**
     * HTML转义
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 暴露公共方法
    return {
        open,
        close
    };
})();

// 暴露为全局变量，供其他模块使用
window.Modal = Modal;
