import { getIni } from './API.js';

let NOVEL_API_URL = "";    // 用於獲取公告 (來自小說庫試算表)
let SERVICE_API_URL = "";  // 用於獲取服務項目 (來自服務試算表)
let JsonDataPath = "";     // 💡 新增：GitHub JSON 路徑
let JsonServicePath = "";
const iniPath = 'settings/Services.ini'; 

let allNotices = [];
let allServices = [];

/**
 * 初始化應用程式
 */
async function initApp() {
    // 💡 第一階段：立即載入快取，達成秒開體驗
    loadCache();

    try {
        const config = await getIni(iniPath);
        
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
            // 解析 Base64 API 網址 (若非 http 開頭則解碼)
            if (config.NOVEL_API_URL && config.SERVICE_API_URL) {
                NOVEL_API_URL = config.NOVEL_API_URL.startsWith("http") ? config.NOVEL_API_URL : atob(config.NOVEL_API_URL);
                SERVICE_API_URL = config.SERVICE_API_URL.startsWith("http") ? config.SERVICE_API_URL : atob(config.SERVICE_API_URL);
                console.log("✅ 系統設定載入成功，啟動遠端同步...");
                // 💡 第三階段：執行背景 API 更新 (確保資料是最新的)
                fetchRemoteData();
            }
        } else {
            throw new Error("INI 設定檔缺少關鍵 API 網址");
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
        allServices = JSON.parse(cachedServices);
        renderServices(allServices);
    }
}
async function loadStaticData(path, type) {
    try {
        const res = await fetch(path);
        if (!res.ok) return;
        const data = await res.json();
        
        console.log(`📄 成功讀取靜態 ${type} JSON`);
        
        if (type === 'notice') {
            const rawData = Array.isArray(data) ? data : (data.notices || []);
            allNotices = rawData.filter(item => {
                const title = item["標題"] || ""; // 取得標題，若無則設為空字串
                return title.includes("公告");    // 只有包含「公告」的會回傳 true 並被保留
            });
            
            renderNotices();
        } else if (type === 'service'){
            allServices = Array.isArray(data) ? data : (data.services || []);
            renderServices(allServices);
        }
    } catch (e) {
        console.warn(`⚠️ 無法讀取 ${type} JSON:`, e);
    }
}

/**
 * 從不同的 API 獲取資料並進行過濾 (優化版：獨立執行不互相等待)
 */
async function fetchRemoteData() {
    // 1. 定義服務項目的同步邏輯
    const syncServices = async () => {
        try {
            const res = await fetch(`${SERVICE_API_URL}${SERVICE_API_URL.includes('?') ? '&' : '?'}type=service`);
            if (!res.ok) return;
            const data = await res.json();
            
            // 篩選掉標題含「公告」的項目
            let newServices = data.filter(item => !String(item["標題"] || "").includes("公告"));

            if (JSON.stringify(newServices) !== localStorage.getItem('cache_services')) {
                allServices = newServices;
                localStorage.setItem('cache_services', JSON.stringify(newServices));
                renderServices(allServices); // 服務一跑完立即渲染
                console.log("🛠️ 服務項目 API 同步完成");
            }
        } catch (e) {
            console.error("服務項目背景同步出錯:", e);
        }
    };

    // 2. 定義公告的同步邏輯
    const syncNotices = async () => {
        try {
            const res = await fetch(`${NOVEL_API_URL}${NOVEL_API_URL.includes('?') ? '&' : '?'}type=notice`);
            if (!res.ok) return;
            const data = await res.json();

            // 只保留標題含「公告」的項目
            let newData = data.filter(item => String(item["標題"] || "").includes("公告"));
            newData.sort((a, b) => new Date(b["發佈日期"]) - new Date(a["發佈日期"]));

            if (JSON.stringify(newData) !== localStorage.getItem('cache_notices')) {
                allNotices = newData;
                localStorage.setItem('cache_notices', JSON.stringify(newData));
                renderNotices(); // 公告一跑完立即渲染
                console.log("📢 公告區 API 同步完成");
            }
        } catch (e) {
            console.error("公告背景同步出錯:", e);
        }
    };

    // 💡 同時啟動，但不使用 await Promise.all，讓它們並行且各自完成後立即觸發更新
    syncServices();
    syncNotices();
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

    // 僅顯示最新 5 筆
    const displayList = allNotices.slice(0, 5);
    
    content.innerHTML = displayList.map(item => {
        const text = item["貼文內容"] || item["內容"] || "";
        const summary = text.length > 50 ? text.substring(0, 50) + "..." : text;
        const dateRaw = item["發佈日期"];
        // 處理 Excel 格式日期或標準日期字串
        const date = dateRaw ? new Date(dateRaw).toLocaleDateString() : "近期";
        
        return `
            <div class="notice-item">
                <span class="notice-date">[${date}]</span>
                <span class="notice-text">${summary}</span>
            </div>
        `;
    }).join('');
}

/**
 * 渲染服務項目卡片
 */
function renderServices(data) {
    const container = document.getElementById('services-container');
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">服務項目整理中，請稍後再訪。</p>';
        return;
    }

    container.innerHTML = data.map(item => `
        <div class="card">
            <h3>${item["服務名稱"] || item["標題"] || '靈學諮詢'}</h3>
            <p>${item["服務介紹"] || item["貼文內容"] || '歡迎洽詢詳細服務內容。'}</p>
        </div>
    `).join('');
}

// 監聽 DOM 載入事件
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});
