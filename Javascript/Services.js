import * as Global from '/Javascript/global.js?v=20261011';

let JsonDataPath = "";
let JsonServicePath = "";
const iniPath = '/settings/global.ini';

let allNotices = [];
let allServices = [];
let allVisualRecords = [];
let allFAQs = [];

/**
 * 初始化應用程式（資料庫 = GitHub 靜態 JSON）
 */
async function initApp() {
    // 💡 第一階段：立即載入快取
    loadCache();
    Global.initGlobalHeader();

    try {
        const config = await Global.getIni(iniPath);
        if (config.MENU_DATA) Global.initMenu(config.MENU_DATA);
        if (config) {
            JsonDataPath = config.JsonData;
            JsonServicePath = config.JsonService;

            // 💡 第二階段：補抓靜態 JSON (如果快取是空的)
            const loadTasks = [];
            if (allNotices.length === 0 && JsonDataPath) {
                loadTasks.push(loadStaticData(JsonDataPath, 'notice'));
            }
            if (allServices.length === 0 && JsonServicePath) {
                loadTasks.push(loadStaticData(JsonServicePath, 'service'));
            }
            if (loadTasks.length > 0) await Promise.all(loadTasks);

            // 💡 第三階段：版本比對，有更新才重抓
            refreshFromVersion();
        } else {
            throw new Error("INI 設定檔載入失敗");
        }
    } catch (e) {
        console.error("❌ 初始化失敗:", e);
    }
}

/**
 * 載入本地快取資料
 */
function loadCache() {
    const cachedNotices = localStorage.getItem('cache_notices');
    const cachedServices = localStorage.getItem('cache_services');

    if (cachedNotices) {
        allNotices = JSON.parse(cachedNotices);
        renderNotices();
    }
    if (cachedServices) {
        // 從快取的服務中拆分並顯示 (使用異步處理以免阻塞公告渲染)
        processServiceData(JSON.parse(cachedServices));
    }
}

/**
 * 核心邏輯：異步處理服務資料，達成「服務」與「FAQ」競爭渲染
 */
function processServiceData(data) {
    // 💡 任務 1：處理服務項目 (包含：服務項目)
    Promise.resolve().then(() => {
        allServices = data.filter(item => String(item["分類"] || "") === "服務項目");
        renderServices(allServices);
        console.log("🛠️ 服務項目已渲染");
    });

    // 💡 任務 2：處理 FAQ (分類：超自然現象彙典)
    Promise.resolve().then(() => {
        allFAQs = data.filter(item => String(item["分類"] || "") === "超自然現象彙典");
        renderFAQ();
        console.log("❓ FAQ 已渲染");
    });
    
    // 💡 任務 3：處理視覺紀錄 (分類：視覺紀錄)
    Promise.resolve().then(() => {
        allVisualRecords = data.filter(item => String(item["分類"] || "") === "視覺紀錄");
        renderVisualRecords(allVisualRecords.slice(0, 6), allVisualRecords.length); // 首頁顯示 6 個，多的去 YouTube 頻道看
    });
}

/**
 * 讀取靜態 JSON 檔案
 */
async function loadStaticData(path, type) {
    try {
        const sep = path.includes('?') ? '&' : '?';
        const res = await fetch(`${path}${sep}t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        
        if (type === 'notice') {
            const rawData = Array.isArray(data) ? data : (data.notices || []);
            allNotices = rawData.filter(item => String(item["標題"] || "").includes("公告"));
            try { localStorage.setItem('cache_notices', JSON.stringify(allNotices)); } catch (e) {}
            renderNotices();
        } else if (type === 'service'){
            const rawData = Array.isArray(data) ? data : (data.services || []);
            // 存完整檔（過濾是渲染時的事，快取存過濾版會污染下次載入）
            try { localStorage.setItem('cache_services', JSON.stringify(rawData)); } catch (e) {}
            processServiceData(rawData); // 觸發並行處理
        }
    } catch (e) {
        console.warn(`⚠️ 無法讀取 ${type} JSON:`, e);
    }
}

/**
 * 版本比對更新：版本沒變就不動作，變了才重抓兩個靜態 JSON
 */
async function refreshFromVersion() {
    let remoteVer = null;
    try {
        remoteVer = await Global.getRemoteVersion();
    } catch (e) {}
    if (!remoteVer) return;
    try {
        const hasData = allNotices.length > 0 || allServices.length > 0;
        if (localStorage.getItem('data_ver') === remoteVer && hasData) return;
    } catch (e) {}
    const tasks = [];
    if (JsonDataPath) tasks.push(loadStaticData(JsonDataPath, 'notice'));
    if (JsonServicePath) tasks.push(loadStaticData(JsonServicePath, 'service'));
    await Promise.all(tasks);
    try {
        // 檔案快取由 loadStaticData 寫入（服務存完整檔），這裡只記版本
        localStorage.setItem('data_ver', remoteVer);
        console.log("✅ 已更新到最新版本");
    } catch (e) {
        console.warn("快取寫入失敗:", e);
    }
}

/**
 * 渲染公告列表
 */
function renderNotices() {
    const content = document.getElementById('announcement-content');
    if (!content) return;
    if (allNotices.length === 0) {
        content.innerText = "目前暫無公告。";
        return;
    }
    // 置頂優先，再按日期倒序
    const sorted = [...allNotices].sort((a, b) =>
        ((b["置頂"] === true) - (a["置頂"] === true)) || (new Date(b["發佈日期"]) - new Date(a["發佈日期"])));
    const displayList = sorted.slice(0, 5);
    content.innerHTML = displayList.map(item => {
        const text = item["貼文內容"] || item["內容"] || "";
        const summary = text.length > 50 ? text.substring(0, 50) + "..." : text;
        const date = item["發佈日期"] ? new Date(item["發佈日期"]).toLocaleDateString() : "近期";
        const pin = item["置頂"] === true ? "📌" : "";
        return `
            <div class="notice-item">
                <span class="notice-date">${pin}[${date}]</span>
                <span class="notice-text">${summary}</span>
            </div>
        `;
    }).join('');
}

/**
 * 渲染常見問題列表
 */
function renderFAQ() {
    const content = document.getElementById('faq-content');
    if (!content) return;
    if (allFAQs.length === 0) {
        content.innerText = "目前暫無新增超自然現象。";
        return;
    }
    const displayList = allFAQs.slice(0, 5);
    content.innerHTML = displayList.map((item, index) => {
        const q = item["標題"] || "超自然現象彙典";
        const a = item["貼文內容"] || item["內容"] || "暫無解答";
        const posturl = item["連結"] || item["貼文連結"] || "";
        const qNumber = index + 1;
        
        // 處理多個連結：支援陣列，或是以逗號、換行、空格分隔的字串
        let urlArray = [];
        if (Array.isArray(posturl)) {
            urlArray = posturl;
        } else if (typeof posturl === "string" && posturl.trim() !== "") {
            // 利用正規表達式分割字串，並過濾掉空值
            urlArray = posturl.split(/[,\n\s]+/).filter(url => url.trim() !== "");
        }
        
        // 將連結陣列轉換為 HTML `<a>` 標籤，並以 <br> 換行
        const linksHtml = urlArray.length > 0 
            ? `<div class="faq-links"><span>相關文章：</span>
                 ${urlArray.map((url, i) => `<a href="${url}" target="_blank" rel="noopener noreferrer">文章${i + 1}</a>`).join('\t')}
               </div>` 
            : "";
        
        return `
            <div class="card">
                <h3>Q${qNumber}: ${q}</h3>
                <p>A: ${a}</p>
                ${linksHtml}
            </div>
        `;
    }).join('');
}
            // <div class="notice-item" style="display: block; margin-bottom: 15px;">
            //     <div class="notice-text" style="font-weight: bold; color: #d4af37;">Q${qNumber}: ${q}</div>
            //     <div class="notice-text" style="margin-left: 20px; font-size: 0.95em; opacity: 0.9;">A: ${a}</div>
            // </div>

/**
 * 渲染服務項目卡片
 */
function renderServices(data) {
    const container = document.getElementById('services-container');
    if (!container) return;
    // 四個以下一列兩個，五個以上一列三個
    container.dataset.cols = data.length >= 5 ? '3' : '2';
    if (data.length === 0) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">服務項目整理中。</p>';
        return;
    }
    container.innerHTML = data.map((item, index) => `
        <div class="card">
            <h3>${item["標題"] || '專業服務'}</h3>
            <p>${item["貼文內容"] || '歡迎洽詢。'}</p>
        </div>
    `).join('');
}

function renderVisualRecords(displayData, totalCount) {
    const container = document.getElementById('visual-records-container');
    const btn = document.getElementById('all-visuals-btn'); // 抓取「顯示所有」按鈕
    
    if (!container) return;

    // 如果沒資料的處理
    if (displayData.length === 0) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">暫無紀錄。</p>';
        if (btn) btn.style.display = 'none';
        return;
    }

    // 渲染卡片內容（支援多個影片連結，疊放多個播放器）
    container.innerHTML = displayData.map(item => {
        const videoRaw = item["連結"] || item["貼文連結"] || "";
        let urlArray = [];
        if (Array.isArray(videoRaw)) {
            urlArray = videoRaw;
        } else if (typeof videoRaw === "string" && videoRaw.trim() !== "") {
            urlArray = videoRaw.split(/[,\n\s]+/).filter(url => url.trim() !== "");
        }
        const embeds = urlArray.map(getYouTubeEmbedUrl).filter(u => u);
        const title = item["標題"] || "影片紀錄";
        const desc = item["貼文內容"] || "";

        return `
            <div class="card">
                ${embeds.length ? `
                    <div class="video-container" style="margin-bottom:10px; border-radius:8px; overflow:hidden;">
                        <iframe width="100%" height="200" src="${embeds[0]}" 
                            frameborder="0" allowfullscreen loading="lazy"></iframe>
                    </div>
                ` : ''}
                ${embeds.length > 1 ? `
                    <div class="vid-tabs">
                        ${embeds.map((u, i) => `<button class="vid-tab${i === 0 ? ' active' : ''}" onclick="switchVisualVideo(this,'${u}')">影片${i + 1}</button>`).join('')}
                    </div>
                ` : ''}
                <h3>${title}</h3>
                <p>${desc}</p>
            </div>
        `;
    }).join('');

    // 💡 關鍵：控制「顯示所有」按鈕
    // 只有當總影片數大於 6 時，才顯示該按鈕
    if (btn) {
        btn.style.display = 'inline-block';
    }
}
// 視覺紀錄分頁切換：同卡只播一支，按鈕換片
window.switchVisualVideo = function(btn, url) {
    const card = btn.closest('.card');
    const frame = card ? card.querySelector('iframe') : null;
    if (frame) frame.src = url;
    const tabs = card ? card.querySelectorAll('.vid-tab') : [];
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
};

function getYouTubeEmbedUrl(url) {    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    const videoId = (match && match[2].length === 11) ? match[2] : null;
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
}

// 啟動應用程式
window.addEventListener('DOMContentLoaded', initApp);
