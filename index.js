import { saveChatConditional, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const MODULE_NAME = 'manual_saver';
const defaultSettings = Object.freeze({
    enabled: true,
    allowTimedSave: true,
    allowInterval: 10,
});

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = { ...defaultSettings };
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwnProperty.call(extension_settings[MODULE_NAME], key)) {
            extension_settings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE_NAME];
}

function saveSettings() {
    saveSettingsDebounced();
}

function renderSettingsHtml() {
    const settings = getSettings();
    return `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>手动保存</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="manual_saver_enabled" ${settings.enabled ? 'checked' : ''}>
                    <span>启用插件</span>
                </label>
                <div class="manual_saver_hint" style="font-size: smaller; opacity: 0.8;">启用插件后，SillyTavern的自动保存聊天记录功能将被禁用，仅允许手动保存和定时允许自动保存</div>
                <fieldset id="manual_saver_timed_options" ${!settings.enabled ? 'disabled' : ''}>
                    <hr>
                    <label class="checkbox_label">
                        <input type="checkbox" id="manual_saver_allow_timed_save" ${settings.allowTimedSave ? 'checked' : ''}>
                        <span>启用定时允许自动保存</span>
                    </label>
                    <div class="manual_saver_hint" style="font-size: smaller; opacity: 0.8;">启用后，每隔一段时间将允许一次自动保存，以避免忘记手动保存导致的大量聊天记录丢失</div>
                    <label for="manual_saver_allow_interval">间隔时间（分钟）</label>
                    <input type="number" id="manual_saver_allow_interval" value="${settings.allowInterval}" min="1" class="text_pole">
                </fieldset>
            </div>
        </div>
    `;
}

function addSaveButton() {
    if ($('#manual_save_button').length) return;

    let extensionsMenu = $('#extensionsMenu');
    if (!extensionsMenu.length) {
        const optionsMenu = $('#options');
        if (!optionsMenu.length) {
            console.warn('[ST-Manual-Saver] Menu not found. Cannot add save button.');
            return;
        }
        extensionsMenu = optionsMenu;
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

function removeSaveButton() {
    $('#manual_save_button').remove();
}

function updateButtonState() {
    if (getSettings().enabled) {
        const buttonInterval = setInterval(() => {
            if ($('#extensionsMenu').length || $('#options').length) {
                addSaveButton();
                clearInterval(buttonInterval);
            }
        }, 500);
    } else {
        removeSaveButton();
    }
}

let lastAllowedAutoSaveTimestamp = Date.now();

function resetTimer() {
    console.log('[ST-Manual-Saver] Auto-save timer has been reset.');
    lastAllowedAutoSaveTimestamp = Date.now();
}

function bindSettingsEvents() {
    const s = () => getSettings();
    const save = () => saveSettings();

    $(document).on('change', '#manual_saver_enabled', function() {
        s().enabled = $(this).prop('checked');
        save();
        $('#manual_saver_timed_options').prop('disabled', !s().enabled);
        updateButtonState();
        resetTimer();
    });

    $(document).on('change', '#manual_saver_allow_timed_save', function() { s().allowTimedSave = $(this).prop('checked'); save(); });
    $(document).on('input', '#manual_saver_allow_interval', function() {
        s().allowInterval = parseInt($(this).val()) || defaultSettings.allowInterval;
        save();
        resetTimer();
    });
}

console.log('[ST-Manual-Saver] Plugin loading and patching fetch...');

const originalFetch = window.fetch;
let isManualSave = false;

window.fetch = function(url, options) {
    const settings = getSettings();
    if (!settings.enabled) {
        return originalFetch.apply(this, arguments);
    }

    const urlString = url.toString();
    const isSaveRequest = urlString.includes('/api/chats/save') || urlString.includes('/api/chats/group/save');

    if (isSaveRequest) {
        if (isManualSave) {
            console.log('[ST-Manual-Saver] Allowing manual chat save request to:', urlString);
            isManualSave = false;

            return originalFetch.apply(this, arguments).then(response => {
                if (response.ok) {
                    if (window.toastr) window.toastr.success('聊天保存成功', 'ST-Manual-Saver');
                } else {
                    if (window.toastr) window.toastr.error(`聊天保存失败: ${response.statusText}`, 'ST-Manual-Saver');
                }
                return response;
            }).catch(error => {
                console.error('[ST-Manual-Saver] Manual save fetch error:', error);
                if (window.toastr) window.toastr.error(`聊天保存失败: ${error.message}`, 'ST-Manual-Saver');
                throw error;
            });
        } else {
            if (settings.allowTimedSave) {
                const now = Date.now();
                const intervalMs = settings.allowInterval * 60 * 1000;
                if (now - lastAllowedAutoSaveTimestamp >= intervalMs) {
                    resetTimer();
                    console.log('[ST-Manual-Saver] Allowing timed automatic save.');
                    return originalFetch.apply(this, arguments).then(response => {
                        if (response.ok) {
                            if (window.toastr) window.toastr.success(`定时自动保存成功 (间隔: ${settings.allowInterval}分钟)`, 'ST-Manual-Saver');
                        } else {
                            if (window.toastr) window.toastr.error(`定时自动保存失败 (间隔: ${settings.allowInterval}分钟): ${response.statusText}`, 'ST-Manual-Saver');
                        }
                        return response;
                    }).catch(error => {
                        console.error('[ST-Manual-Saver] Timed auto-save fetch error:', error);
                        if (window.toastr) window.toastr.error(`定时自动保存失败 (间隔: ${settings.allowInterval}分钟): ${error.message}`, 'ST-Manual-Saver');
                        throw error;
                    });
                }
            }
            
            console.log('[ST-Manual-Saver] Intercepted and blocked automatic chat save request to:', urlString);
            return Promise.resolve(new Response(JSON.stringify({ status: 'ok', message: 'Blocked by ST-Manual-Saver' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
    }

    return originalFetch.apply(this, arguments);
};

console.log('[ST-Manual-Saver] Global fetch patched successfully.');

$(document).ready(function() {
    const extensionsSettings = $('#extensions_settings');
    if (extensionsSettings.length) {
        extensionsSettings.append(`<div id="manual_saver_container">${renderSettingsHtml()}</div>`);
        bindSettingsEvents();
    }

    updateButtonState();
});