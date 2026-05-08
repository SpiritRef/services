import { getIni } from './API.js';

let NOVEL_API_URL = "";    // 用於獲取公告 (來自小說庫試算表)
let SERVICE_API_URL = "";  // 用於獲取服務項目 (來自服務試算表)
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
        
        if (config && config.NOVEL_API_URL && config.SERVICE_API_URL) {
            // 解析 Base64 API 網址 (若非 http 開頭則解碼)
            NOVEL_API_URL = config.NOVEL_API_URL.startsWith("http") ? config.NOVEL_API_URL : atob(config.NOVEL_API_URL);
            SERVICE_API_URL = config.SERVICE_API_URL.startsWith("http") ? config.SERVICE_API_URL : atob(config.SERVICE_API_URL);
            
            console.log("✅ 系統設定載入成功，啟動遠端同步...");
            
            // 💡 第二階段：執行背景更新
            await fetchRemoteData();
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

/**
 * 從不同的 API 獲取資料並進行過濾
 */
async function fetchRemoteData() {
    try {
        // 同時請求兩個不同的 URL
        // 加上 type 參數以便未來 Apps Script 更新後能自動提速
        const [noticeRes, serviceRes] = await Promise.allSettled([
            fetch(`${NOVEL_API_URL}${NOVEL_API_URL.includes('?') ? '&' : '?'}type=notice`).then(res => res.json()),
            fetch(`${SERVICE_API_URL}${SERVICE_API_URL.includes('?') ? '&' : '?'}type=service`).then(res => res.json())
        ]);

        // 1. 處理公告更新 (來自 NOVEL_API_URL)
        if (noticeRes.status === 'fulfilled') {
            let newData = noticeRes.value;
            
            // 前端防線：過濾標題含「公告」的資料 (相容舊版 GAS)
            newData = newData.filter(item => String(item["標題"] || "").includes("公告"));
            
            // 排序：日期由新到舊
            newData.sort((a, b) => new Date(b["發佈日期"]) - new Date(a["發佈日期"]));

            if (JSON.stringify(newData) !== localStorage.getItem('cache_notices')) {
                allNotices = newData;
                localStorage.setItem('cache_notices', JSON.stringify(newData));
                renderNotices();
                console.log("📢 公告區已更新至最新狀態");
            }
        }

        // 2. 處理服務項目更新 (來自 SERVICE_API_URL)
        if (serviceRes.status === 'fulfilled') {
            let newServices = serviceRes.value;
            
            // 前端防線：排除標題含「公告」的資料，保留純服務內容
            newServices = newServices.filter(item => !String(item["標題"] || "").includes("公告"));

            if (JSON.stringify(newServices) !== localStorage.getItem('cache_services')) {
                allServices = newServices;
                localStorage.setItem('cache_services', JSON.stringify(newServices));
                renderServices(allServices);
                console.log("🛠️ 服務項目已更新至最新狀態");
            }
        }
    } catch (e) {
        console.error("背景同步出錯:", e);
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
