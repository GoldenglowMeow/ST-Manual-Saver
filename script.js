import { saveChatConditional } from '../../../../../script.js';

(async function() {
    console.log('[ST-Manual-Saver] Plugin loading and patching fetch...');

    const originalFetch = window.fetch;
    let isManualSave = false;

    window.fetch = function(url, options) {
        const urlString = url.toString();
        const isSaveRequest = urlString.includes('/api/chats/save') || urlString.includes('/api/chats/group/save');

        if (isSaveRequest) {
            if (isManualSave) {
                console.log('[ST-Manual-Saver] Allowing manual chat save request to:', urlString);
                isManualSave = false;

                return originalFetch.apply(this, arguments).then(response => {
                    if (response.ok) {
                        if (window.toastr) {
                            window.toastr.success('聊天保存成功', 'ST-Manual-Saver');
                        }
                    } else {
                        if (window.toastr) {
                            window.toastr.error(`聊天保存失败: ${response.statusText}`, 'ST-Manual-Saver');
                        }
                    }
                    return response;
                }).catch(error => {
                    console.error('[ST-Manual-Saver] Manual save fetch error:', error);
                    if (window.toastr) {
                        window.toastr.error(`聊天保存失败: ${error.message}`, 'ST-Manual-Saver');
                    }
                    throw error;
                });
            } else {
                console.log('[ST-Manual-Saver] Intercepted and blocked automatic chat save request to:', urlString);
                // if (window.toastr) {
                //     window.toastr.info('Auto-save blocked.', 'ST-Manual-Saver', { timeOut: 2000, preventDuplicates: true });
                // }
                return Promise.resolve(new Response(JSON.stringify({ status: 'ok', message: 'Blocked by ST-Manual-Saver' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
        }

        return originalFetch.apply(this, arguments);
    };

    console.log('[ST-Manual-Saver] Global fetch patched successfully.');

    jQuery(async function () {
        function addSaveButton() {
            const extensionsMenu = $('#extensionsMenu');
            if (!extensionsMenu.length) {
                const optionsMenu = $('#options');
                if (!optionsMenu.length) {
                    console.warn('[ST-Manual-Saver] Menu not found. Cannot add save button.');
                    return;
                }
                extensionsMenu = optionsMenu;
            }

            if ($('#manual_save_button').length) {
                return;
            }

            const saveButton = $('<div id="manual_save_button" class="list-group-item flex-container flexGap5 interactable tavern-helper-shortcut-item" title="Save the current chat manually"><div class="fa-solid fa-save extensionsMenuExtensionButton"></div><span>保存聊天</span></div>');

            saveButton.on('click', async () => {
                console.log('[ST-Manual-Saver] Manual save triggered.');
                isManualSave = true;
                try {
                    await saveChatConditional();
                } catch (error) {
                    console.error('[ST-Manual-Saver] Error while trying to initiate save:', error);
                    if (window.toastr) {
                        window.toastr.error(`Could not initiate save: ${error.message}`, 'ST-Manual-Saver');
                    }
                    isManualSave = false;
                }
            });

            extensionsMenu.append(saveButton);
        }

        const buttonInterval = setInterval(() => {
            if ($('#extensionsMenu').length || $('#options').length) {
                addSaveButton();
                clearInterval(buttonInterval);
            }
        }, 500);
    });
})();